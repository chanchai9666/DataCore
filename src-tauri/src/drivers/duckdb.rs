use std::sync::Arc;
use async_trait::async_trait;
use tokio::sync::Mutex;
use crate::error::AppError;
use crate::models::connection::ConnectionConfig;
use crate::models::query::{CellValue, ColumnMeta, QueryResult};
use crate::drivers::traits::{build_safe_where_clause, Chunk, DatabaseConnection, SchemaNode, SchemaNodeType, StreamOutcome};
use crate::drivers::sqlite::split_sql_statements;

#[derive(Clone)]
pub struct DuckdbConnection {
    conn: Arc<Mutex<duckdb::Connection>>,
    database_name: String,
    #[allow(dead_code)]
    read_only: bool,
    autocommit: Arc<Mutex<bool>>,
}

impl DuckdbConnection {
    pub fn from_config(config: &ConnectionConfig) -> Result<Self, AppError> {
        let is_memory = config.database == ":memory:" || config.database.is_empty();
        let read_only = config.read_only.unwrap_or(false);

        let duck_conn = if is_memory {
            duckdb::Connection::open_in_memory()
                .map_err(|e| AppError::Database(format!("Failed to open in-memory DuckDB: {}", e)))?
        } else {
            let path = std::path::Path::new(&config.database);
            if read_only {
                let cfg = duckdb::Config::default()
                    .access_mode(duckdb::AccessMode::ReadOnly)
                    .map_err(|e| AppError::Database(format!("Invalid DuckDB config: {}", e)))?;
                duckdb::Connection::open_with_flags(path, cfg)
                    .map_err(|e| AppError::Database(format!("Failed to open DuckDB file '{}': {}", config.database, e)))?
            } else {
                duckdb::Connection::open(path)
                    .map_err(|e| AppError::Database(format!("Failed to open DuckDB file '{}': {}", config.database, e)))?
            }
        };

        let db_name = if is_memory {
            "memory".to_string()
        } else {
            std::path::Path::new(&config.database)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("duckdb")
                .to_string()
        };

        Ok(Self {
            conn: Arc::new(Mutex::new(duck_conn)),
            database_name: db_name,
            read_only,
            autocommit: Arc::new(Mutex::new(true)),
        })
    }

    fn value_ref_to_cell(val: duckdb::types::ValueRef) -> CellValue {
        use duckdb::types::ValueRef;
        match val {
            ValueRef::Null => CellValue::Null,
            ValueRef::Boolean(b) => CellValue::Boolean(b),
            ValueRef::TinyInt(n) => CellValue::Integer(n as i64),
            ValueRef::SmallInt(n) => CellValue::Integer(n as i64),
            ValueRef::Int(n) => CellValue::Integer(n as i64),
            ValueRef::BigInt(n) => CellValue::Integer(n),
            ValueRef::HugeInt(n) => CellValue::Text(n.to_string()),
            ValueRef::UTinyInt(n) => CellValue::Integer(n as i64),
            ValueRef::USmallInt(n) => CellValue::Integer(n as i64),
            ValueRef::UInt(n) => CellValue::Integer(n as i64),
            ValueRef::UBigInt(n) => CellValue::Text(n.to_string()),
            ValueRef::Float(f) => CellValue::Float(f as f64),
            ValueRef::Double(d) => CellValue::Float(d),
            ValueRef::Text(bytes) => {
                CellValue::Text(String::from_utf8_lossy(bytes).into_owned())
            }
            ValueRef::Blob(b) => {
                use base64::Engine;
                CellValue::Bytes(base64::engine::general_purpose::STANDARD.encode(b))
            }
            ValueRef::Date32(days) => CellValue::Text(format!("Day {}", days)),
            ValueRef::Time64(unit, val) => CellValue::Text(format!("{}: {:?}", val, unit)),
            ValueRef::Timestamp(unit, val) => CellValue::Text(format!("{}: {:?}", val, unit)),
            ValueRef::Decimal(d) => CellValue::Text(d.to_string()),
            _ => CellValue::Text(format!("{:?}", val)),
        }
    }

