use crate::drivers::DatabaseConnection;
use crate::error::AppError;
use crate::models::query::CellValue;
use crate::models::{DatabaseDriver, TableMetadata};

fn cell_to_string(cell: &CellValue) -> Option<String> {
    match cell {
        CellValue::Text(s) => Some(s.clone()),
        CellValue::Integer(i) => Some(i.to_string()),
        CellValue::Float(f) => Some(f.to_string()),
        _ => None,
    }
}

fn cell_to_i64(cell: &CellValue) -> Option<i64> {
    match cell {
        CellValue::Integer(i) => Some(*i),
        CellValue::Float(f) => Some(*f as i64),
        CellValue::Text(s) => s.parse::<i64>().ok(),
        _ => None,
    }
}

fn cell_to_u64(cell: &CellValue) -> Option<u64> {
    match cell {
        CellValue::Integer(i) => Some(*i as u64),
        CellValue::Float(f) => Some(*f as u64),
        CellValue::Text(s) => s.parse::<u64>().ok(),
        _ => None,
    }
}

pub async fn get_table_list_metadata_impl(
    conn: &dyn DatabaseConnection,
    driver: DatabaseDriver,
    schema: Option<&str>,
) -> Result<Vec<TableMetadata>, AppError> {
    match driver {
        DatabaseDriver::Postgres => {
            let schema_name = schema.unwrap_or("public");
            let sql = format!(
                r#"SELECT c.relname as table_name,
                          COALESCE(c.reltuples::bigint, 0) as approx_rows,
                          COALESCE(pg_total_relation_size(c.oid), 0)::bigint as total_bytes,
                          COALESCE(pg_relation_size(c.oid), 0)::bigint as data_bytes,
                          COALESCE(pg_indexes_size(c.oid), 0)::bigint as index_bytes
                   FROM pg_class c
                   JOIN pg_namespace n ON n.oid = c.relnamespace
                   WHERE n.nspname = '{}' AND c.relkind = 'r'
                   ORDER BY c.relname;"#,
                schema_name.replace('\'', "''")
            );
            let result = conn.execute_query(&sql).await?;
            let mut list = Vec::new();
            for row in result.rows {
                if row.is_empty() {
                    continue;
                }
                let name = cell_to_string(&row[0]).unwrap_or_default();
                let approx_row_count = if row.len() > 1 {
                    cell_to_i64(&row[1]).unwrap_or(0)
                } else {
                    0
                };
                let total_size_bytes = if row.len() > 2 {
                    cell_to_u64(&row[2]).unwrap_or(0)
                } else {
                    0
                };
                let data_size_bytes = if row.len() > 3 {
                    cell_to_u64(&row[3]).unwrap_or(0)
                } else {
                    0
                };
                let index_size_bytes = if row.len() > 4 {
                    cell_to_u64(&row[4]).unwrap_or(0)
                } else {
                    0
                };
                list.push(TableMetadata {
                    name,
                    approx_row_count,
                    data_size_bytes,
                    index_size_bytes,
                    total_size_bytes,
                    engine: Some("heap".to_string()),
                    collation: None,
                    comment: None,
                    created_at: None,
                });
            }
            Ok(list)
        }
        DatabaseDriver::Mysql => {
            let schema_clause = if let Some(s) = schema {
                format!("TABLE_SCHEMA = '{}'", s.replace('\'', "''"))
            } else {
                "TABLE_SCHEMA = DATABASE()".to_string()
            };
            let sql = format!(
                r#"SELECT TABLE_NAME,
                          COALESCE(TABLE_ROWS, 0) as approx_rows,
                          COALESCE(DATA_LENGTH, 0) as data_bytes,
                          COALESCE(INDEX_LENGTH, 0) as index_bytes,
                          COALESCE(DATA_LENGTH + INDEX_LENGTH, 0) as total_bytes,
                          ENGINE,
                          TABLE_COLLATION,
                          TABLE_COMMENT,
                          CREATE_TIME
                   FROM information_schema.TABLES
                   WHERE {} AND TABLE_TYPE = 'BASE TABLE'
                   ORDER BY TABLE_NAME;"#,
                schema_clause
            );
            let result = conn.execute_query(&sql).await?;
            let mut list = Vec::new();
            for row in result.rows {
                if row.is_empty() {
                    continue;
                }
                let name = cell_to_string(&row[0]).unwrap_or_default();
                let approx_row_count = if row.len() > 1 {
                    cell_to_i64(&row[1]).unwrap_or(0)
                } else {
                    0
                };
                let data_size_bytes = if row.len() > 2 {
                    cell_to_u64(&row[2]).unwrap_or(0)
                } else {
                    0
                };
                let index_size_bytes = if row.len() > 3 {
                    cell_to_u64(&row[3]).unwrap_or(0)
                } else {
                    0
                };
                let total_size_bytes = if row.len() > 4 {
                    cell_to_u64(&row[4]).unwrap_or(0)
                } else {
                    0
                };
                let engine = if row.len() > 5 {
                    cell_to_string(&row[5])
                } else {
                    None
                };
                let collation = if row.len() > 6 {
                    cell_to_string(&row[6])
                } else {
                    None
                };
                let comment = if row.len() > 7 {
                    cell_to_string(&row[7])
                } else {
                    None
                };
                let created_at = if row.len() > 8 {
                    cell_to_string(&row[8])
                } else {
                    None
                };
                list.push(TableMetadata {
                    name,
                    approx_row_count,
                    data_size_bytes,
                    index_size_bytes,
                    total_size_bytes,
                    engine,
                    collation,
                    comment,
                    created_at,
                });
            }
            Ok(list)
        }
        DatabaseDriver::Sqlite => {
            let sql = "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;";
            let result = conn.execute_query(sql).await?;
            let mut list = Vec::new();
            for row in result.rows {
                if row.is_empty() {
                    continue;
                }
                let name = cell_to_string(&row[0]).unwrap_or_default();
                list.push(TableMetadata {
                    name,
                    approx_row_count: -1,
                    data_size_bytes: 0,
                    index_size_bytes: 0,
                    total_size_bytes: 0,
                    engine: None,
                    collation: None,
                    comment: None,
                    created_at: None,
                });
            }
            Ok(list)
        }
    }
}
