use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use async_trait::async_trait;
use base64::Engine;
use futures::TryStreamExt;
use sqlx::{Column, Connection, Either, Row, TypeInfo, ValueRef};
use tokio::sync::Mutex;

use crate::error::AppError;
use crate::models::connection::ConnectionConfig;
use crate::models::query::{CellValue, ColumnMeta, QueryResult};
use crate::drivers::traits::{validate_table_filter, DatabaseConnection, SchemaNode, SchemaNodeType};
use crate::services::ssh_tunnel::SshTunnelHandle;

pub struct MySqlConnection {
    conn: Arc<Mutex<sqlx::MySqlConnection>>,
    ssh_tunnel: Arc<Mutex<Option<SshTunnelHandle>>>,
    database_name: String,
    config: ConnectionConfig,
    password: Option<String>,
    connect_options: Arc<Mutex<sqlx::mysql::MySqlConnectOptions>>,
    connection_id: Arc<AtomicU64>,
    in_manual_tx: Arc<AtomicBool>,
}

impl MySqlConnection {
    async fn establish_raw(
        config: &ConnectionConfig,
        password: Option<&str>,
    ) -> Result<(sqlx::MySqlConnection, sqlx::mysql::MySqlConnectOptions, u64, Option<SshTunnelHandle>), AppError> {
        let timeout_secs = config.timeout_seconds.unwrap_or(15).max(1) as u64;
        let remote_host = config.host.as_deref().unwrap_or("localhost");
        let remote_port = config.port.unwrap_or(3306);

        let mut tunnel_handle: Option<SshTunnelHandle> = None;
        let (target_host, target_port) = if let Some(ref ssh) = config.ssh_tunnel {
            if ssh.enabled {
                let handle = SshTunnelHandle::establish(ssh, remote_host, remote_port, timeout_secs).await?;
                let port = handle.local_port();
                tunnel_handle = Some(handle);
                ("127.0.0.1".to_string(), port)
            } else {
                (remote_host.to_string(), remote_port)
            }
        } else {
            (remote_host.to_string(), remote_port)
        };

        let mut options = sqlx::mysql::MySqlConnectOptions::new()
            .host(&target_host)
            .port(target_port)
            .database(&config.database);

        if let Some(user) = &config.user {
            options = options.username(user);
        }
        if let Some(pwd) = password {
            options = options.password(pwd);
        }

        if let Some(mode) = &config.ssl_mode {
            let ssl_mode = match mode.to_lowercase().as_str() {
                "disable" | "disabled" => sqlx::mysql::MySqlSslMode::Disabled,
                "preferred" | "prefer" => sqlx::mysql::MySqlSslMode::Preferred,
                "require" | "required" => sqlx::mysql::MySqlSslMode::Required,
                "verify-ca" => sqlx::mysql::MySqlSslMode::VerifyCa,
                "verify-full" | "verify-identity" => sqlx::mysql::MySqlSslMode::VerifyIdentity,
                _ => sqlx::mysql::MySqlSslMode::Preferred,
            };
            options = options.ssl_mode(ssl_mode);
        }

        if let Some(ref certs) = config.ssl_certs {
            if let Some(ref ca) = certs.ca_cert_path {
                if !ca.trim().is_empty() {
                    options = options.ssl_ca(ca);
                }
            }
            if let Some(ref cert) = certs.client_cert_path {
                if !cert.trim().is_empty() {
                    options = options.ssl_client_cert(cert);
                }
            }
            if let Some(ref key) = certs.client_key_path {
                if !key.trim().is_empty() {
                    options = options.ssl_client_key(key);
                }
            }
        }

        let connect_fut = sqlx::MySqlConnection::connect_with(&options);
        let mut conn = tokio::time::timeout(std::time::Duration::from_secs(timeout_secs), connect_fut)
            .await
            .map_err(|_| AppError::Other(format!("Connection timed out after {} seconds", timeout_secs)))??;
        let connection_id: u64 = sqlx::query_scalar("SELECT CONNECTION_ID();")
            .fetch_one(&mut conn)
            .await
            .unwrap_or(0);

        if config.read_only.unwrap_or(false) {
            sqlx::query("SET SESSION transaction_read_only = 1;")
                .execute(&mut conn)
                .await?;
        }

        Ok((conn, options, connection_id, tunnel_handle))
    }