    fn execute_single_stmt(
        conn: &duckdb::Connection,
        sql: &str,
    ) -> Result<QueryResult, duckdb::Error> {
        let trimmed = sql.trim();
        if trimmed.is_empty() {
            return Ok(QueryResult::new(Vec::new(), Vec::new(), 0, Some(0)));
        }

        let mut stmt = conn.prepare(trimmed)?;
        let upper = trimmed.to_uppercase();
        let is_select = upper.starts_with("SELECT")
            || upper.starts_with("WITH")
            || upper.starts_with("SHOW")
            || upper.starts_with("DESCRIBE")
            || upper.starts_with("EXPLAIN")
            || upper.starts_with("PRAGMA");

        if is_select {
            let mut rows = stmt.query([])?;
            let (col_count, columns) = if let Some(stmt_ref) = rows.as_ref() {
                let count = stmt_ref.column_count();
                let cols: Vec<ColumnMeta> = (0..count)
                    .map(|i| {
                        let name = stmt_ref
                            .column_name(i)
                            .map(|s| s.to_string())
                            .unwrap_or_else(|_| format!("col_{}", i));
                        ColumnMeta::new(name, "VARCHAR", true)
                    })
                    .collect();
                (count, cols)
            } else {
                (0, Vec::new())
            };

            let mut rows_out = Vec::new();
            while let Some(row) = rows.next()? {
                let mut row_values = Vec::with_capacity(col_count);
                for i in 0..col_count {
                    let val_ref = row.get_ref(i)?;
                    row_values.push(Self::value_ref_to_cell(val_ref));
                }
                rows_out.push(row_values);
            }

            Ok(QueryResult::new(columns, rows_out, 0, None))
        } else {
            let rows_affected = stmt.execute([])? as u64;
            Ok(QueryResult::new(Vec::new(), Vec::new(), 0, Some(rows_affected)))
        }
    }

    fn execute_on_conn(
        conn: &duckdb::Connection,
        sql: &str,
        start: std::time::Instant,
    ) -> Result<QueryResult, duckdb::Error> {
        let statements = split_sql_statements(sql);
        if statements.is_empty() {
            let elapsed = start.elapsed().as_millis() as u64;
            return Ok(QueryResult::new(Vec::new(), Vec::new(), elapsed, Some(0)));
        }

        if statements.len() > 1 {
            let mut last_result = QueryResult::new(Vec::new(), Vec::new(), 0, Some(0));
            for stmt_sql in statements {
                last_result = Self::execute_single_stmt(conn, &stmt_sql)?;
            }
            let elapsed = start.elapsed().as_millis() as u64;
            last_result.execution_time_ms = elapsed;
            return Ok(last_result);
        }

        let mut res = Self::execute_single_stmt(conn, &statements[0])?;
        res.execution_time_ms = start.elapsed().as_millis() as u64;
        Ok(res)
    }

