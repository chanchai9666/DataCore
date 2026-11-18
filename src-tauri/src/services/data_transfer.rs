use std::collections::{BTreeSet, HashMap};
use std::fmt;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::Path;
use std::time::Instant;

use crate::drivers::DatabaseConnection;
use crate::error::AppError;
use crate::models::{
    CellValue, ExportOptions, ExportResult, ImportErrorPolicy, ImportMode, ImportOptions,
    ImportPreview, ImportResult, JsonStructure, QueryResult, TransferFormat, TransferProgress,
};
use crate::services::transfer_checkpoint::{
    load_checkpoint, remove_checkpoint, save_checkpoint, ImportCheckpoint, RejectsWriter,
};
use crate::services::transfer_compression::{
    detect_compression, open_decompressed_reader, strip_compression_ext, AsyncCompressedFileWriter,
};
pub use crate::services::transfer_registry::{
    cancel_transfer_job, is_transfer_cancelled, register_cancellation_token, register_transfer_job,
    remove_cancellation_token, trigger_cancellation, TransferJob,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValueError {
    pub column: Option<String>,
    pub value: String,
    pub expected_type: String,
    pub reason: String,
}

impl fmt::Display for ValueError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let Some(ref col) = self.column {
            write!(
                f,
                "Column '{}' expected {}: {} (value: '{}')",
                col, self.expected_type, self.reason, self.value
            )
        } else {
            write!(
                f,
                "Expected {}: {} (value: '{}')",
                self.expected_type, self.reason, self.value
            )
        }
    }
}

impl std::error::Error for ValueError {}

impl From<ValueError> for AppError {
    fn from(err: ValueError) -> Self {
        AppError::InvalidInput(err.to_string())
    }
}

/// Detects the most likely CSV delimiter (',', ';', '\t') from a sample text.
pub fn detect_csv_delimiter(sample: &str) -> char {
    let delimiters = [',', ';', '\t'];
    let mut scores: HashMap<char, usize> = HashMap::new();

    for delim in &delimiters {
        scores.insert(*delim, 0);
    }

    for line in sample.lines().take(10) {
        if line.trim().is_empty() {
            continue;
        }
        for delim in &delimiters {
            let count = line.chars().filter(|c| c == delim).count();
            if count > 0 {
                *scores.entry(*delim).or_insert(0) += count;
            }
        }
    }

    let mut best_delim = ',';
    let mut max_count = 0;

    for delim in &delimiters {
        let count = scores.get(delim).copied().unwrap_or(0);
        if count > max_count {
            max_count = count;
            best_delim = *delim;
        }
    }

    best_delim
}

/// Parses preview rows and headers from a CSV reader.
pub fn parse_csv_preview<R: Read>(mut reader: R, delimiter: Option<char>) -> Result<ImportPreview, AppError> {
    let mut initial_buf = Vec::new();
    let mut chunk = [0u8; 4096];
    let n = reader.read(&mut chunk).map_err(|e| AppError::Other(e.to_string()))?;
    initial_buf.extend_from_slice(&chunk[..n]);

    let detected_delim = match delimiter {
        Some(d) => d,
        None => {
            let sample = String::from_utf8_lossy(&initial_buf);
            detect_csv_delimiter(&sample)
        }
    };

    let full_reader = std::io::Cursor::new(initial_buf).chain(reader);
    let mut csv_reader = csv::ReaderBuilder::new()
        .delimiter(detected_delim as u8)
        .has_headers(false)
        .flexible(true)
        .from_reader(full_reader);

    let mut records = Vec::new();
    for result in csv_reader.records() {
        match result {
            Ok(record) => {
                let row: Vec<String> = record.iter().map(|s| s.trim().to_string()).collect();
                records.push(row);
                if records.len() >= 6 {
                    break;
                }
            }
            Err(e) => return Err(AppError::Other(format!("Failed to parse CSV: {}", e))),
        }
    }

    if records.is_empty() {
        return Ok(ImportPreview {
            detected_delimiter: detected_delim,
            headers: Vec::new(),
            preview_rows: Vec::new(),
            total_preview_rows: 0,
        });
    }

    let headers = records[0].clone();
    let preview_rows: Vec<Vec<String>> = records.into_iter().skip(1).take(5).collect();
    let total_preview = preview_rows.len();

    Ok(ImportPreview {
        detected_delimiter: detected_delim,
        headers,
        preview_rows,
        total_preview_rows: total_preview,
    })
}

/// Parses preview rows and headers from a JSON or NDJSON reader.
pub fn parse_json_preview<R: Read>(reader: R) -> Result<ImportPreview, AppError> {
    let mut buf_reader = BufReader::new(reader);
    let mut first_bytes = [0u8; 1];
    let n = buf_reader.read(&mut first_bytes).map_err(|e| AppError::Other(e.to_string()))?;
    if n == 0 {
        return Ok(ImportPreview {
            detected_delimiter: ',',
            headers: Vec::new(),
            preview_rows: Vec::new(),
            total_preview_rows: 0,
        });
    }

    let is_array = first_bytes[0] == b'[';
    let full_reader = std::io::Cursor::new(first_bytes).chain(buf_reader);

    let mut parsed_objects: Vec<serde_json::Map<String, serde_json::Value>> = Vec::new();

    if is_array {
        let val: serde_json::Value = serde_json::from_reader(full_reader)
            .map_err(|e| AppError::Other(format!("Invalid JSON array: {}", e)))?;
        if let serde_json::Value::Array(items) = val {
            for item in items.into_iter().take(5) {
                if let serde_json::Value::Object(map) = item {
                    parsed_objects.push(map);
                }
            }
        }
    } else {
        // Assume NDJSON (line by line)
        let reader = BufReader::new(full_reader);
        for line in reader.lines().take(5) {
            let l = line.map_err(|e| AppError::Other(e.to_string()))?;
            let trimmed = l.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Ok(serde_json::Value::Object(map)) = serde_json::from_str(trimmed) {
                parsed_objects.push(map);
            }
        }
    }

    if parsed_objects.is_empty() {
        return Ok(ImportPreview {
            detected_delimiter: ',',
            headers: Vec::new(),
            preview_rows: Vec::new(),
            total_preview_rows: 0,
        });
    }

    // Collect all unique keys for headers in deterministic order
    let mut header_set = BTreeSet::new();
    for obj in &parsed_objects {
        for k in obj.keys() {
            header_set.insert(k.clone());
        }
    }
    let headers: Vec<String> = header_set.into_iter().collect();

    let mut preview_rows = Vec::new();
    for obj in &parsed_objects {
        let mut row = Vec::new();
        for h in &headers {
            let val_str = match obj.get(h) {
                Some(serde_json::Value::Null) | None => String::new(),
                Some(serde_json::Value::String(s)) => s.clone(),
                Some(v) => v.to_string(),
            };
            row.push(val_str);
        }
        preview_rows.push(row);
    }

    let total_preview = preview_rows.len();

    Ok(ImportPreview {
        detected_delimiter: ',',
        headers,
        preview_rows,
        total_preview_rows: total_preview,
    })
}

/// Previews an import file (CSV or JSON, optionally gzip/zstd compressed) from disk.
pub fn preview_import_file_impl(file_path: &str, delimiter: Option<char>) -> Result<ImportPreview, AppError> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Err(AppError::NotFound(format!("File '{}' not found", file_path)));
    }

    let reader = open_decompressed_reader(file_path)?;
    let inner_path = Path::new(strip_compression_ext(file_path));
    let ext = inner_path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    if ext == "json" || ext == "ndjson" || ext == "jsonl" {
        parse_json_preview(reader)
    } else {
        parse_csv_preview(reader, delimiter)
    }
}