    pub async fn connect(config: &ConnectionConfig, password: Option<&str>) -> Result<Self, AppError> {
        let (conn, options, connection_id, tunnel_handle) = Self::establish_raw(config, password).await?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            ssh_tunnel: Arc::new(Mutex::new(tunnel_handle)),
            database_name: config.database.clone(),
            config: config.clone(),
            password: password.map(|s| s.to_string()),
            connect_options: Arc::new(Mutex::new(options)),
            connection_id: Arc::new(AtomicU64::new(connection_id)),
            in_manual_tx: Arc::new(AtomicBool::new(false)),
        })
    }

    fn is_disconnect_error(err: &sqlx::Error) -> bool {
        matches!(
            err,
            sqlx::Error::Io(_)
                | sqlx::Error::Protocol(_)
                | sqlx::Error::PoolTimedOut
                | sqlx::Error::PoolClosed
        )
    }

    async fn run_raw_sql(
        conn: &mut sqlx::MySqlConnection,
        sql: &str,
        start: std::time::Instant,
    ) -> Result<QueryResult, sqlx::Error> {
        let mut stream = sqlx::raw_sql(sql).fetch_many(&mut *conn);
        let mut columns = Vec::new();
        let mut rows_out = Vec::new();
        let mut rows_affected = None;

        while let Some(item) = stream.try_next().await? {
            match item {
                Either::Left(result) => {
                    rows_affected = Some(result.rows_affected());
                }
                Either::Right(row) => {
                    if columns.is_empty() {
                        columns = row
                            .columns()
                            .iter()
                            .map(|col| {
                                ColumnMeta::new(
                                    col.name(),
                                    col.type_info().name(),
                                    true,
                                )
                            })
                            .collect();
                    }
                    let col_len = row.columns().len();
                    let mut row_values = Vec::with_capacity(col_len);
                    for i in 0..col_len {
                        row_values.push(decode_mysql_cell(&row, i));
                    }
                    rows_out.push(row_values);
                }
            }
        }

        drop(stream);
        let elapsed = start.elapsed().as_millis() as u64;
        Ok(QueryResult::new(columns, rows_out, elapsed, rows_affected))
    }
}

