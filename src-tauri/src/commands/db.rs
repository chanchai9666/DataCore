use crate::drivers::{
    build_keyset_clause, build_safe_where_clause, quote_keyset_table_ref, Chunk,
    DatabaseConnection, KeysetDirection, SchemaNode,
};
use crate::error::AppError;
use crate::models::{
    CellValue, ColumnMeta, ConnectionConfig, DatabaseDriver, ImpactSimulationResult, QueryResult,
    TruncationReason, WorkspaceState,
};
use crate::services::{AuditLogEntryInput, AuditLogger, ConnectionStore, WorkspaceStore};
use crate::session::SessionManager;
use tauri::State;

pub const DEFAULT_QUERY_ROW_CAP: usize = 10_000;
pub const DEFAULT_QUERY_BYTE_CAP: usize = 64 * 1024 * 1024;
pub const STREAM_CHUNK_ROWS: usize = 500;

fn estimate_cell_bytes(cell: &CellValue) -> usize {
    match cell {
        CellValue::Null | CellValue::Boolean(_) => 8,
        CellValue::Integer(_) | CellValue::Float(_) => 16,
        CellValue::Text(s) => 24 + s.len(),
        CellValue::Bytes(b) => 24 + b.len(),
        CellValue::Json(v) => 32 + v.to_string().len(),
    }
}

fn is_streaming_read_query(sql: &str) -> bool {
    let cleaned = strip_sql_comments_and_whitespace(sql);
    let first_word = cleaned
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_ascii_uppercase();
    matches!(
        first_word.as_str(),
        "SELECT" | "WITH" | "SHOW" | "PRAGMA" | "EXPLAIN" | "DESCRIBE" | "DESC" | "VALUES"
    )
}

/// Executes a read query using `stream_query` while enforcing hard row and byte caps.
/// When a cap is reached, drops the receiver channel and calls `conn.cancel().await`
/// so the connection is clean for subsequent queries.
pub async fn execute_query_with_cap(
    conn: &dyn DatabaseConnection,
    sql: &str,
    row_cap: usize,
    byte_cap: usize,
) -> Result<QueryResult, AppError> {
    let start = std::time::Instant::now();
    let (tx, mut rx) = tokio::sync::mpsc::channel::<Chunk>(8);

    let stream_fut = conn.stream_query(sql, STREAM_CHUNK_ROWS, tx);
    let collect_fut = async {
        let mut columns: Vec<ColumnMeta> = Vec::new();
        let mut rows: Vec<Vec<CellValue>> = Vec::new();
        let mut total_bytes: usize = 0;
        let mut truncation_reason: Option<TruncationReason> = None;

        while let Some(chunk) = rx.recv().await {
            if columns.is_empty() && !chunk.columns.is_empty() {
                columns = (*chunk.columns).clone();
            }
            for row in chunk.rows {
                if rows.len() >= row_cap {
                    truncation_reason = Some(TruncationReason::RowCapReached);
                    break;
                }
                let row_bytes: usize = row.iter().map(estimate_cell_bytes).sum();
                if !rows.is_empty() && total_bytes.saturating_add(row_bytes) > byte_cap {
                    truncation_reason = Some(TruncationReason::ByteCapReached);
                    break;
                }
                total_bytes = total_bytes.saturating_add(row_bytes);
                rows.push(row);
            }
            if truncation_reason.is_some() {
                drop(rx);
                break;
            }
        }
        (columns, rows, total_bytes, truncation_reason)
    };

    let (stream_res, (columns, rows, total_bytes, truncation_reason)) =
        tokio::join!(stream_fut, collect_fut);

    let elapsed = start.elapsed().as_millis() as u64;

    if let Some(reason) = truncation_reason {
        let _ = conn.cancel().await;
        return Ok(QueryResult::new(columns, rows, elapsed, None)
            .with_truncation(reason, total_bytes as u64));
    }

    stream_res?;
    Ok(QueryResult::new(columns, rows, elapsed, None))
}

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
    let conn =
        SessionManager::create_connection(&resolved_config, resolved_password.as_deref()).await?;
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
    if session_mgr.has_session(tab_id).await {
        return Ok(());
    }

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
    session_mgr
        .set_session_password(connection_id, password)
        .await;
    Ok(())
}

