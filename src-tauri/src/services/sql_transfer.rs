use std::fs::File;
use std::io::{BufRead, BufReader, BufWriter, Write};
use crate::drivers::DatabaseConnection;
use crate::error::AppError;
use crate::models::transfer::{SqlExportOptions, SqlExportResult, SqlImportOptions, SqlImportResult, TransferProgress};
use crate::models::{CellValue, DatabaseDriver};
use crate::services::data_transfer::{is_transfer_cancelled, remove_cancellation_token};
use crate::services::table_list::get_table_list_metadata_impl;

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
            let next_c = if i + 1 < len { Some(chars[i + 1]) } else { None };

            if in_block_comment {
                if c == '*' && next_c == Some('/') {
                    in_block_comment = false;
                    i += 2;
                    continue;
                }
                i += 1;
                continue;
            }

            if !in_single_quote && !in_double_quote && !in_backtick && c == '/' && next_c == Some('*') {
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
            let next_c = if i + 1 < len { Some(chars[i + 1]) } else { None };

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
            if !in_single_quote && !in_double_quote && !in_backtick && c == '/' && next_c == Some('*') {
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
            format!("'{}'", s.replace('\'', "''"))
        }
        CellValue::Boolean(b) => {
            if dialect == "postgres" {
                if *b { "TRUE".to_string() } else { "FALSE".to_string() }
            } else {
                if *b { "1".to_string() } else { "0".to_string() }
            }
        }
        CellValue::Json(j) => {
            let json_str = j.to_string();
            format!("'{}'", json_str.replace('\'', "''"))
        }
        CellValue::Bytes(b64) => {
            format!("'{}'", b64.replace('\'', "''"))
        }
    }
}

