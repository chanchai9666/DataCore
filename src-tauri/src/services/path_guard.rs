use std::path::{Component, Path, PathBuf};

/// Dangerous system directories that should never be read from or written to by transfers.
const DANGEROUS_SYSTEM_DIRS: &[&str] = &[
    "/etc",
    "/private/etc",
    "/System",
    "/usr",
    "/bin",
    "/private/bin",
    "/sbin",
    "/private/sbin",
    "/dev",
    "/proc",
    "/sys",
    "/var/root",
    "/private/var/root",
];

/// Returns the user's home directory from HOME or USERPROFILE environment variables.
pub fn get_home_dir() -> Option<PathBuf> {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok()
        .map(PathBuf::from)
}

/// On macOS, /System/Volumes/Data is the writable APFS data volume that holds /Users, /private, etc.
/// Stripping this prefix allows canonicalized paths under /Users or /tmp to be evaluated properly
/// without triggering a false positive against /System.
fn strip_macos_system_data_prefix(path: &Path) -> PathBuf {
    let macos_prefix = Path::new("/System/Volumes/Data");
    if let Ok(stripped) = path.strip_prefix(macos_prefix) {
        Path::new("/").join(stripped)
    } else {
        path.to_path_buf()
    }
}

/// Checks whether a normalized or canonicalized path points to a forbidden location.
fn check_blocked_locations(path: &Path, home: Option<&Path>) -> Result<(), String> {
    let normalized = strip_macos_system_data_prefix(path);

    // 1. Check dangerous system locations
    for &prefix in DANGEROUS_SYSTEM_DIRS {
        let prefix_path = Path::new(prefix);
        if normalized == prefix_path || normalized.starts_with(prefix_path) {
            return Err(format!(
                "Access to dangerous system location '{}' is denied",
                prefix
            ));
        }
    }

    // 2. Sensitive user directories: ~/.ssh, ~/.gnupg
    if normalized.components().any(|c| c.as_os_str() == ".ssh") {
        return Err("Access to sensitive directory ~/.ssh is denied".to_string());
    }
    if normalized.components().any(|c| c.as_os_str() == ".gnupg") {
        return Err("Access to sensitive directory ~/.gnupg is denied".to_string());
    }

    if let Some(home_path) = home {
        if normalized.starts_with(home_path.join(".ssh")) {
            return Err("Access to sensitive directory ~/.ssh is denied".to_string());
        }
        if normalized.starts_with(home_path.join(".gnupg")) {
            return Err("Access to sensitive directory ~/.gnupg is denied".to_string());
        }
    }

    // 3. Sensitive DataCore vault files: ~/.datacore/vault.enc, ~/.datacore/.vault.key
    if let Some(file_name) = normalized.file_name().and_then(|f| f.to_str()) {
        let is_vault_file = file_name == "vault.enc"
            || file_name == ".vault.key"
            || file_name.starts_with("vault.enc")
            || file_name.starts_with(".vault.key");

        if is_vault_file {
            let in_datacore_dir = normalized.components().any(|c| c.as_os_str() == ".datacore");
            let in_vault_env = std::env::var("DATACORE_VAULT_DIR")
                .map(|vd| normalized.starts_with(PathBuf::from(vd)))
                .unwrap_or(false);

            if in_datacore_dir || in_vault_env {
                return Err("Access to sensitive DataCore vault files is denied".to_string());
            }
        }
    }

    Ok(())
}

