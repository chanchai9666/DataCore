use crate::drivers::{Chunk, DatabaseConnection};
use crate::error::AppError;
use crate::models::transfer::{
    SqlExportOptions, SqlExportResult, SqlImportOptions, SqlImportResult, TransferProgress,
};
use crate::models::{CellValue, DatabaseDriver};
use crate::services::data_transfer::{
    escape_sql_string, is_transfer_cancelled, remove_cancellation_token,
};
use crate::services::table_list::get_table_list_metadata_impl;
use std::fs::File;
use std::io::{BufRead, BufReader, BufWriter, Write};

/// Checks whether a statement string contains any executable SQL (i.e. not solely whitespace and comments).
fn is_executable_sql(stmt: &str) -> bool {
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut in_backtick = false;
    let mut in_block_comment = false;

    for line in stmt.lines() {
        let chars: Vec<char> = line.chars().collect();
        let len = chars.len();
        let mut i = 0;
        while i < len {
            let c = chars[i];
            let next_c = if i + 1 < len {
                Some(chars[i + 1])
            } else {
                None
            };

            if in_block_comment {
                if c == '*' && next_c == Some('/') {
                    in_block_comment = false;
                    i += 2;
                    continue;
                }
                i += 1;
                continue;
            }

            if !in_single_quote
                && !in_double_quote
                && !in_backtick
                && c == '/'
                && next_c == Some('*')
            {
                in_block_comment = true;
                i += 2;
                continue;
            }

            if !in_single_quote
                && !in_double_quote
                && !in_backtick
                && ((c == '-' && next_c == Some('-')) || c == '#')
            {
                // Remainder of line is a comment
                break;
            }

            if c == '\'' && !in_double_quote && !in_backtick {
                in_single_quote = !in_single_quote;
            } else if c == '"' && !in_single_quote && !in_backtick {
                in_double_quote = !in_double_quote;
            } else if c == '`' && !in_single_quote && !in_double_quote {
                in_backtick = !in_backtick;
            }

            if !c.is_whitespace() {
                return true;
            }
            i += 1;
        }
    }
    false
}

/// Splits SQL script text into individual executable SQL statements.
/// Detects, tracks, and strips DELIMITER directives (e.g. `DELIMITER $$`).
pub fn split_sql_script(content: &str) -> Vec<String> {
    let mut statements = Vec::new();
    let mut current_stmt = String::new();
    let mut current_delimiter = ";".to_string();

    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut in_backtick = false;
    let mut in_block_comment = false;

    let lines = content.lines();

    for line in lines {
        let trimmed_line = line.trim();

        // Check for DELIMITER directive (case-insensitive) outside quotes
        if !in_single_quote
            && !in_double_quote
            && !in_backtick
            && !in_block_comment
            && trimmed_line.to_uppercase().starts_with("DELIMITER ")
        {
            let parts: Vec<&str> = trimmed_line.split_whitespace().collect();
            if parts.len() >= 2 {
                current_delimiter = parts[1].to_string();
            }
            // Strip DELIMITER line: do not append to statement
            continue;
        }

        let chars: Vec<char> = line.chars().collect();
        let len = chars.len();
        let mut i = 0;

        while i < len {
            let c = chars[i];
            let next_c = if i + 1 < len {
                Some(chars[i + 1])
            } else {
                None
            };

            // Handle block comment
            if in_block_comment {
                if c == '*' && next_c == Some('/') {
                    in_block_comment = false;
                    current_stmt.push(c);
                    current_stmt.push('/');
                    i += 2;
                    continue;
                }
                current_stmt.push(c);
                i += 1;
                continue;
            }

            // Start block comment
            if !in_single_quote
                && !in_double_quote
                && !in_backtick
                && c == '/'
                && next_c == Some('*')
            {
                in_block_comment = true;
                current_stmt.push(c);
                current_stmt.push('*');
                i += 2;
                continue;
            }

            // Line comment (-- or #)
            if !in_single_quote
                && !in_double_quote
                && !in_backtick
                && ((c == '-' && next_c == Some('-')) || c == '#')
            {
                // Line comment extends to the end of the line
                for &ch in &chars[i..] {
                    current_stmt.push(ch);
                }
                current_stmt.push('\n');
                break;
            }

            // Handle quotes
            if c == '\'' && !in_double_quote && !in_backtick {
                if in_single_quote && next_c == Some('\'') {
                    // Escaped single quote
                    current_stmt.push('\'');
                    current_stmt.push('\'');
                    i += 2;
                    continue;
                }
                in_single_quote = !in_single_quote;
            } else if c == '"' && !in_single_quote && !in_backtick {
                in_double_quote = !in_double_quote;
            } else if c == '`' && !in_single_quote && !in_double_quote {
                in_backtick = !in_backtick;
            }

            // Check if delimiter matches at current position
            if !in_single_quote && !in_double_quote && !in_backtick && !in_block_comment {
                let delim_chars: Vec<char> = current_delimiter.chars().collect();
                let delim_len = delim_chars.len();
                if i + delim_len <= len && chars[i..i + delim_len] == delim_chars[..] {
                    let final_stmt = current_stmt.trim().to_string();
                    if !final_stmt.is_empty() && is_executable_sql(&final_stmt) {
                        statements.push(final_stmt);
                    }
                    current_stmt.clear();
                    i += delim_len;
                    continue;
                }
            }

            current_stmt.push(c);
            i += 1;
        }

        current_stmt.push('\n');
    }

    let final_stmt = current_stmt.trim().to_string();
    if !final_stmt.is_empty() && is_executable_sql(&final_stmt) {
        statements.push(final_stmt);
    }

    statements
}

