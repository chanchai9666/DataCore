use std::time::Instant;
use crate::drivers::DatabaseConnection;
use crate::error::AppError;
use crate::models::query::ColumnMeta;
use crate::models::transfer::{CrossDbCopyResult, CrossDbCopyTableOptions, TransferProgress};
use crate::models::DatabaseDriver;
use crate::services::data_transfer::generate_batch_insert_cells_sql;

/// Maps a column data type from source dialect to target dialect.
pub fn map_data_type(src_type: &str, _src_dialect: &str, target_dialect: &str) -> String {
    let upper = src_type.to_uppercase();

    match target_dialect {
        "sqlite" => {
            if upper.contains("INT") || upper.contains("SERIAL") {
                "INTEGER".to_string()
            } else if upper.contains("FLOAT")
                || upper.contains("DOUBLE")
                || upper.contains("REAL")
                || upper.contains("DECIMAL")
                || upper.contains("NUMERIC")
            {
                "REAL".to_string()
            } else if upper.contains("BLOB")
                || upper.contains("BYTEA")
                || upper.contains("BINARY")
            {
                "BLOB".to_string()
            } else {
                "TEXT".to_string()
            }
        }
        "mysql" => {
            if upper.contains("SERIAL") {
                "BIGINT AUTO_INCREMENT PRIMARY KEY".to_string()
            } else if upper.contains("BOOL") {
                "TINYINT(1)".to_string()
            } else if upper.contains("BIGINT") {
                "BIGINT".to_string()
            } else if upper.contains("INT") {
                "INT".to_string()
            } else if upper.contains("DOUBLE") || upper.contains("REAL") {
                "DOUBLE".to_string()
            } else if upper.contains("FLOAT") {
                "FLOAT".to_string()
            } else if upper.contains("DECIMAL") || upper.contains("NUMERIC") {
                "DECIMAL(12,2)".to_string()
            } else if upper.contains("BLOB") || upper.contains("BYTEA") {
                "LONGBLOB".to_string()
            } else if upper.contains("TIME") || upper.contains("DATE") {
                "DATETIME".to_string()
            } else if upper.contains("JSON") {
                "JSON".to_string()
            } else if upper.contains("VARCHAR") {
                src_type.to_string()
            } else {
                "TEXT".to_string()
            }
        }
        "postgres" => {
            if upper.contains("AUTO_INCREMENT") || upper.contains("SERIAL") {
                "BIGSERIAL".to_string()
            } else if upper.contains("BOOL") || upper == "TINYINT(1)" {
                "BOOLEAN".to_string()
            } else if upper.contains("BIGINT") {
                "BIGINT".to_string()
            } else if upper.contains("INT") {
                "INTEGER".to_string()
            } else if upper.contains("DOUBLE") || upper.contains("REAL") {
                "DOUBLE PRECISION".to_string()
            } else if upper.contains("FLOAT") {
                "REAL".to_string()
            } else if upper.contains("DECIMAL") || upper.contains("NUMERIC") {
                "NUMERIC(12,2)".to_string()
            } else if upper.contains("BLOB") || upper.contains("BYTEA") {
                "BYTEA".to_string()
            } else if upper.contains("TIME") || upper.contains("DATE") {
                "TIMESTAMPTZ".to_string()
            } else if upper.contains("JSON") {
                "JSONB".to_string()
            } else if upper.contains("VARCHAR") {
                src_type.to_string()
            } else {
                "TEXT".to_string()
            }
        }
        _ => src_type.to_string(),
    }
}

/// Generates CREATE TABLE DDL for target database based on source columns.
pub fn generate_create_table_ddl(
    target_dialect: &str,
    target_schema: Option<&str>,
    target_table: &str,
    columns: &[ColumnMeta],
    src_dialect: &str,
) -> String {
    let (left_q, right_q) = match target_dialect {
        "mysql" => ("`", "`"),
        _ => ("\"", "\""),
    };

    let full_table_name = match target_schema {
        Some(s) if !s.is_empty() => match target_dialect {
            "mysql" => format!("`{}`.`{}`", s.replace('`', "``"), target_table.replace('`', "``")),
            _ => format!("\"{}\".\"{}\"", s.replace('"', "\"\""), target_table.replace('"', "\"\"")),
        },
        _ => format!("{}{}{}", left_q, target_table.replace(left_q, &format!("{left_q}{left_q}")), right_q),
    };

    let mut col_defs = Vec::new();
    let mut pk_cols = Vec::new();

    for col in columns {
        let q_name = format!("{}{}{}", left_q, col.name.replace(left_q, &format!("{left_q}{left_q}")), right_q);
        let mapped_type = map_data_type(&col.data_type, src_dialect, target_dialect);

        let mut def = format!("{} {}", q_name, mapped_type);

        if col.is_primary_key.unwrap_or(false) {
            pk_cols.push(q_name.clone());
        }

        if !col.nullable && !mapped_type.contains("PRIMARY KEY") {
            def.push_str(" NOT NULL");
        }

        col_defs.push(def);
    }

    // Add composite PK constraint if multiple PKs or if not inline
    if !pk_cols.is_empty() && target_dialect != "sqlite" && !col_defs.iter().any(|d| d.contains("PRIMARY KEY")) {
        col_defs.push(format!("PRIMARY KEY ({})", pk_cols.join(", ")));
    }

    format!(
        "CREATE TABLE {} (\n  {}\n);",
        full_table_name,
        col_defs.join(",\n  ")
    )
}

