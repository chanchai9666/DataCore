use tauri::State;
use crate::drivers::SchemaNode;
use crate::error::AppError;
use crate::models::{ConnectionConfig, DatabaseDriver, ImpactSimulationResult, QueryResult};
use crate::services::{AuditLogEntryInput, AuditLogger, ConnectionStore};
use crate::session::SessionManager;

// ============================================================================
// Core Implementations (Callable by unit tests and commands alike)
// ============================================================================

pub async fn test_connection_impl(
    store: &ConnectionStore,
    config: &ConnectionConfig,
    password: Option<&str>,
) -> Result<u64, AppError> {
    let mut resolved_config = config.clone();
    if let Some(ref mut ssh) = resolved_config.ssh_tunnel {
        if ssh.enabled && (ssh.passphrase.is_none() || ssh.passphrase.as_deref() == Some("")) {
            ssh.passphrase = store.get_ssh_passphrase(&config.id).ok().flatten();
        }
    }
    let resolved_password = match password {
        Some(p) if !p.is_empty() => Some(p.to_string()),
        _ => store.get_password(&config.id).ok().flatten(),
    };
    let conn = SessionManager::create_connection(&resolved_config, resolved_password.as_deref()).await?;
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
    let mut config = store
        .get(connection_id)?
        .ok_or_else(|| AppError::NotFound(format!("Connection '{}' not found", connection_id)))?;
    if let Some(ref mut ssh) = config.ssh_tunnel {
        if ssh.enabled {
            ssh.passphrase = match session_mgr.get_session_ssh_passphrase(connection_id).await {
                Some(p) => Some(p),
                None => store.get_ssh_passphrase(connection_id).ok().flatten(),
            };
        }
    }
    let password = match session_mgr.get_session_password(connection_id).await {
        Some(p) => Some(p),
        None => store.get_password(connection_id).ok().flatten(),
    };
    session_mgr
        .open_session(tab_id, connection_id, &config, password.as_deref())
        .await?;

    let _ = AuditLogger::global().log(AuditLogEntryInput {
        action: "CONNECT".to_string(),
        connection_id: Some(connection_id.to_string()),
        connection_name: Some(config.name),
        status: "SUCCESS".to_string(),
        details: Some(format!("tab_id={}", tab_id)),
        ..Default::default()
    });

    Ok(())
}

pub async fn set_session_password_impl(
    session_mgr: &SessionManager,
    connection_id: &str,
    password: &str,
) -> Result<(), AppError> {
    session_mgr.set_session_password(connection_id, password).await;
    Ok(())
}

pub async fn clear_session_password_impl(
    session_mgr: &SessionManager,
    connection_id: &str,
) -> Result<(), AppError> {
    session_mgr.clear_session_password(connection_id).await;
    Ok(())
}

pub async fn close_session_impl(
    session_mgr: &SessionManager,
    tab_id: &str,
) -> Result<(), AppError> {
    let res = session_mgr.close_session(tab_id).await;
    let _ = AuditLogger::global().log(AuditLogEntryInput {
        action: "DISCONNECT".to_string(),
        status: if res.is_ok() { "SUCCESS".to_string() } else { "FAILURE".to_string() },
        details: Some(format!("tab_id={}", tab_id)),
        ..Default::default()
    });
    res
}

pub async fn disconnect_connection_impl(
    session_mgr: &SessionManager,
    connection_id: &str,
) -> Result<usize, AppError> {
    let closed = session_mgr.close_sessions_for_connection(connection_id).await?;
    crate::services::keychain::clear_mock_store();
    let _ = AuditLogger::global().log(AuditLogEntryInput {
        action: "DISCONNECT".to_string(),
        connection_id: Some(connection_id.to_string()),
        status: "SUCCESS".to_string(),
        details: Some(format!("closed_sessions={}", closed)),
        ..Default::default()
    });
    Ok(closed)
}