pub async fn resolve_connection_credentials(
    store: &ConnectionStore,
    session_mgr: &SessionManager,
    connection_id: &str,
) -> Result<(ConnectionConfig, Option<String>), AppError> {
    let mut config = store
        .get(connection_id)?
        .ok_or_else(|| AppError::NotFound(format!("Connection '{}' not found", connection_id)))?;

    let mut password = session_mgr.get_session_password(connection_id).await;
    if password.is_none() {
        password = store.get_password(connection_id)?;
    }

    if let Some(ref mut ssh) = config.ssh_tunnel {
        if ssh.enabled {
            let mut phrase = session_mgr.get_session_ssh_passphrase(connection_id).await;
            if phrase.is_none() {
                phrase = store.get_ssh_passphrase(connection_id).ok().flatten();
            }
            ssh.passphrase = phrase;
        }
    }

    Ok((config, password))
}

pub async fn set_session_ssh_passphrase_impl(
    session_mgr: &SessionManager,
    connection_id: &str,
    passphrase: &str,
) -> Result<(), AppError> {
    session_mgr
        .set_session_ssh_passphrase(connection_id, passphrase)
        .await;
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
        status: if res.is_ok() {
            "SUCCESS".to_string()
        } else {
            "FAILURE".to_string()
        },
        details: Some(format!("tab_id={}", tab_id)),
        ..Default::default()
    });
    res
}