/// Formats a CellValue as an SQL literal string.
fn format_cell_value(val: &CellValue, dialect: &str) -> String {
    match val {
        CellValue::Null => "NULL".to_string(),
        CellValue::Integer(i) => i.to_string(),
        CellValue::Float(f) => {
            if f.is_nan() || f.is_infinite() {
                "NULL".to_string()
            } else {
                f.to_string()
            }
        }
        CellValue::Text(s) => {
            format!("'{}'", escape_sql_string(s, dialect))
        }
        CellValue::Boolean(b) => {
            if dialect == "postgres" {
                if *b {
                    "TRUE".to_string()
                } else {
                    "FALSE".to_string()
                }
            } else {
                if *b {
                    "1".to_string()
                } else {
                    "0".to_string()
                }
            }
        }
        CellValue::Json(j) => {
            let json_str = j.to_string();
            format!("'{}'", escape_sql_string(&json_str, dialect))
        }
        CellValue::Bytes(b64) => {
            use base64::Engine;
            if let Ok(raw) = base64::engine::general_purpose::STANDARD.decode(b64) {
                let hex_str: String = raw.iter().map(|b| format!("{:02X}", b)).collect();
                if dialect.to_lowercase().contains("postgres") {
                    format!("'\\x{}'::bytea", hex_str)
                } else {
                    format!("X'{}'", hex_str)
                }
            } else {
                format!("'{}'", escape_sql_string(b64, dialect))
            }
        }
    }
}

/// Dumps table DDL and data into a local SQL script file using streaming pagination.
pub async fn export_sql_impl(
    conn: &dyn DatabaseConnection,
    driver: DatabaseDriver,
    options: &SqlExportOptions,
) -> Result<SqlExportResult, AppError> {
    export_sql_with_progress_impl(conn, driver, options, None::<fn(TransferProgress)>).await
}

