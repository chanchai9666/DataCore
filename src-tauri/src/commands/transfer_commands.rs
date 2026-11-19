use crate::commands::db::resolve_connection_credentials;
use crate::models::transfer::{
    CrossDbCopyResult, CrossDbCopyTableOptions, DuplicateTableOptions, SqlExportOptions,
    SqlExportResult, SqlImportOptions, SqlImportResult,
};
use crate::models::{
    DatabaseDriver, ExportOptions, ExportResult, ImportOptions, ImportPreview, ImportResult,
    TableMetadata,
};
use crate::services::audit_logger::{AuditLogEntryInput, AuditLogger};
use crate::services::connection_store::ConnectionStore;
use crate::services::cross_db_transfer::copy_table_cross_db_impl;
use crate::services::data_transfer::{
    cancel_transfer_job, export_data_with_progress_impl, import_data_impl,
    preview_import_file_impl, register_transfer_job, remove_cancellation_token,
};
use crate::services::duplicate_table::duplicate_table_impl;
use crate::services::path_guard::validate_safe_transfer_path;
use crate::services::sql_transfer::{export_sql_with_progress_impl, import_sql_impl};
use crate::services::table_list::get_table_list_metadata_impl;
use crate::session::SessionManager;
use tauri::{AppHandle, Emitter, State};

const ALLOWED_DATA_EXTS: &[&str] = &[
    "csv", "tsv", "json", "ndjson", "jsonl", "txt", "gz", "gzip", "zst", "zstd",
];
const ALLOWED_SQL_EXTS: &[&str] = &["sql", "txt"];
const ALLOWED_BACKUP_EXTS: &[&str] = &[
    "sql", "dump", "backup", "tar", "db", "sqlite", "sqlite3", "bak", "txt",
];

