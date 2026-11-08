use tauri::{AppHandle, Emitter, State};
use crate::models::{
    DatabaseDriver, ExportOptions, ExportResult, ImportOptions, ImportPreview, ImportResult,
    TableMetadata,
};
use crate::models::transfer::{
    DuplicateTableOptions, SqlExportOptions, SqlExportResult, SqlImportOptions, SqlImportResult,
};
use crate::services::connection_store::ConnectionStore;
use crate::services::data_transfer::{
    export_data_impl, import_data_impl, preview_import_file_impl,
};
use crate::services::table_list::get_table_list_metadata_impl;
use crate::services::duplicate_table::duplicate_table_impl;
use crate::services::sql_transfer::{export_sql_impl, import_sql_impl};
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

    import_sql_impl(conn.as_ref(), &options, Some(on_progress))
        .await
        .map_err(|e| e.to_string())
}