    fn stream_on_conn(
        conn: &duckdb::Connection,
        sql: &str,
        chunk_rows: usize,
        tx: &tokio::sync::mpsc::Sender<Chunk>,
    ) -> Result<StreamOutcome, duckdb::Error> {
        let chunk_rows = chunk_rows.max(1);
        let statements = split_sql_statements(sql);
        if statements.is_empty() {
            return Ok(StreamOutcome {
                rows_sent: 0,
                stopped_early: false,
            });
        }

        let last_idx = statements.len() - 1;
        for stmt_sql in &statements[..last_idx] {
            Self::execute_single_stmt(conn, stmt_sql)?;
        }

        let trimmed = statements[last_idx].trim();
        if trimmed.is_empty() {
            return Ok(StreamOutcome {
                rows_sent: 0,
                stopped_early: false,
            });
        }

        let mut stmt = conn.prepare(trimmed)?;
        let upper = trimmed.to_uppercase();
        let is_select = upper.starts_with("SELECT")
            || upper.starts_with("WITH")
            || upper.starts_with("SHOW")
            || upper.starts_with("DESCRIBE")
            || upper.starts_with("EXPLAIN")
            || upper.starts_with("PRAGMA");

        if !is_select {
            stmt.execute([])?;
            return Ok(StreamOutcome {
                rows_sent: 0,
                stopped_early: false,
            });
        }

        let mut rows = stmt.query([])?;
        let (col_count, columns) = if let Some(stmt_ref) = rows.as_ref() {
            let count = stmt_ref.column_count();
            let cols: Vec<ColumnMeta> = (0..count)
                .map(|i| {
                    let name = stmt_ref
                        .column_name(i)
                        .map(|s| s.to_string())
                        .unwrap_or_else(|_| format!("col_{}", i));
                    ColumnMeta::new(name, "VARCHAR", true)
                })
                .collect();
            (count, Arc::new(cols))
        } else {
            (0, Arc::new(Vec::new()))
        };

        let mut batch: Vec<Vec<CellValue>> = Vec::with_capacity(chunk_rows);
        let mut rows_sent: u64 = 0;

        while let Some(row) = rows.next()? {
            let mut row_values = Vec::with_capacity(col_count);
            for i in 0..col_count {
                let val_ref = row.get_ref(i)?;
                row_values.push(Self::value_ref_to_cell(val_ref));
            }
            batch.push(row_values);

            if batch.len() >= chunk_rows {
                let count = batch.len() as u64;
                let chunk = Chunk {
                    columns: Arc::clone(&columns),
                    rows: std::mem::replace(&mut batch, Vec::with_capacity(chunk_rows)),
                };
                if tx.blocking_send(chunk).is_err() {
                    return Ok(StreamOutcome {
                        rows_sent,
                        stopped_early: true,
                    });
                }
                rows_sent += count;
            }
        }

        if !batch.is_empty() {
            let count = batch.len() as u64;
            let chunk = Chunk {
                columns: Arc::clone(&columns),
                rows: batch,
            };
            if tx.blocking_send(chunk).is_err() {
                return Ok(StreamOutcome {
                    rows_sent,
                    stopped_early: true,
                });
            }
            rows_sent += count;
        } else if rows_sent == 0 && !columns.is_empty() {
            let chunk = Chunk {
                columns,
                rows: Vec::new(),
            };
            if tx.blocking_send(chunk).is_err() {
                return Ok(StreamOutcome {
                    rows_sent: 0,
                    stopped_early: true,
                });
            }
        }

        Ok(StreamOutcome {
            rows_sent,
            stopped_early: false,
        })
    }
}

#[async_trait]
impl DatabaseConnection for DuckdbConnection {
    async fn test_connection(&self) -> Result<u64, AppError> {
        let start = std::time::Instant::now();
        let conn = self.conn.lock().await;
        conn.execute_batch("SELECT 1;")
            .map_err(|e| AppError::Database(format!("DuckDB test_connection failed: {}", e)))?;
        Ok(start.elapsed().as_millis() as u64)
    }

    async fn execute_query(&self, sql: &str) -> Result<QueryResult, AppError> {
        if self.read_only && crate::drivers::is_read_only_blocked_sql(sql) {
            return Err(AppError::Database(
                "Connection is in read-only mode. Write operations are disabled.".to_string(),
            ));
        }
        let start = std::time::Instant::now();
        let conn = self.conn.lock().await;
        Self::execute_on_conn(&conn, sql, start)
            .map_err(|e| AppError::Database(format!("DuckDB query error: {}", e)))
    }