/// Dumps table DDL and data into a local SQL script file using streaming pagination.
pub async fn export_sql_impl(
    conn: &dyn DatabaseConnection,
    driver: DatabaseDriver,
    options: &SqlExportOptions,
) -> Result<SqlExportResult, AppError> {
    let dialect = match driver {
        DatabaseDriver::Sqlite => "sqlite",
        DatabaseDriver::Mysql => "mysql",
        DatabaseDriver::Postgres => "postgres",
    };

    let file = File::create(&options.file_path).map_err(|e| {
        AppError::Other(format!(
            "Failed to create SQL export file '{}': {}",
            options.file_path, e
        ))
    })?;
    let mut writer = BufWriter::new(file);

    writeln!(writer, "-- --------------------------------------------------------")?;
    writeln!(writer, "-- DataCore SQL Dump")?;
    writeln!(writer, "-- Target: {}", dialect)?;
    writeln!(writer, "-- Generated at: {}", chrono::Utc::now().to_rfc3339())?;
    writeln!(writer, "-- --------------------------------------------------------\n")?;

    let batch_size = options.batch_size.unwrap_or(500).max(1);
    let mut total_rows = 0;

    let target_tables = if options.tables.is_empty() {
        let tables_meta = get_table_list_metadata_impl(conn, driver, options.schema.as_deref()).await?;
        tables_meta.into_iter().map(|t| t.name).collect::<Vec<_>>()
    } else {
        options.tables.clone()
    };
    let total_tables = target_tables.len();

    for table in &target_tables {
        if let Some(ref jid) = options.job_id {
            if is_transfer_cancelled(jid) {
                remove_cancellation_token(jid);
                return Err(AppError::Cancelled("SQL export cancelled by user".to_string()));
            }
        }

        writeln!(writer, "--")?;
        writeln!(writer, "-- Table structure and data for `{}`", table)?;
        writeln!(writer, "--\n")?;

        let schema_name = options.schema.as_deref();

        // 1. Drop Table statement
        if options.include_drop_table {
            let drop_sql = match driver {
                DatabaseDriver::Sqlite => format!("DROP TABLE IF EXISTS \"{}\";\n", table.replace('"', "\"\"")),
                DatabaseDriver::Mysql => {
                    let schema_prefix = match schema_name {
                        Some(s) if !s.is_empty() => format!("`{}`.", s.replace('`', "``")),
                        _ => String::new(),
                    };
                    format!("DROP TABLE IF EXISTS {schema_prefix}`{}`;\n", table.replace('`', "``"))
                }
                DatabaseDriver::Postgres => {
                    let s_name = schema_name.unwrap_or("public");
                    format!("DROP TABLE IF EXISTS \"{}\".\"{}\" CASCADE;\n", s_name.replace('"', "\"\""), table.replace('"', "\"\""))
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
                    let ddl_query = format!("SHOW CREATE TABLE {schema_prefix}`{}`;", table.replace('`', "``"));
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
                                if let (Some(CellValue::Text(name)), Some(CellValue::Text(dtype))) = (row.first(), row.get(1)) {
                                    let is_null = row.get(2).and_then(|c| match c {
                                        CellValue::Text(t) => Some(t == "NO"),
                                        _ => None,
                                    }).unwrap_or(false);
                                    let not_null_str = if is_null { " NOT NULL" } else { "" };
                                    col_defs.push(format!("    \"{}\" {}{}", name.replace('"', "\"\""), dtype, not_null_str));
                                }
                            }
                            writeln!(writer, "CREATE TABLE \"{}\".\"{}\" (\n{}\n);\n",
                                s_name.replace('"', "\"\""),
                                table.replace('"', "\"\""),
                                col_defs.join(",\n")
                            )?;
                        }
                    }
                }
            }
        }

        // 3. Table Data (Streamed in batches of `batch_size` rows via LIMIT/OFFSET)
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
                    format!("\"{}\".\"{}\"", s_name.replace('"', "\"\""), table.replace('"', "\"\""))
                }
            };

            let mut offset: usize = 0;
            loop {
                if let Some(ref jid) = options.job_id {
                    if is_transfer_cancelled(jid) {
                        remove_cancellation_token(jid);
                        return Err(AppError::Cancelled("SQL export cancelled by user".to_string()));
                    }
                }

                let select_sql = format!(
                    "SELECT * FROM {} LIMIT {} OFFSET {};",
                    quoted_table, batch_size, offset
                );
                let query_res = conn.execute_query(&select_sql).await?;
                let col_names: Vec<String> = query_res.columns.iter().map(|c| c.name.clone()).collect();
                let rows = query_res.rows;

                if rows.is_empty() || col_names.is_empty() {
                    break;
                }

                let fetched_count = rows.len();
                total_rows += fetched_count;

                let quoted_cols: Vec<String> = col_names
                    .iter()
                    .map(|c| match driver {
                        DatabaseDriver::Mysql => format!("`{}`", c.replace('`', "``")),
                        _ => format!("\"{}\"", c.replace('"', "\"\"")),
                    })
                    .collect();

                let cols_joined = quoted_cols.join(", ");

                let mut value_tuples = Vec::with_capacity(fetched_count);
                for row in &rows {
                    let formatted: Vec<String> = row
                        .iter()
                        .map(|v| format_cell_value(v, dialect))
                        .collect();
                    value_tuples.push(format!("({})", formatted.join(", ")));
                }

                writeln!(
                    writer,
                    "INSERT INTO {} ({}) VALUES\n{};\n",
                    quoted_table,
                    cols_joined,
                    value_tuples.join(",\n")
                )?;

                if fetched_count < batch_size {
                    break;
                }
                offset += fetched_count;
            }
        }
    }

    writer.flush()?;

    if let Some(ref jid) = options.job_id {
        remove_cancellation_token(jid);
    }

    let metadata = std::fs::metadata(&options.file_path).map_err(|e| {
        AppError::Other(format!("Failed to read export file metadata: {}", e))
    })?;

    Ok(SqlExportResult {
        total_tables,
        total_rows,
        file_size_bytes: metadata.len(),
    })
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
        let line = line_res.map_err(|e| AppError::Other(format!("Failed to read SQL script line: {}", e)))?;
        let trimmed_line = line.trim();

        // Check cancellation
        if let Some(jid) = job_id {
            if is_transfer_cancelled(jid) {
                if !continue_on_error {
                    let _ = conn.execute_query("ROLLBACK").await;
                }
                remove_cancellation_token(jid);
                return Err(AppError::Cancelled("SQL import cancelled by user".to_string()));
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
            let next_c = if i + 1 < len { Some(chars[i + 1]) } else { None };

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
            if !in_single_quote && !in_double_quote && !in_backtick && c == '/' && next_c == Some('*') {
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
                                    return Err(AppError::Cancelled("SQL import cancelled by user".to_string()));
                                }
                            }

                            executed_count += 1;
                            if let Some(ref cb) = on_progress {
                                cb(TransferProgress {
                                    current_row: executed_count,
                                    total_rows: None,
                                    status: format!("Executing statement {}", executed_count),
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
                return Err(AppError::Cancelled("SQL import cancelled by user".to_string()));
            }
        }

        executed_count += 1;
        if let Some(ref cb) = on_progress {
            cb(TransferProgress {
                current_row: executed_count,
                total_rows: None,
                status: format!("Executing statement {}", executed_count),
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

    if let Some(jid) = job_id {
        remove_cancellation_token(jid);
    }

    Ok(SqlImportResult {
        total_statements: executed_count,
        successful_statements,
        failed_statements,
    })
}