/// Exports query results directly into a writer (CSV or JSON format).
pub fn export_query_result_to_writer<W: Write>(
    result: &QueryResult,
    writer: &mut W,
    options: &ExportOptions,
) -> Result<(usize, u64), AppError> {
    let mut counting_writer = CountingWriter::new(writer);

    let check_cancel = || -> Result<(), AppError> {
        if let Some(ref jid) = options.job_id {
            if is_transfer_cancelled(jid) {
                return Err(AppError::Cancelled("Export cancelled by user".to_string()));
            }
        }
        Ok(())
    };

    match options.format {
        TransferFormat::Csv => {
            let delim = options.delimiter.unwrap_or(',');
            let mut csv_writer = csv::WriterBuilder::new()
                .delimiter(delim as u8)
                .from_writer(&mut counting_writer);

            if options.include_headers {
                let headers: Vec<&str> = result.columns.iter().map(|c| c.name.as_str()).collect();
                csv_writer
                    .write_record(&headers)
                    .map_err(|e| AppError::Other(format!("CSV write header error: {}", e)))?;
            }

            for (idx, row) in result.rows.iter().enumerate() {
                if idx % 100 == 0 {
                    check_cancel()?;
                }
                let record: Vec<String> = row
                    .iter()
                    .map(|cell| match cell {
                        CellValue::Null => String::new(),
                        CellValue::Text(s) => s.clone(),
                        CellValue::Integer(i) => i.to_string(),
                        CellValue::Float(f) => f.to_string(),
                        CellValue::Boolean(b) => b.to_string(),
                        CellValue::Json(v) => v.to_string(),
                        CellValue::Bytes(b) => b.clone(),
                    })
                    .collect();

                csv_writer
                    .write_record(&record)
                    .map_err(|e| AppError::Other(format!("CSV write row error: {}", e)))?;
            }

            csv_writer
                .flush()
                .map_err(|e| AppError::Other(format!("CSV flush error: {}", e)))?;
        }
        TransferFormat::Json => {
            let is_ndjson = matches!(options.json_structure, Some(JsonStructure::Ndjson));
            let col_names: Vec<&str> = result.columns.iter().map(|c| c.name.as_str()).collect();

            if is_ndjson {
                for (idx, row) in result.rows.iter().enumerate() {
                    if idx % 100 == 0 {
                        check_cancel()?;
                    }
                    let map = row_to_json_map(&col_names, row);
                    let line = serde_json::to_string(&map)
                        .map_err(|e| AppError::Other(format!("JSON serialization error: {}", e)))?;
                    writeln!(counting_writer, "{}", line)
                        .map_err(|e| AppError::Other(format!("JSON write error: {}", e)))?;
                }
            } else {
                writeln!(counting_writer, "[")
                    .map_err(|e| AppError::Other(format!("JSON write error: {}", e)))?;

                for (idx, row) in result.rows.iter().enumerate() {
                    if idx % 100 == 0 {
                        check_cancel()?;
                    }
                    let map = row_to_json_map(&col_names, row);
                    let json_str = serde_json::to_string_pretty(&map)
                        .map_err(|e| AppError::Other(format!("JSON serialization error: {}", e)))?;

                    // Indent the object
                    let indented = json_str
                        .lines()
                        .map(|l| format!("  {}", l))
                        .collect::<Vec<_>>()
                        .join("\n");

                    if idx + 1 < result.rows.len() {
                        writeln!(counting_writer, "{},", indented)
                            .map_err(|e| AppError::Other(format!("JSON write error: {}", e)))?;
                    } else {
                        writeln!(counting_writer, "{}", indented)
                            .map_err(|e| AppError::Other(format!("JSON write error: {}", e)))?;
                    }
                }

                writeln!(counting_writer, "]")
                    .map_err(|e| AppError::Other(format!("JSON write error: {}", e)))?;
            }
            counting_writer
                .flush()
                .map_err(|e| AppError::Other(format!("Flush error: {}", e)))?;
        }
    }

    check_cancel()?;
    let bytes_written = counting_writer.bytes_written;
    Ok((result.rows.len(), bytes_written))
}

fn row_to_json_map(col_names: &[&str], row: &[CellValue]) -> serde_json::Map<String, serde_json::Value> {
    let mut map = serde_json::Map::new();
    for (i, cell) in row.iter().enumerate() {
        let key = col_names.get(i).copied().unwrap_or("unknown").to_string();
        let value = match cell {
            CellValue::Null => serde_json::Value::Null,
            CellValue::Text(s) => serde_json::Value::String(s.clone()),
            CellValue::Integer(n) => serde_json::Value::Number((*n).into()),
            CellValue::Float(f) => serde_json::Number::from_f64(*f)
                .map(serde_json::Value::Number)
                .unwrap_or(serde_json::Value::Null),
            CellValue::Boolean(b) => serde_json::Value::Bool(*b),
            CellValue::Json(v) => v.clone(),
            CellValue::Bytes(b) => serde_json::Value::String(b.clone()),
        };
        map.insert(key, value);
    }
    map
}

/// Helper wrapper that counts bytes written.
struct CountingWriter<W: Write> {
    inner: W,
    bytes_written: u64,
}

impl<W: Write> CountingWriter<W> {
    fn new(inner: W) -> Self {
        Self {
            inner,
            bytes_written: 0,
        }
    }
}

impl<W: Write> Write for CountingWriter<W> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let n = self.inner.write(buf)?;
        self.bytes_written += n as u64;
        Ok(n)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.inner.flush()
    }
}

/// Escapes string literals for SQL according to database dialect.
/// Replaces single quotes with double single quotes, and for MySQL additionally escapes backslashes.
pub fn escape_sql_string(val: &str, dialect: &str) -> String {
    let escaped_quotes = val.replace('\'', "''");
    if dialect.to_lowercase().contains("mysql") {
        escaped_quotes.replace('\\', "\\\\")
    } else {
        escaped_quotes
    }
}

/// Quotes an SQL identifier depending on database dialect.
pub fn quote_identifier(ident: &str, dialect: &str) -> String {
    let lower_dialect = dialect.to_lowercase();
    if lower_dialect.contains("mysql") {
        format!("`{}`", ident.replace('`', "``"))
    } else {
        format!("\"{}\"", ident.replace('"', "\"\""))
    }
}

/// Quotes a table name which might contain a schema (e.g. "public"."users" or "users").
pub fn quote_table_name(table_name: &str, dialect: &str) -> String {
    let parts: Vec<&str> = table_name.split('.').collect();
    if parts.len() == 2 {
        format!(
            "{}.{}",
            quote_identifier(parts[0], dialect),
            quote_identifier(parts[1], dialect)
        )
    } else {
        quote_identifier(table_name, dialect)
    }
}

/// Formats a raw string cell value into valid SQL literal.
pub fn format_sql_literal(val: &str, dialect: &str) -> String {
    format_sql_literal_with_options(val, None, false, dialect)
        .expect("untyped SQL literal formatting is infallible")
}