pub async fn disconnect_connection_impl(
    store: &ConnectionStore,
    session_mgr: &SessionManager,
    connection_id: &str,
) -> Result<usize, AppError> {
    let closed = session_mgr
        .close_sessions_for_connection(connection_id)
        .await?;
    store.vault().clear_cache();
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
    let res = if is_streaming_read_query(sql) {
        execute_query_with_cap(&*conn, sql, DEFAULT_QUERY_ROW_CAP, DEFAULT_QUERY_BYTE_CAP).await
    } else {
        conn.execute_query(sql).await
    };
    let elapsed = start.elapsed().as_millis() as u64;

    let trimmed = sql.trim().to_uppercase();
    let action = if trimmed.starts_with("SELECT")
        || trimmed.starts_with("WITH")
        || trimmed.starts_with("EXPLAIN")
    {
        "QUERY"
    } else if trimmed.starts_with("INSERT")
        || trimmed.starts_with("UPDATE")
        || trimmed.starts_with("DELETE")
        || trimmed.starts_with("REPLACE")
    {
        "DML"
    } else if trimmed.starts_with("CREATE")
        || trimmed.starts_with("ALTER")
        || trimmed.starts_with("DROP")
        || trimmed.starts_with("TRUNCATE")
        || trimmed.starts_with("RENAME")
    {
        "DDL"
    } else if trimmed.starts_with("BEGIN")
        || trimmed.starts_with("COMMIT")
        || trimmed.starts_with("ROLLBACK")
        || trimmed.starts_with("SAVEPOINT")
        || trimmed.starts_with("RELEASE")
    {
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
    conn.fetch_table_data(schema, table, limit, offset, filter, sort_col, sort_dir)
        .await
}

pub async fn count_table_rows_impl(
    session_mgr: &SessionManager,
    tab_id: &str,
    schema: Option<&str>,
    table: &str,
    filter: Option<&str>,
    driver: Option<&str>,
) -> Result<u64, AppError> {
    let conn = session_mgr.get_session(tab_id).await?;
    let drv = driver.unwrap_or("postgres");
    let from_clause = quote_keyset_table_ref(schema, table, drv);
    let where_clause = build_safe_where_clause(filter, drv)?;
    let count_sql = format!("SELECT COUNT(*) FROM {}{};", from_clause, where_clause);
    let res = conn.execute_query(&count_sql).await?;
    let count = res
        .rows
        .first()
        .and_then(|r| r.first())
        .and_then(|v| v.as_i64())
        .map(|n| n.max(0) as u64)
        .unwrap_or(0);
    Ok(count)
}

#[allow(clippy::too_many_arguments)]
pub async fn fetch_table_data_keyset_impl(
    session_mgr: &SessionManager,
    tab_id: &str,
    schema: Option<&str>,
    table: &str,
    limit: u32,
    filter: Option<&str>,
    key_columns: Vec<String>,
    cursor_values: Option<Vec<CellValue>>,
    direction: Option<&str>,
    sort_dir: Option<&str>,
    driver: Option<&str>,
) -> Result<QueryResult, AppError> {
    let conn = session_mgr.get_session(tab_id).await?;
    if key_columns.is_empty() {
        return conn
            .fetch_table_data(schema, table, limit, 0, filter, None, sort_dir)
            .await;
    }

    let drv = driver.unwrap_or("postgres");
    let from_clause = quote_keyset_table_ref(schema, table, drv);
    let base_where = build_safe_where_clause(filter, drv)?;
    let dir = if cursor_values.is_none() {
        KeysetDirection::Next
    } else {
        KeysetDirection::from_str_opt(direction)
    };
    let (keyset_pred, order_clause, needs_reverse) = build_keyset_clause(
        &key_columns,
        cursor_values.as_deref(),
        dir,
        sort_dir.unwrap_or("ASC"),
        drv,
    )?;

    let combined_where = match (base_where.is_empty(), keyset_pred) {
        (true, None) => String::new(),
        (true, Some(pred)) => format!(" WHERE {}", pred),
        (false, None) => base_where,
        (false, Some(pred)) => {
            let inner = base_where.strip_prefix(" WHERE ").unwrap_or(&base_where);
            format!(" WHERE ({}) AND ({})", inner, pred)
        }
    };

    let fetch_limit = limit.saturating_add(1);
    let sql = if drv == "mssql" {
        format!(
            "SELECT TOP {} * FROM {}{}{};",
            fetch_limit, from_clause, combined_where, order_clause
        )
    } else {
        format!(
            "SELECT * FROM {}{}{} LIMIT {};",
            from_clause, combined_where, order_clause, fetch_limit
        )
    };

    let mut res = conn.execute_query(&sql).await?;
    for col in &mut res.columns {
        if key_columns
            .iter()
            .any(|k| k.eq_ignore_ascii_case(&col.name))
        {
            col.is_primary_key = Some(true);
        }
    }

    let has_more = res.rows.len() > limit as usize;
    if has_more {
        res.rows.truncate(limit as usize);
    }
    if needs_reverse {
        res.rows.reverse();
    }

    let has_more_forward = if dir == KeysetDirection::Prev {
        !res.rows.is_empty()
    } else {
        has_more
    };

    let next_cursor = if let Some(last_row) = res.rows.last() {
        let mut vals = Vec::with_capacity(key_columns.len());
        let mut all_found = true;
        for key_col in &key_columns {
            if let Some(idx) = res.columns.iter().position(|c| c.name == *key_col) {
                if let Some(val) = last_row.get(idx) {
                    vals.push(val.clone());
                } else {
                    all_found = false;
                    break;
                }
            } else {
                all_found = false;
                break;
            }
        }
        if all_found {
            Some(vals)
        } else {
            None
        }
    } else {
        None
    };

    Ok(res.with_keyset_cursor(next_cursor, has_more_forward))
}

pub async fn cancel_query_impl(session_mgr: &SessionManager, tab_id: &str) -> Result<(), AppError> {
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
    session_mgr: &SessionManager,
    connection_id: &str,
) -> Result<Vec<SchemaNode>, AppError> {
    let (config, password) =
        resolve_connection_credentials(store, session_mgr, connection_id).await?;
    let conn = SessionManager::create_connection(&config, password.as_deref()).await?;
    conn.fetch_schema_tree().await
}

pub async fn get_object_ddl_impl(
    store: &ConnectionStore,
    session_mgr: &SessionManager,
    connection_id: &str,
    schema: Option<&str>,
    object_name: &str,
    object_type: &str,
) -> Result<String, AppError> {
    let (config, password) =
        resolve_connection_credentials(store, session_mgr, connection_id).await?;
    let conn = SessionManager::create_connection(&config, password.as_deref()).await?;
    conn.get_object_ddl(schema, object_name, object_type).await
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
        let token = target
            .split_whitespace()
            .next()
            .unwrap_or("")
            .trim_matches(';');
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
        let token = target
            .split_whitespace()
            .next()
            .unwrap_or("")
            .trim_matches(';');
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
            "Impact preview supports only a single DELETE or UPDATE statement at a time."
                .to_string(),
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
        return Err(AppError::NotFound(format!(
            "Connection '{}' not found",
            connection_id
        )));
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
        let _ = conn
            .execute_query("ROLLBACK TO SAVEPOINT _dc_impact_preview;")
            .await;
        let _ = conn
            .execute_query("RELEASE SAVEPOINT _dc_impact_preview;")
            .await;
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
pub async fn has_stored_password(
    store: State<'_, ConnectionStore>,
    connection_id: String,
) -> Result<bool, String> {
    store
        .get_password(&connection_id)
        .map(|opt| opt.is_some())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_stored_password(
    store: State<'_, ConnectionStore>,
    connection_id: String,
) -> Result<(), String> {
    store
        .delete_password(&connection_id)
        .map_err(|e| e.to_string())?;
    store
        .delete_ssh_passphrase(&connection_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn vault_is_keychain_enabled(store: State<'_, ConnectionStore>) -> Result<bool, String> {
    Ok(store.vault().is_keychain_opt_in())
}

#[tauri::command]
pub async fn vault_set_keychain_enabled(
    store: State<'_, ConnectionStore>,
    enabled: bool,
) -> Result<(), String> {
    store
        .vault()
        .set_keychain_opt_in(enabled)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn vault_has_master_password(store: State<'_, ConnectionStore>) -> Result<bool, String> {
    store
        .vault()
        .has_master_password()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn vault_set_master_password(
    store: State<'_, ConnectionStore>,
    password: String,
) -> Result<(), String> {
    store
        .vault()
        .set_master_password(&password)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn vault_change_master_password(
    store: State<'_, ConnectionStore>,
    old_password: String,
    new_password: String,
) -> Result<(), String> {
    store
        .vault()
        .change_master_password(&old_password, &new_password)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn vault_remove_master_password(
    store: State<'_, ConnectionStore>,
    current_password: String,
) -> Result<(), String> {
    store
        .vault()
        .remove_master_password(&current_password)
        .map_err(|e| e.to_string())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    pub has_master_password: bool,
    pub is_unlocked: bool,
    pub keychain_opt_in: bool,
}

#[tauri::command]
pub async fn vault_status(store: State<'_, ConnectionStore>) -> Result<VaultStatus, String> {
    let vault = store.vault();
    let has_master_password = vault.has_master_password().map_err(|e| e.to_string())?;
    let keychain_opt_in = vault.is_keychain_opt_in();
    let mut is_unlocked = vault.is_unlocked().map_err(|e| e.to_string())?;

    if has_master_password && !is_unlocked && keychain_opt_in {
        if let Ok(true) = vault.unlock_from_macos_keychain() {
            is_unlocked = true;
        }
    }

    Ok(VaultStatus {
        has_master_password,
        is_unlocked,
        keychain_opt_in,
    })
}

#[tauri::command]
pub async fn vault_unlock(
    store: State<'_, ConnectionStore>,
    password: Option<String>,
) -> Result<bool, String> {
    if let Some(pwd) = password {
        match store.vault().unlock(&pwd) {
            Ok(()) => {
                let _ = AuditLogger::global().log(AuditLogEntryInput {
                    action: "VAULT_UNLOCK".to_string(),
                    status: "SUCCESS".to_string(),
                    details: Some("Vault unlocked with master password".to_string()),
                    ..Default::default()
                });
                Ok(true)
            }
            Err(e) => {
                let _ = AuditLogger::global().log(AuditLogEntryInput {
                    action: "VAULT_UNLOCK".to_string(),
                    status: "FAILED".to_string(),
                    error_message: Some(e.to_string()),
                    details: Some("Vault unlock attempt failed".to_string()),
                    ..Default::default()
                });
                Err(e.to_string())
            }
        }
    } else {
        store
            .vault()
            .unlock_from_macos_keychain()
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn vault_lock(store: State<'_, ConnectionStore>) -> Result<(), String> {
    store.vault().lock();
    Ok(())
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
    store: State<'_, ConnectionStore>,
    session_mgr: State<'_, SessionManager>,
    connection_id: String,
) -> Result<usize, String> {
    disconnect_connection_impl(&store, &session_mgr, &connection_id)
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
pub async fn count_table_rows(
    session_mgr: State<'_, SessionManager>,
    tab_id: String,
    schema: Option<String>,
    table: String,
    filter: Option<String>,
    driver: Option<String>,
) -> Result<u64, String> {
    count_table_rows_impl(
        &session_mgr,
        &tab_id,
        schema.as_deref(),
        &table,
        filter.as_deref(),
        driver.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn fetch_table_data_keyset(
    session_mgr: State<'_, SessionManager>,
    tab_id: String,
    schema: Option<String>,
    table: String,
    limit: u32,
    filter: Option<String>,
    key_columns: Vec<String>,
    cursor_values: Option<Vec<CellValue>>,
    direction: Option<String>,
    sort_dir: Option<String>,
    driver: Option<String>,
) -> Result<QueryResult, String> {
    fetch_table_data_keyset_impl(
        &session_mgr,
        &tab_id,
        schema.as_deref(),
        &table,
        limit,
        filter.as_deref(),
        key_columns,
        cursor_values,
        direction.as_deref(),
        sort_dir.as_deref(),
        driver.as_deref(),
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
    session_mgr: State<'_, SessionManager>,
    connection_id: String,
) -> Result<Vec<SchemaNode>, String> {
    get_schema_tree_impl(&store, &session_mgr, &connection_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_object_ddl(
    store: State<'_, ConnectionStore>,
    session_mgr: State<'_, SessionManager>,
    connection_id: String,
    schema: Option<String>,
    object_name: String,
    object_type: String,
) -> Result<String, String> {
    get_object_ddl_impl(
        &store,
        &session_mgr,
        &connection_id,
        schema.as_deref(),
        &object_name,
        &object_type,
    )
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
pub async fn set_session_ssh_passphrase(
    session_mgr: State<'_, SessionManager>,
    connection_id: String,
    passphrase: String,
) -> Result<(), String> {
    set_session_ssh_passphrase_impl(&session_mgr, &connection_id, &passphrase)
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

#[tauri::command]
pub async fn get_workspace_state(
    workspace_store: State<'_, WorkspaceStore>,
) -> Result<Option<WorkspaceState>, String> {
    workspace_store.load().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_workspace_state(
    workspace_store: State<'_, WorkspaceStore>,
    state: WorkspaceState,
) -> Result<(), String> {
    workspace_store.save(&state).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_workspace_state(
    workspace_store: State<'_, WorkspaceStore>,
) -> Result<(), String> {
    workspace_store.clear().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_screen_protection(
    window: tauri::WebviewWindow,
    enabled: bool,
) -> Result<(), String> {
    window
        .set_content_protected(enabled)
        .map_err(|e| e.to_string())
}
