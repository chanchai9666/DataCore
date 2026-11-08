use tauri::State;
use crate::drivers::SchemaNode;
use crate::error::AppError;
use crate::models::{ConnectionConfig, QueryResult};
use crate::services::ConnectionStore;
use crate::session::SessionManager;

// ============================================================================
// Core Implementations (Callable by unit tests and commands alike)
// ============================================================================

pub async fn test_connection_impl(
    store: &ConnectionStore,
    config: &ConnectionConfig,
    password: Option<&str>,
) -> Result<u64, AppError> {
    let resolved_password = match password {
        Some(p) if !p.is_empty() => Some(p.to_string()),
        _ => store.get_password(&config.id).ok().flatten(),
    };
    let conn = SessionManager::create_connection(config, resolved_password.as_deref()).await?;
    conn.test_connection().await
}

pub fn get_connections_impl(store: &ConnectionStore) -> Result<Vec<ConnectionConfig>, AppError> {
    store.list()
}

pub fn save_connection_impl(
    store: &ConnectionStore,
    config: &ConnectionConfig,
    password: Option<&str>,
) -> Result<(), AppError> {
    store.save_connection(config, password)
}

pub fn delete_connection_impl(
    store: &ConnectionStore,
    connection_id: &str,
) -> Result<(), AppError> {
    store.delete_connection(connection_id)
}

pub async fn open_session_impl(
    store: &ConnectionStore,
    session_mgr: &SessionManager,
    connection_id: &str,
    tab_id: &str,
) -> Result<(), AppError> {
    let config = store
        .get(connection_id)?
        .ok_or_else(|| AppError::NotFound(format!("Connection '{}' not found", connection_id)))?;
    let password = store.get_password(connection_id)?;
    session_mgr
        .open_session(tab_id, connection_id, &config, password.as_deref())
        .await?;
    Ok(())
}

pub async fn close_session_impl(
    session_mgr: &SessionManager,
    tab_id: &str,
) -> Result<(), AppError> {
    session_mgr.close_session(tab_id).await
}

pub async fn disconnect_connection_impl(
    session_mgr: &SessionManager,
    connection_id: &str,
) -> Result<usize, AppError> {
    session_mgr.close_sessions_for_connection(connection_id).await
}

pub async fn execute_query_impl(
    session_mgr: &SessionManager,
    tab_id: &str,
    sql: &str,
) -> Result<QueryResult, AppError> {
    let conn = session_mgr.get_session(tab_id).await?;
    conn.execute_query(sql).await
}

#[allow(clippy::too_many_arguments)]
pub async fn fetch_table_data_impl(
    session_mgr: &SessionManager,
    tab_id: &str,
    schema: Option<&str>,
    table: &str,
    limit: u32,
    offset: u32,
    filter: Option<&str>,
    sort_col: Option<&str>,
    sort_dir: Option<&str>,
) -> Result<QueryResult, AppError> {
    let conn = session_mgr.get_session(tab_id).await?;
    conn.fetch_table_data(schema, table, limit, offset, filter, sort_col, sort_dir).await
}

pub async fn cancel_query_impl(
    session_mgr: &SessionManager,
    tab_id: &str,
) -> Result<(), AppError> {
    let conn = session_mgr.get_session(tab_id).await?;
    conn.cancel().await
}

pub async fn set_autocommit_impl(
    session_mgr: &SessionManager,
    tab_id: &str,
    enabled: bool,
) -> Result<(), AppError> {
    let conn = session_mgr.get_session(tab_id).await?;
    conn.set_autocommit(enabled).await
}

pub async fn commit_transaction_impl(
    session_mgr: &SessionManager,
    tab_id: &str,
) -> Result<(), AppError> {
    let conn = session_mgr.get_session(tab_id).await?;
    conn.commit().await
}

pub async fn rollback_transaction_impl(
    session_mgr: &SessionManager,
    tab_id: &str,
) -> Result<(), AppError> {
    let conn = session_mgr.get_session(tab_id).await?;
    conn.rollback().await
}