/// Formats a raw string cell value into valid SQL literal respecting target type and empty string policy.
/// Returns `Err(ValueError)` if `target_type` is numeric or boolean and the value cannot be parsed,
/// preventing silent NULL conversions.
pub fn format_sql_literal_with_options(
    val: &str,
    target_type: Option<&str>,
    empty_as_null: bool,
    dialect: &str,
) -> Result<String, ValueError> {
    let trimmed = val.trim();
    let is_sqlite = dialect.to_lowercase().contains("sqlite");

    if let Some(data_type) = target_type {
        let dt = data_type.to_lowercase();
        if dt.contains("char") || dt.contains("text") || dt.contains("clob") || dt.contains("string") {
            if val.is_empty() {
                return Ok(if empty_as_null { "NULL".to_string() } else { "''".to_string() });
            }
            if trimmed.eq_ignore_ascii_case("null") {
                return Ok("NULL".to_string());
            }
            return Ok(format!("'{}'", escape_sql_string(val, dialect)));
        }
        if dt.contains("int") || dt.contains("serial") {
            if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("null") {
                return Ok("NULL".to_string());
            }
            if let Ok(i) = trimmed.parse::<i64>() {
                return Ok(i.to_string());
            }
            return Err(ValueError {
                column: None,
                value: val.to_string(),
                expected_type: data_type.to_string(),
                reason: "invalid integer value".to_string(),
            });
        }
        if dt.contains("float") || dt.contains("double") || dt.contains("real") || dt.contains("numeric") || dt.contains("decimal") {
            if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("null") {
                return Ok("NULL".to_string());
            }
            if let Ok(f) = trimmed.parse::<f64>() {
                if f.is_finite() {
                    return Ok(f.to_string());
                }
            }
            return Err(ValueError {
                column: None,
                value: val.to_string(),
                expected_type: data_type.to_string(),
                reason: "invalid floating-point/numeric value".to_string(),
            });
        }
        if dt.contains("bool") {
            if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("null") {
                return Ok("NULL".to_string());
            }
            if trimmed.eq_ignore_ascii_case("true") || trimmed == "1" {
                return Ok(if is_sqlite { "1".to_string() } else { "TRUE".to_string() });
            }
            if trimmed.eq_ignore_ascii_case("false") || trimmed == "0" {
                return Ok(if is_sqlite { "0".to_string() } else { "FALSE".to_string() });
            }
            return Err(ValueError {
                column: None,
                value: val.to_string(),
                expected_type: data_type.to_string(),
                reason: "invalid boolean value".to_string(),
            });
        }
    }

    if val.is_empty() {
        return Ok(if empty_as_null { "NULL".to_string() } else { "''".to_string() });
    }
    if trimmed.eq_ignore_ascii_case("null") || trimmed == "\\N" {
        return Ok("NULL".to_string());
    }

    if trimmed.eq_ignore_ascii_case("true") {
        return Ok(if is_sqlite { "1".to_string() } else { "TRUE".to_string() });
    }
    if trimmed.eq_ignore_ascii_case("false") {
        return Ok(if is_sqlite { "0".to_string() } else { "FALSE".to_string() });
    }

    // Do NOT coerce numbers with leading zeroes (e.g. "0123", "007") or leading "-0" into integers!
    let has_leading_zero = (trimmed.starts_with('0') && trimmed.len() > 1 && !trimmed.starts_with("0."))
        || (trimmed.starts_with("-0") && trimmed.len() > 2 && !trimmed.starts_with("-0."));

    if !has_leading_zero {
        // Try parsing as integer
        if let Ok(i) = trimmed.parse::<i64>() {
            return Ok(i.to_string());
        }

        // Try parsing as float if it contains decimal point or exponent
        if trimmed.contains('.') || trimmed.contains('e') || trimmed.contains('E') {
            if let Ok(f) = trimmed.parse::<f64>() {
                if f.is_finite() {
                    return Ok(f.to_string());
                }
            }
        }
    }

    // Escape single quotes (and backslashes for MySQL) for string literal
    Ok(format!("'{}'", escape_sql_string(val, dialect)))
}