fn decode_mysql_cell(row: &sqlx::mysql::MySqlRow, index: usize) -> CellValue {
    let raw = match row.try_get_raw(index) {
        Ok(r) => r,
        Err(_) => return CellValue::Null,
    };

    if raw.is_null() {
        return CellValue::Null;
    }

    let col = &row.columns()[index];
    let type_name = col.type_info().name();

    match type_name {
        "BOOLEAN" | "TINYINT(1)" => {
            if let Ok(b) = row.try_get::<bool, _>(index) {
                CellValue::Boolean(b)
            } else if let Ok(i) = row.try_get::<i8, _>(index) {
                CellValue::Integer(i as i64)
            } else {
                CellValue::Null
            }
        }
        "TINYINT" => row.try_get::<i8, _>(index).map(|v| CellValue::Integer(v as i64)).unwrap_or(CellValue::Null),
        "SMALLINT" => row.try_get::<i16, _>(index).map(|v| CellValue::Integer(v as i64)).unwrap_or(CellValue::Null),
        "INT" | "INTEGER" | "MEDIUMINT" => row.try_get::<i32, _>(index).map(|v| CellValue::Integer(v as i64)).unwrap_or(CellValue::Null),
        "BIGINT" => row.try_get::<i64, _>(index).map(CellValue::Integer).unwrap_or(CellValue::Null),
        "FLOAT" => row.try_get::<f32, _>(index).map(|v| CellValue::Float(v as f64)).unwrap_or(CellValue::Null),
        "DOUBLE" => row.try_get::<f64, _>(index).map(CellValue::Float).unwrap_or(CellValue::Null),
        "DECIMAL" => {
            if let Ok(s) = row.try_get::<String, _>(index) {
                CellValue::Text(s)
            } else if let Ok(f) = row.try_get::<f64, _>(index) {
                CellValue::Float(f)
            } else {
                CellValue::Text("DECIMAL".to_string())
            }
        }
        "JSON" => row.try_get::<serde_json::Value, _>(index).map(CellValue::Json).unwrap_or(CellValue::Null),
        "BLOB" | "VARBINARY" | "BINARY" | "LONGBLOB" | "MEDIUMBLOB" | "TINYBLOB" => {
            row.try_get::<Vec<u8>, _>(index)
                .map(|b| CellValue::Bytes(base64::engine::general_purpose::STANDARD.encode(b)))
                .unwrap_or(CellValue::Null)
        }
        "TIMESTAMP" => {
            if let Ok(dt) = row.try_get::<chrono::DateTime<chrono::Utc>, _>(index) {
                CellValue::Text(dt.to_rfc3339())
            } else if let Ok(dt) = row.try_get::<chrono::NaiveDateTime, _>(index) {
                CellValue::Text(dt.to_string())
            } else if let Ok(s) = row.try_get::<String, _>(index) {
                CellValue::Text(s)
            } else {
                CellValue::Null
            }
        }
        "DATETIME" => {
            if let Ok(dt) = row.try_get::<chrono::NaiveDateTime, _>(index) {
                CellValue::Text(dt.to_string())
            } else if let Ok(s) = row.try_get::<String, _>(index) {
                CellValue::Text(s)
            } else {
                CellValue::Null
            }
        }
        "DATE" => {
            if let Ok(d) = row.try_get::<chrono::NaiveDate, _>(index) {
                CellValue::Text(d.to_string())
            } else if let Ok(s) = row.try_get::<String, _>(index) {
                CellValue::Text(s)
            } else {
                CellValue::Null
            }
        }
        "TIME" => {
            if let Ok(t) = row.try_get::<chrono::NaiveTime, _>(index) {
                CellValue::Text(t.to_string())
            } else if let Ok(s) = row.try_get::<String, _>(index) {
                CellValue::Text(s)
            } else {
                CellValue::Null
            }
        }
        "VARCHAR" | "CHAR" | "TEXT" | "LONGTEXT" | "MEDIUMTEXT" | "TINYTEXT" => {
            row.try_get::<String, _>(index).map(CellValue::Text).unwrap_or(CellValue::Null)
        }
        _ => {
            if let Ok(s) = row.try_get::<String, _>(index) {
                CellValue::Text(s)
            } else if let Ok(n) = row.try_get::<i64, _>(index) {
                CellValue::Integer(n)
            } else if let Ok(f) = row.try_get::<f64, _>(index) {
                CellValue::Float(f)
            } else if let Ok(b) = row.try_get::<bool, _>(index) {
                CellValue::Boolean(b)
            } else {
                CellValue::Text(format!("<unsupported: {}>", type_name))
            }
        }
    }
}

#[async_trait]
impl DatabaseConnection for MySqlConnection {
    async fn test_connection(&self) -> Result<u64, AppError> {
        let start = std::time::Instant::now();
        self.execute_query("SELECT 1;").await?;
        let elapsed = start.elapsed().as_millis() as u64;
        Ok(elapsed)
    }

    async fn execute_query(&self, sql: &str) -> Result<QueryResult, AppError> {
        let start = std::time::Instant::now();
        let mut conn = self.conn.lock().await;

        match Self::run_raw_sql(&mut conn, sql, start).await {
            Ok(res) => Ok(res),
            Err(err) => {
                let auto_reconnect = self.config.auto_reconnect.unwrap_or(true);
                let in_tx = self.in_manual_tx.load(Ordering::SeqCst);
                if auto_reconnect && !in_tx && Self::is_disconnect_error(&err) {
                    if let Ok((new_conn, new_opts, new_cid, new_tunnel)) =
                        Self::establish_raw(&self.config, self.password.as_deref()).await
                    {
                        *conn = new_conn;
                        *self.connect_options.lock().await = new_opts;
                        self.connection_id.store(new_cid, Ordering::SeqCst);
                        *self.ssh_tunnel.lock().await = new_tunnel;
                        return Self::run_raw_sql(&mut conn, sql, std::time::Instant::now())
                            .await
                            .map_err(AppError::from);
                    }
                }
                Err(AppError::from(err))
            }
        }
    }

