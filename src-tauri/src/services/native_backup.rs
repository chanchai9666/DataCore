use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

use crate::error::AppError;
use crate::models::{ConnectionConfig, DatabaseDriver};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NativeCliStatus {
    pub cli_name: String,
    pub available: bool,
    pub path: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeBackupOptions {
    pub connection_id: String,
    pub output_file: String,
    pub format: Option<String>, // "plain", "custom", "tar", "directory"
    pub schema_only: Option<bool>,
    pub data_only: Option<bool>,
    pub clean: Option<bool>,
    pub tables: Option<Vec<String>>,
    pub schemas: Option<Vec<String>>,
    pub compression_level: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeRestoreOptions {
    pub connection_id: String,
    pub input_file: String,
    pub clean: Option<bool>,
    pub single_transaction: Option<bool>,
    pub schema_only: Option<bool>,
    pub data_only: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeProgressEvent {
    pub task_id: String,
    pub line: String,
    pub is_stderr: bool,
}

fn get_running_native_tasks() -> &'static Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>> {
    static TASKS: OnceLock<Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>> = OnceLock::new();
    TASKS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn find_cli_binary(cli_name: &str) -> Option<PathBuf> {
    // 1. Check entries in PATH env
    if let Some(paths) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&paths) {
            let candidate = dir.join(cli_name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    // 2. Check standard macOS & Linux system locations
    let standard_dirs = [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/opt/homebrew/opt/libpq/bin",
        "/usr/local/opt/libpq/bin",
        "/opt/homebrew/opt/mysql-client/bin",
        "/usr/local/opt/mysql-client/bin",
        "/Applications/Postgres.app/Contents/Versions/latest/bin",
    ];

    for dir in &standard_dirs {
        let candidate = Path::new(dir).join(cli_name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    None
}

pub async fn get_cli_version(bin_path: &Path) -> Option<String> {
    let output = Command::new(bin_path)
        .arg("--version")
        .output()
        .await
        .ok()?;

    if output.status.success() {
        let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !text.is_empty() {
            return Some(text);
        }
    }
    None
}

pub async fn check_cli_availability_for_driver(driver: DatabaseDriver) -> NativeCliStatus {
    let cli_name = match driver {
        DatabaseDriver::Postgres => "pg_dump",
        DatabaseDriver::Mysql => "mysqldump",
        DatabaseDriver::Sqlite => "sqlite3",
        DatabaseDriver::Duckdb => "duckdb",
        DatabaseDriver::Mssql => "sqlcmd",
    };

    if let Some(path) = find_cli_binary(cli_name) {
        let version = get_cli_version(&path).await;
        NativeCliStatus {
            cli_name: cli_name.to_string(),
            available: true,
            path: Some(path.to_string_lossy().to_string()),
            version,
        }
    } else {
        NativeCliStatus {
            cli_name: cli_name.to_string(),
            available: false,
            path: None,
            version: None,
        }
    }
}

pub type CliCommandParts = (PathBuf, Vec<String>, HashMap<String, String>);

pub fn build_backup_command(
    config: &ConnectionConfig,
    password: Option<&str>,
    opts: &NativeBackupOptions,
) -> Result<CliCommandParts, AppError> {
    let mut args = Vec::new();
    let mut envs = HashMap::new();

    match config.driver {
        DatabaseDriver::Postgres => {
            let bin = find_cli_binary("pg_dump").ok_or_else(|| {
                AppError::NotFound("pg_dump CLI not found on system. Please install PostgreSQL client tools.".into())
            })?;

            if let Some(host) = &config.host {
                args.push("-h".to_string());
                args.push(host.clone());
            }
            if let Some(port) = config.port {
                args.push("-p".to_string());
                args.push(port.to_string());
            }
            if let Some(user) = &config.user {
                args.push("-U".to_string());
                args.push(user.clone());
            }

            if let Some(fmt) = &opts.format {
                match fmt.as_str() {
                    "custom" => args.push("-Fc".to_string()),
                    "tar" => args.push("-Ft".to_string()),
                    "directory" => args.push("-Fd".to_string()),
                    _ => args.push("-Fp".to_string()),
                }
            }

            if opts.schema_only.unwrap_or(false) {
                args.push("--schema-only".to_string());
            }
            if opts.data_only.unwrap_or(false) {
                args.push("--data-only".to_string());
            }
            if opts.clean.unwrap_or(false) {
                args.push("--clean".to_string());
            }

            if let Some(compress) = opts.compression_level {
                args.push(format!("--compress={}", compress));
            }

            if let Some(schemas) = &opts.schemas {
                for s in schemas {
                    args.push("-n".to_string());
                    args.push(s.clone());
                }
            }

            if let Some(tables) = &opts.tables {
                for t in tables {
                    args.push("-t".to_string());
                    args.push(t.clone());
                }
            }

            args.push("-f".to_string());
            args.push(opts.output_file.clone());

            args.push(config.database.clone());

            if let Some(pwd) = password {
                envs.insert("PGPASSWORD".to_string(), pwd.to_string());
            }

            Ok((bin, args, envs))
        }
        DatabaseDriver::Mysql => {
            let bin = find_cli_binary("mysqldump").ok_or_else(|| {
                AppError::NotFound("mysqldump CLI not found on system. Please install MySQL client tools.".into())
            })?;

            if let Some(host) = &config.host {
                args.push(format!("--host={}", host));
            }
            if let Some(port) = config.port {
                args.push(format!("--port={}", port));
            }
            if let Some(user) = &config.user {
                args.push(format!("--user={}", user));
            }
            if let Some(pwd) = password {
                args.push(format!("--password={}", pwd));
            }

            if opts.schema_only.unwrap_or(false) {
                args.push("--no-data".to_string());
            }
            if opts.data_only.unwrap_or(false) {
                args.push("--no-create-info".to_string());
            }
            if opts.clean.unwrap_or(false) {
                args.push("--add-drop-table".to_string());
            }

            args.push(format!("--result-file={}", opts.output_file));
            args.push(config.database.clone());

            if let Some(tables) = &opts.tables {
                for t in tables {
                    args.push(t.clone());
                }
            }

            Ok((bin, args, envs))
        }
        DatabaseDriver::Sqlite => {
            let bin = find_cli_binary("sqlite3").ok_or_else(|| {
                AppError::NotFound("sqlite3 CLI not found on system.".into())
            })?;

            args.push(config.database.clone());
            if opts.schema_only.unwrap_or(false) {
                args.push(".schema".to_string());
            } else {
                args.push(format!(".backup '{}'", opts.output_file.replace('\'', "''")));
            }

            Ok((bin, args, envs))
        }
        DatabaseDriver::Duckdb | DatabaseDriver::Mssql => {
            Err(AppError::NotSupported("Native CLI backup for DuckDB / MSSQL is not supported via wrapper. Please use SQL Export.".into()))
        }
    }
}

pub fn build_restore_command(
    config: &ConnectionConfig,
    password: Option<&str>,
    opts: &NativeRestoreOptions,
) -> Result<CliCommandParts, AppError> {
    let mut args = Vec::new();
    let mut envs = HashMap::new();

    match config.driver {
        DatabaseDriver::Postgres => {
            let bin = find_cli_binary("pg_restore").ok_or_else(|| {
                AppError::NotFound("pg_restore CLI not found on system.".into())
            })?;

            if let Some(host) = &config.host {
                args.push("-h".to_string());
                args.push(host.clone());
            }
            if let Some(port) = config.port {
                args.push("-p".to_string());
                args.push(port.to_string());
            }
            if let Some(user) = &config.user {
                args.push("-U".to_string());
                args.push(user.clone());
            }
            if opts.clean.unwrap_or(false) {
                args.push("--clean".to_string());
            }
            if opts.single_transaction.unwrap_or(false) {
                args.push("--single-transaction".to_string());
            }
            if opts.schema_only.unwrap_or(false) {
                args.push("--schema-only".to_string());
            }
            if opts.data_only.unwrap_or(false) {
                args.push("--data-only".to_string());
            }

            args.push("-d".to_string());
            args.push(config.database.clone());
            args.push(opts.input_file.clone());

            if let Some(pwd) = password {
                envs.insert("PGPASSWORD".to_string(), pwd.to_string());
            }

            Ok((bin, args, envs))
        }
        DatabaseDriver::Mysql => {
            let bin = find_cli_binary("mysql").ok_or_else(|| {
                AppError::NotFound("mysql CLI not found on system.".into())
            })?;

            if let Some(host) = &config.host {
                args.push(format!("--host={}", host));
            }
            if let Some(port) = config.port {
                args.push(format!("--port={}", port));
            }
            if let Some(user) = &config.user {
                args.push(format!("--user={}", user));
            }
            if let Some(pwd) = password {
                args.push(format!("--password={}", pwd));
            }

            args.push(format!("--database={}", config.database));
            args.push(format!("--execute=source {}", opts.input_file));

            Ok((bin, args, envs))
        }
        DatabaseDriver::Sqlite => {
            let bin = find_cli_binary("sqlite3").ok_or_else(|| {
                AppError::NotFound("sqlite3 CLI not found on system.".into())
            })?;

            args.push(config.database.clone());
            args.push(format!(".restore '{}'", opts.input_file.replace('\'', "''")));

            Ok((bin, args, envs))
        }
        DatabaseDriver::Duckdb | DatabaseDriver::Mssql => {
            Err(AppError::NotSupported("Native CLI restore for DuckDB / MSSQL is not supported via wrapper. Please use SQL Import.".into()))
        }
    }
}

pub async fn cancel_running_native_task(task_id: &str) -> Result<(), AppError> {
    let mut map = get_running_native_tasks().lock().await;
    if let Some(sender) = map.remove(task_id) {
        let _ = sender.send(());
        Ok(())
    } else {
        Err(AppError::NotFound(format!("Task '{}' not found or already finished", task_id)))
    }
}

pub async fn run_native_cli_streaming<F>(
    task_id: String,
    bin_path: PathBuf,
    args: Vec<String>,
    envs: HashMap<String, String>,
    progress_callback: F,
) -> Result<i32, AppError>
where
    F: Fn(NativeProgressEvent) + Send + Sync + 'static,
{
    let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel::<()>();

    {
        let mut map = get_running_native_tasks().lock().await;
        map.insert(task_id.clone(), cancel_tx);
    }

    let mut cmd = Command::new(bin_path);
    cmd.args(&args)
        .envs(&envs)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| AppError::Other(format!("Failed to spawn process: {}", e)))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let cb_arc = Arc::new(progress_callback);

    let stdout_handle = tokio::spawn({
        let cb = cb_arc.clone();
        let tid = task_id.clone();
        async move {
            if let Some(out) = stdout {
                let mut reader = BufReader::new(out).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    cb(NativeProgressEvent {
                        task_id: tid.clone(),
                        line,
                        is_stderr: false,
                    });
                }
            }
        }
    });

    let stderr_handle = tokio::spawn({
        let cb = cb_arc.clone();
        let tid = task_id.clone();
        async move {
            if let Some(err) = stderr {
                let mut reader = BufReader::new(err).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    cb(NativeProgressEvent {
                        task_id: tid.clone(),
                        line,
                        is_stderr: true,
                    });
                }
            }
        }
    });

    let exit_code = tokio::select! {
        _ = &mut cancel_rx => {
            let _ = child.kill().await;
            {
                let mut map = get_running_native_tasks().lock().await;
                map.remove(&task_id);
            }
            return Err(AppError::Cancelled("Native operation was cancelled by user".into()));
        }
        res = child.wait() => {
            match res {
                Ok(status) => status.code().unwrap_or(0),
                Err(e) => return Err(AppError::Other(format!("Process error: {}", e))),
            }
        }
    };

    let _ = stdout_handle.await;
    let _ = stderr_handle.await;

    {
        let mut map = get_running_native_tasks().lock().await;
        map.remove(&task_id);
    }

    Ok(exit_code)
}