/// Validates that `file_path` is safe for data transfer operations (export / import / preview).
///
/// Ensures:
/// 1. Path is not empty and does not contain null characters.
/// 2. Expands `~` to the current user's home directory.
/// 3. Rejects path traversal (`..` components or encoded dots).
/// 4. Resolves single dot (`.`) references.
/// 5. Validates file extension against `allowed_exts` (case-insensitive).
/// 6. Blocks access to dangerous system locations (`/etc`, `/System`, `/usr`, `/bin`, etc.).
/// 7. Blocks access to sensitive user directories (`~/.ssh`, `~/.gnupg`, `~/.datacore/vault.enc`, etc.).
/// 8. Checks canonicalized path of existing files or existing parent directories to prevent symlink bypasses.
pub fn validate_safe_transfer_path(
    file_path: &str,
    allowed_exts: &[&str],
) -> Result<PathBuf, String> {
    let trimmed = file_path.trim();
    if trimmed.is_empty() {
        return Err("File path cannot be empty".to_string());
    }

    if file_path.contains('\0') {
        return Err("File path contains invalid null characters".to_string());
    }

    // Reject directory traversal attempts early
    if file_path.split(['/', '\\']).any(|part| part == "..")
        || file_path.contains("%2e%2e")
        || file_path.contains("%2E%2E")
        || Path::new(file_path).components().any(|c| matches!(c, Component::ParentDir))
    {
        return Err("Directory traversal (..) is not allowed".to_string());
    }

    let home = get_home_dir();

    // Expand ~ if present
    let expanded: PathBuf = if trimmed == "~" {
        home.clone()
            .ok_or_else(|| "Could not determine user home directory for '~'".to_string())?
    } else if trimmed.starts_with("~/") || trimmed.starts_with("~\\") {
        let h = home.clone()
            .ok_or_else(|| "Could not determine user home directory for '~'".to_string())?;
        h.join(&trimmed[2..])
    } else if trimmed.starts_with('~') {
        return Err("Tilde expansion only supported for current user (~/)".to_string());
    } else {
        PathBuf::from(trimmed)
    };

    // Resolve dots (CurDir) and verify no ParentDir remained
    let mut normalized = PathBuf::new();
    for comp in expanded.components() {
        match comp {
            Component::Prefix(p) => normalized.push(p.as_os_str()),
            Component::RootDir => normalized.push(Component::RootDir.as_os_str()),
            Component::CurDir => { /* Skip . */ }
            Component::ParentDir => {
                return Err("Directory traversal (..) is not allowed".to_string());
            }
            Component::Normal(c) => normalized.push(c),
        }
    }

    // Make absolute if relative
    let absolute_path = if normalized.is_absolute() {
        normalized
    } else {
        match std::env::current_dir() {
            Ok(cwd) => cwd.join(&normalized),
            Err(_) => normalized,
        }
    };

    // Check blocked locations on the resolved path before extension check
    check_blocked_locations(&absolute_path, home.as_deref())?;

    // Extension validation
    if !allowed_exts.is_empty() {
        let ext = absolute_path
            .extension()
            .and_then(|e| e.to_str())
            .ok_or_else(|| {
                format!(
                    "File path has no extension. Allowed extensions: {}",
                    allowed_exts.join(", ")
                )
            })?;

        let ext_lower = ext.to_lowercase();
        let is_allowed = allowed_exts.iter().any(|allowed| {
            let clean = allowed.trim_start_matches('.').to_lowercase();
            clean == ext_lower
        });

        if !is_allowed {
            return Err(format!(
                "File extension '.{}' is not allowed. Allowed extensions: {}",
                ext,
                allowed_exts.join(", ")
            ));
        }
    }

    // Check canonicalized path if path or existing parent exists (protecting against symlink traversal)
    if absolute_path.exists() {
        if let Ok(canon) = std::fs::canonicalize(&absolute_path) {
            check_blocked_locations(&canon, home.as_deref())?;
        }
    } else {
        let mut curr = absolute_path.parent();
        while let Some(parent) = curr {
            if parent.exists() {
                if let Ok(canon_parent) = std::fs::canonicalize(parent) {
                    check_blocked_locations(&canon_parent, home.as_deref())?;
                }
                break;
            }
            curr = parent.parent();
        }
    }

    Ok(absolute_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_valid_safe_path() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("export.csv");
        let path_str = file_path.to_str().unwrap();

        let res = validate_safe_transfer_path(path_str, &["csv", "json"]);
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), file_path);
    }

    #[test]
    fn test_rejects_empty_and_null_bytes() {
        assert!(validate_safe_transfer_path("", &["csv"]).is_err());
        assert!(validate_safe_transfer_path("   ", &["csv"]).is_err());
        assert!(validate_safe_transfer_path("/tmp/test\0.csv", &["csv"]).is_err());
    }

    #[test]
    fn test_rejects_directory_traversal() {
        let cases = [
            "../../../etc/passwd",
            "/tmp/../../etc/passwd.csv",
            "folder/sub/../../../etc/shadow.csv",
            "test/..\\secret.csv",
            "%2e%2e/data.json",
        ];
        for c in cases {
            let res = validate_safe_transfer_path(c, &["csv", "json", "txt"]);
            assert!(res.is_err(), "Expected rejection for {}", c);
            let err = res.err().unwrap();
            assert!(
                err.contains("Directory traversal") || err.contains("dangerous system location"),
                "Unexpected err: {} for {}",
                err,
                c
            );
        }
    }

    #[test]
    fn test_rejects_dangerous_system_directories() {
        let system_paths = [
            "/etc/passwd.csv",
            "/private/etc/hosts.sql",
            "/System/Library/CoreServices/SystemVersion.plist.txt",
            "/usr/bin/python.csv",
            "/bin/sh.json",
            "/sbin/ping.txt",
            "/dev/null.csv",
            "/proc/cpuinfo.txt",
            "/sys/kernel.csv",
            "/var/root/secret.sql",
        ];
        for path in system_paths {
            let res = validate_safe_transfer_path(path, &["csv", "sql", "json", "txt"]);
            assert!(res.is_err(), "Expected rejection for {}", path);
            let err = res.err().unwrap();
            assert!(
                err.contains("dangerous system location"),
                "Expected system location error, got: {} for {}",
                err,
                path
            );
        }
    }

    #[test]
    fn test_rejects_sensitive_user_folders_and_vault() {
        let sensitive = [
            "~/.ssh/id_rsa.csv",
            "~/.ssh/authorized_keys.txt",
            "~/.gnupg/secring.gpg.sql",
            "~/.datacore/vault.enc",
            "~/.datacore/.vault.key",
            "/tmp/fake/.ssh/key.csv",
            "/tmp/fake/.gnupg/key.sql",
        ];
        for path in sensitive {
            let res = validate_safe_transfer_path(path, &["csv", "sql", "enc", "key", "txt"]);
            assert!(res.is_err(), "Expected rejection for {}", path);
            let err = res.err().unwrap();
            assert!(
                err.contains("sensitive") || err.contains("denied"),
                "Expected sensitive rejection, got: {} for {}",
                err,
                path
            );
        }
    }

    #[test]
    fn test_extension_validation() {
        let dir = tempdir().unwrap();
        let good_csv = dir.path().join("data.CSV");
        let good_json = dir.path().join("data.ndjson");
        let bad_ext = dir.path().join("data.exe");
        let no_ext = dir.path().join("data");

        assert!(validate_safe_transfer_path(good_csv.to_str().unwrap(), &["csv", "json"]).is_ok());
        assert!(validate_safe_transfer_path(good_json.to_str().unwrap(), &["csv", "ndjson"]).is_ok());

        let res_bad = validate_safe_transfer_path(bad_ext.to_str().unwrap(), &["csv", "json"]);
        assert!(res_bad.is_err());
        assert!(res_bad.err().unwrap().contains("not allowed"));

        let res_no_ext = validate_safe_transfer_path(no_ext.to_str().unwrap(), &["csv", "json"]);
        assert!(res_no_ext.is_err());
        assert!(res_no_ext.err().unwrap().contains("no extension"));
    }

    #[test]
    fn test_tilde_expansion_for_user() {
        if let Some(home) = get_home_dir() {
            let res = validate_safe_transfer_path("~/test_export.csv", &["csv"]);
            assert!(res.is_ok());
            assert_eq!(res.unwrap(), home.join("test_export.csv"));

            // Other user's tilde is rejected
            let res_other = validate_safe_transfer_path("~otheruser/test.csv", &["csv"]);
            assert!(res_other.is_err());
        }
    }

    #[test]
    fn test_dot_resolution() {
        let dir = tempdir().unwrap();
        let nested = dir.path().join("foo").join(".").join("bar.csv");
        let res = validate_safe_transfer_path(nested.to_str().unwrap(), &["csv"]);
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), dir.path().join("foo").join("bar.csv"));
    }
}