/// Formats a CellValue into a valid SQL literal without type coercion.
pub fn cell_value_to_sql_literal(val: &CellValue, dialect: &str) -> String {
    let is_sqlite = dialect.to_lowercase().contains("sqlite");
    match val {
        CellValue::Null => "NULL".to_string(),
        CellValue::Integer(i) => i.to_string(),
        CellValue::Float(f) => {
            if f.is_finite() {
                f.to_string()
            } else {
                "NULL".to_string()
            }
        }
        CellValue::Boolean(b) => {
            if is_sqlite {
                if *b { "1".to_string() } else { "0".to_string() }
            } else {
                if *b { "TRUE".to_string() } else { "FALSE".to_string() }
            }
        }
        CellValue::Text(s) => format!("'{}'", escape_sql_string(s, dialect)),
        CellValue::Json(j) => format!("'{}'", escape_sql_string(&j.to_string(), dialect)),
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

/// Generates a batch INSERT SQL statement for given CellValue rows.
pub fn generate_batch_insert_cells_sql(
    table: &str,
    target_columns: &[String],
    rows: &[Vec<CellValue>],
    dialect: &str,
) -> String {
    let quoted_table = quote_table_name(table, dialect);
    let quoted_cols: Vec<String> = target_columns
        .iter()
        .map(|c| quote_identifier(c, dialect))
        .collect();

    let mut value_tuples = Vec::with_capacity(rows.len());

    for row in rows {
        let formatted_vals: Vec<String> = row
            .iter()
            .map(|val| cell_value_to_sql_literal(val, dialect))
            .collect();
        value_tuples.push(format!("({})", formatted_vals.join(", ")));
    }

    format!(
        "INSERT INTO {} ({}) VALUES\n{};",
        quoted_table,
        quoted_cols.join(", "),
        value_tuples.join(",\n")
    )
}

/// Generates a batch INSERT SQL statement for given rows with column types and empty-string policy.
pub fn generate_batch_insert_sql_with_options(
    table: &str,
    target_columns: &[String],
    target_types: &[Option<String>],
    rows: &[Vec<String>],
    treat_empty_as_null: bool,
    dialect: &str,
) -> Result<String, ValueError> {
    let quoted_table = quote_table_name(table, dialect);
    let quoted_cols: Vec<String> = target_columns
        .iter()
        .map(|c| quote_identifier(c, dialect))
        .collect();

    let mut value_tuples = Vec::with_capacity(rows.len());

    for row in rows {
        let mut formatted_vals = Vec::with_capacity(row.len());
        for (i, val) in row.iter().enumerate() {
            let target_type = target_types.get(i).and_then(|opt| opt.as_deref());
            match format_sql_literal_with_options(val, target_type, treat_empty_as_null, dialect) {
                Ok(lit) => formatted_vals.push(lit),
                Err(mut err) => {
                    err.column = target_columns.get(i).cloned();
                    return Err(err);
                }
            }
        }
        value_tuples.push(format!("({})", formatted_vals.join(", ")));
    }

    Ok(format!(
        "INSERT INTO {} ({}) VALUES\n{};",
        quoted_table,
        quoted_cols.join(", "),
        value_tuples.join(",\n")
    ))
}

/// Generates a batch INSERT SQL statement for given rows.
pub fn generate_batch_insert_sql(
    table: &str,
    target_columns: &[String],
    rows: &[Vec<String>],
    dialect: &str,
) -> String {
    generate_batch_insert_sql_with_options(table, target_columns, &[], rows, true, dialect)
        .expect("untyped batch insert SQL generation is infallible")
}

/// Checks whether a SQL query already contains a top-level LIMIT clause or cannot be wrapped.
fn is_paginatable_select(sql: &str) -> bool {
    let trimmed = sql.trim().trim_end_matches(';').trim();
    let upper = trimmed.to_uppercase();
    if !upper.starts_with("SELECT ") {
        return false;
    }
    if upper.contains(" LIMIT ") {
        return false;
    }
    true
}

/// Streams and executes export to a local file in paginated chunks without loading the entire dataset into RAM.
pub async fn export_data_impl(
    conn: &dyn DatabaseConnection,
    sql: &str,
    file_path: &str,
    options: &ExportOptions,
) -> Result<ExportResult, AppError> {
    export_data_with_progress_impl(conn, sql, file_path, options, None::<fn(TransferProgress)>).await
}

/// Streams and executes export to a local file with optional progress reporting,
/// async on-the-fly gzip/zstd compression, optional PostgreSQL native COPY,
/// and partial file cleanup on cancellation or error.
pub async fn export_data_with_progress_impl<F>(
    conn: &dyn DatabaseConnection,
    sql: &str,
    file_path: &str,
    options: &ExportOptions,
    on_progress: Option<F>,
) -> Result<ExportResult, AppError>
where
    F: Fn(TransferProgress) + Send + Sync,
{
    let check_cancel = || -> Result<(), AppError> {
        if let Some(ref jid) = options.job_id {
            if is_transfer_cancelled(jid) {
                return Err(AppError::Cancelled("Export cancelled by user".to_string()));
            }
        }
        Ok(())
    };

    check_cancel()?;
    let start_time = Instant::now();
    let compression = detect_compression(file_path);
    let mut writer = AsyncCompressedFileWriter::create(file_path, compression)?;

    let res = export_data_inner(conn, sql, options, &mut writer, &start_time, &on_progress, &check_cancel).await;

    match res {
        Ok(total_rows) => {
            let file_size_bytes = match writer.finish().await {
                Ok(b) => b,
                Err(e) => {
                    let _ = std::fs::remove_file(file_path);
                    if let Some(ref jid) = options.job_id {
                        remove_cancellation_token(jid);
                    }
                    return Err(e);
                }
            };
            let elapsed_ms = start_time.elapsed().as_millis() as u64;
            if let Some(ref cb) = on_progress {
                cb(TransferProgress {
                    current_row: total_rows,
                    total_rows: Some(total_rows),
                    status: "done".to_string(),
                    job_id: options.job_id.clone(),
                    rows_processed: Some(total_rows),
                    bytes_written: Some(file_size_bytes),
                    elapsed_ms: Some(elapsed_ms),
                });
            }
            if let Some(ref jid) = options.job_id {
                remove_cancellation_token(jid);
            }
            Ok(ExportResult {
                total_rows,
                file_size_bytes,
                elapsed_ms,
            })
        }
        Err(e) => {
            writer.abort().await;
            let _ = std::fs::remove_file(file_path);
            if let Some(ref jid) = options.job_id {
                remove_cancellation_token(jid);
            }
            Err(e)
        }
    }
}

async fn export_data_inner<F, C>(
    conn: &dyn DatabaseConnection,
    sql: &str,
    options: &ExportOptions,
    writer: &mut AsyncCompressedFileWriter,
    start_time: &Instant,
    on_progress: &Option<F>,
    check_cancel: &C,
) -> Result<usize, AppError>
where
    F: Fn(TransferProgress) + Send + Sync,
    C: Fn() -> Result<(), AppError>,
{
    let clean_sql = sql.trim().trim_end_matches(';').trim();
    let delim = options.delimiter.unwrap_or(',');

    // Fast path: PostgreSQL native COPY TO STDOUT when requested and format is CSV.
    if options.use_native_copy == Some(true) && options.format == TransferFormat::Csv {
        let (tx, mut rx) = tokio::sync::mpsc::channel::<Vec<u8>>(16);
        let copy_fut = conn.copy_out_csv(clean_sql, options.include_headers, delim, tx);
        let write_fut = async {
            let mut newline_count: usize = 0;
            while let Some(chunk) = rx.recv().await {
                check_cancel()?;
                newline_count += chunk.iter().filter(|&&b| b == b'\n').count();
                writer.write_all(&chunk).await?;
                let rows_so_far = if options.include_headers {
                    newline_count.saturating_sub(1)
                } else {
                    newline_count
                };
                if let Some(ref cb) = on_progress {
                    cb(TransferProgress {
                        current_row: rows_so_far,
                        total_rows: None,
                        status: "exporting".to_string(),
                        job_id: options.job_id.clone(),
                        rows_processed: Some(rows_so_far),
                        bytes_written: Some(writer.bytes_written_so_far()),
                        elapsed_ms: Some(start_time.elapsed().as_millis() as u64),
                    });
                }
            }
            Ok::<usize, AppError>(if options.include_headers {
                newline_count.saturating_sub(1)
            } else {
                newline_count
            })
        };

        let (copy_res, write_res) = tokio::join!(copy_fut, write_fut);
        match copy_res {
            Ok(()) => return write_res,
            Err(AppError::NotSupported(_)) => {
                // Fall back to standard query export below
            }
            Err(e) => return Err(e),
        }
    }

    let can_paginate = is_paginatable_select(clean_sql);
    let chunk_size: usize = 1000;
    let mut offset: usize = 0;
    let mut total_rows: usize = 0;

    match options.format {
        TransferFormat::Csv => {
            let mut headers_written = false;

            loop {
                check_cancel()?;
                let page_sql = if can_paginate {
                    format!("{} LIMIT {} OFFSET {};", clean_sql, chunk_size, offset)
                } else {
                    format!("{};", clean_sql)
                };

                let query_res = conn.execute_query(&page_sql).await?;
                check_cancel()?;

                let mut buf = Vec::with_capacity(64 * 1024);
                {
                    let mut csv_writer = csv::WriterBuilder::new()
                        .delimiter(delim as u8)
                        .from_writer(&mut buf);

                    if !headers_written && options.include_headers && !query_res.columns.is_empty() {
                        let headers: Vec<&str> =
                            query_res.columns.iter().map(|c| c.name.as_str()).collect();
                        csv_writer
                            .write_record(&headers)
                            .map_err(|e| AppError::Other(format!("CSV write header error: {}", e)))?;
                        headers_written = true;
                    }

                    for (idx, row) in query_res.rows.iter().enumerate() {
                        if idx % 100 == 0 {
                            check_cancel()?;
                        }
                        let record: Vec<String> = row
                            .iter()
                            .map(|cell| match cell {
                                CellValue::Null => String::new(),
                                CellValue::Text(s) => s.clone(),
                                CellValue::Integer(i) => i.to_string(),
                                CellValue::Float(f) => f.to_string(),
                                CellValue::Boolean(b) => b.to_string(),
                                CellValue::Json(v) => v.to_string(),
                                CellValue::Bytes(b) => b.clone(),
                            })
                            .collect();
                        csv_writer
                            .write_record(&record)
                            .map_err(|e| AppError::Other(format!("CSV write row error: {}", e)))?;
                    }
                    csv_writer
                        .flush()
                        .map_err(|e| AppError::Other(format!("CSV flush error: {}", e)))?;
                }
                writer.write_all(&buf).await?;

                let fetched_count = query_res.rows.len();
                total_rows += fetched_count;
                if let Some(ref cb) = on_progress {
                    cb(TransferProgress {
                        current_row: total_rows,
                        total_rows: None,
                        status: "exporting".to_string(),
                        job_id: options.job_id.clone(),
                        rows_processed: Some(total_rows),
                        bytes_written: Some(writer.bytes_written_so_far()),
                        elapsed_ms: Some(start_time.elapsed().as_millis() as u64),
                    });
                }

                if !can_paginate || fetched_count < chunk_size {
                    break;
                }
                offset += fetched_count;
            }
        }
        TransferFormat::Json => {
            let is_ndjson = matches!(options.json_structure, Some(JsonStructure::Ndjson));
            if !is_ndjson {
                writer.write_all(b"[\n").await?;
            }

            let mut first_item = true;
            let mut cached_col_names: Vec<String> = Vec::new();

            loop {
                check_cancel()?;
                let page_sql = if can_paginate {
                    format!("{} LIMIT {} OFFSET {};", clean_sql, chunk_size, offset)
                } else {
                    format!("{};", clean_sql)
                };

                let query_res = conn.execute_query(&page_sql).await?;
                check_cancel()?;

                if cached_col_names.is_empty() && !query_res.columns.is_empty() {
                    cached_col_names = query_res.columns.iter().map(|c| c.name.clone()).collect();
                }
                let col_refs: Vec<&str> = cached_col_names.iter().map(|s| s.as_str()).collect();

                let mut buf = Vec::with_capacity(64 * 1024);
                let fetched_count = query_res.rows.len();
                for (idx, row) in query_res.rows.iter().enumerate() {
                    if idx % 100 == 0 {
                        check_cancel()?;
                    }
                    let map = row_to_json_map(&col_refs, row);
                    if is_ndjson {
                        let line = serde_json::to_string(&map)
                            .map_err(|e| AppError::Other(format!("JSON serialization error: {}", e)))?;
                        writeln!(buf, "{}", line)
                            .map_err(|e| AppError::Other(format!("JSON write error: {}", e)))?;
                    } else {
                        if !first_item {
                            writeln!(buf, ",")
                                .map_err(|e| AppError::Other(format!("JSON write error: {}", e)))?;
                        }
                        first_item = false;
                        let json_str = serde_json::to_string_pretty(&map)
                            .map_err(|e| AppError::Other(format!("JSON serialization error: {}", e)))?;
                        let indented = json_str
                            .lines()
                            .map(|l| format!("  {}", l))
                            .collect::<Vec<_>>()
                            .join("\n");
                        write!(buf, "{}", indented)
                            .map_err(|e| AppError::Other(format!("JSON write error: {}", e)))?;
                    }
                }
                writer.write_all(&buf).await?;

                total_rows += fetched_count;
                if let Some(ref cb) = on_progress {
                    cb(TransferProgress {
                        current_row: total_rows,
                        total_rows: None,
                        status: "exporting".to_string(),
                        job_id: options.job_id.clone(),
                        rows_processed: Some(total_rows),
                        bytes_written: Some(writer.bytes_written_so_far()),
                        elapsed_ms: Some(start_time.elapsed().as_millis() as u64),
                    });
                }

                if !can_paginate || fetched_count < chunk_size {
                    break;
                }
                offset += fetched_count;
            }

            if !is_ndjson {
                if !first_item {
                    writer.write_all(b"\n").await?;
                }
                writer.write_all(b"]\n").await?;
            }
        }
    }

    Ok(total_rows)
}

/// Validates a batch of `(row_number, row)` client-side before SQL generation.
/// - In `Abort` mode, returns `Err` on the first invalid cell with row number and column name.
/// - In `Skip` mode, logs invalid rows to `rejects` and returns only valid rows.
fn validate_and_filter_chunk(
    target_columns: &[String],
    target_types: &[Option<String>],
    chunk: &[(usize, Vec<String>)],
    treat_empty_as_null: bool,
    dialect: &str,
    error_policy: ImportErrorPolicy,
    rejects: &mut RejectsWriter,
) -> Result<(Vec<(usize, Vec<String>)>, usize), AppError> {
    let mut valid = Vec::with_capacity(chunk.len());
    let mut skipped = 0usize;

    for (row_num, row) in chunk {
        let mut row_err: Option<ValueError> = None;
        for (i, val) in row.iter().enumerate() {
            let target_type = target_types.get(i).and_then(|opt| opt.as_deref());
            if let Err(mut err) =
                format_sql_literal_with_options(val, target_type, treat_empty_as_null, dialect)
            {
                err.column = target_columns.get(i).cloned();
                row_err = Some(err);
                break;
            }
        }

        if let Some(err) = row_err {
            if error_policy == ImportErrorPolicy::Abort {
                return Err(AppError::InvalidInput(format!(
                    "Row {}: {}",
                    row_num, err
                )));
            } else {
                rejects.write_reject(*row_num, &err.to_string(), row)?;
                skipped += 1;
            }
        } else {
            valid.push((*row_num, row.clone()));
        }
    }

    Ok((valid, skipped))
}

/// Binary-bisect batch inserter for `Skip` mode: when a batch fails on the DB server,
/// splits the batch in half recursively to isolate only the failing rows instead of
/// falling back to row-by-row inserts for the entire batch.
#[allow(clippy::too_many_arguments)]
fn bisect_insert_rows<'a>(
    conn: &'a dyn DatabaseConnection,
    table: &'a str,
    target_columns: &'a [String],
    target_types: &'a [Option<String>],
    rows: &'a [(usize, Vec<String>)],
    treat_empty_as_null: bool,
    dialect: &'a str,
    rejects: &'a mut RejectsWriter,
) -> futures::future::BoxFuture<'a, Result<(usize, usize), AppError>> {
    Box::pin(async move {
        if rows.is_empty() {
            return Ok((0, 0));
        }

        let raw_rows: Vec<Vec<String>> = rows.iter().map(|(_, r)| r.clone()).collect();
        let batch_sql = generate_batch_insert_sql_with_options(
            table,
            target_columns,
            target_types,
            &raw_rows,
            treat_empty_as_null,
            dialect,
        )
        .map_err(AppError::from)?;

        match conn.execute_query(&batch_sql).await {
            Ok(_) => Ok((rows.len(), 0)),
            Err(db_err) => {
                if rows.len() == 1 {
                    let (row_num, row) = &rows[0];
                    rejects.write_reject(*row_num, &db_err.to_string(), row)?;
                    Ok((0, 1))
                } else {
                    let mid = rows.len() / 2;
                    let (left_imp, left_skp) = bisect_insert_rows(
                        conn,
                        table,
                        target_columns,
                        target_types,
                        &rows[..mid],
                        treat_empty_as_null,
                        dialect,
                        rejects,
                    )
                    .await?;
                    let (right_imp, right_skp) = bisect_insert_rows(
                        conn,
                        table,
                        target_columns,
                        target_types,
                        &rows[mid..],
                        treat_empty_as_null,
                        dialect,
                        rejects,
                    )
                    .await?;
                    Ok((left_imp + right_imp, left_skp + right_skp))
                }
            }
        }
    })
}