pub async fn execute_query_impl(
    session_mgr: &SessionManager,
    tab_id: &str,
    sql: &str,
) -> Result<QueryResult, AppError> {
    let session_entry = session_mgr.get_session_entry(tab_id).await;
    let conn_id = session_entry.as_ref().map(|e| e.connection_id.clone()).ok();
    let conn = match session_entry {
        Ok(e) => e.connection,
        Err(_) => session_mgr.get_session(tab_id).await?,
    };

    let start = std::time::Instant::now();
    let res = conn.execute_query(sql).await;
    let elapsed = start.elapsed().as_millis() as u64;

    let trimmed = sql.trim().to_uppercase();
    let action = if trimmed.starts_with("SELECT") || trimmed.starts_with("WITH") || trimmed.starts_with("EXPLAIN") {
        "QUERY"
    } else if trimmed.starts_with("INSERT") || trimmed.starts_with("UPDATE") || trimmed.starts_with("DELETE") || trimmed.starts_with("REPLACE") {
        "DML"
    } else if trimmed.starts_with("CREATE") || trimmed.starts_with("ALTER") || trimmed.starts_with("DROP") || trimmed.starts_with("TRUNCATE") || trimmed.starts_with("RENAME") {
        "DDL"
    } else if trimmed.starts_with("BEGIN") || trimmed.starts_with("COMMIT") || trimmed.starts_with("ROLLBACK") || trimmed.starts_with("SAVEPOINT") || trimmed.starts_with("RELEASE") {
        "TRANSACTION"
    } else {
        "QUERY"
    };

    let (status, rows, err_msg) = match &res {
        Ok(qr) => ("SUCCESS", qr.rows_affected, None),
        Err(e) => ("FAILURE", None, Some(e.to_string())),
    };

    let _ = AuditLogger::global().log(AuditLogEntryInput {
        action: action.to_string(),
        connection_id: conn_id,
        query: Some(sql.to_string()),
        execution_time_ms: Some(elapsed),
        rows_affected: rows,
        status: status.to_string(),
        error_message: err_msg,
        ..Default::default()
    });

    res
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
    let mut config = store
        .get(connection_id)?
        .ok_or_else(|| AppError::NotFound(format!("Connection '{}' not found", connection_id)))?;
    if let Some(ref mut ssh) = config.ssh_tunnel {
        if ssh.enabled {
            ssh.passphrase = store.get_ssh_passphrase(connection_id).ok().flatten();
        }
    }
    let password = store.get_password(connection_id)?;
    let conn = SessionManager::create_connection(&config, password.as_deref()).await?;
    conn.fetch_schema_tree().await
}

pub fn strip_sql_comments_and_whitespace(sql: &str) -> String {
    let mut result = String::with_capacity(sql.len());
    let mut chars = sql.chars().peekable();
    let mut in_single_quote = false;
    let mut in_double_quote = false;

    while let Some(c) = chars.next() {
        if !in_single_quote && !in_double_quote {
            // Check line comment '--'
            if c == '-' && chars.peek() == Some(&'-') {
                chars.next();
                for nc in chars.by_ref() {
                    if nc == '\n' {
                        result.push('\n');
                        break;
                    }
                }
                continue;
            }
            // Check block comment '/*'
            if c == '/' && chars.peek() == Some(&'*') {
                chars.next();
                while let Some(nc) = chars.next() {
                    if nc == '*' && chars.peek() == Some(&'/') {
                        chars.next();
                        break;
                    }
                }
                continue;
            }
            if c == '\'' {
                in_single_quote = true;
            } else if c == '"' {
                in_double_quote = true;
            }
        } else if in_single_quote && c == '\'' {
            in_single_quote = false;
        } else if in_double_quote && c == '"' {
            in_double_quote = false;
        }
        result.push(c);
    }
    result.trim().to_string()
}

pub fn check_has_where_clause(sql: &str) -> bool {
    let mut in_quote = false;
    let mut quote_char = ' ';
    let mut tokens = Vec::new();
    let mut current_token = String::new();

    for c in sql.chars() {
        if in_quote {
            if c == quote_char {
                in_quote = false;
            }
        } else if c == '\'' || c == '"' || c == '`' {
            in_quote = true;
            quote_char = c;
            if !current_token.is_empty() {
                tokens.push(std::mem::take(&mut current_token));
            }
        } else if c.is_alphanumeric() || c == '_' {
            current_token.push(c);
        } else if !current_token.is_empty() {
            tokens.push(std::mem::take(&mut current_token));
        }
    }
    if !current_token.is_empty() {
        tokens.push(current_token);
    }

    tokens.iter().any(|t| t.eq_ignore_ascii_case("WHERE"))
}

pub fn parse_mutation_info(sql: &str) -> (bool, Option<String>, bool) {
    let cleaned = strip_sql_comments_and_whitespace(sql);
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        return (false, None, false);
    }

    let uppercase = trimmed.to_uppercase();
    let is_delete = uppercase.starts_with("DELETE");
    let is_update = uppercase.starts_with("UPDATE");

    if !is_delete && !is_update {
        return (false, None, false);
    }

    let mut table_name = None;
    if is_delete {
        let rest = trimmed["DELETE".len()..].trim();
        let rest_upper = rest.to_uppercase();
        let target = if rest_upper.starts_with("FROM") {
            rest["FROM".len()..].trim()
        } else {
            rest
        };
        let token = target.split_whitespace().next().unwrap_or("").trim_matches(';');
        if !token.is_empty() {
            let clean_table = token.trim_matches(|c| c == '`' || c == '"' || c == '\'');
            if !clean_table.is_empty() {
                table_name = Some(clean_table.to_string());
            }
        }
    } else if is_update {
        let rest = trimmed["UPDATE".len()..].trim();
        let rest_upper = rest.to_uppercase();
        let target = if rest_upper.starts_with("ONLY") {
            rest["ONLY".len()..].trim()
        } else {
            rest
        };
        let token = target.split_whitespace().next().unwrap_or("").trim_matches(';');
        if !token.is_empty() {
            let clean_table = token.trim_matches(|c| c == '`' || c == '"' || c == '\'');
            if !clean_table.is_empty() {
                table_name = Some(clean_table.to_string());
            }
        }
    }

    let has_where = check_has_where_clause(&cleaned);
    (true, table_name, has_where)
}

