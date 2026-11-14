use std::sync::Arc;
use async_trait::async_trait;
use tokio::sync::Mutex;
use crate::error::AppError;
use crate::models::connection::ConnectionConfig;
use crate::models::query::{CellValue, ColumnMeta, QueryResult};
use crate::drivers::traits::{validate_table_filter, DatabaseConnection, SchemaNode, SchemaNodeType};

#[derive(Clone)]
pub struct SqliteConnection {
    conn: Arc<Mutex<rusqlite::Connection>>,
    interrupt_handle: Arc<Mutex<rusqlite::InterruptHandle>>,
    database_name: String,
    file_path: Option<String>,
    auto_reconnect: bool,
    autocommit: Arc<Mutex<bool>>,
}

impl SqliteConnection {
    pub fn open_in_memory() -> Result<Self, AppError> {
        let conn = rusqlite::Connection::open_in_memory()?;
        let interrupt_handle = Arc::new(Mutex::new(conn.get_interrupt_handle()));
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            interrupt_handle,
            database_name: "main".to_string(),
            file_path: None,
            auto_reconnect: false,
            autocommit: Arc::new(Mutex::new(true)),
        })
    }

    pub fn open(path: &str) -> Result<Self, AppError> {
        let conn = rusqlite::Connection::open(path)?;
        let interrupt_handle = Arc::new(Mutex::new(conn.get_interrupt_handle()));
        let db_name = std::path::Path::new(path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("main")
            .to_string();
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            interrupt_handle,
            database_name: db_name,
            file_path: Some(path.to_string()),
            auto_reconnect: true,
            autocommit: Arc::new(Mutex::new(true)),
        })
    }

    pub fn from_config(config: &ConnectionConfig) -> Result<Self, AppError> {
        let mut instance = if config.database == ":memory:" || config.database.starts_with("sqlite::memory:") {
            Self::open_in_memory()?
        } else {
            Self::open(&config.database)?
        };
        instance.auto_reconnect = config.auto_reconnect.unwrap_or(true);
        Ok(instance)
    }

    fn execute_on_conn(
        conn: &rusqlite::Connection,
        sql: &str,
        start: std::time::Instant,
    ) -> Result<QueryResult, rusqlite::Error> {
        let trimmed_sql = sql.trim();
        if trimmed_sql.contains(';') && !trimmed_sql.to_uppercase().starts_with("SELECT") {
            let statements: Vec<&str> = trimmed_sql
                .split(';')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();
            if statements.len() > 1 {
                conn.execute_batch(sql)?;
                let elapsed = start.elapsed().as_millis() as u64;
                return Ok(QueryResult::new(Vec::new(), Vec::new(), elapsed, Some(0)));
            }
        }

        let mut stmt = conn.prepare(sql)?;
        let col_count = stmt.column_count();

        if col_count > 0 {
            let columns: Vec<ColumnMeta> = stmt
                .columns()
                .into_iter()
                .map(|col| {
                    ColumnMeta::new(
                        col.name(),
                        col.decl_type().unwrap_or("TEXT"),
                        true,
                    )
                })
                .collect();

            let mut rows = stmt.query([])?;
            let mut rows_out = Vec::new();

            while let Some(row) = rows.next()? {
                let mut row_values = Vec::with_capacity(col_count);
                for i in 0..col_count {
                    let val_ref = row.get_ref(i)?;
                    let cell_val = match val_ref {
                        rusqlite::types::ValueRef::Null => CellValue::Null,
                        rusqlite::types::ValueRef::Integer(n) => CellValue::Integer(n),
                        rusqlite::types::ValueRef::Real(f) => CellValue::Float(f),
                        rusqlite::types::ValueRef::Text(bytes) => {
                            CellValue::Text(String::from_utf8_lossy(bytes).into_owned())
                        }
                        rusqlite::types::ValueRef::Blob(b) => {
                            use base64::Engine;
                            CellValue::Bytes(base64::engine::general_purpose::STANDARD.encode(b))
                        }
                    };
                    row_values.push(cell_val);
                }
                rows_out.push(row_values);
            }

            let elapsed = start.elapsed().as_millis() as u64;
            Ok(QueryResult::new(columns, rows_out, elapsed, None))
        } else {
            let rows_affected = stmt.execute([])? as u64;
            let elapsed = start.elapsed().as_millis() as u64;
            Ok(QueryResult::new(Vec::new(), Vec::new(), elapsed, Some(rows_affected)))
        }
    }
}