/// Copies table structure and data across databases (same or different engines).
pub async fn copy_table_cross_db_impl<F>(
    src_conn: &dyn DatabaseConnection,
    src_driver: DatabaseDriver,
    tgt_conn: &dyn DatabaseConnection,
    tgt_driver: DatabaseDriver,
    options: &CrossDbCopyTableOptions,
    on_progress: Option<F>,
) -> Result<CrossDbCopyResult, AppError>
where
    F: Fn(TransferProgress) + Send + 'static,
{
    let start_time = Instant::now();

    let src_dialect = match src_driver {
        DatabaseDriver::Sqlite => "sqlite",
        DatabaseDriver::Mysql => "mysql",
        DatabaseDriver::Postgres => "postgres",
    };

    let tgt_dialect = match tgt_driver {
        DatabaseDriver::Sqlite => "sqlite",
        DatabaseDriver::Mysql => "mysql",
        DatabaseDriver::Postgres => "postgres",
    };

    // 1. Fetch source table data and column metadata
    let src_qualified_table = match options.source_schema.as_deref() {
        Some(s) if !s.is_empty() => match src_driver {
            DatabaseDriver::Mysql => format!("`{}`.`{}`", s.replace('`', "``"), options.source_table.replace('`', "``")),
            _ => format!("\"{}\".\"{}\"", s.replace('"', "\"\""), options.source_table.replace('"', "\"\"")),
        },
        _ => match src_driver {
            DatabaseDriver::Mysql => format!("`{}`", options.source_table.replace('`', "``")),
            _ => format!("\"{}\"", options.source_table.replace('"', "\"\"")),
        },
    };

    let query_sql = format!("SELECT * FROM {};", src_qualified_table);
    let src_result = src_conn.execute_query(&query_sql).await?;
    let columns = src_result.columns;
    let rows = src_result.rows;

    let tgt_qualified_table = match options.target_schema.as_deref() {
        Some(s) if !s.is_empty() => match tgt_driver {
            DatabaseDriver::Mysql => format!("`{}`.`{}`", s.replace('`', "``"), options.target_table.replace('`', "``")),
            _ => format!("\"{}\".\"{}\"", s.replace('"', "\"\""), options.target_table.replace('"', "\"\"")),
        },
        _ => match tgt_driver {
            DatabaseDriver::Mysql => format!("`{}`", options.target_table.replace('`', "``")),
            _ => format!("\"{}\"", options.target_table.replace('"', "\"\"")),
        },
    };

    // 2. Drop target table if exists
    if options.drop_target_if_exists {
        let drop_sql = match tgt_driver {
            DatabaseDriver::Postgres => format!("DROP TABLE IF EXISTS {} CASCADE;", tgt_qualified_table),
            _ => format!("DROP TABLE IF EXISTS {};", tgt_qualified_table),
        };
        tgt_conn.execute_query(&drop_sql).await?;
    }

    // 3. Create target table structure
    if options.copy_structure {
        let create_ddl = generate_create_table_ddl(
            tgt_dialect,
            options.target_schema.as_deref(),
            &options.target_table,
            &columns,
            src_dialect,
        );
        tgt_conn.execute_query(&create_ddl).await?;
    }

    // 4. Stream data in batches
    let mut rows_transferred = 0;
    let total_rows = rows.len();

    if options.copy_data && !rows.is_empty() {
        let col_names: Vec<String> = columns.iter().map(|c| c.name.clone()).collect();
        let batch_size = options.batch_size.unwrap_or(500).max(1);

        for chunk in rows.chunks(batch_size) {
            let target_table_unquoted = match options.target_schema.as_deref() {
                Some(s) if !s.is_empty() => format!("{}.{}", s, options.target_table),
                _ => options.target_table.clone(),
            };

            // We generate the batch insert sql directly using raw CellValues (no lossy string heuristic)
            let insert_sql = generate_batch_insert_cells_sql(
                &target_table_unquoted,
                &col_names,
                chunk,
                tgt_dialect,
            );

            tgt_conn.execute_query(&insert_sql).await?;
            rows_transferred += chunk.len();

            if let Some(ref cb) = on_progress {
                cb(TransferProgress {
                    current_row: rows_transferred,
                    total_rows: Some(total_rows),
                    status: format!("Transferring rows: {} / {}", rows_transferred, total_rows),
                });
            }
        }
    }

    let elapsed_ms = start_time.elapsed().as_millis() as u64;

    Ok(CrossDbCopyResult {
        rows_transferred,
        elapsed_ms,
    })
}