    async fn stream_query(
        &self,
        sql: &str,
        chunk_rows: usize,
        tx: tokio::sync::mpsc::Sender<Chunk>,
    ) -> Result<StreamOutcome, AppError> {
        let conn_guard = Arc::clone(&self.conn).lock_owned().await;
        let sql_owned = sql.to_string();

        tokio::task::spawn_blocking(move || {
            Self::stream_on_conn(&conn_guard, &sql_owned, chunk_rows, &tx)
                .map_err(|e| AppError::Database(format!("DuckDB query error: {}", e)))
        })
        .await
        .map_err(|e| AppError::Other(format!("DuckDB streaming task failed: {}", e)))?
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
        let escaped_table = table.replace('"', "\"\"");
        let from_clause = match schema {
            Some(s) if !s.is_empty() => format!("\"{}\".\"{}\"", s.replace('"', "\"\""), escaped_table),
            _ => format!("\"{}\"", escaped_table),
        };

        let where_clause = build_safe_where_clause(filter, "duckdb")?;

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

        let sql = format!(
            "SELECT * FROM {}{}{} LIMIT {} OFFSET {};",
            from_clause, where_clause, order_clause, limit, offset
        );
        let mut res = self.execute_query(&sql).await?;
        if total_count.is_some() {
            res.rows_affected = total_count;
        }
        Ok(res)
    }

    async fn fetch_schema_tree(&self) -> Result<Vec<SchemaNode>, AppError> {
        let conn = self.conn.lock().await;
        let sql = "SELECT table_schema, table_name, 'table' as type FROM information_schema.tables WHERE table_type='BASE TABLE' \
                   UNION ALL \
                   SELECT table_schema, table_name, 'view' as type FROM information_schema.views \
                   ORDER BY type, table_name;";

        let mut stmt = conn.prepare(sql).map_err(|e| AppError::Database(e.to_string()))?;
        let mut rows = stmt.query([]).map_err(|e| AppError::Database(e.to_string()))?;

        let mut children = Vec::new();
        while let Some(row) = rows.next().map_err(|e| AppError::Database(e.to_string()))? {
            let schema_name: String = row.get(0).unwrap_or_else(|_| "main".to_string());
            let name: String = row.get(1).map_err(|e| AppError::Database(e.to_string()))?;
            let type_str: String = row.get(2).map_err(|e| AppError::Database(e.to_string()))?;

            let node_type = if type_str == "view" {
                SchemaNodeType::View
            } else {
                SchemaNodeType::Table
            };

            let node = SchemaNode::new(name, node_type).with_schema(schema_name);
            children.push(node);
        }

        let db_node = SchemaNode::new(&self.database_name, SchemaNodeType::Database)
            .with_children(children);
        Ok(vec![db_node])
    }

    async fn commit(&self) -> Result<(), AppError> {
        let conn = self.conn.lock().await;
        let ac = *self.autocommit.lock().await;
        conn.execute_batch("COMMIT;")
            .map_err(|e| AppError::Database(format!("Commit failed: {}", e)))?;
        if !ac {
            let _ = conn.execute_batch("BEGIN TRANSACTION;");
        }
        Ok(())
    }

    async fn rollback(&self) -> Result<(), AppError> {
        let conn = self.conn.lock().await;
        let ac = *self.autocommit.lock().await;
        conn.execute_batch("ROLLBACK;")
            .map_err(|e| AppError::Database(format!("Rollback failed: {}", e)))?;
        if !ac {
            let _ = conn.execute_batch("BEGIN TRANSACTION;");
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
            let _ = conn.execute_batch("BEGIN TRANSACTION;");
        } else {
            let _ = conn.execute_batch("COMMIT;");
        }
        Ok(())
    }

    async fn get_object_ddl(
        &self,
        _schema: Option<&str>,
        name: &str,
        _object_type: &str,
    ) -> Result<String, AppError> {
        let sql = format!(
            "SELECT sql FROM duckdb_tables() WHERE table_name = '{}';",
            name.replace('\'', "''")
        );
        let res = self.execute_query(&sql).await?;
        if let Some(row) = res.rows.first() {
            if let Some(CellValue::Text(ddl)) = row.first() {
                return Ok(ddl.clone());
            }
        }
        Err(AppError::NotFound(format!("DDL for object '{}' not found", name)))
    }
}
