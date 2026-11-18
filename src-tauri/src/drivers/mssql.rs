use std::sync::Arc;
use async_trait::async_trait;
use tokio::net::TcpStream;
use tokio::sync::Mutex;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};
use tiberius::{AuthMethod, Client, Config, Query};

use crate::error::AppError;
use crate::models::connection::ConnectionConfig;
use crate::models::query::{CellValue, ColumnMeta, QueryResult};
use crate::drivers::is_write_sql;
use crate::drivers::traits::{build_safe_where_clause, DatabaseConnection, SchemaNode, SchemaNodeType};
use crate::services::ssh_tunnel::SshTunnelHandle;

type TiberiusClient = Client<Compat<TcpStream>>;

#[derive(Clone)]
pub struct MssqlConnection {
    client: Arc<Mutex<TiberiusClient>>,
    config: ConnectionConfig,
    read_only: bool,
    #[allow(dead_code)]
    ssh_tunnel: Arc<Mutex<Option<SshTunnelHandle>>>,
}

pub(crate) fn should_trust_mssql_cert(ssl_mode: Option<&str>) -> bool {
    !matches!(
        ssl_mode.map(|s| s.to_lowercase()).as_deref(),
        Some("verify-ca") | Some("verify-full")
    )
}

impl MssqlConnection {
    pub async fn connect(
        config: &ConnectionConfig,
        password: Option<&str>,
    ) -> Result<Self, AppError> {
        let timeout_secs = config.timeout_seconds.unwrap_or(15).max(1) as u64;
        let remote_host = config.host.as_deref().unwrap_or("127.0.0.1");
        let remote_port = config.port.unwrap_or(1433);
        let database = &config.database;
        let user = config.user.as_deref().unwrap_or("sa");
        let pwd = password.unwrap_or("");

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

        let mut t_config = Config::new();
        t_config.host(&target_host);
        t_config.port(target_port);
        t_config.database(database);
        t_config.authentication(AuthMethod::sql_server(user, pwd));
        if should_trust_mssql_cert(config.ssl_mode.as_deref()) {
            t_config.trust_cert();
        }

        let tcp = TcpStream::connect(t_config.get_addr())
            .await
            .map_err(|e| AppError::Database(format!("MSSQL connection to {}:{} failed: {}", target_host, target_port, e)))?;
        tcp.set_nodelay(true)
            .map_err(|e| AppError::Database(format!("Failed to set TCP nodelay: {}", e)))?;

        let client = Client::connect(t_config, tcp.compat_write())
            .await
            .map_err(|e| AppError::Database(format!("MSSQL handshake failed: {}", e)))?;

        Ok(Self {
            client: Arc::new(Mutex::new(client)),
            config: config.clone(),
            read_only: config.read_only.unwrap_or(false),
            ssh_tunnel: Arc::new(Mutex::new(tunnel_handle)),
        })
    }

    fn row_to_cells(row: &tiberius::Row) -> Vec<CellValue> {
        let mut cells = Vec::new();
        let len = row.len();
        for i in 0..len {
            let col = &row.columns()[i];
            let type_name = col.column_type();

            if let Ok(Some(s)) = row.try_get::<&str, _>(i) {
                cells.push(CellValue::Text(s.to_string()));
            } else if let Ok(Some(n)) = row.try_get::<i64, _>(i) {
                cells.push(CellValue::Integer(n));
            } else if let Ok(Some(n)) = row.try_get::<i32, _>(i) {
                cells.push(CellValue::Integer(n as i64));
            } else if let Ok(Some(n)) = row.try_get::<i16, _>(i) {
                cells.push(CellValue::Integer(n as i64));
            } else if let Ok(Some(n)) = row.try_get::<u8, _>(i) {
                cells.push(CellValue::Integer(n as i64));
            } else if let Ok(Some(b)) = row.try_get::<bool, _>(i) {
                cells.push(CellValue::Boolean(b));
            } else if let Ok(Some(f)) = row.try_get::<f64, _>(i) {
                cells.push(CellValue::Float(f));
            } else if let Ok(Some(f)) = row.try_get::<f32, _>(i) {
                cells.push(CellValue::Float(f as f64));
            } else if let Ok(Some(dt)) = row.try_get::<chrono::NaiveDateTime, _>(i) {
                cells.push(CellValue::Text(dt.to_string()));
            } else if let Ok(Some(d)) = row.try_get::<chrono::NaiveDate, _>(i) {
                cells.push(CellValue::Text(d.to_string()));
            } else if let Ok(Some(bytes)) = row.try_get::<&[u8], _>(i) {
                use base64::Engine;
                cells.push(CellValue::Bytes(base64::engine::general_purpose::STANDARD.encode(bytes)));
            } else {
                let is_null = row.try_get::<&str, _>(i).is_ok();
                if is_null {
                    cells.push(CellValue::Null);
                } else {
                    cells.push(CellValue::Text(format!("<{:?}>", type_name)));
                }
            }
        }
        cells
    }
}

