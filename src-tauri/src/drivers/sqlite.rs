use std::sync::Arc;
use async_trait::async_trait;
use tokio::sync::Mutex;
use crate::error::AppError;
use crate::models::connection::ConnectionConfig;
use crate::models::query::{CellValue, ColumnMeta, QueryResult};
use crate::drivers::traits::{DatabaseConnection, SchemaNode, SchemaNodeType};

#[derive(Clone)]
pub struct SqliteConnection {
    conn: Arc<Mutex<rusqlite::Connection>>,
    database_name: String,
    autocommit: Arc<Mutex<bool>>,
}

impl SqliteConnection {
    pub fn open_in_memory() -> Result<Self, AppError> {
        let conn = rusqlite::Connection::open_in_memory()?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            database_name: "main".to_string(),
            autocommit: Arc::new(Mutex::new(true)),
        })
    }

    pub fn open(path: &str) -> Result<Self, AppError> {
        let conn = rusqlite::Connection::open(path)?;
        let db_name = std::path::Path::new(path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("main")
            .to_string();
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            database_name: db_name,
            autocommit: Arc::new(Mutex::new(true)),
        })
    }

    pub fn from_config(config: &ConnectionConfig) -> Result<Self, AppError> {
        if config.database == ":memory:" || config.database.starts_with("sqlite::memory:") {
            Self::open_in_memory()
        } else {
            Self::open(&config.database)
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
        let conn = self.conn.lock().await;

        let mut stmt = conn.prepare(sql)?;
        let col_count = stmt.column_count();

        if col_count > 0 {
            let columns: Vec<ColumnMeta> = stmt
                .column_names()
                .into_iter()
                .map(|name| {
                    ColumnMeta::new(
                        name,
                        "TEXT",
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

    async fn fetch_table_data(&self, schema: Option<&str>, table: &str, limit: u32, offset: u32) -> Result<QueryResult, AppError> {
        let escaped_table = table.replace('"', "\"\"");
        let sql = if let Some(sch) = schema {
            let escaped_schema = sch.replace('"', "\"\"");
            format!("SELECT * FROM \"{}\".\"{}\" LIMIT {} OFFSET {};", escaped_schema, escaped_table, limit, offset)
        } else {
            format!("SELECT * FROM \"{}\" LIMIT {} OFFSET {};", escaped_table, limit, offset)
        };
        self.execute_query(&sql).await
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