#[allow(clippy::too_many_arguments)]
async fn execute_import_chunk(
    conn: &dyn DatabaseConnection,
    table: &str,
    target_columns: &[String],
    target_types: &[Option<String>],
    chunk: &[(usize, Vec<String>)],
    treat_empty_as_null: bool,
    dialect: &str,
    error_policy: ImportErrorPolicy,
    in_tx: bool,
    rejects: &mut RejectsWriter,
) -> Result<(usize, usize), AppError> {
    let (valid_rows, client_skipped) = match validate_and_filter_chunk(
        target_columns,
        target_types,
        chunk,
        treat_empty_as_null,
        dialect,
        error_policy,
        rejects,
    ) {
        Ok(res) => res,
        Err(e) => {
            if in_tx {
                let _ = conn.execute_query("ROLLBACK").await;
            }
            return Err(e);
        }
    };

    if valid_rows.is_empty() {
        return Ok((0, client_skipped));
    }

    let raw_rows: Vec<Vec<String>> = valid_rows.iter().map(|(_, r)| r.clone()).collect();
    let batch_sql = generate_batch_insert_sql_with_options(
        table,
        target_columns,
        target_types,
        &raw_rows,
        treat_empty_as_null,
        dialect,
    )
    .map_err(AppError::from)?;

    let exec_result = conn.execute_query(&batch_sql).await;

    match exec_result {
        Ok(_) => Ok((valid_rows.len(), client_skipped)),
        Err(e) => {
            if error_policy == ImportErrorPolicy::Abort {
                if in_tx {
                    let rollback_res = conn.execute_query("ROLLBACK").await;
                    let rollback_msg = match rollback_res {
                        Ok(_) => "Transaction rolled back successfully.".to_string(),
                        Err(rb_err) => format!("Rollback also failed: {}.", rb_err),
                    };
                    Err(AppError::Other(format!(
                        "Import failed during batch: {}. {}",
                        e, rollback_msg
                    )))
                } else {
                    Err(AppError::Other(format!("Import failed during batch: {}", e)))
                }
            } else {
                let (imp, db_skipped) = bisect_insert_rows(
                    conn,
                    table,
                    target_columns,
                    target_types,
                    &valid_rows,
                    treat_empty_as_null,
                    dialect,
                    rejects,
                )
                .await?;
                Ok((imp, client_skipped + db_skipped))
            }
        }
    }
}