#[async_trait]
impl DatabaseConnection for SqliteConnection {
    async fn test_connection(&self) -> Result<u64, AppError> {
        let start = std::time::Instant::now();
        let conn = self.conn.lock().await;
        conn.query_row("SELECT 1;", [], |_| Ok(()))?;
        let elapsed = start.elapsed().as_millis() as u64;
        Ok(elapsed)
    }

    async fn execute_query(&self, sql: &str) -> Result<QueryResult, AppError> {
        let start = std::time::Instant::now();
        let mut conn = self.conn.lock().await;

        match Self::execute_on_conn(&conn, sql, start) {
            Ok(res) => Ok(res),
            Err(err) => {
                let ac = *self.autocommit.lock().await;
                if self.auto_reconnect && ac {
                    if let Some(ref path) = self.file_path {
                        if let Ok(new_conn) = rusqlite::Connection::open(path) {
                            let new_handle = new_conn.get_interrupt_handle();
                            *conn = new_conn;
                            *self.interrupt_handle.lock().await = new_handle;
                            return Self::execute_on_conn(&conn, sql, std::time::Instant::now())
                                .map_err(AppError::from);
                        }
                    }
                }
                Err(AppError::from(err))
            }
        }
    }

    async fn fetch_table_data(&self, schema: Option<&str>, table: &str, limit: u32, offset: u32, filter: Option<&str>, sort_col: Option<&str>, sort_dir: Option<&str>) -> Result<QueryResult, AppError> {
        let escaped_table = table.replace('"', "\"\"");
        let from_clause = if let Some(sch) = schema {
            let escaped_schema = sch.replace('"', "\"\"");
            format!("\"{}\".\"{}\"", escaped_schema, escaped_table)
        } else {
            format!("\"{}\"", escaped_table)
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
                let escaped_col = col.trim().replace('"', "\"\"");
                let dir = if sort_dir == Some("DESC") { "DESC" } else { "ASC" };
                format!(" ORDER BY \"{}\" {}", escaped_col, dir)
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
        Ok(res)
    }

    async fn fetch_schema_tree(&self) -> Result<Vec<SchemaNode>, AppError> {
        let conn = self.conn.lock().await;
        let mut stmt = conn.prepare(
            "SELECT type, name, tbl_name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name;"
        )?;
        let mut rows = stmt.query([])?;
        let mut children = Vec::new();
        while let Some(row) = rows.next()? {
            let type_str: String = row.get(0)?;
            let name: String = row.get(1)?;
            let node_type = if type_str == "view" {
                SchemaNodeType::View
            } else {
                SchemaNodeType::Table
            };
            children.push(SchemaNode::new(name, node_type).with_schema("main"));
        }
        let db_node = SchemaNode::new(&self.database_name, SchemaNodeType::Database)
            .with_children(children);
        Ok(vec![db_node])
    }

    async fn commit(&self) -> Result<(), AppError> {
        let conn = self.conn.lock().await;
        let ac = *self.autocommit.lock().await;
        if !conn.is_autocommit() {
            conn.execute_batch("COMMIT;")?;
        }
        if !ac {
            conn.execute_batch("BEGIN;")?;
        }
        Ok(())
    }

    async fn rollback(&self) -> Result<(), AppError> {
        let conn = self.conn.lock().await;
        let ac = *self.autocommit.lock().await;
        if !conn.is_autocommit() {
            conn.execute_batch("ROLLBACK;")?;
        }
        if !ac {
            conn.execute_batch("BEGIN;")?;
        }
        Ok(())
    }

    async fn cancel(&self) -> Result<(), AppError> {
        self.interrupt_handle.lock().await.interrupt();
        Ok(())
    }

    async fn set_autocommit(&self, enabled: bool) -> Result<(), AppError> {
        let mut ac = self.autocommit.lock().await;
        *ac = enabled;
        let conn = self.conn.lock().await;
        if !enabled {
            if conn.is_autocommit() {
                conn.execute_batch("BEGIN;")?;
            }
        } else if !conn.is_autocommit() {
            conn.execute_batch("COMMIT;")?;
        }
        Ok(())
    }
}
