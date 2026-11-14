use std::fs;
use std::io::Write;
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use crate::error::AppError;
use crate::models::connection::SshTunnelConfig;

/// Represents an active SSH local port-forwarding tunnel (`ssh -N -L local_port:remote_host:remote_port`).
/// When dropped, the underlying `ssh` child process and any temporary askpass script are cleaned up.
pub struct SshTunnelHandle {
    local_port: u16,
    child: Child,
    askpass_script: Option<PathBuf>,
}

impl SshTunnelHandle {
    pub fn local_port(&self) -> u16 {
        self.local_port
    }

    /// Establishes an SSH local port-forwarding tunnel to `remote_host:remote_port` via `ssh_config`.
    pub async fn establish(
        ssh_config: &SshTunnelConfig,
        remote_host: &str,
        remote_port: u16,
        timeout_secs: u64,
    ) -> Result<Self, AppError> {
        let ssh_host = ssh_config
            .host
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| {
                AppError::Other("SSH Tunnel is enabled, but SSH Host is not specified.".to_string())
            })?;

        let ssh_port = ssh_config.port.unwrap_or(22);
        let ssh_user = ssh_config
            .user
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty());

        if ssh_host.starts_with('-') {
            return Err(AppError::InvalidInput(
                "Invalid SSH host: cannot start with '-'".to_string(),
            ));
        }
        if let Some(user) = ssh_user {
            if user.starts_with('-') {
                return Err(AppError::InvalidInput(
                    "Invalid SSH username: cannot start with '-'".to_string(),
                ));
            }
        }

        // Allocate an ephemeral local port on 127.0.0.1
        let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| {
            AppError::Other(format!(
                "Failed to allocate local port for SSH tunnel: {}",
                e
            ))
        })?;
        let local_port = listener
            .local_addr()
            .map_err(|e| AppError::Other(format!("Failed to read local tunnel address: {}", e)))?
            .port();
        drop(listener);

        let mut cmd = Command::new("/usr/bin/ssh");
        cmd.arg("-N")
            .arg("-L")
            .arg(format!("127.0.0.1:{}:{}:{}", local_port, remote_host, remote_port))
            .arg("-p")
            .arg(ssh_port.to_string())
            .arg("-o")
            .arg("ExitOnForwardFailure=yes")
            .arg("-o")
            .arg("ServerAliveInterval=15")
            .arg("-o")
            .arg("ServerAliveCountMax=3")
            .arg("-o")
            .arg("StrictHostKeyChecking=accept-new")
            .arg("-o")
            .arg(format!("ConnectTimeout={}", timeout_secs.max(1)));

        let auth_type = ssh_config
            .auth_type
            .as_deref()
            .unwrap_or("key")
            .to_lowercase();

        if auth_type == "key" {
            if let Some(key_path) = ssh_config
                .private_key_path
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
            {
                let expanded_path = if let Some(stripped) = key_path.strip_prefix("~/") {
                    if let Ok(home) = std::env::var("HOME") {
                        format!("{}/{}", home, stripped)
                    } else {
                        key_path.to_string()
                    }
                } else {
                    key_path.to_string()
                };

                if !std::path::Path::new(&expanded_path).exists() {
                    return Err(AppError::Other(format!(
                        "SSH Tunnel to '{}' failed: private key file '{}' not found. Direct connection to database host blocked to prevent security bypass.",
                        ssh_host, key_path
                    )));
                }
                cmd.arg("-i").arg(expanded_path);
            }
        }

        let secret = ssh_config
            .passphrase
            .as_deref()
            .filter(|s| !s.is_empty());

        let mut askpass_script: Option<PathBuf> = None;

        if let Some(sec) = secret {
            let script_path = std::env::temp_dir().join(format!(
                "datacore_ssh_askpass_{}.sh",
                uuid::Uuid::new_v4()
            ));
            let mut open_opts = fs::OpenOptions::new();
            open_opts.create_new(true).write(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                open_opts.mode(0o700);
            }
            let mut file = open_opts.open(&script_path).map_err(|e| {
                AppError::Other(format!("Failed to create SSH askpass helper: {}", e))
            })?;
            // Safely escape single quotes in secret
            let escaped = sec.replace('\'', "'\\''");
            writeln!(file, "#!/bin/sh\nprintf '%s\\n' '{}'", escaped).map_err(|e| {
                AppError::Other(format!("Failed to write SSH askpass helper: {}", e))
            })?;
            drop(file);

            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = fs::set_permissions(&script_path, fs::Permissions::from_mode(0o700));
            }

            cmd.env("SSH_ASKPASS", &script_path)
                .env("SSH_ASKPASS_REQUIRE", "force")
                .env("DISPLAY", "datacore:0");
            askpass_script = Some(script_path);
        } else {
            cmd.arg("-o").arg("BatchMode=yes");
        }

        cmd.arg("--");
        if let Some(user) = ssh_user {
            cmd.arg(format!("{}@{}", user, ssh_host));
        } else {
            cmd.arg(ssh_host);
        }

        cmd.stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| {
            if let Some(ref p) = askpass_script {
                let _ = fs::remove_file(p);
            }
            AppError::Other(format!(
                "SSH Tunnel to '{}' could not be started: {}. Direct connection to database host blocked to prevent security bypass.",
                ssh_host, e
            ))
        })?;

        let deadline = Instant::now() + Duration::from_secs(timeout_secs.max(1));
        let poll_interval = Duration::from_millis(40);

        loop {
            // Check if ssh process exited prematurely (e.g. auth failure, host unreachable)
            match child.try_wait() {
                Ok(Some(status)) => {
                    let mut stderr_msg = String::new();
                    if let Some(mut stderr) = child.stderr.take() {
                        use std::io::Read;
                        let _ = stderr.read_to_string(&mut stderr_msg);
                    }
                    if let Some(ref p) = askpass_script {
                        let _ = fs::remove_file(p);
                    }
                    let detail = stderr_msg.trim();
                    return Err(AppError::Other(format!(
                        "SSH Tunnel to '{}' is enabled, but local SSH port forwarder failed to establish (exit {}): {}. Direct connection to database host blocked to prevent security bypass.",
                        ssh_host,
                        status,
                        if detail.is_empty() { "connection refused or authentication failed" } else { detail }
                    )));
                }
                Ok(None) => {}
                Err(e) => {
                    let _ = child.kill();
                    if let Some(ref p) = askpass_script {
                        let _ = fs::remove_file(p);
                    }
                    return Err(AppError::Other(format!(
                        "SSH Tunnel to '{}' failed while waiting for tunnel: {}. Direct connection to database host blocked to prevent security bypass.",
                        ssh_host, e
                    )));
                }
            }

            // Probe if local port is now accepting TCP connections
            if tokio::net::TcpStream::connect(("127.0.0.1", local_port))
                .await
                .is_ok()
            {
                // Immediately delete the askpass helper script once connection succeeds
                if let Some(script) = askpass_script.take() {
                    let _ = fs::remove_file(script);
                }
                break;
            }

            if Instant::now() >= deadline {
                let _ = child.kill();
                let _ = child.wait();
                if let Some(ref p) = askpass_script {
                    let _ = fs::remove_file(p);
                }
                return Err(AppError::Other(format!(
                    "SSH Tunnel to '{}' timed out after {} seconds while establishing local port forwarder. Direct connection to database host blocked to prevent security bypass.",
                    ssh_host, timeout_secs
                )));
            }

            tokio::time::sleep(poll_interval).await;
        }

        Ok(Self {
            local_port,
            child,
            askpass_script,
        })
    }
}

