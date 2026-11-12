use std::collections::{BTreeSet, HashMap};
use std::fs::File;
use std::io::{BufRead, BufReader, BufWriter, Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;

use crate::drivers::DatabaseConnection;
use crate::error::AppError;
use crate::models::{
    CellValue, ExportOptions, ExportResult, ImportErrorPolicy, ImportOptions, ImportPreview,
    ImportResult, JsonStructure, QueryResult, TransferFormat, TransferProgress,
};

static CANCELLATION_REGISTRY: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();

fn get_cancellation_registry() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    CANCELLATION_REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn register_cancellation_token(job_id: &str) -> Arc<AtomicBool> {
    let mut map = get_cancellation_registry().lock().unwrap();
    let token = Arc::new(AtomicBool::new(false));
    map.insert(job_id.to_string(), token.clone());
    token
}

pub fn trigger_cancellation(job_id: &str) -> bool {
    let map = get_cancellation_registry().lock().unwrap();
    if let Some(token) = map.get(job_id) {
        token.store(true, Ordering::SeqCst);
        true
    } else {
        false
    }
}

pub fn is_transfer_cancelled(job_id: &str) -> bool {
    let map = get_cancellation_registry().lock().unwrap();
    if let Some(token) = map.get(job_id) {
        token.load(Ordering::SeqCst)
    } else {
        false
    }
}

pub fn remove_cancellation_token(job_id: &str) {
    let mut map = get_cancellation_registry().lock().unwrap();
    map.remove(job_id);
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

/// Previews an import file (CSV or JSON) from disk.
pub fn preview_import_file_impl(file_path: &str, delimiter: Option<char>) -> Result<ImportPreview, AppError> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Err(AppError::NotFound(format!("File '{}' not found", file_path)));
    }

    let file = File::open(path).map_err(|e| AppError::Other(format!("Failed to open file: {}", e)))?;
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();

    if ext == "json" || ext == "ndjson" || ext == "jsonl" {
        parse_json_preview(file)
    } else {
        parse_csv_preview(file, delimiter)
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
}

/// Formats a raw string cell value into valid SQL literal respecting target type and empty string policy.
pub fn format_sql_literal_with_options(
    val: &str,
    target_type: Option<&str>,
    empty_as_null: bool,
    dialect: &str,
) -> String {
    let trimmed = val.trim();
    let is_sqlite = dialect.to_lowercase().contains("sqlite");

    if let Some(data_type) = target_type {
        let dt = data_type.to_lowercase();
        if dt.contains("char") || dt.contains("text") || dt.contains("clob") || dt.contains("string") {
            if val.is_empty() {
                return if empty_as_null { "NULL".to_string() } else { "''".to_string() };
            }
            if trimmed.eq_ignore_ascii_case("null") {
                return "NULL".to_string();
            }
            return format!("'{}'", val.replace('\'', "''"));
        }
        if dt.contains("int") || dt.contains("serial") {
            if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("null") {
                return "NULL".to_string();
            }
            if let Ok(i) = trimmed.parse::<i64>() {
                return i.to_string();
            }
            return "NULL".to_string();
        }
        if dt.contains("float") || dt.contains("double") || dt.contains("real") || dt.contains("numeric") || dt.contains("decimal") {
            if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("null") {
                return "NULL".to_string();
            }
            if let Ok(f) = trimmed.parse::<f64>() {
                if f.is_finite() {
                    return f.to_string();
                }
            }
            return "NULL".to_string();
        }
        if dt.contains("bool") {
            if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("null") {
                return "NULL".to_string();
            }
            if trimmed.eq_ignore_ascii_case("true") || trimmed == "1" {
                return if is_sqlite { "1".to_string() } else { "TRUE".to_string() };
            }
            if trimmed.eq_ignore_ascii_case("false") || trimmed == "0" {
                return if is_sqlite { "0".to_string() } else { "FALSE".to_string() };
            }
            return "NULL".to_string();
        }
    }

    if val.is_empty() {
        return if empty_as_null { "NULL".to_string() } else { "''".to_string() };
    }
    if trimmed.eq_ignore_ascii_case("null") || trimmed == "\\N" {
        return "NULL".to_string();
    }

    if trimmed.eq_ignore_ascii_case("true") {
        return if is_sqlite { "1".to_string() } else { "TRUE".to_string() };
    }
    if trimmed.eq_ignore_ascii_case("false") {
        return if is_sqlite { "0".to_string() } else { "FALSE".to_string() };
    }

    // Do NOT coerce numbers with leading zeroes (e.g. "0123", "007") or leading "-0" into integers!
    let has_leading_zero = (trimmed.starts_with('0') && trimmed.len() > 1 && !trimmed.starts_with("0."))
        || (trimmed.starts_with("-0") && trimmed.len() > 2 && !trimmed.starts_with("-0."));

    if !has_leading_zero {
        // Try parsing as integer
        if let Ok(i) = trimmed.parse::<i64>() {
            return i.to_string();
        }

        // Try parsing as float if it contains decimal point or exponent
        if trimmed.contains('.') || trimmed.contains('e') || trimmed.contains('E') {
            if let Ok(f) = trimmed.parse::<f64>() {
                if f.is_finite() {
                    return f.to_string();
                }
            }
        }
    }

    // Escape single quotes for string literal
    format!("'{}'", val.replace('\'', "''"))
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
        CellValue::Text(s) => format!("'{}'", s.replace('\'', "''")),
        CellValue::Json(j) => format!("'{}'", j.to_string().replace('\'', "''")),
        CellValue::Bytes(b) => format!("'{}'", b.replace('\'', "''")),
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
            .enumerate()
            .map(|(i, val)| {
                let target_type = target_types.get(i).and_then(|opt| opt.as_deref());
                format_sql_literal_with_options(val, target_type, treat_empty_as_null, dialect)
            })
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

/// Generates a batch INSERT SQL statement for given rows.
pub fn generate_batch_insert_sql(
    table: &str,
    target_columns: &[String],
    rows: &[Vec<String>],
    dialect: &str,
) -> String {
    generate_batch_insert_sql_with_options(table, target_columns, &[], rows, true, dialect)
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

    let file = File::create(file_path)
        .map_err(|e| AppError::Other(format!("Failed to create export file '{}': {}", file_path, e)))?;
    let buf_writer = BufWriter::new(file);
    let mut counting_writer = CountingWriter::new(buf_writer);

    let clean_sql = sql.trim().trim_end_matches(';').trim();
    let can_paginate = is_paginatable_select(clean_sql);
    let chunk_size: usize = 1000;
    let mut offset: usize = 0;
    let mut total_rows: usize = 0;

    match options.format {
        TransferFormat::Csv => {
            let delim = options.delimiter.unwrap_or(',');
            let mut csv_writer = csv::WriterBuilder::new()
                .delimiter(delim as u8)
                .from_writer(&mut counting_writer);
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

                if !headers_written && options.include_headers && !query_res.columns.is_empty() {
                    let headers: Vec<&str> = query_res.columns.iter().map(|c| c.name.as_str()).collect();
                    csv_writer
                        .write_record(&headers)
                        .map_err(|e| AppError::Other(format!("CSV write header error: {}", e)))?;
                    headers_written = true;
                }

                let fetched_count = query_res.rows.len();
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

                total_rows += fetched_count;
                if !can_paginate || fetched_count < chunk_size {
                    break;
                }
                offset += fetched_count;
            }

            csv_writer
                .flush()
                .map_err(|e| AppError::Other(format!("CSV flush error: {}", e)))?;
        }
        TransferFormat::Json => {
            let is_ndjson = matches!(options.json_structure, Some(JsonStructure::Ndjson));
            if !is_ndjson {
                writeln!(counting_writer, "[")
                    .map_err(|e| AppError::Other(format!("JSON write error: {}", e)))?;
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

                let fetched_count = query_res.rows.len();
                for (idx, row) in query_res.rows.iter().enumerate() {
                    if idx % 100 == 0 {
                        check_cancel()?;
                    }
                    let map = row_to_json_map(&col_refs, row);
                    if is_ndjson {
                        let line = serde_json::to_string(&map)
                            .map_err(|e| AppError::Other(format!("JSON serialization error: {}", e)))?;
                        writeln!(counting_writer, "{}", line)
                            .map_err(|e| AppError::Other(format!("JSON write error: {}", e)))?;
                    } else {
                        if !first_item {
                            writeln!(counting_writer, ",")
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
                        write!(counting_writer, "{}", indented)
                            .map_err(|e| AppError::Other(format!("JSON write error: {}", e)))?;
                    }
                }

                total_rows += fetched_count;
                if !can_paginate || fetched_count < chunk_size {
                    break;
                }
                offset += fetched_count;
            }

            if !is_ndjson {
                if !first_item {
                    writeln!(counting_writer)
                        .map_err(|e| AppError::Other(format!("JSON write error: {}", e)))?;
                }
                writeln!(counting_writer, "]")
                    .map_err(|e| AppError::Other(format!("JSON write error: {}", e)))?;
            }
            counting_writer
                .flush()
                .map_err(|e| AppError::Other(format!("Flush error: {}", e)))?;
        }
    }

    if let Some(ref jid) = options.job_id {
        remove_cancellation_token(jid);
    }

    let file_size_bytes = counting_writer.bytes_written;
    let elapsed_ms = start_time.elapsed().as_millis() as u64;

    Ok(ExportResult {
        total_rows,
        file_size_bytes,
        elapsed_ms,
    })
}

#[allow(clippy::too_many_arguments)]
async fn execute_import_chunk(
    conn: &dyn DatabaseConnection,
    table: &str,
    target_columns: &[String],
    target_types: &[Option<String>],
    chunk: &[Vec<String>],
    treat_empty_as_null: bool,
    dialect: &str,
    error_policy: ImportErrorPolicy,
) -> Result<(usize, usize), AppError> {
    let batch_sql = generate_batch_insert_sql_with_options(
        table,
        target_columns,
        target_types,
        chunk,
        treat_empty_as_null,
        dialect,
    );
    let exec_result = conn.execute_query(&batch_sql).await;

    match exec_result {
        Ok(_) => Ok((chunk.len(), 0)),
        Err(e) => {
            if error_policy == ImportErrorPolicy::Abort {
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
                let mut imported = 0;
                let mut skipped = 0;
                for row in chunk {
                    let single_sql = generate_batch_insert_sql_with_options(
                        table,
                        target_columns,
                        target_types,
                        std::slice::from_ref(row),
                        treat_empty_as_null,
                        dialect,
                    );
                    if conn.execute_query(&single_sql).await.is_ok() {
                        imported += 1;
                    } else {
                        skipped += 1;
                    }
                }
                Ok((imported, skipped))
            }
        }
    }
}

/// Streams and imports data from a CSV or JSON file into the database.
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

    let file = File::open(path)
        .map_err(|e| AppError::Other(format!("Failed to open file: {}", e)))?;

    let batch_size = options.batch_size.unwrap_or(500).clamp(1, 2000);
    let job_id = options.job_id.as_deref();

    let check_cancelled = |jid: Option<&str>| -> Result<(), AppError> {
        if let Some(id) = jid {
            if is_transfer_cancelled(id) {
                return Err(AppError::Other("Import cancelled by user".to_string()));
            }
        }
        Ok(())
    };

    // Handle atomic transaction if policy is Abort
    if options.error_policy == ImportErrorPolicy::Abort {
        conn.execute_query("BEGIN")
            .await
            .map_err(|e| AppError::Other(format!("Failed to begin transaction: {}", e)))?;
    }

    let mut imported_rows = 0;
    let mut skipped_rows = 0;

    if options.format == TransferFormat::Csv {
        let delim = options.delimiter.unwrap_or(',');
        let mut csv_reader = csv::ReaderBuilder::new()
            .delimiter(delim as u8)
            .has_headers(options.has_headers)
            .flexible(true)
            .from_reader(file);

        let mut col_index_map: HashMap<String, usize> = HashMap::new();
        if options.has_headers {
            let headers = csv_reader
                .headers()
                .map_err(|e| AppError::Other(format!("Failed to read CSV headers: {}", e)))?;
            for (idx, name) in headers.iter().enumerate() {
                col_index_map.insert(name.trim().to_string(), idx);
            }
        }

        let mut current_chunk: Vec<Vec<String>> = Vec::with_capacity(batch_size);

        for result in csv_reader.records() {
            if let Err(err) = check_cancelled(job_id) {
                if options.error_policy == ImportErrorPolicy::Abort {
                    let _ = conn.execute_query("ROLLBACK").await;
                }
                return Err(err);
            }

            let record = result.map_err(|e| AppError::Other(format!("CSV read error: {}", e)))?;
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
            current_chunk.push(row);

            if current_chunk.len() >= batch_size {
                let (imp, skp) = execute_import_chunk(
                    conn,
                    table,
                    &target_columns,
                    &target_types,
                    &current_chunk,
                    treat_empty_as_null,
                    dialect,
                    options.error_policy,
                ).await?;
                imported_rows += imp;
                skipped_rows += skp;
                current_chunk.clear();

                if let Some(ref progress_cb) = on_progress {
                    progress_cb(TransferProgress {
                        current_row: imported_rows + skipped_rows,
                        total_rows: None,
                        status: "importing".to_string(),
                    });
                }
            }
        }

        if !current_chunk.is_empty() {
            let (imp, skp) = execute_import_chunk(
                conn,
                table,
                &target_columns,
                &target_types,
                &current_chunk,
                treat_empty_as_null,
                dialect,
                options.error_policy,
            ).await?;
            imported_rows += imp;
            skipped_rows += skp;
            current_chunk.clear();
        }
    } else {
        let mut buf_reader = BufReader::new(file);
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
            let mut current_chunk: Vec<Vec<String>> = Vec::with_capacity(batch_size);

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

                // First non-ws is '[', consume it
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
                            if let Err(err) = check_cancelled(job_id) {
                                if options.error_policy == ImportErrorPolicy::Abort {
                                    let _ = conn.execute_query("ROLLBACK").await;
                                }
                                return Err(err);
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
                            current_chunk.push(row);

                            if current_chunk.len() >= batch_size {
                                let (imp, skp) = execute_import_chunk(
                                    conn,
                                    table,
                                    &target_columns,
                                    &target_types,
                                    &current_chunk,
                                    treat_empty_as_null,
                                    dialect,
                                    options.error_policy,
                                ).await?;
                                imported_rows += imp;
                                skipped_rows += skp;
                                current_chunk.clear();

                                if let Some(ref progress_cb) = on_progress {
                                    progress_cb(TransferProgress {
                                        current_row: imported_rows + skipped_rows,
                                        total_rows: None,
                                        status: "importing".to_string(),
                                    });
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
                    if let Err(err) = check_cancelled(job_id) {
                        if options.error_policy == ImportErrorPolicy::Abort {
                            let _ = conn.execute_query("ROLLBACK").await;
                        }
                        return Err(err);
                    }
                    let line = line_res.map_err(|e| AppError::Other(e.to_string()))?;
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    if let Ok(serde_json::Value::Object(map)) = serde_json::from_str(trimmed) {
                        let mut row = Vec::with_capacity(options.column_mappings.len());
                        for mapping in &options.column_mappings {
                            let val_str = match map.get(&mapping.source_column) {
                                Some(serde_json::Value::Null) | None => String::new(),
                                Some(serde_json::Value::String(s)) => s.clone(),
                                Some(other) => other.to_string(),
                            };
                            row.push(val_str);
                        }
                        current_chunk.push(row);

                        if current_chunk.len() >= batch_size {
                            let (imp, skp) = execute_import_chunk(
                                conn,
                                table,
                                &target_columns,
                                &target_types,
                                &current_chunk,
                                treat_empty_as_null,
                                dialect,
                                options.error_policy,
                            ).await?;
                            imported_rows += imp;
                            skipped_rows += skp;
                            current_chunk.clear();

                            if let Some(ref progress_cb) = on_progress {
                                progress_cb(TransferProgress {
                                    current_row: imported_rows + skipped_rows,
                                    total_rows: None,
                                    status: "importing".to_string(),
                                });
                            }
                        }
                    }
                }
            }

            if !current_chunk.is_empty() {
                let (imp, skp) = execute_import_chunk(
                    conn,
                    table,
                    &target_columns,
                    &target_types,
                    &current_chunk,
                    treat_empty_as_null,
                    dialect,
                    options.error_policy,
                ).await?;
                imported_rows += imp;
                skipped_rows += skp;
                current_chunk.clear();
            }
        }
    }

    let total_rows = imported_rows + skipped_rows;
    if options.error_policy == ImportErrorPolicy::Abort {
        conn.execute_query("COMMIT")
            .await
            .map_err(|e| AppError::Other(format!("Failed to commit transaction: {}", e)))?;
    }

    if let Some(ref progress_cb) = on_progress {
        progress_cb(TransferProgress {
            current_row: total_rows,
            total_rows: Some(total_rows),
            status: "done".to_string(),
        });
    }

    if let Some(ref jid) = options.job_id {
        remove_cancellation_token(jid);
    }

    Ok(ImportResult {
        total_rows,
        imported_rows,
        skipped_rows,
        elapsed_ms: start_time.elapsed().as_millis() as u64,
    })
}