pub async fn simulate_query_impact_impl(
    store: &ConnectionStore,
    session_mgr: &SessionManager,
    connection_id: &str,
    sql: &str,
) -> Result<ImpactSimulationResult, AppError> {
    let statements = crate::drivers::sqlite::split_sql_statements(sql);
    if statements.len() != 1 {
        return Ok(ImpactSimulationResult::non_mutation(Some(
            "Impact preview supports only a single DELETE or UPDATE statement at a time.".to_string(),
        )));
    }

    let (is_mutation, table_name, has_where) = parse_mutation_info(sql);
    if !is_mutation {
        return Ok(ImpactSimulationResult::non_mutation(Some(
            "Query is not a DELETE or UPDATE statement. Impact preview is only applicable for data modification statements.".to_string(),
        )));
    }

    let mut config_opt = store.get(connection_id)?;
    if config_opt.is_none() {
        if let Ok(entry) = session_mgr.get_session_entry(connection_id).await {
            config_opt = store.get(&entry.connection_id)?;
        }
    }

    let start = std::time::Instant::now();

    let conn = if let Some(mut config) = config_opt {
        if let Some(ref mut ssh) = config.ssh_tunnel {
            if ssh.enabled {
                ssh.passphrase = match session_mgr.get_session_ssh_passphrase(&config.id).await {
                    Some(p) => Some(p),
                    None => store.get_ssh_passphrase(&config.id).ok().flatten(),
                };
            }
        }
        let password = match session_mgr.get_session_password(&config.id).await {
            Some(p) => Some(p),
            None => store.get_password(&config.id).ok().flatten(),
        };

        if config.driver == DatabaseDriver::Sqlite
            && (config.database == ":memory:" || config.database.starts_with("sqlite::memory:"))
        {
            if let Ok(sess) = session_mgr.get_session(connection_id).await {
                sess
            } else {
                SessionManager::create_connection(&config, password.as_deref()).await?
            }
        } else {
            match SessionManager::create_connection(&config, password.as_deref()).await {
                Ok(c) => c,
                Err(e) => {
                    if let Ok(sess) = session_mgr.get_session(connection_id).await {
                        sess
                    } else {
                        return Err(e);
                    }
                }
            }
        }
    } else if let Ok(sess) = session_mgr.get_session(connection_id).await {
        sess
    } else {
        return Err(AppError::NotFound(format!("Connection '{}' not found", connection_id)));
    };

    let started_tx = conn.execute_query("BEGIN;").await.is_ok();
    let use_savepoint = if !started_tx {
        conn.execute_query("SAVEPOINT _dc_impact_preview;").await?;
        true
    } else {
        false
    };

    let exec_res = conn.execute_query(sql).await;

    if use_savepoint {
        let _ = conn.execute_query("ROLLBACK TO SAVEPOINT _dc_impact_preview;").await;
        let _ = conn.execute_query("RELEASE SAVEPOINT _dc_impact_preview;").await;
    } else {
        let _ = conn.execute_query("ROLLBACK;").await;
    }

    let res = exec_res?;
    let affected_rows = res.rows_affected.unwrap_or(0);
    let execution_time_ms = start.elapsed().as_millis() as u64;

    let warning = if !has_where {
        Some(format!(
            "⚠️ HIGH RISK: No WHERE clause detected! This operation will affect the entire table ({} rows).",
            affected_rows
        ))
    } else if affected_rows > 100 {
        Some(format!(
            "⚠️ High Risk: {} rows will be affected (exceeds warning threshold of 100 rows).",
            affected_rows
        ))
    } else if affected_rows == 0 {
        Some("ℹ️ 0 rows will be affected by this query.".to_string())
    } else {
        None
    };

    Ok(ImpactSimulationResult::new(
        true,
        table_name,
        affected_rows,
        execution_time_ms,
        warning,
    ))
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
    store.delete_password(&connection_id).map_err(|e| e.to_string())?;
    store.delete_ssh_passphrase(&connection_id).map_err(|e| e.to_string())
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

#[tauri::command]
pub async fn set_session_password(
    session_mgr: State<'_, SessionManager>,
    connection_id: String,
    password: String,
) -> Result<(), String> {
    set_session_password_impl(&session_mgr, &connection_id, &password)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_session_password(
    session_mgr: State<'_, SessionManager>,
    connection_id: String,
) -> Result<(), String> {
    clear_session_password_impl(&session_mgr, &connection_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn simulate_query_impact(
    store: State<'_, ConnectionStore>,
    session_mgr: State<'_, SessionManager>,
    connection_id: String,
    sql: String,
) -> Result<ImpactSimulationResult, String> {
    simulate_query_impact_impl(&store, &session_mgr, &connection_id, &sql)
        .await
        .map_err(|e| e.to_string())
}