pub async fn get_schema_tree_impl(
    store: &ConnectionStore,
    connection_id: &str,
) -> Result<Vec<SchemaNode>, AppError> {
    let config = store
        .get(connection_id)?
        .ok_or_else(|| AppError::NotFound(format!("Connection '{}' not found", connection_id)))?;
    let password = store.get_password(connection_id)?;
    let conn = SessionManager::create_connection(&config, password.as_deref()).await?;
    conn.fetch_schema_tree().await
}

// ============================================================================
// Tauri IPC Commands
// ============================================================================

#[tauri::command]
pub async fn test_connection(
    store: State<'_, ConnectionStore>,
    config: ConnectionConfig,
    password: Option<String>,
) -> Result<u64, String> {
    test_connection_impl(&store, &config, password.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_connections(
    store: State<'_, ConnectionStore>,
) -> Result<Vec<ConnectionConfig>, String> {
    get_connections_impl(&store).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_connection(
    store: State<'_, ConnectionStore>,
    config: ConnectionConfig,
    password: Option<String>,
) -> Result<(), String> {
    save_connection_impl(&store, &config, password.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_connection(
    store: State<'_, ConnectionStore>,
    connection_id: String,
) -> Result<(), String> {
    delete_connection_impl(&store, &connection_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_stored_password(
    store: State<'_, ConnectionStore>,
    connection_id: String,
) -> Result<Option<String>, String> {
    store.get_password(&connection_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_stored_password(
    store: State<'_, ConnectionStore>,
    connection_id: String,
) -> Result<(), String> {
    store.delete_password(&connection_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_session(
    store: State<'_, ConnectionStore>,
    session_mgr: State<'_, SessionManager>,
    connection_id: String,
    tab_id: String,
) -> Result<(), String> {
    open_session_impl(&store, &session_mgr, &connection_id, &tab_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn close_session(
    session_mgr: State<'_, SessionManager>,
    tab_id: String,
) -> Result<(), String> {
    close_session_impl(&session_mgr, &tab_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn disconnect_connection(
    session_mgr: State<'_, SessionManager>,
    connection_id: String,
) -> Result<usize, String> {
    disconnect_connection_impl(&session_mgr, &connection_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn execute_query(
    session_mgr: State<'_, SessionManager>,
    tab_id: String,
    sql: String,
) -> Result<QueryResult, String> {
    execute_query_impl(&session_mgr, &tab_id, &sql)
        .await
        .map_err(|e| e.to_string())
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn fetch_table_data(
    session_mgr: State<'_, SessionManager>,
    tab_id: String,
    schema: Option<String>,
    table: String,
    limit: u32,
    offset: u32,
    filter: Option<String>,
    sort_col: Option<String>,
    sort_dir: Option<String>,
) -> Result<QueryResult, String> {
    fetch_table_data_impl(
        &session_mgr,
        &tab_id,
        schema.as_deref(),
        &table,
        limit,
        offset,
        filter.as_deref(),
        sort_col.as_deref(),
        sort_dir.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_query(
    session_mgr: State<'_, SessionManager>,
    tab_id: String,
) -> Result<(), String> {
    cancel_query_impl(&session_mgr, &tab_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_autocommit(
    session_mgr: State<'_, SessionManager>,
    tab_id: String,
    enabled: bool,
) -> Result<(), String> {
    set_autocommit_impl(&session_mgr, &tab_id, enabled)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn commit_transaction(
    session_mgr: State<'_, SessionManager>,
    tab_id: String,
) -> Result<(), String> {
    commit_transaction_impl(&session_mgr, &tab_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rollback_transaction(
    session_mgr: State<'_, SessionManager>,
    tab_id: String,
) -> Result<(), String> {
    rollback_transaction_impl(&session_mgr, &tab_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_schema_tree(
    store: State<'_, ConnectionStore>,
    connection_id: String,
) -> Result<Vec<SchemaNode>, String> {
    get_schema_tree_impl(&store, &connection_id)
        .await
        .map_err(|e| e.to_string())
}