/// Computes the driver-specific maximum batch size for multi-row INSERT statements.
pub fn clamp_import_batch_size(requested: Option<usize>, dialect: &str) -> usize {
    let max_batch = if dialect.to_lowercase().contains("mssql") {
        1000
    } else {
        2000
    };
    requested.unwrap_or(500).clamp(1, max_batch)
}

fn staging_table_name(dialect: &str) -> String {
    let id = uuid::Uuid::new_v4().simple().to_string();
    let short = &id[..12];
    if dialect.to_lowercase().contains("mssql") {
        format!("#datacore_staging_{}", short)
    } else {
        format!("__datacore_staging_{}", short)
    }
}

fn build_create_staging_sql(
    staging_table: &str,
    target_table: &str,
    target_columns: &[String],
    dialect: &str,
) -> String {
    let lower = dialect.to_lowercase();
    let quoted_target = quote_table_name(target_table, dialect);
    let quoted_cols = target_columns
        .iter()
        .map(|c| quote_identifier(c, dialect))
        .collect::<Vec<_>>()
        .join(", ");

    if lower.contains("mssql") {
        format!(
            "SELECT TOP 0 {} INTO {} FROM {};",
            quoted_cols,
            quote_identifier(staging_table, dialect),
            quoted_target
        )
    } else if lower.contains("mysql") {
        let quoted_staging = quote_identifier(staging_table, dialect);
        format!(
            "CREATE TEMPORARY TABLE {} AS SELECT {} FROM {} WHERE 1=0;",
            quoted_staging, quoted_cols, quoted_target
        )
    } else {
        let quoted_staging = quote_identifier(staging_table, dialect);
        format!(
            "CREATE TEMP TABLE {} AS SELECT {} FROM {} WHERE 1=0;",
            quoted_staging, quoted_cols, quoted_target
        )
    }
}

