use std::sync::Arc;
use async_trait::async_trait;
use tokio::net::TcpStream;
use tokio::sync::Mutex;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};
use tiberius::{AuthMethod, Client, Config, Query};

use crate::error::AppError;
use crate::models::connection::ConnectionConfig;
use crate::models::query::{CellValue, ColumnMeta, QueryResult};
use crate::drivers::traits::{build_safe_where_clause, Chunk, DatabaseConnection, SchemaNode, SchemaNodeType, StreamOutcome};

type TiberiusClient = Client<Compat<TcpStream>>;

#[derive(Clone)]
pub struct MssqlConnection {
    client: Arc<Mutex<TiberiusClient>>,
    config: ConnectionConfig,
    #[allow(dead_code)]
    read_only: bool,
    #[allow(dead_code)]
    password: Option<String>,
}

impl MssqlConnection {
    pub async fn connect(
        config: &ConnectionConfig,
        password: Option<&str>,
    ) -> Result<Self, AppError> {
        let host = config.host.as_deref().unwrap_or("127.0.0.1");
        let port = config.port.unwrap_or(1433);
        let database = &config.database;
        let user = config.user.as_deref().unwrap_or("sa");
        let pwd = password.unwrap_or("");

        let mut t_config = Config::new();
        t_config.host(host);
        t_config.port(port);
        t_config.database(database);
        t_config.authentication(AuthMethod::sql_server(user, pwd));
        t_config.trust_cert();

        let tcp = TcpStream::connect(t_config.get_addr())
            .await
            .map_err(|e| AppError::Database(format!("MSSQL connection to {}:{} failed: {}", host, port, e)))?;
        tcp.set_nodelay(true)
            .map_err(|e| AppError::Database(format!("Failed to set TCP nodelay: {}", e)))?;

        let client = Client::connect(t_config, tcp.compat_write())
            .await
            .map_err(|e| AppError::Database(format!("MSSQL handshake failed: {}", e)))?;

        Ok(Self {
            client: Arc::new(Mutex::new(client)),
            config: config.clone(),
            read_only: config.read_only.unwrap_or(false),
            password: password.map(String::from),
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

    async fn stream_query(
        &self,
        sql: &str,
        chunk_rows: usize,
        tx: tokio::sync::mpsc::Sender<Chunk>,
    ) -> Result<StreamOutcome, AppError> {
        use futures::TryStreamExt;

        let chunk_rows = chunk_rows.max(1);
        let trimmed = sql.trim();
        if trimmed.is_empty() {
            return Ok(StreamOutcome {
                rows_sent: 0,
                stopped_early: false,
            });
        }

        let mut client = self.client.lock().await;
        let query = Query::new(trimmed);
        let mut stream = query
            .query(&mut *client)
            .await
            .map_err(|e| AppError::Database(format!("MSSQL query error: {}", e)))?;

        let mut columns: Option<Arc<Vec<ColumnMeta>>> = None;
        let mut batch: Vec<Vec<CellValue>> = Vec::with_capacity(chunk_rows);
        let mut rows_sent: u64 = 0;

        while let Some(item) = stream
            .try_next()
            .await
            .map_err(|e| AppError::Database(format!("MSSQL stream error: {}", e)))?
        {
            match item {
                tiberius::QueryItem::Metadata(meta) => {
                    if columns.is_none() && !meta.columns().is_empty() {
                        let cols: Vec<ColumnMeta> = meta
                            .columns()
                            .iter()
                            .map(|col| {
                                ColumnMeta::new(
                                    col.name().to_string(),
                                    format!("{:?}", col.column_type()),
                                    true,
                                )
                            })
                            .collect();
                        columns = Some(Arc::new(cols));
                    }
                }
                tiberius::QueryItem::Row(row) => {
                    if columns.is_none() {
                        let cols: Vec<ColumnMeta> = row
                            .columns()
                            .iter()
                            .map(|col| {
                                ColumnMeta::new(
                                    col.name().to_string(),
                                    format!("{:?}", col.column_type()),
                                    true,
                                )
                            })
                            .collect();
                        columns = Some(Arc::new(cols));
                    }
                    batch.push(Self::row_to_cells(&row));

                    if batch.len() >= chunk_rows {
                        let count = batch.len() as u64;
                        let chunk = Chunk {
                            columns: Arc::clone(columns.as_ref().unwrap()),
                            rows: std::mem::replace(&mut batch, Vec::with_capacity(chunk_rows)),
                        };
                        if tx.send(chunk).await.is_err() {
                            drop(stream);
                            return Ok(StreamOutcome {
                                rows_sent,
                                stopped_early: true,
                            });
                        }
                        rows_sent += count;
                    }
                }
            }
        }

        drop(stream);

        if !batch.is_empty() {
            let count = batch.len() as u64;
            let chunk = Chunk {
                columns: Arc::clone(columns.as_ref().unwrap()),
                rows: batch,
            };
            if tx.send(chunk).await.is_err() {
                return Ok(StreamOutcome {
                    rows_sent,
                    stopped_early: true,
                });
            }
            rows_sent += count;
        } else if rows_sent == 0 {
            if let Some(cols) = columns {
                if !cols.is_empty() {
                    let chunk = Chunk {
                        columns: cols,
                        rows: Vec::new(),
                    };
                    if tx.send(chunk).await.is_err() {
                        return Ok(StreamOutcome {
                            rows_sent: 0,
                            stopped_early: true,
                        });
                    }
                }
            }
        }

        Ok(StreamOutcome {
            rows_sent,
            stopped_early: false,
        })
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