#[tauri::command]
pub async fn get_table_list_metadata(
    store: State<'_, ConnectionStore>,
    session_mgr: State<'_, SessionManager>,
    connection_id: String,
    schema: Option<String>,
) -> Result<Vec<TableMetadata>, String> {
    let (config, password) = resolve_connection_credentials(&store, &session_mgr, &connection_id)
        .await
        .map_err(|e| e.to_string())?;
    let conn = SessionManager::create_connection(&config, password.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    get_table_list_metadata_impl(conn.as_ref(), config.driver, schema.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn preview_import_file(
    file_path: String,
    delimiter: Option<char>,
) -> Result<ImportPreview, String> {
    let safe_path = validate_safe_transfer_path(&file_path, ALLOWED_DATA_EXTS)?;
    let safe_str = safe_path.to_string_lossy().to_string();
    preview_import_file_impl(&safe_str, delimiter).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_data(
    app: AppHandle,
    store: State<'_, ConnectionStore>,
    session_mgr: State<'_, SessionManager>,
    connection_id: String,
    sql: String,
    file_path: String,
    options: ExportOptions,
) -> Result<ExportResult, String> {
    let safe_path = validate_safe_transfer_path(&file_path, ALLOWED_DATA_EXTS)?;
    let safe_str = safe_path.to_string_lossy().to_string();

    let (config, password) = resolve_connection_credentials(&store, &session_mgr, &connection_id)
        .await
        .map_err(|e| e.to_string())?;
    let conn = match SessionManager::create_connection(&config, password.as_deref()).await {
        Ok(c) => c,
        Err(e) => {
            if let Some(ref jid) = options.job_id {
                remove_cancellation_token(jid);
            }
            return Err(e.to_string());
        }
    };

    if let Some(ref jid) = options.job_id {
        register_transfer_job(jid, conn.clone());
    }

    let on_progress = move |progress| {
        let _ = app.emit("transfer://progress", progress);
    };

    let res =
        export_data_with_progress_impl(conn.as_ref(), &sql, &safe_str, &options, Some(on_progress))
            .await
            .map_err(|e| e.to_string());

    let (status, rows, err) = match &res {
        Ok(r) => ("SUCCESS", Some(r.total_rows as u64), None),
        Err(e) => ("FAILURE", None, Some(e.clone())),
    };
    let _ = AuditLogger::global().log(AuditLogEntryInput {
        action: "EXPORT".to_string(),
        connection_id: Some(connection_id),
        connection_name: Some(config.name),
        query: Some(sql),
        rows_affected: rows,
        status: status.to_string(),
        error_message: err,
        details: Some(format!("file={}", safe_str)),
        ..Default::default()
    });

    res
}

#[tauri::command]
pub async fn import_data(
    app: AppHandle,
    store: State<'_, ConnectionStore>,
    session_mgr: State<'_, SessionManager>,
    connection_id: String,
    table: String,
    options: ImportOptions,
) -> Result<ImportResult, String> {
    let safe_path = validate_safe_transfer_path(&options.file_path, ALLOWED_DATA_EXTS)?;
    let mut options = options;
    options.file_path = safe_path.to_string_lossy().to_string();

    let (config, password) = resolve_connection_credentials(&store, &session_mgr, &connection_id)
        .await
        .map_err(|e| e.to_string())?;
    let conn = SessionManager::create_connection(&config, password.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    let dialect = match config.driver {
        DatabaseDriver::Sqlite => "sqlite",
        DatabaseDriver::Postgres => "postgres",
        DatabaseDriver::Mysql => "mysql",
        DatabaseDriver::Duckdb => "duckdb",
        DatabaseDriver::Mssql => "mssql",
    };

    let on_progress = move |progress| {
        let _ = app.emit("transfer://progress", progress);
    };

    if let Some(ref jid) = options.job_id {
        register_transfer_job(jid, conn.clone());
    }

    let file_str = options.file_path.clone();
    let res = import_data_impl(conn.as_ref(), &table, &options, dialect, Some(on_progress))
        .await
        .map_err(|e| e.to_string());

    let (status, rows, err) = match &res {
        Ok(r) => ("SUCCESS", Some(r.imported_rows as u64), None),
        Err(e) => ("FAILURE", None, Some(e.clone())),
    };
    let _ = AuditLogger::global().log(AuditLogEntryInput {
        action: "IMPORT".to_string(),
        connection_id: Some(connection_id),
        connection_name: Some(config.name),
        database: Some(table),
        rows_affected: rows,
        status: status.to_string(),
        error_message: err,
        details: Some(format!("file={}", file_str)),
        ..Default::default()
    });

    res
}

#[tauri::command]
pub async fn duplicate_table(
    store: State<'_, ConnectionStore>,
    session_mgr: State<'_, SessionManager>,
    options: DuplicateTableOptions,
) -> Result<(), String> {
    let (config, password) =
        resolve_connection_credentials(&store, &session_mgr, &options.connection_id)
            .await
            .map_err(|e| e.to_string())?;
    let conn = SessionManager::create_connection(&config, password.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    let res = duplicate_table_impl(conn.as_ref(), config.driver, &options)
        .await
        .map_err(|e| e.to_string());

    let (status, err) = match &res {
        Ok(_) => ("SUCCESS", None),
        Err(e) => ("FAILURE", Some(e.clone())),
    };
    let _ = AuditLogger::global().log(AuditLogEntryInput {
        action: "DDL".to_string(),
        connection_id: Some(options.connection_id.clone()),
        connection_name: Some(config.name),
        status: status.to_string(),
        error_message: err,
        details: Some(format!(
            "duplicate source={} target={}",
            options.source_table, options.new_table_name
        )),
        ..Default::default()
    });

    res
}

#[tauri::command]
pub async fn export_sql(
    app: AppHandle,
    store: State<'_, ConnectionStore>,
    session_mgr: State<'_, SessionManager>,
    options: SqlExportOptions,
) -> Result<SqlExportResult, String> {
    let safe_path = validate_safe_transfer_path(&options.file_path, ALLOWED_SQL_EXTS)?;
    let mut options = options;
    options.file_path = safe_path.to_string_lossy().to_string();

    let (config, password) =
        resolve_connection_credentials(&store, &session_mgr, &options.connection_id)
            .await
            .map_err(|e| e.to_string())?;
    let conn = SessionManager::create_connection(&config, password.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    if let Some(ref jid) = options.job_id {
        register_transfer_job(jid, conn.clone());
    }

    let on_progress = move |progress| {
        let _ = app.emit("transfer://progress", progress);
    };

    let file_str = options.file_path.clone();
    let res =
        export_sql_with_progress_impl(conn.as_ref(), config.driver, &options, Some(on_progress))
            .await
            .map_err(|e| e.to_string());

    let (status, err) = match &res {
        Ok(_) => ("SUCCESS", None),
        Err(e) => ("FAILURE", Some(e.clone())),
    };
    let _ = AuditLogger::global().log(AuditLogEntryInput {
        action: "EXPORT".to_string(),
        connection_id: Some(options.connection_id.clone()),
        connection_name: Some(config.name),
        status: status.to_string(),
        error_message: err,
        details: Some(format!("sql_file={}", file_str)),
        ..Default::default()
    });

    res
}

#[tauri::command]
pub async fn import_sql(
    app: AppHandle,
    store: State<'_, ConnectionStore>,
    session_mgr: State<'_, SessionManager>,
    options: SqlImportOptions,
) -> Result<SqlImportResult, String> {
    let safe_path = validate_safe_transfer_path(&options.file_path, ALLOWED_SQL_EXTS)?;
    let mut options = options;
    options.file_path = safe_path.to_string_lossy().to_string();

    let (config, password) =
        resolve_connection_credentials(&store, &session_mgr, &options.connection_id)
            .await
            .map_err(|e| e.to_string())?;
    let conn = SessionManager::create_connection(&config, password.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    let on_progress = move |progress| {
        let _ = app.emit("transfer://progress", progress);
    };

    if let Some(ref jid) = options.job_id {
        register_transfer_job(jid, conn.clone());
    }

    let file_str = options.file_path.clone();
    let res = import_sql_impl(conn.as_ref(), &options, Some(on_progress))
        .await
        .map_err(|e| e.to_string());

    let (status, rows, err) = match &res {
        Ok(r) => ("SUCCESS", Some(r.successful_statements as u64), None),
        Err(e) => ("FAILURE", None, Some(e.clone())),
    };
    let _ = AuditLogger::global().log(AuditLogEntryInput {
        action: "IMPORT".to_string(),
        connection_id: Some(options.connection_id.clone()),
        connection_name: Some(config.name),
        rows_affected: rows,
        status: status.to_string(),
        error_message: err,
        details: Some(format!("sql_file={}", file_str)),
        ..Default::default()
    });

    res
}

#[tauri::command]
pub async fn cancel_transfer(job_id: String) -> Result<bool, String> {
    Ok(cancel_transfer_job(&job_id).await)
}

#[tauri::command]
pub async fn copy_table_cross_db(
    app: AppHandle,
    store: State<'_, ConnectionStore>,
    session_mgr: State<'_, SessionManager>,
    options: CrossDbCopyTableOptions,
) -> Result<CrossDbCopyResult, String> {
    let (src_config, src_pass) =
        resolve_connection_credentials(&store, &session_mgr, &options.source_connection_id)
            .await
            .map_err(|e| e.to_string())?;
    let src_conn = SessionManager::create_connection(&src_config, src_pass.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    if let Some(ref jid) = options.job_id {
        register_transfer_job(jid, src_conn.clone());
    }

    let (tgt_config, tgt_pass) =
        resolve_connection_credentials(&store, &session_mgr, &options.target_connection_id)
            .await
            .map_err(|e| e.to_string())?;
    let tgt_conn = SessionManager::create_connection(&tgt_config, tgt_pass.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    let on_progress = move |progress| {
        let _ = app.emit("transfer://progress", progress);
    };

    copy_table_cross_db_impl(
        src_conn.as_ref(),
        src_config.driver,
        tgt_conn.as_ref(),
        tgt_config.driver,
        &options,
        Some(on_progress),
    )
    .await
    .map_err(|e| e.to_string())
}

const ALLOWED_TEXT_SAVE_EXTS: &[&str] = &[
    "svg", "xml", "txt", "sql", "json", "csv", "tsv", "md", "html",
];

#[tauri::command]
pub async fn save_text_file(file_path: String, content: String) -> Result<(), String> {
    let safe_path = validate_safe_transfer_path(&file_path, ALLOWED_TEXT_SAVE_EXTS)?;
    std::fs::write(&safe_path, content.as_bytes())
        .map_err(|e| format!("Failed to write file '{}': {}", safe_path.display(), e))
}

#[tauri::command]
pub async fn check_native_cli_availability(
    store: State<'_, ConnectionStore>,
    connection_id: String,
) -> Result<crate::services::NativeCliStatus, String> {
    let config = store
        .get(&connection_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Connection '{}' not found", connection_id))?;
    Ok(crate::services::check_cli_availability_for_driver(config.driver).await)
}

#[tauri::command]
pub async fn start_native_backup(
    app: AppHandle,
    store: State<'_, ConnectionStore>,
    session_mgr: State<'_, SessionManager>,
    task_id: String,
    options: crate::services::NativeBackupOptions,
) -> Result<i32, String> {
    let allowed_exts: &[&str] = if options.format.as_deref() == Some("directory") {
        &[]
    } else {
        ALLOWED_BACKUP_EXTS
    };
    let safe_path = validate_safe_transfer_path(&options.output_file, allowed_exts)?;
    let mut options = options;
    options.output_file = safe_path.to_string_lossy().to_string();

    let (config, password) =
        resolve_connection_credentials(&store, &session_mgr, &options.connection_id)
            .await
            .map_err(|e| e.to_string())?;

    let spec = crate::services::build_backup_command(&config, password.as_deref(), &options)
        .map_err(|e| e.to_string())?;

    let app_clone = app.clone();
    let callback = move |evt: crate::services::NativeProgressEvent| {
        let _ = app_clone.emit("native://progress", evt);
    };

    crate::services::run_native_cli_streaming(task_id, spec, Some(safe_path), callback)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn start_native_restore(
    app: AppHandle,
    store: State<'_, ConnectionStore>,
    session_mgr: State<'_, SessionManager>,
    task_id: String,
    options: crate::services::NativeRestoreOptions,
) -> Result<i32, String> {
    let allowed_exts: &[&str] = if std::path::Path::new(&options.input_file).is_dir() {
        &[]
    } else {
        ALLOWED_BACKUP_EXTS
    };
    let safe_path = validate_safe_transfer_path(&options.input_file, allowed_exts)?;
    let mut options = options;
    options.input_file = safe_path.to_string_lossy().to_string();

    let (config, password) =
        resolve_connection_credentials(&store, &session_mgr, &options.connection_id)
            .await
            .map_err(|e| e.to_string())?;

    let spec = crate::services::build_restore_command(&config, password.as_deref(), &options)
        .map_err(|e| e.to_string())?;

    let app_clone = app.clone();
    let callback = move |evt: crate::services::NativeProgressEvent| {
        let _ = app_clone.emit("native://progress", evt);
    };

    crate::services::run_native_cli_streaming(task_id, spec, None, callback)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_native_task(task_id: String) -> Result<(), String> {
    crate::services::cancel_running_native_task(&task_id)
        .await
        .map_err(|e| e.to_string())
}