/// Streams and imports data from a CSV or JSON file (optionally gzip/zstd compressed)
/// into the database with support for Atomic, Chunked, and Staging modes,
/// checkpoint/resume, client-side type validation, rejects logging, and bisect skip.
pub async fn import_data_impl<F>(
    conn: &dyn DatabaseConnection,
    table: &str,
    options: &ImportOptions,
    dialect: &str,
    on_progress: Option<F>,
) -> Result<ImportResult, AppError>
where
    F: Fn(TransferProgress) + Send + Sync,
{
    let start_time = Instant::now();
    let path = Path::new(&options.file_path);
    if !path.exists() {
        return Err(AppError::NotFound(format!("Import file '{}' not found", options.file_path)));
    }

    let target_columns: Vec<String> = options
        .column_mappings
        .iter()
        .map(|m| m.target_column.clone())
        .collect();
    let target_types: Vec<Option<String>> = options
        .column_mappings
        .iter()
        .map(|m| m.target_type.clone())
        .collect();
    let treat_empty_as_null = options.treat_empty_as_null.unwrap_or(false);

    if target_columns.is_empty() {
        return Err(AppError::Other("No column mappings provided".to_string()));
    }

    let batch_size = clamp_import_batch_size(options.batch_size, dialect);
    let job_id = options.job_id.as_deref();

    let check_cancelled = |jid: Option<&str>| -> Result<(), AppError> {
        if let Some(id) = jid {
            if is_transfer_cancelled(id) {
                return Err(AppError::Cancelled("Import cancelled by user".to_string()));
            }
        }
        Ok(())
    };

    // Fast path: PostgreSQL native COPY IN when requested for CSV + Abort + non-Staging.
    if options.use_native_copy == Some(true)
        && options.format == TransferFormat::Csv
        && options.error_policy == ImportErrorPolicy::Abort
        && !matches!(options.import_mode, Some(ImportMode::Staging))
    {
        let delim = options.delimiter.unwrap_or(',');
        let (tx, rx) = tokio::sync::mpsc::channel::<Vec<u8>>(16);
        let file_path_owned = options.file_path.clone();
        let read_handle = tokio::task::spawn_blocking(move || -> Result<(), AppError> {
            let mut reader = open_decompressed_reader(&file_path_owned)?;
            let mut buf = vec![0u8; 64 * 1024];
            loop {
                let n = reader
                    .read(&mut buf)
                    .map_err(|e| AppError::Other(format!("Read error: {}", e)))?;
                if n == 0 {
                    break;
                }
                if tx.blocking_send(buf[..n].to_vec()).is_err() {
                    break;
                }
            }
            Ok(())
        });

        let copy_res = conn
            .copy_in_csv(table, &target_columns, options.has_headers, delim, rx)
            .await;
        match copy_res {
            Ok(rows_affected) => {
                let _ = read_handle.await;
                let imported = rows_affected as usize;
                let elapsed_ms = start_time.elapsed().as_millis() as u64;
                if let Some(ref progress_cb) = on_progress {
                    progress_cb(TransferProgress {
                        current_row: imported,
                        total_rows: Some(imported),
                        status: "done".to_string(),
                        job_id: options.job_id.clone(),
                        rows_processed: Some(imported),
                        bytes_written: None,
                        elapsed_ms: Some(elapsed_ms),
                    });
                }
                if let Some(ref jid) = options.job_id {
                    remove_cancellation_token(jid);
                }
                return Ok(ImportResult {
                    total_rows: imported,
                    imported_rows: imported,
                    skipped_rows: 0,
                    elapsed_ms,
                    rejects_file_path: None,
                });
            }
            Err(AppError::NotSupported(_)) => {
                read_handle.abort();
                // Fall back to standard import path
            }
            Err(e) => {
                read_handle.abort();
                if let Some(ref jid) = options.job_id {
                    remove_cancellation_token(jid);
                }
                return Err(e);
            }
        }
    }

    // Determine import mode: explicit or auto-select Chunked for >64 MB files.
    let mode = options.import_mode.unwrap_or_else(|| {
        let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        if size > 64 * 1024 * 1024 {
            ImportMode::Chunked
        } else {
            ImportMode::Atomic
        }
    });
    let chunk_commit_rows = options.chunk_commit_rows.unwrap_or(50_000).max(1);

    // Checkpoint / Resume handling
    let mut resume_skip_rows = 0usize;
    let mut imported_rows = 0usize;
    let mut skipped_rows = 0usize;
    if options.resume_from_checkpoint == Some(true) {
        if let Some(cp) = load_checkpoint(&options.file_path, table) {
            resume_skip_rows = cp.committed_rows;
            imported_rows = cp.imported_rows;
            skipped_rows = cp.skipped_rows;
        }
    }

    // Setup target table (or temporary staging table for Staging mode)
    let active_table = if mode == ImportMode::Staging {
        let st = staging_table_name(dialect);
        let create_sql = build_create_staging_sql(&st, table, &target_columns, dialect);
        conn.execute_query(&create_sql).await?;
        st
    } else {
        table.to_string()
    };

    let mut in_tx = false;
    if mode == ImportMode::Atomic && options.error_policy == ImportErrorPolicy::Abort {
        conn.execute_query("BEGIN")
            .await
            .map_err(|e| AppError::Other(format!("Failed to begin transaction: {}", e)))?;
        in_tx = true;
    } else if mode == ImportMode::Chunked {
        conn.execute_query("BEGIN")
            .await
            .map_err(|e| AppError::Other(format!("Failed to begin chunk transaction: {}", e)))?;
        in_tx = true;
    }

    let mut rejects = RejectsWriter::new(&options.file_path, target_columns.clone());

    // Offload file reading, decompression, and CSV/JSON parsing to blocking thread pool.
    let (batch_tx, mut batch_rx) =
        tokio::sync::mpsc::channel::<Result<Vec<(usize, Vec<String>)>, AppError>>(4);
    let options_clone = options.clone();
    let parse_handle = tokio::task::spawn_blocking(move || {
        let res = stream_parsed_batches(&options_clone, batch_size, resume_skip_rows, &batch_tx);
        if let Err(e) = res {
            let _ = batch_tx.blocking_send(Err(e));
        }
    });

    let mut rows_since_commit = 0usize;
    let mut total_seen_rows = resume_skip_rows;

    let mut loop_err: Option<AppError> = None;
    while let Some(batch_res) = batch_rx.recv().await {
        if let Err(err) = check_cancelled(job_id) {
            if in_tx {
                let _ = conn.execute_query("ROLLBACK").await;
            }
            loop_err = Some(err);
            break;
        }

        let batch = match batch_res {
            Ok(b) => b,
            Err(e) => {
                if in_tx {
                    let _ = conn.execute_query("ROLLBACK").await;
                }
                loop_err = Some(e);
                break;
            }
        };

        let batch_len = batch.len();
        match execute_import_chunk(
            conn,
            &active_table,
            &target_columns,
            &target_types,
            &batch,
            treat_empty_as_null,
            dialect,
            options.error_policy,
            in_tx,
            &mut rejects,
        )
        .await
        {
            Ok((imp, skp)) => {
                imported_rows += imp;
                skipped_rows += skp;
                total_seen_rows += batch_len;
                rows_since_commit += batch_len;
            }
            Err(e) => {
                loop_err = Some(e);
                break;
            }
        }

        if mode == ImportMode::Chunked && rows_since_commit >= chunk_commit_rows {
            if in_tx {
                conn.execute_query("COMMIT")
                    .await
                    .map_err(|e| AppError::Other(format!("Failed to commit chunk: {}", e)))?;
                let cp = ImportCheckpoint {
                    file_path: options.file_path.clone(),
                    table: table.to_string(),
                    committed_rows: total_seen_rows,
                    imported_rows,
                    skipped_rows,
                };
                save_checkpoint(&options.file_path, &cp)?;
                conn.execute_query("BEGIN")
                    .await
                    .map_err(|e| AppError::Other(format!("Failed to begin next chunk: {}", e)))?;
            }
            rows_since_commit = 0;
        }

        if let Some(ref progress_cb) = on_progress {
            let processed = imported_rows + skipped_rows;
            progress_cb(TransferProgress {
                current_row: processed,
                total_rows: None,
                status: "importing".to_string(),
                job_id: options.job_id.clone(),
                rows_processed: Some(processed),
                bytes_written: None,
                elapsed_ms: Some(start_time.elapsed().as_millis() as u64),
            });
        }
    }

    if let Some(err) = loop_err {
        parse_handle.abort();
        let _ = rejects.finish();
        if mode == ImportMode::Staging {
            let drop_sql = format!("DROP TABLE IF EXISTS {};", quote_identifier(&active_table, dialect));
            let _ = conn.execute_query(&drop_sql).await;
        }
        if let Some(ref jid) = options.job_id {
            remove_cancellation_token(jid);
        }
        return Err(err);
    }

    let _ = parse_handle.await;

    if in_tx {
        conn.execute_query("COMMIT")
            .await
            .map_err(|e| AppError::Other(format!("Failed to commit transaction: {}", e)))?;
    }

    // Move data from staging table into target table atomically, then drop staging table.
    if mode == ImportMode::Staging {
        let quoted_target = quote_table_name(table, dialect);
        let quoted_staging = quote_identifier(&active_table, dialect);
        let quoted_cols = target_columns
            .iter()
            .map(|c| quote_identifier(c, dialect))
            .collect::<Vec<_>>()
            .join(", ");

        conn.execute_query("BEGIN")
            .await
            .map_err(|e| AppError::Other(format!("Failed to begin staging swap tx: {}", e)))?;
        let move_sql = format!(
            "INSERT INTO {} ({}) SELECT {} FROM {};",
            quoted_target, quoted_cols, quoted_cols, quoted_staging
        );
        if let Err(e) = conn.execute_query(&move_sql).await {
            let _ = conn.execute_query("ROLLBACK").await;
            let _ = conn
                .execute_query(&format!("DROP TABLE IF EXISTS {};", quoted_staging))
                .await;
            if let Some(ref jid) = options.job_id {
                remove_cancellation_token(jid);
            }
            return Err(e);
        }
        conn.execute_query("COMMIT")
            .await
            .map_err(|e| AppError::Other(format!("Failed to commit staging swap tx: {}", e)))?;
        let _ = conn
            .execute_query(&format!("DROP TABLE IF EXISTS {};", quoted_staging))
            .await;
    }

    // Clean up checkpoint on successful completion
    remove_checkpoint(&options.file_path);

    let rejects_file_path = rejects.finish()?;
    let total_rows = imported_rows + skipped_rows;
    let elapsed_ms = start_time.elapsed().as_millis() as u64;

    if let Some(ref progress_cb) = on_progress {
        progress_cb(TransferProgress {
            current_row: total_rows,
            total_rows: Some(total_rows),
            status: "done".to_string(),
            job_id: options.job_id.clone(),
            rows_processed: Some(total_rows),
            bytes_written: None,
            elapsed_ms: Some(elapsed_ms),
        });
    }

    if let Some(ref jid) = options.job_id {
        remove_cancellation_token(jid);
    }

    Ok(ImportResult {
        total_rows,
        imported_rows,
        skipped_rows,
        elapsed_ms,
        rejects_file_path,
    })
}

