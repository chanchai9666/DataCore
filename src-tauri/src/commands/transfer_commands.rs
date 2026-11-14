use tauri::{AppHandle, Emitter, State};
use crate::models::{
    DatabaseDriver, ExportOptions, ExportResult, ImportOptions, ImportPreview, ImportResult,
    TableMetadata,
};
use crate::models::transfer::{
    CrossDbCopyResult, CrossDbCopyTableOptions, DuplicateTableOptions, SqlExportOptions,
    SqlExportResult, SqlImportOptions, SqlImportResult,
};
use crate::services::audit_logger::{AuditLogEntryInput, AuditLogger};
use crate::services::connection_store::ConnectionStore;
use crate::services::data_transfer::{
    export_data_impl, import_data_impl, preview_import_file_impl,
    register_cancellation_token, trigger_cancellation,
};
use crate::services::table_list::get_table_list_metadata_impl;
use crate::services::duplicate_table::duplicate_table_impl;
use crate::services::sql_transfer::{export_sql_impl, import_sql_impl};
use crate::services::cross_db_transfer::copy_table_cross_db_impl;
use crate::services::path_guard::validate_safe_transfer_path;
use crate::session::SessionManager;

const ALLOWED_DATA_EXTS: &[&str] = &["csv", "tsv", "json", "ndjson", "jsonl", "txt"];
const ALLOWED_SQL_EXTS: &[&str] = &["sql", "txt"];

#[tauri::command]
pub async fn get_table_list_metadata(
    store: State<'_, ConnectionStore>,
    connection_id: String,
    schema: Option<String>,
) -> Result<Vec<TableMetadata>, String> {
    let config = store
        .get(&connection_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Connection '{}' not found", connection_id))?;
    let password = store.get_password(&connection_id).map_err(|e| e.to_string())?;
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
    store: State<'_, ConnectionStore>,
    connection_id: String,
    sql: String,
    file_path: String,
    options: ExportOptions,
) -> Result<ExportResult, String> {
    let safe_path = validate_safe_transfer_path(&file_path, ALLOWED_DATA_EXTS)?;
    let safe_str = safe_path.to_string_lossy().to_string();

    if let Some(ref jid) = options.job_id {
        register_cancellation_token(jid);
    }

    let config = store
        .get(&connection_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Connection '{}' not found", connection_id))?;
    let password = store.get_password(&connection_id).map_err(|e| e.to_string())?;
    let conn = SessionManager::create_connection(&config, password.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    let res = export_data_impl(conn.as_ref(), &sql, &safe_str, &options)
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
    connection_id: String,
    table: String,
    options: ImportOptions,
) -> Result<ImportResult, String> {
    let safe_path = validate_safe_transfer_path(&options.file_path, ALLOWED_DATA_EXTS)?;
    let mut options = options;
    options.file_path = safe_path.to_string_lossy().to_string();

    let config = store
        .get(&connection_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Connection '{}' not found", connection_id))?;
    let password = store.get_password(&connection_id).map_err(|e| e.to_string())?;
    let conn = SessionManager::create_connection(&config, password.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    let dialect = match config.driver {
        DatabaseDriver::Sqlite => "sqlite",
        DatabaseDriver::Postgres => "postgres",
        DatabaseDriver::Mysql => "mysql",
    };

    let on_progress = move |progress| {
        let _ = app.emit("transfer://progress", progress);
    };

    if let Some(ref jid) = options.job_id {
        register_cancellation_token(jid);
    }

    let file_str = options.file_path.clone();
    let res = import_data_impl(
        conn.as_ref(),
        &table,
        &options,
        dialect,
        Some(on_progress),
    )
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
    options: DuplicateTableOptions,
) -> Result<(), String> {
    let config = store
        .get(&options.connection_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Connection '{}' not found", options.connection_id))?;
    let password = store.get_password(&options.connection_id).map_err(|e| e.to_string())?;
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
    store: State<'_, ConnectionStore>,
    options: SqlExportOptions,
) -> Result<SqlExportResult, String> {
    let safe_path = validate_safe_transfer_path(&options.file_path, ALLOWED_SQL_EXTS)?;
    let mut options = options;
    options.file_path = safe_path.to_string_lossy().to_string();

    if let Some(ref jid) = options.job_id {
        register_cancellation_token(jid);
    }

    let config = store
        .get(&options.connection_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Connection '{}' not found", options.connection_id))?;
    let password = store.get_password(&options.connection_id).map_err(|e| e.to_string())?;
    let conn = SessionManager::create_connection(&config, password.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    let file_str = options.file_path.clone();
    let res = export_sql_impl(conn.as_ref(), config.driver, &options)
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
    options: SqlImportOptions,
) -> Result<SqlImportResult, String> {
    let safe_path = validate_safe_transfer_path(&options.file_path, ALLOWED_SQL_EXTS)?;
    let mut options = options;
    options.file_path = safe_path.to_string_lossy().to_string();

    let config = store
        .get(&options.connection_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Connection '{}' not found", options.connection_id))?;
    let password = store.get_password(&options.connection_id).map_err(|e| e.to_string())?;
    let conn = SessionManager::create_connection(&config, password.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    let on_progress = move |progress| {
        let _ = app.emit("transfer://progress", progress);
    };

    if let Some(ref jid) = options.job_id {
        register_cancellation_token(jid);
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
    Ok(trigger_cancellation(&job_id))
}

#[tauri::command]
pub async fn copy_table_cross_db(
    app: AppHandle,
    store: State<'_, ConnectionStore>,
    options: CrossDbCopyTableOptions,
) -> Result<CrossDbCopyResult, String> {
    if let Some(ref jid) = options.job_id {
        register_cancellation_token(jid);
    }

    let src_config = store
        .get(&options.source_connection_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Source connection '{}' not found", options.source_connection_id))?;
    let src_pass = store.get_password(&options.source_connection_id).map_err(|e| e.to_string())?;
    let src_conn = SessionManager::create_connection(&src_config, src_pass.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    let tgt_config = store
        .get(&options.target_connection_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Target connection '{}' not found", options.target_connection_id))?;
    let tgt_pass = store.get_password(&options.target_connection_id).map_err(|e| e.to_string())?;
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
