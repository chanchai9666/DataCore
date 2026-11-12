use tauri::{AppHandle, Emitter, State};
use crate::models::{
    DatabaseDriver, ExportOptions, ExportResult, ImportOptions, ImportPreview, ImportResult,
    TableMetadata,
};
use crate::models::transfer::{
    CrossDbCopyResult, CrossDbCopyTableOptions, DuplicateTableOptions, SqlExportOptions,
    SqlExportResult, SqlImportOptions, SqlImportResult,
};
use crate::services::connection_store::ConnectionStore;
use crate::services::data_transfer::{
    export_data_impl, import_data_impl, preview_import_file_impl,
    register_cancellation_token, trigger_cancellation,
};
use crate::services::table_list::get_table_list_metadata_impl;
use crate::services::duplicate_table::duplicate_table_impl;
use crate::services::sql_transfer::{export_sql_impl, import_sql_impl};
use crate::services::cross_db_transfer::copy_table_cross_db_impl;
use crate::session::SessionManager;

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
    preview_import_file_impl(&file_path, delimiter).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_data(
    store: State<'_, ConnectionStore>,
    connection_id: String,
    sql: String,
    file_path: String,
    options: ExportOptions,
) -> Result<ExportResult, String> {
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

    export_data_impl(conn.as_ref(), &sql, &file_path, &options)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_data(
    app: AppHandle,
    store: State<'_, ConnectionStore>,
    connection_id: String,
    table: String,
    options: ImportOptions,
) -> Result<ImportResult, String> {
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

    import_data_impl(
        conn.as_ref(),
        &table,
        &options,
        dialect,
        Some(on_progress),
    )
    .await
    .map_err(|e| e.to_string())
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

    duplicate_table_impl(conn.as_ref(), config.driver, &options)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_sql(
    store: State<'_, ConnectionStore>,
    options: SqlExportOptions,
) -> Result<SqlExportResult, String> {
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

    export_sql_impl(conn.as_ref(), config.driver, &options)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_sql(
    app: AppHandle,
    store: State<'_, ConnectionStore>,
    options: SqlImportOptions,
) -> Result<SqlImportResult, String> {
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

    import_sql_impl(conn.as_ref(), &options, Some(on_progress))
        .await
        .map_err(|e| e.to_string())
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