    async fn fetch_table_data(&self, schema: Option<&str>, table: &str, limit: u32, offset: u32, filter: Option<&str>, sort_col: Option<&str>, sort_dir: Option<&str>) -> Result<QueryResult, AppError> {
        let escaped_table = table.replace('`', "``");
        let from_clause = if let Some(sch) = schema {
            let escaped_schema = sch.replace('`', "``");
            format!("`{}`.`{}`", escaped_schema, escaped_table)
        } else {
            format!("`{}`", escaped_table)
        };

        let where_clause = match filter {
            Some(f) if !f.trim().is_empty() => {
                validate_table_filter(f)?;
                format!(" WHERE {}", f.trim())
            }
            _ => String::new(),
        };

        let order_clause = match sort_col {
            Some(col) if !col.trim().is_empty() => {
                let escaped_col = col.trim().replace('`', "``");
                let dir = if sort_dir == Some("DESC") { "DESC" } else { "ASC" };
                format!(" ORDER BY `{}` {}", escaped_col, dir)
            }
            _ => String::new(),
        };

        let count_sql = format!("SELECT COUNT(*) FROM {}{};", from_clause, where_clause);
        let total_count = match self.execute_query(&count_sql).await {
            Ok(count_res) => {
                if let Some(first_row) = count_res.rows.first() {
                    match first_row.first() {
                        Some(CellValue::Integer(n)) => Some(*n as u64),
                        _ => None,
                    }
                } else {
                    None
                }
            }
            Err(_) => None,
        };

        let sql = format!("SELECT * FROM {}{}{} LIMIT {} OFFSET {};", from_clause, where_clause, order_clause, limit, offset);
        let mut res = self.execute_query(&sql).await?;
        if total_count.is_some() {
            res.rows_affected = total_count;
        }
        if res.columns.is_empty() {
            let col_sql = if let Some(sch) = schema {
                format!(
                    "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS \
                     WHERE TABLE_NAME = '{}' AND TABLE_SCHEMA = '{}' \
                     ORDER BY ORDINAL_POSITION;",
                    table.replace('\'', "''"),
                    sch.replace('\'', "''")
                )
            } else {
                format!(
                    "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS \
                     WHERE TABLE_NAME = '{}' AND TABLE_SCHEMA = DATABASE() \
                     ORDER BY ORDINAL_POSITION;",
                    table.replace('\'', "''")
                )
            };
            if let Ok(col_res) = self.execute_query(&col_sql).await {
                res.columns = col_res
                    .rows
                    .into_iter()
                    .filter_map(|r| {
                        let name = r.first()?.as_text()?.to_string();
                        let dtype = r.get(1)?.as_text()?.to_string();
                        let nullable = r.get(2).and_then(|c| c.as_text()).map(|s| s == "YES").unwrap_or(true);
                        Some(ColumnMeta::new(name, dtype, nullable))
                    })
                    .collect();
            }
        }
        Ok(res)
    }

    async fn fetch_schema_tree(&self) -> Result<Vec<SchemaNode>, AppError> {
        let sql = "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_type, table_name;";
        let query_res = self.execute_query(sql).await?;

        let mut tables = Vec::new();
        for row in query_res.rows {
            let table_name = row.first().and_then(|c| c.as_text()).unwrap_or("").to_string();
            let table_type = row.get(1).and_then(|c| c.as_text()).unwrap_or("BASE TABLE");

            let node_type = if table_type.contains("VIEW") {
                SchemaNodeType::View
            } else {
                SchemaNodeType::Table
            };

            let node = SchemaNode::new(table_name, node_type);
            tables.push(node);
        }

        let root = SchemaNode::new(&self.database_name, SchemaNodeType::Database)
            .with_children(tables);
        Ok(vec![root])
    }

    async fn commit(&self) -> Result<(), AppError> {
        self.execute_query("COMMIT;").await?;
        Ok(())
    }

    async fn rollback(&self) -> Result<(), AppError> {
        self.execute_query("ROLLBACK;").await?;
        Ok(())
    }

    async fn cancel(&self) -> Result<(), AppError> {
        let cid = self.connection_id.load(Ordering::SeqCst);
        if cid > 0 {
            let opts = self.connect_options.lock().await.clone();
            if let Ok(mut cancel_conn) = sqlx::MySqlConnection::connect_with(&opts).await {
                let kill_sql = format!("KILL QUERY {};", cid);
                let _ = sqlx::query(&kill_sql).execute(&mut cancel_conn).await;
            }
        }
        Ok(())
    }

    async fn set_autocommit(&self, enabled: bool) -> Result<(), AppError> {
        self.in_manual_tx.store(!enabled, Ordering::SeqCst);
        let sql = if enabled { "SET autocommit = 1;" } else { "SET autocommit = 0;" };
        self.execute_query(sql).await?;
        Ok(())
    }
}