/// Dumps table DDL and data into a local SQL script file with real-time progress reporting.
pub async fn export_sql_with_progress_impl<F>(
    conn: &dyn DatabaseConnection,
    driver: DatabaseDriver,
    options: &SqlExportOptions,
    on_progress: Option<F>,
) -> Result<SqlExportResult, AppError>
where
    F: Fn(TransferProgress) + Send + Sync,
{
    let start_time = std::time::Instant::now();
    let dialect = match driver {
        DatabaseDriver::Sqlite => "sqlite",
        DatabaseDriver::Mysql => "mysql",
        DatabaseDriver::Postgres => "postgres",
        DatabaseDriver::Duckdb => "duckdb",
        DatabaseDriver::Mssql => "mssql",
    };

    let file = File::create(&options.file_path).map_err(|e| {
        AppError::Other(format!(
            "Failed to create SQL export file '{}': {}",
            options.file_path, e
        ))
    })?;
    let mut writer = BufWriter::new(file);

    let export_res: Result<(usize, usize), AppError> = async {
        writeln!(
            writer,
            "-- --------------------------------------------------------"
        )?;
        writeln!(writer, "-- DataCore SQL Dump")?;
        writeln!(writer, "-- Target: {}", dialect)?;
        writeln!(
            writer,
            "-- Generated at: {}",
            chrono::Utc::now().to_rfc3339()
        )?;
        writeln!(
            writer,
            "-- --------------------------------------------------------\n"
        )?;

        let batch_size = options.batch_size.unwrap_or(500).max(1);
        let mut total_rows = 0usize;

        let tables_meta = get_table_list_metadata_impl(conn, driver, options.schema.as_deref())
            .await
            .unwrap_or_default();
        let table_row_map: std::collections::HashMap<String, usize> = tables_meta
            .iter()
            .map(|t| (t.name.clone(), t.approx_row_count.max(0) as usize))
            .collect();

        let target_tables = if options.tables.is_empty() {
            if !tables_meta.is_empty() {
                tables_meta.into_iter().map(|t| t.name).collect::<Vec<_>>()
            } else {
                let fallback =
                    get_table_list_metadata_impl(conn, driver, options.schema.as_deref()).await?;
                fallback.into_iter().map(|t| t.name).collect::<Vec<_>>()
            }
        } else {
            options.tables.clone()
        };
        let total_tables = target_tables.len();
        let estimated_total_rows: usize = target_tables
            .iter()
            .map(|t| table_row_map.get(t).copied().unwrap_or(0))
            .sum();

        for (table_idx, table) in target_tables.iter().enumerate() {
            if let Some(ref jid) = options.job_id {
                if is_transfer_cancelled(jid) {
                    return Err(AppError::Cancelled(
                        "SQL export cancelled by user".to_string(),
                    ));
                }
            }

            if let Some(ref cb) = on_progress {
                let pct = if options.include_data && estimated_total_rows > 0 {
                    ((total_rows as f64 / estimated_total_rows as f64) * 100.0).clamp(0.0, 99.0)
                } else if total_tables > 0 {
                    ((table_idx as f64 / total_tables as f64) * 100.0).clamp(0.0, 99.0)
                } else {
                    0.0
                };
                cb(TransferProgress {
                    current_row: if estimated_total_rows > 0 {
                        total_rows
                    } else {
                        table_idx
                    },
                    total_rows: Some(if estimated_total_rows > 0 {
                        estimated_total_rows.max(total_rows)
                    } else {
                        total_tables.max(1)
                    }),
                    status: format!("Exporting {} ({}/{})", table, table_idx + 1, total_tables),
                    job_id: options.job_id.clone(),
                    rows_processed: Some(total_rows),
                    bytes_written: std::fs::metadata(&options.file_path).ok().map(|m| m.len()),
                    elapsed_ms: Some(start_time.elapsed().as_millis() as u64),
                    percent: Some(pct),
                });
            }

            writeln!(writer, "--")?;
            writeln!(writer, "-- Table structure and data for `{}`", table)?;
            writeln!(writer, "--\n")?;

            let schema_name = options.schema.as_deref();

            // 1. Drop Table statement
            if options.include_drop_table {
                let drop_sql = match driver {
                    DatabaseDriver::Sqlite => {
                        format!("DROP TABLE IF EXISTS \"{}\";\n", table.replace('"', "\"\""))
                    }
                    DatabaseDriver::Mysql => {
                        let schema_prefix = match schema_name {
                            Some(s) if !s.is_empty() => format!("`{}`.", s.replace('`', "``")),
                            _ => String::new(),
                        };
                        format!(
                            "DROP TABLE IF EXISTS {schema_prefix}`{}`;\n",
                            table.replace('`', "``")
                        )
                    }
                    DatabaseDriver::Postgres => {
                        let s_name = schema_name.unwrap_or("public");
                        format!(
                            "DROP TABLE IF EXISTS \"{}\".\"{}\" CASCADE;\n",
                            s_name.replace('"', "\"\""),
                            table.replace('"', "\"\"")
                        )
                    }
                    DatabaseDriver::Duckdb => {
                        format!("DROP TABLE IF EXISTS \"{}\";\n", table.replace('"', "\"\""))
                    }
                    DatabaseDriver::Mssql => {
                        let s_name = schema_name.unwrap_or("dbo");
                        format!(
                            "DROP TABLE IF EXISTS [{s_name}].[{}];\n",
                            table.replace(']', "]]")
                        )
                    }
                };
                writer.write_all(drop_sql.as_bytes())?;
            }

            // 2. DDL Structure
            if options.include_structure {
                match driver {
                    DatabaseDriver::Sqlite => {
                        let ddl_query = format!(
                            "SELECT sql FROM sqlite_schema WHERE type='table' AND name = '{}';",
                            table.replace('\'', "''")
                        );
                        let res = conn.execute_query(&ddl_query).await?;
                        for row in res.rows {
                            if let Some(CellValue::Text(ddl)) = row.first() {
                                writeln!(writer, "{};\n", ddl.trim_end_matches(';'))?;
                            }
                        }
                    }
                    DatabaseDriver::Mysql => {
                        let schema_prefix = match schema_name {
                            Some(s) if !s.is_empty() => format!("`{}`.", s.replace('`', "``")),
                            _ => String::new(),
                        };
                        let ddl_query = format!(
                            "SHOW CREATE TABLE {schema_prefix}`{}`;",
                            table.replace('`', "``")
                        );
                        if let Ok(res) = conn.execute_query(&ddl_query).await {
                            for row in res.rows {
                                if let Some(CellValue::Text(ddl)) = row.get(1) {
                                    writeln!(writer, "{};\n", ddl.trim_end_matches(';'))?;
                                }
                            }
                        }
                    }
                    DatabaseDriver::Postgres => {
                        let s_name = schema_name.unwrap_or("public");
                        let cols_query = format!(
                            r#"SELECT column_name, data_type, is_nullable, column_default 
                           FROM information_schema.columns 
                           WHERE table_schema = '{}' AND table_name = '{}'
                           ORDER BY ordinal_position;"#,
                            s_name.replace('\'', "''"),
                            table.replace('\'', "''")
                        );
                        if let Ok(res) = conn.execute_query(&cols_query).await {
                            if !res.rows.is_empty() {
                                let mut col_defs = Vec::new();
                                for row in res.rows {
                                    if let (
                                        Some(CellValue::Text(name)),
                                        Some(CellValue::Text(dtype)),
                                    ) = (row.first(), row.get(1))
                                    {
                                        let is_not_null = row
                                            .get(2)
                                            .and_then(|c| match c {
                                                CellValue::Text(t) => Some(t == "NO"),
                                                _ => None,
                                            })
                                            .unwrap_or(false);
                                        let default_str =
                                            if let Some(CellValue::Text(def)) = row.get(3) {
                                                if !def.is_empty() {
                                                    format!(" DEFAULT {}", def)
                                                } else {
                                                    String::new()
                                                }
                                            } else {
                                                String::new()
                                            };
                                        let not_null_str =
                                            if is_not_null { " NOT NULL" } else { "" };
                                        col_defs.push(format!(
                                            "    \"{}\" {}{}{}",
                                            name.replace('"', "\"\""),
                                            dtype,
                                            default_str,
                                            not_null_str
                                        ));
                                    }
                                }

                                // Query primary key constraints
                                let pk_query = format!(
                                    r#"SELECT kcu.column_name 
                                   FROM information_schema.table_constraints tc 
                                   JOIN information_schema.key_column_usage kcu 
                                     ON tc.constraint_name = kcu.constraint_name 
                                     AND tc.table_schema = kcu.table_schema 
                                   WHERE tc.constraint_type = 'PRIMARY KEY' 
                                     AND tc.table_schema = '{}' 
                                     AND tc.table_name = '{}' 
                                   ORDER BY kcu.ordinal_position;"#,
                                    s_name.replace('\'', "''"),
                                    table.replace('\'', "''")
                                );
                                if let Ok(pk_res) = conn.execute_query(&pk_query).await {
                                    let pk_cols: Vec<String> = pk_res
                                        .rows
                                        .into_iter()
                                        .filter_map(|r| match r.first() {
                                            Some(CellValue::Text(c)) => {
                                                Some(format!("\"{}\"", c.replace('"', "\"\"")))
                                            }
                                            _ => None,
                                        })
                                        .collect();
                                    if !pk_cols.is_empty() {
                                        col_defs.push(format!(
                                            "    PRIMARY KEY ({})",
                                            pk_cols.join(", ")
                                        ));
                                    }
                                }

                                writeln!(
                                    writer,
                                    "CREATE TABLE \"{}\".\"{}\" (\n{}\n);\n",
                                    s_name.replace('"', "\"\""),
                                    table.replace('"', "\"\""),
                                    col_defs.join(",\n")
                                )?;
                            }
                        }
                    }
                    DatabaseDriver::Duckdb => {
                        let ddl_query = format!(
                            "SELECT sql FROM duckdb_tables() WHERE table_name = '{}';",
                            table.replace('\'', "''")
                        );
                        if let Ok(res) = conn.execute_query(&ddl_query).await {
                            for row in res.rows {
                                if let Some(CellValue::Text(ddl)) = row.first() {
                                    writeln!(writer, "{};\n", ddl.trim_end_matches(';'))?;
                                }
                            }
                        }
                    }
                    DatabaseDriver::Mssql => {
                        let s_name = schema_name.unwrap_or("dbo");
                        writeln!(
                            writer,
                            "-- DDL for [{s_name}].[{}]",
                            table.replace(']', "]]")
                        )?;
                    }
                }
            }

            // 3. Table Data (Streamed in batches of `batch_size` rows via single-statement stream_query)
            if options.include_data {
                let quoted_table = match driver {
                    DatabaseDriver::Sqlite => format!("\"{}\"", table.replace('"', "\"\"")),
                    DatabaseDriver::Mysql => {
                        let schema_prefix = match schema_name {
                            Some(s) if !s.is_empty() => format!("`{}`.", s.replace('`', "``")),
                            _ => String::new(),
                        };
                        format!("{schema_prefix}`{}`", table.replace('`', "``"))
                    }
                    DatabaseDriver::Postgres => {
                        let s_name = schema_name.unwrap_or("public");
                        format!(
                            "\"{}\".\"{}\"",
                            s_name.replace('"', "\"\""),
                            table.replace('"', "\"\"")
                        )
                    }
                    DatabaseDriver::Duckdb => {
                        format!("\"{}\"", table.replace('"', "\"\""))
                    }
                    DatabaseDriver::Mssql => {
                        let s_name = schema_name.unwrap_or("dbo");
                        format!("[{s_name}].[{}]", table.replace(']', "]]"))
                    }
                };

                let select_sql = format!("SELECT * FROM {};", quoted_table);
                let (tx, mut rx) = tokio::sync::mpsc::channel::<Chunk>(4);
                let stream_fut = conn.stream_query(&select_sql, batch_size, tx);
                let total_rows_ref = &mut total_rows;
                let on_progress_ref = &on_progress;
                let file_path_ref = &options.file_path;
                let job_id_ref = &options.job_id;
                let consume_fut = async {
                    while let Some(chunk) = rx.recv().await {
                        if let Some(ref jid) = job_id_ref {
                            if is_transfer_cancelled(jid) {
                                remove_cancellation_token(jid);
                                drop(rx);
                                return Err(AppError::Cancelled(
                                    "SQL export cancelled by user".to_string(),
                                ));
                            }
                        }

                        if chunk.rows.is_empty() || chunk.columns.is_empty() {
                            continue;
                        }

                        let fetched_count = chunk.rows.len();
                        *total_rows_ref += fetched_count;

                        let quoted_cols: Vec<String> = chunk
                            .columns
                            .iter()
                            .map(|c| match driver {
                                DatabaseDriver::Mysql => format!("`{}`", c.name.replace('`', "``")),
                                _ => format!("\"{}\"", c.name.replace('"', "\"\"")),
                            })
                            .collect();

                        let cols_joined = quoted_cols.join(", ");

                        let mut value_tuples = Vec::with_capacity(fetched_count);
                        for row in &chunk.rows {
                            let formatted: Vec<String> =
                                row.iter().map(|v| format_cell_value(v, dialect)).collect();
                            value_tuples.push(format!("({})", formatted.join(", ")));
                        }

                        if let Err(e) = writeln!(
                            writer,
                            "INSERT INTO {} ({}) VALUES\n{};\n",
                            quoted_table,
                            cols_joined,
                            value_tuples.join(",\n")
                        ) {
                            drop(rx);
                            return Err(AppError::from(e));
                        }

                        if let Some(ref cb) = on_progress_ref {
                            let current = *total_rows_ref;
                            let pct = if estimated_total_rows > 0 {
                                ((current as f64 / estimated_total_rows as f64) * 100.0)
                                    .clamp(0.0, 99.0)
                            } else if total_tables > 0 {
                                (((table_idx as f64 + 0.5) / total_tables as f64) * 100.0)
                                    .clamp(0.0, 99.0)
                            } else {
                                0.0
                            };
                            cb(TransferProgress {
                                current_row: if estimated_total_rows > 0 {
                                    current
                                } else {
                                    table_idx + 1
                                },
                                total_rows: Some(if estimated_total_rows > 0 {
                                    estimated_total_rows.max(current)
                                } else {
                                    total_tables.max(1)
                                }),
                                status: format!(
                                    "Exporting {} ({}/{})",
                                    table,
                                    table_idx + 1,
                                    total_tables
                                ),
                                job_id: job_id_ref.clone(),
                                rows_processed: Some(current),
                                bytes_written: std::fs::metadata(file_path_ref)
                                    .ok()
                                    .map(|m| m.len()),
                                elapsed_ms: Some(start_time.elapsed().as_millis() as u64),
                                percent: Some(pct),
                            });
                        }
                    }
                    Ok::<(), AppError>(())
                };

                let (stream_res, consume_res) = tokio::join!(stream_fut, consume_fut);
                consume_res?;
                stream_res?;
            }
        }

        writer.flush()?;
        Ok((total_tables, total_rows))
    }
    .await;

    drop(writer);
    if let Some(ref jid) = options.job_id {
        remove_cancellation_token(jid);
    }

    match export_res {
        Ok((total_tables, total_rows)) => {
            let metadata = std::fs::metadata(&options.file_path).map_err(|e| {
                AppError::Other(format!("Failed to read export file metadata: {}", e))
            })?;

            if let Some(ref cb) = on_progress {
                cb(TransferProgress {
                    current_row: total_rows,
                    total_rows: Some(total_rows.max(1)),
                    status: "done".to_string(),
                    job_id: options.job_id.clone(),
                    rows_processed: Some(total_rows),
                    bytes_written: Some(metadata.len()),
                    elapsed_ms: Some(start_time.elapsed().as_millis() as u64),
                    percent: Some(100.0),
                });
            }

            Ok(SqlExportResult {
                total_tables,
                total_rows,
                file_size_bytes: metadata.len(),
            })
        }
        Err(e) => {
            let _ = std::fs::remove_file(&options.file_path);
            Err(e)
        }
    }
}