#[async_trait]
impl DatabaseConnection for MssqlConnection {
    async fn test_connection(&self) -> Result<u64, AppError> {
        let start = std::time::Instant::now();
        let _ = self.execute_query("SELECT 1;").await?;
        Ok(start.elapsed().as_millis() as u64)
    }

    async fn execute_query(&self, sql: &str) -> Result<QueryResult, AppError> {
        let start = std::time::Instant::now();
        let mut client = self.client.lock().await;

        let trimmed = sql.trim();
        if trimmed.is_empty() {
            return Ok(QueryResult::new(Vec::new(), Vec::new(), 0, Some(0)));
        }

        if self.read_only && is_write_sql(trimmed) {
            return Err(AppError::Database(
                "Connection is in read-only mode. Write operations are disabled.".to_string(),
            ));
        }

        if is_write_sql(trimmed) {
            let exec_res = client
                .execute(trimmed, &[])
                .await
                .map_err(|e| AppError::Database(format!("MSSQL execute error: {}", e)))?;
            let elapsed = start.elapsed().as_millis() as u64;
            return Ok(QueryResult::new(
                Vec::new(),
                Vec::new(),
                elapsed,
                Some(exec_res.total()),
            ));
        }

        let query = Query::new(trimmed);
        let stream = query.query(&mut *client)
            .await
            .map_err(|e| AppError::Database(format!("MSSQL query error: {}", e)))?;

        let result_set = stream.into_first_result()
            .await
            .map_err(|e| AppError::Database(format!("MSSQL result fetch error: {}", e)))?;

        let mut columns = Vec::new();
        let mut rows = Vec::new();

        if let Some(first_row) = result_set.first() {
            for col in first_row.columns() {
                let name = col.name().to_string();
                let type_name = format!("{:?}", col.column_type());
                columns.push(ColumnMeta::new(name, type_name, true));
            }
        }

        for row in &result_set {
            rows.push(Self::row_to_cells(row));
        }

        let elapsed = start.elapsed().as_millis() as u64;
        let rows_affected = rows.len() as u64;

        Ok(QueryResult::new(
            columns,
            rows,
            elapsed,
            Some(rows_affected),
        ))
    }

