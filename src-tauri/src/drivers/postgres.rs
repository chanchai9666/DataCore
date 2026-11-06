use std::collections::HashMap;
use std::sync::Arc;
use async_trait::async_trait;
use base64::Engine;
use futures::TryStreamExt;
use sqlx::{Column, Connection, Either, Row, TypeInfo, ValueRef};
use tokio::sync::Mutex;

use crate::error::AppError;
use crate::models::connection::ConnectionConfig;
use crate::models::query::{CellValue, ColumnMeta, QueryResult};
use crate::drivers::traits::{DatabaseConnection, SchemaNode, SchemaNodeType};

pub struct PostgresConnection {
    conn: Arc<Mutex<sqlx::PgConnection>>,
    database_name: String,
}

impl PostgresConnection {
    pub async fn connect(config: &ConnectionConfig, password: Option<&str>) -> Result<Self, AppError> {
        let mut options = sqlx::postgres::PgConnectOptions::new()
            .host(config.host.as_deref().unwrap_or("localhost"))
            .port(config.port.unwrap_or(5432))
            .database(&config.database);

        if let Some(user) = &config.user {
            options = options.username(user);
        }
        if let Some(pwd) = password {
            options = options.password(pwd);
        }

        let conn = sqlx::PgConnection::connect_with(&options).await?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            database_name: config.database.clone(),
        })
    }
}

fn decode_pg_cell(row: &sqlx::postgres::PgRow, index: usize) -> CellValue {
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
        "BOOL" => row.try_get::<bool, _>(index).map(CellValue::Boolean).unwrap_or(CellValue::Null),
        "INT2" => row.try_get::<i16, _>(index).map(|v| CellValue::Integer(v as i64)).unwrap_or(CellValue::Null),
        "INT4" => row.try_get::<i32, _>(index).map(|v| CellValue::Integer(v as i64)).unwrap_or(CellValue::Null),
        "INT8" => row.try_get::<i64, _>(index).map(CellValue::Integer).unwrap_or(CellValue::Null),
        "FLOAT4" => row.try_get::<f32, _>(index).map(|v| CellValue::Float(v as f64)).unwrap_or(CellValue::Null),
        "FLOAT8" => row.try_get::<f64, _>(index).map(CellValue::Float).unwrap_or(CellValue::Null),
        "NUMERIC" => {
            if let Ok(s) = row.try_get::<String, _>(index) {
                CellValue::Text(s)
            } else if let Ok(f) = row.try_get::<f64, _>(index) {
                CellValue::Float(f)
            } else {
                CellValue::Text("NUMERIC".to_string())
            }
        }
        "JSON" | "JSONB" => row.try_get::<serde_json::Value, _>(index).map(CellValue::Json).unwrap_or(CellValue::Null),
        "BYTEA" => {
            row.try_get::<Vec<u8>, _>(index)
                .map(|b| CellValue::Bytes(base64::engine::general_purpose::STANDARD.encode(b)))
                .unwrap_or(CellValue::Null)
        }
        "UUID" => {
            if let Ok(u) = row.try_get::<uuid::Uuid, _>(index) {
                CellValue::Text(u.to_string())
            } else if let Ok(s) = row.try_get::<String, _>(index) {
                CellValue::Text(s)
            } else {
                CellValue::Null
            }
        }
        "TIMESTAMPTZ" => {
            if let Ok(dt) = row.try_get::<chrono::DateTime<chrono::Utc>, _>(index) {
                CellValue::Text(dt.to_rfc3339())
            } else if let Ok(s) = row.try_get::<String, _>(index) {
                CellValue::Text(s)
            } else {
                CellValue::Null
            }
        }
        "TIMESTAMP" => {
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
        "VARCHAR" | "CHAR" | "TEXT" | "NAME" | "BPCHAR" => {
            row.try_get::<String, _>(index).map(CellValue::Text).unwrap_or(CellValue::Null)
        }
        _ => {
            // Dynamic fallback to string, integer, float, bool or display representation
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
impl DatabaseConnection for PostgresConnection {
    async fn test_connection(&self) -> Result<u64, AppError> {
        let start = std::time::Instant::now();
        self.execute_query("SELECT 1;").await?;
        let elapsed = start.elapsed().as_millis() as u64;
        Ok(elapsed)
    }

    async fn execute_query(&self, sql: &str) -> Result<QueryResult, AppError> {
        let start = std::time::Instant::now();
        let mut conn = self.conn.lock().await;

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
                        row_values.push(decode_pg_cell(&row, i));
                    }
                    rows_out.push(row_values);
                }
            }
        }

        drop(stream);
        let elapsed = start.elapsed().as_millis() as u64;
        Ok(QueryResult::new(columns, rows_out, elapsed, rows_affected))
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
        let sql = "SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_schema, table_type, table_name;";
        let query_res = self.execute_query(sql).await?;

        let mut schema_map: HashMap<String, Vec<SchemaNode>> = HashMap::new();
        for row in query_res.rows {
            let schema_name = row.get(0).and_then(|c| c.as_text()).unwrap_or("public").to_string();
            let table_name = row.get(1).and_then(|c| c.as_text()).unwrap_or("").to_string();
            let table_type = row.get(2).and_then(|c| c.as_text()).unwrap_or("BASE TABLE");

            let node_type = if table_type.contains("VIEW") {
                SchemaNodeType::View
            } else {
                SchemaNodeType::Table
            };

            let node = SchemaNode::new(table_name, node_type).with_schema(&schema_name);
            schema_map.entry(schema_name).or_default().push(node);
        }

        let mut schema_nodes = Vec::new();
        for (schema_name, tables) in schema_map {
            let node = SchemaNode::new(schema_name, SchemaNodeType::Schema).with_children(tables);
            schema_nodes.push(node);
        }
        schema_nodes.sort_by(|a, b| a.name.cmp(&b.name));

        let root = SchemaNode::new(&self.database_name, SchemaNodeType::Database)
            .with_children(schema_nodes);
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
        Ok(())
    }
}