fn stream_parsed_batches(
    options: &ImportOptions,
    batch_size: usize,
    skip_rows: usize,
    tx: &tokio::sync::mpsc::Sender<Result<Vec<(usize, Vec<String>)>, AppError>>,
) -> Result<(), AppError> {
    let reader = open_decompressed_reader(&options.file_path)?;
    let mut data_row_index = 0usize;

    if options.format == TransferFormat::Csv {
        let delim = options.delimiter.unwrap_or(',');
        let mut csv_reader = csv::ReaderBuilder::new()
            .delimiter(delim as u8)
            .has_headers(options.has_headers)
            .flexible(true)
            .from_reader(reader);

        let mut col_index_map: HashMap<String, usize> = HashMap::new();
        if options.has_headers {
            let headers = csv_reader
                .headers()
                .map_err(|e| AppError::Other(format!("Failed to read CSV headers: {}", e)))?;
            for (idx, name) in headers.iter().enumerate() {
                col_index_map.insert(name.trim().to_string(), idx);
            }
        }

        let mut current_chunk: Vec<(usize, Vec<String>)> = Vec::with_capacity(batch_size);
        for result in csv_reader.records() {
            let record = result.map_err(|e| AppError::Other(format!("CSV read error: {}", e)))?;
            data_row_index += 1;
            if data_row_index <= skip_rows {
                continue;
            }
            let mut row = Vec::with_capacity(options.column_mappings.len());
            for mapping in &options.column_mappings {
                let val = if options.has_headers {
                    col_index_map
                        .get(&mapping.source_column)
                        .and_then(|&idx| record.get(idx))
                        .unwrap_or("")
                } else {
                    mapping
                        .source_column
                        .parse::<usize>()
                        .ok()
                        .and_then(|idx| record.get(idx))
                        .unwrap_or("")
                };
                row.push(val.trim().to_string());
            }
            current_chunk.push((data_row_index, row));

            if current_chunk.len() >= batch_size {
                let send_batch = std::mem::replace(&mut current_chunk, Vec::with_capacity(batch_size));
                if tx.blocking_send(Ok(send_batch)).is_err() {
                    return Ok(());
                }
            }
        }
        if !current_chunk.is_empty() {
            let _ = tx.blocking_send(Ok(current_chunk));
        }
    } else {
        let mut buf_reader = BufReader::new(reader);
        let mut prefix_bytes = Vec::new();
        let mut first_non_ws = None;
        let mut byte_buf = [0u8; 1];

        while buf_reader.read_exact(&mut byte_buf).is_ok() {
            prefix_bytes.push(byte_buf[0]);
            if !byte_buf[0].is_ascii_whitespace() {
                first_non_ws = Some(byte_buf[0]);
                break;
            }
        }

        if let Some(first_char) = first_non_ws {
            let is_array = first_char == b'[';
            let full_reader = std::io::Cursor::new(prefix_bytes).chain(buf_reader);
            let mut current_chunk: Vec<(usize, Vec<String>)> = Vec::with_capacity(batch_size);

            if is_array {
                let mut stream_bytes = full_reader.bytes();

                fn get_next_non_ws<I: Iterator<Item = std::io::Result<u8>>>(iter: &mut I) -> Option<u8> {
                    while let Some(Ok(b)) = iter.next() {
                        if !b.is_ascii_whitespace() {
                            return Some(b);
                        }
                    }
                    None
                }

                let mut next_char = get_next_non_ws(&mut stream_bytes);
                if next_char == Some(b'[') {
                    next_char = get_next_non_ws(&mut stream_bytes);
                }

                while let Some(ch) = next_char {
                    if ch == b']' {
                        break;
                    }
                    if ch == b',' {
                        next_char = get_next_non_ws(&mut stream_bytes);
                        continue;
                    }

                    if ch == b'{' {
                        let mut obj_bytes = vec![b'{'];
                        let mut brace_depth = 1;
                        let mut in_string = false;
                        let mut escape_next = false;

                        for byte_res in &mut stream_bytes {
                            let b = byte_res.map_err(|e| AppError::Other(format!("Read error: {}", e)))?;
                            obj_bytes.push(b);

                            if escape_next {
                                escape_next = false;
                                continue;
                            }
                            if b == b'\\' && in_string {
                                escape_next = true;
                                continue;
                            }
                            if b == b'"' {
                                in_string = !in_string;
                                continue;
                            }
                            if !in_string {
                                if b == b'{' {
                                    brace_depth += 1;
                                } else if b == b'}' {
                                    brace_depth -= 1;
                                    if brace_depth == 0 {
                                        break;
                                    }
                                }
                            }
                        }

                        if let Ok(serde_json::Value::Object(map)) = serde_json::from_slice(&obj_bytes) {
                            data_row_index += 1;
                            if data_row_index > skip_rows {
                                let mut row = Vec::with_capacity(options.column_mappings.len());
                                for mapping in &options.column_mappings {
                                    let val_str = match map.get(&mapping.source_column) {
                                        Some(serde_json::Value::Null) | None => String::new(),
                                        Some(serde_json::Value::String(s)) => s.clone(),
                                        Some(other) => other.to_string(),
                                    };
                                    row.push(val_str);
                                }
                                current_chunk.push((data_row_index, row));

                                if current_chunk.len() >= batch_size {
                                    let send_batch = std::mem::replace(
                                        &mut current_chunk,
                                        Vec::with_capacity(batch_size),
                                    );
                                    if tx.blocking_send(Ok(send_batch)).is_err() {
                                        return Ok(());
                                    }
                                }
                            }
                        }

                        next_char = get_next_non_ws(&mut stream_bytes);
                    } else {
                        next_char = get_next_non_ws(&mut stream_bytes);
                    }
                }
            } else {
                let lines_reader = BufReader::new(full_reader);
                for line_res in lines_reader.lines() {
                    let line = line_res.map_err(|e| AppError::Other(e.to_string()))?;
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    if let Ok(serde_json::Value::Object(map)) = serde_json::from_str(trimmed) {
                        data_row_index += 1;
                        if data_row_index <= skip_rows {
                            continue;
                        }
                        let mut row = Vec::with_capacity(options.column_mappings.len());
                        for mapping in &options.column_mappings {
                            let val_str = match map.get(&mapping.source_column) {
                                Some(serde_json::Value::Null) | None => String::new(),
                                Some(serde_json::Value::String(s)) => s.clone(),
                                Some(other) => other.to_string(),
                            };
                            row.push(val_str);
                        }
                        current_chunk.push((data_row_index, row));

                        if current_chunk.len() >= batch_size {
                            let send_batch = std::mem::replace(
                                &mut current_chunk,
                                Vec::with_capacity(batch_size),
                            );
                            if tx.blocking_send(Ok(send_batch)).is_err() {
                                return Ok(());
                            }
                        }
                    }
                }
            }

            if !current_chunk.is_empty() {
                let _ = tx.blocking_send(Ok(current_chunk));
            }
        }
    }

    Ok(())
}