    async fn fetch_table_data(
        &self,
        schema: Option<&str>,
        table: &str,
        limit: u32,
        offset: u32,
        filter: Option<&str>,
        sort_col: Option<&str>,
        sort_dir: Option<&str>,
    ) -> Result<QueryResult, AppError> {
        let schema_name = schema.unwrap_or("dbo");
        let from_clause = format!("[{}].[{}]", schema_name.replace(']', "]]"), table.replace(']', "]]"));

        let where_clause = build_safe_where_clause(filter, "mssql")?;

        let order_clause = match sort_col {
            Some(col) if !col.trim().is_empty() => {
                let escaped_col = col.trim().replace(']', "]]");
                let dir = if sort_dir == Some("DESC") { "DESC" } else { "ASC" };
                format!(" ORDER BY [{}] {}", escaped_col, dir)
            }
            _ => " ORDER BY (SELECT NULL)".to_string(),
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

        let sql = format!(
            "SELECT * FROM {}{}{} OFFSET {} ROWS FETCH NEXT {} ROWS ONLY;",
            from_clause, where_clause, order_clause, offset, limit
        );
        let mut res = self.execute_query(&sql).await?;
        if total_count.is_some() {
            res.rows_affected = total_count;
        }
        Ok(res)
    }

    async fn fetch_schema_tree(&self) -> Result<Vec<SchemaNode>, AppError> {
        let sql = "SELECT s.name AS schema_name, t.name AS table_name, 'table' AS type \
                   FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id \
                   UNION ALL \
                   SELECT s.name AS schema_name, v.name AS table_name, 'view' AS type \
                   FROM sys.views v JOIN sys.schemas s ON v.schema_id = s.schema_id \
                   ORDER BY schema_name, table_name;";

        let res = self.execute_query(sql).await?;
        let mut schema_map: std::collections::BTreeMap<String, Vec<SchemaNode>> = std::collections::BTreeMap::new();

        for row in res.rows {
            if row.len() >= 3 {
                let schema_name = match &row[0] {
                    CellValue::Text(t) => t.clone(),
                    _ => "dbo".to_string(),
                };
                let table_name = match &row[1] {
                    CellValue::Text(t) => t.clone(),
                    _ => continue,
                };
                let type_str = match &row[2] {
                    CellValue::Text(t) => t.clone(),
                    _ => "table".to_string(),
                };

                let node_type = if type_str == "view" {
                    SchemaNodeType::View
                } else {
                    SchemaNodeType::Table
                };

                let node = SchemaNode::new(table_name, node_type).with_schema(&schema_name);
                schema_map.entry(schema_name).or_default().push(node);
            }
        }

        let mut children = Vec::new();
        for (schema_name, tables) in schema_map {
            let schema_node = SchemaNode::new(schema_name, SchemaNodeType::Schema)
                .with_children(tables);
            children.push(schema_node);
        }

        let db_node = SchemaNode::new(&self.config.database, SchemaNodeType::Database)
            .with_children(children);
        Ok(vec![db_node])
    }

    async fn cancel(&self) -> Result<(), AppError> {
        Ok(())
    }

    async fn commit(&self) -> Result<(), AppError> {
        let _ = self.execute_query("COMMIT;").await?;
        Ok(())
    }

    async fn rollback(&self) -> Result<(), AppError> {
        let _ = self.execute_query("ROLLBACK;").await?;
        Ok(())
    }

    async fn set_autocommit(&self, _enabled: bool) -> Result<(), AppError> {
        Ok(())
    }

    async fn get_object_ddl(
        &self,
        schema: Option<&str>,
        name: &str,
        _object_type: &str,
    ) -> Result<String, AppError> {
        let s_name = schema.unwrap_or("dbo");
        let sql = format!(
            "SELECT OBJECT_DEFINITION(OBJECT_ID('[{s_name}].[{}]')) AS ddl;",
            name.replace(']', "]]")
        );
        let res = self.execute_query(&sql).await?;
        if let Some(row) = res.rows.first() {
            if let Some(CellValue::Text(ddl)) = row.first() {
                return Ok(ddl.clone());
            }
        }
        Err(AppError::NotFound(format!("DDL for object '{}.{}' not found", s_name, name)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_should_trust_mssql_cert_respects_ssl_mode() {
        assert!(should_trust_mssql_cert(None));
        assert!(should_trust_mssql_cert(Some("disable")));
        assert!(should_trust_mssql_cert(Some("require")));
        assert!(!should_trust_mssql_cert(Some("verify-ca")));
        assert!(!should_trust_mssql_cert(Some("verify-full")));
        assert!(!should_trust_mssql_cert(Some("VERIFY-FULL")));
    }

    #[test]
    fn test_is_write_sql_detection() {
        assert!(is_write_sql("INSERT INTO users VALUES (1)"));
        assert!(is_write_sql("/* c */ UPDATE users SET a = 1"));
        assert!(is_write_sql("-- line\nDELETE FROM users"));
        assert!(!is_write_sql("SELECT * FROM users"));
        assert!(!is_write_sql("-- INSERT\nSELECT 1"));
    }
}