impl Drop for SshTunnelHandle {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        if let Some(ref script) = self.askpass_script {
            let _ = fs::remove_file(script);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_ssh_tunnel_rejects_leading_dash_host() {
        let config = SshTunnelConfig {
            enabled: true,
            host: Some("-oProxyCommand=calc.exe".to_string()),
            port: Some(22),
            user: Some("testuser".to_string()),
            auth_type: Some("password".to_string()),
            passphrase: Some("secret".to_string()),
            private_key_path: None,
        };

        let res = SshTunnelHandle::establish(&config, "127.0.0.1", 3306, 1).await;
        assert!(res.is_err());
        match res.err().unwrap() {
            AppError::InvalidInput(msg) => {
                assert!(msg.contains("cannot start with '-'"), "Expected leading dash error, got: {}", msg);
            }
            other => panic!("Expected AppError::InvalidInput, got: {:?}", other),
        }
    }

    #[tokio::test]
    async fn test_ssh_tunnel_rejects_leading_dash_user() {
        let config = SshTunnelConfig {
            enabled: true,
            host: Some("example.com".to_string()),
            port: Some(22),
            user: Some("-oProxyCommand=evil".to_string()),
            auth_type: Some("password".to_string()),
            passphrase: Some("secret".to_string()),
            private_key_path: None,
        };

        let res = SshTunnelHandle::establish(&config, "127.0.0.1", 3306, 1).await;
        assert!(res.is_err());
        match res.err().unwrap() {
            AppError::InvalidInput(msg) => {
                assert!(msg.contains("cannot start with '-'"), "Expected leading dash error, got: {}", msg);
            }
            other => panic!("Expected AppError::InvalidInput, got: {:?}", other),
        }
    }
}