/// Reads and executes SQL script statement-by-statement via streaming BufReader.
pub async fn import_sql_impl<F>(
    conn: &dyn DatabaseConnection,
    options: &SqlImportOptions,
    on_progress: Option<F>,
) -> Result<SqlImportResult, AppError>
where
    F: Fn(TransferProgress) + Send + 'static,
{
    let file = File::open(&options.file_path).map_err(|e| {
        AppError::Other(format!(
            "Failed to open SQL import file '{}': {}",
            options.file_path, e
        ))
    })?;

    let total_file_bytes = file.metadata().map(|m| m.len()).unwrap_or(0).max(1);
    let start_time = std::time::Instant::now();
    let mut bytes_read: u64 = 0;

    let reader = BufReader::new(file);
    let continue_on_error = options.error_policy.to_lowercase() == "continue";
    let mut successful_statements = 0;
    let mut failed_statements = 0;
    let mut executed_count = 0;

    let mut current_stmt = String::new();
    let mut current_delimiter = ";".to_string();

    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut in_backtick = false;
    let mut in_block_comment = false;

    let job_id = options.job_id.as_deref();

    if !continue_on_error {
        let _ = conn.execute_query("BEGIN").await;
    }

    for line_res in reader.lines() {
        let line = line_res
            .map_err(|e| AppError::Other(format!("Failed to read SQL script line: {}", e)))?;
        bytes_read = bytes_read.saturating_add(line.len() as u64 + 1);
        let trimmed_line = line.trim();

        // Check cancellation
        if let Some(jid) = job_id {
            if is_transfer_cancelled(jid) {
                if !continue_on_error {
                    let _ = conn.execute_query("ROLLBACK").await;
                }
                remove_cancellation_token(jid);
                return Err(AppError::Cancelled(
                    "SQL import cancelled by user".to_string(),
                ));
            }
        }

        // Check for DELIMITER directive outside quotes
        if !in_single_quote
            && !in_double_quote
            && !in_backtick
            && !in_block_comment
            && trimmed_line.to_uppercase().starts_with("DELIMITER ")
        {
            let parts: Vec<&str> = trimmed_line.split_whitespace().collect();
            if parts.len() >= 2 {
                current_delimiter = parts[1].to_string();
            }
            continue;
        }

        let chars: Vec<char> = line.chars().collect();
        let len = chars.len();
        let mut i = 0;

        while i < len {
            let c = chars[i];
            let next_c = if i + 1 < len {
                Some(chars[i + 1])
            } else {
                None
            };

            // Handle block comment
            if in_block_comment {
                if c == '*' && next_c == Some('/') {
                    in_block_comment = false;
                    current_stmt.push(c);
                    current_stmt.push('/');
                    i += 2;
                    continue;
                }
                current_stmt.push(c);
                i += 1;
                continue;
            }

            // Start block comment
            if !in_single_quote
                && !in_double_quote
                && !in_backtick
                && c == '/'
                && next_c == Some('*')
            {
                in_block_comment = true;
                current_stmt.push(c);
                current_stmt.push('*');
                i += 2;
                continue;
            }

            // Line comment (-- or #)
            if !in_single_quote
                && !in_double_quote
                && !in_backtick
                && ((c == '-' && next_c == Some('-')) || c == '#')
            {
                for &ch in &chars[i..] {
                    current_stmt.push(ch);
                }
                break;
            }

            // Quotes handling
            if c == '\'' && !in_double_quote && !in_backtick {
                if in_single_quote && next_c == Some('\'') {
                    current_stmt.push('\'');
                    current_stmt.push('\'');
                    i += 2;
                    continue;
                }
                in_single_quote = !in_single_quote;
                current_stmt.push(c);
                i += 1;
                continue;
            }
            if c == '"' && !in_single_quote && !in_backtick {
                in_double_quote = !in_double_quote;
                current_stmt.push(c);
                i += 1;
                continue;
            }
            if c == '`' && !in_single_quote && !in_double_quote {
                in_backtick = !in_backtick;
                current_stmt.push(c);
                i += 1;
                continue;
            }

            // Check delimiter
            if !in_single_quote && !in_double_quote && !in_backtick && !in_block_comment {
                let delim_len = current_delimiter.chars().count();
                if i + delim_len <= len {
                    let sub: String = chars[i..i + delim_len].iter().collect();
                    if sub == current_delimiter {
                        let stmt_to_exec = current_stmt.trim().to_string();
                        current_stmt.clear();
                        i += delim_len;

                        if is_executable_sql(&stmt_to_exec) {
                            if let Some(jid) = job_id {
                                if is_transfer_cancelled(jid) {
                                    if !continue_on_error {
                                        let _ = conn.execute_query("ROLLBACK").await;
                                    }
                                    remove_cancellation_token(jid);
                                    return Err(AppError::Cancelled(
                                        "SQL import cancelled by user".to_string(),
                                    ));
                                }
                            }

                            executed_count += 1;
                            if let Some(ref cb) = on_progress {
                                let pct = ((bytes_read as f64 / total_file_bytes as f64) * 100.0)
                                    .clamp(1.0, 99.0);
                                let estimated_total_stmts =
                                    ((executed_count as f64 / (pct / 100.0)).round() as usize)
                                        .max(executed_count + 1);
                                cb(TransferProgress {
                                    current_row: executed_count,
                                    total_rows: Some(estimated_total_stmts),
                                    status: format!("Executing statement {}", executed_count),
                                    job_id: options.job_id.clone(),
                                    rows_processed: Some(executed_count),
                                    bytes_written: Some(bytes_read),
                                    elapsed_ms: Some(start_time.elapsed().as_millis() as u64),
                                    percent: Some(pct),
                                });
                            }

                            match conn.execute_query(&stmt_to_exec).await {
                                Ok(_) => successful_statements += 1,
                                Err(e) => {
                                    failed_statements += 1;
                                    if !continue_on_error {
                                        let _ = conn.execute_query("ROLLBACK").await;
                                        if let Some(jid) = job_id {
                                            remove_cancellation_token(jid);
                                        }
                                        return Err(AppError::Other(format!(
                                            "SQL Import failed at statement {}: {}\nStatement: {}",
                                            executed_count, e, stmt_to_exec
                                        )));
                                    }
                                }
                            }
                        }
                        continue;
                    }
                }
            }

            current_stmt.push(c);
            i += 1;
        }
        current_stmt.push('\n');
    }

    // Trailing statement
    let trailing = current_stmt.trim().to_string();
    if is_executable_sql(&trailing) {
        if let Some(jid) = job_id {
            if is_transfer_cancelled(jid) {
                if !continue_on_error {
                    let _ = conn.execute_query("ROLLBACK").await;
                }
                remove_cancellation_token(jid);
                return Err(AppError::Cancelled(
                    "SQL import cancelled by user".to_string(),
                ));
            }
        }

        executed_count += 1;
        if let Some(ref cb) = on_progress {
            let pct = ((bytes_read as f64 / total_file_bytes as f64) * 100.0).clamp(1.0, 99.0);
            cb(TransferProgress {
                current_row: executed_count,
                total_rows: Some(executed_count),
                status: format!("Executing statement {}", executed_count),
                job_id: options.job_id.clone(),
                rows_processed: Some(executed_count),
                bytes_written: Some(bytes_read),
                elapsed_ms: Some(start_time.elapsed().as_millis() as u64),
                percent: Some(pct),
            });
        }
        match conn.execute_query(&trailing).await {
            Ok(_) => successful_statements += 1,
            Err(e) => {
                failed_statements += 1;
                if !continue_on_error {
                    let _ = conn.execute_query("ROLLBACK").await;
                    if let Some(jid) = job_id {
                        remove_cancellation_token(jid);
                    }
                    return Err(AppError::Other(format!(
                        "SQL Import failed at statement {}: {}\nStatement: {}",
                        executed_count, e, trailing
                    )));
                }
            }
        }
    }

    if !continue_on_error {
        let _ = conn.execute_query("COMMIT").await;
    }

    if let Some(ref cb) = on_progress {
        cb(TransferProgress {
            current_row: executed_count,
            total_rows: Some(executed_count.max(1)),
            status: "done".to_string(),
            job_id: options.job_id.clone(),
            rows_processed: Some(executed_count),
            bytes_written: Some(total_file_bytes),
            elapsed_ms: Some(start_time.elapsed().as_millis() as u64),
            percent: Some(100.0),
        });
    }

    if let Some(jid) = job_id {
        remove_cancellation_token(jid);
    }

    Ok(SqlImportResult {
        total_statements: executed_count,
        successful_statements,
        failed_statements,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::drivers::SqliteConnection;
    use crate::services::data_transfer::{register_cancellation_token, trigger_cancellation};

    #[tokio::test]
    async fn test_export_sql_removes_partial_file_on_cancel() {
        let conn = SqliteConnection::open_in_memory().expect("sqlite");
        conn.execute_query("CREATE TABLE t1 (id INTEGER, name TEXT);")
            .await
            .unwrap();
        conn.execute_query("INSERT INTO t1 VALUES (1, 'a'), (2, 'b');")
            .await
            .unwrap();

        let dir = tempfile::tempdir().unwrap();
        let out_path = dir.path().join("cancelled.sql");
        let job_id = "sql_export_cancel_cleanup_test";
        register_cancellation_token(job_id);
        trigger_cancellation(job_id);

        let opts = SqlExportOptions {
            connection_id: "c1".to_string(),
            schema: None,
            tables: vec!["t1".to_string()],
            file_path: out_path.to_string_lossy().to_string(),
            include_drop_table: true,
            include_structure: true,
            include_data: true,
            batch_size: Some(10),
            job_id: Some(job_id.to_string()),
        };

        let err = export_sql_impl(&conn, DatabaseDriver::Sqlite, &opts)
            .await
            .expect_err("cancelled sql export must err");
        assert!(err.to_string().contains("cancelled"));
        assert!(
            !out_path.exists(),
            "Partial .sql export file must be deleted on cancellation"
        );
    }

    #[tokio::test]
    async fn test_export_sql_with_progress_emits_percent_and_total_rows() {
        use std::sync::{Arc, Mutex};

        let conn = SqliteConnection::open_in_memory().expect("sqlite");
        conn.execute_query("CREATE TABLE p1 (id INTEGER, name TEXT);")
            .await
            .unwrap();
        conn.execute_query("INSERT INTO p1 VALUES (1, 'a'), (2, 'b');")
            .await
            .unwrap();
        conn.execute_query("CREATE TABLE p2 (id INTEGER, name TEXT);")
            .await
            .unwrap();
        conn.execute_query("INSERT INTO p2 VALUES (3, 'c'), (4, 'd');")
            .await
            .unwrap();

        let dir = tempfile::tempdir().unwrap();
        let out_path = dir.path().join("progress.sql");
        let events: Arc<Mutex<Vec<TransferProgress>>> = Arc::new(Mutex::new(Vec::new()));
        let events_clone = events.clone();

        let opts = SqlExportOptions {
            connection_id: "c1".to_string(),
            schema: None,
            tables: vec!["p1".to_string(), "p2".to_string()],
            file_path: out_path.to_string_lossy().to_string(),
            include_drop_table: true,
            include_structure: true,
            include_data: true,
            batch_size: Some(1),
            job_id: Some("sql_prog_1".to_string()),
        };

        let res = export_sql_with_progress_impl(
            &conn,
            DatabaseDriver::Sqlite,
            &opts,
            Some(move |p: TransferProgress| {
                events_clone.lock().unwrap().push(p);
            }),
        )
        .await
        .expect("sql export with progress");
        assert_eq!(res.total_rows, 4);

        let captured = events.lock().unwrap();
        assert!(captured.len() >= 2);
        assert!(captured.iter().all(|p| p.percent.is_some()));
        let last = captured.last().unwrap();
        assert_eq!(last.status, "done");
        assert_eq!(last.percent, Some(100.0));
        assert_eq!(last.total_rows, Some(4));
    }

    #[tokio::test]
    async fn test_import_sql_emits_percent_progress_to_100() {
        use std::sync::{Arc, Mutex};

        let conn = SqliteConnection::open_in_memory().expect("sqlite");
        let dir = tempfile::tempdir().unwrap();
        let sql_path = dir.path().join("import_prog.sql");
        std::fs::write(
            &sql_path,
            "CREATE TABLE imp_t (id INTEGER);\nINSERT INTO imp_t VALUES (1);\nINSERT INTO imp_t VALUES (2);\n",
        )
        .unwrap();

        let events: Arc<Mutex<Vec<TransferProgress>>> = Arc::new(Mutex::new(Vec::new()));
        let events_clone = events.clone();

        let opts = SqlImportOptions {
            connection_id: "c1".to_string(),
            schema: None,
            file_path: sql_path.to_string_lossy().to_string(),
            error_policy: "abort".to_string(),
            job_id: Some("sql_imp_prog_1".to_string()),
        };

        let res = import_sql_impl(
            &conn,
            &opts,
            Some(move |p: TransferProgress| {
                events_clone.lock().unwrap().push(p);
            }),
        )
        .await
        .expect("sql import with progress");
        assert_eq!(res.successful_statements, 3);

        let captured = events.lock().unwrap();
        assert!(captured.len() >= 3);
        assert!(captured
            .iter()
            .all(|p| p.percent.is_some() && p.total_rows.is_some()));
        let last = captured.last().unwrap();
        assert_eq!(last.status, "done");
        assert_eq!(last.percent, Some(100.0));
    }
}
