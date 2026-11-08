use std::collections::{BTreeSet, HashMap};
use std::fs::File;
use std::io::{BufRead, BufReader, BufWriter, Read, Write};
use std::path::Path;
use std::time::Instant;

use crate::drivers::DatabaseConnection;
use crate::error::AppError;
use crate::models::{
    CellValue, ExportOptions, ExportResult, ImportErrorPolicy, ImportOptions, ImportPreview,
    ImportResult, JsonStructure, QueryResult, TransferFormat, TransferProgress,
};

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

            for row in &result.rows {
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
                for row in &result.rows {
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
    let trimmed = val.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("null") {
        return "NULL".to_string();
    }

    let is_sqlite = dialect.to_lowercase().contains("sqlite");

    if trimmed.eq_ignore_ascii_case("true") {
        return if is_sqlite { "1".to_string() } else { "TRUE".to_string() };
    }
    if trimmed.eq_ignore_ascii_case("false") {
        return if is_sqlite { "0".to_string() } else { "FALSE".to_string() };
    }

    // Try parsing as integer
    if let Ok(i) = trimmed.parse::<i64>() {
        return i.to_string();
    }

    // Try parsing as float
    if let Ok(f) = trimmed.parse::<f64>() {
        if f.is_finite() {
            return f.to_string();
        }
    }

    // Escape single quotes for string literal
    format!("'{}'", val.replace('\'', "''"))
}

/// Generates a batch INSERT SQL statement for given rows.
pub fn generate_batch_insert_sql(
    table: &str,
    target_columns: &[String],
    rows: &[Vec<String>],
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
            .map(|val| format_sql_literal(val, dialect))
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

/// Streams and executes export to a local file.
pub async fn export_data_impl(
    conn: &dyn DatabaseConnection,
    sql: &str,
    file_path: &str,
    options: &ExportOptions,
) -> Result<ExportResult, AppError> {
    let start_time = Instant::now();
    let query_result = conn.execute_query(sql).await?;

    let file = File::create(file_path)
        .map_err(|e| AppError::Other(format!("Failed to create export file '{}': {}", file_path, e)))?;
    let mut buf_writer = BufWriter::new(file);

    let (total_rows, file_size_bytes) =
        export_query_result_to_writer(&query_result, &mut buf_writer, options)?;

    let elapsed_ms = start_time.elapsed().as_millis() as u64;

    Ok(ExportResult {
        total_rows,
        file_size_bytes,
        elapsed_ms,
    })
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

    let file = File::open(path)
        .map_err(|e| AppError::Other(format!("Failed to open file: {}", e)))?;

    let batch_size = options.batch_size.unwrap_or(500).clamp(1, 2000);

    // Extract raw rows mapped to target columns
    let mapped_rows = match options.format {
        TransferFormat::Csv => read_mapped_csv_rows(file, options)?,
        TransferFormat::Json => read_mapped_json_rows(file, options)?,
    };

    let total_rows = mapped_rows.len();
    let target_columns: Vec<String> = options
        .column_mappings
        .iter()
        .map(|m| m.target_column.clone())
        .collect();

    if target_columns.is_empty() {
        return Err(AppError::Other("No column mappings provided".to_string()));
    }

    if mapped_rows.is_empty() {
        return Ok(ImportResult {
            total_rows: 0,
            imported_rows: 0,
            skipped_rows: 0,
            elapsed_ms: start_time.elapsed().as_millis() as u64,
        });
    }

    // Handle atomic transaction if policy is Abort
    if options.error_policy == ImportErrorPolicy::Abort {
        let _ = conn.execute_query("BEGIN").await;
    }

    let mut imported_rows = 0;
    let mut skipped_rows = 0;

    for chunk in mapped_rows.chunks(batch_size) {
        let batch_sql = generate_batch_insert_sql(table, &target_columns, chunk, dialect);
        let exec_result = conn.execute_query(&batch_sql).await;

        match exec_result {
            Ok(_) => {
                imported_rows += chunk.len();
            }
            Err(e) => {
                if options.error_policy == ImportErrorPolicy::Abort {
                    let _ = conn.execute_query("ROLLBACK").await;
                    return Err(AppError::Other(format!("Import failed during batch: {}", e)));
                } else {
                    // Skip invalid rows policy: fallback to row-by-row insert for this chunk
                    for row in chunk {
                        let single_sql = generate_batch_insert_sql(table, &target_columns, std::slice::from_ref(row), dialect);
                        if conn.execute_query(&single_sql).await.is_ok() {
                            imported_rows += 1;
                        } else {
                            skipped_rows += 1;
                        }
                    }
                }
            }
        }

        if let Some(ref progress_cb) = on_progress {
            progress_cb(TransferProgress {
                current_row: imported_rows + skipped_rows,
                total_rows: Some(total_rows),
                status: "importing".to_string(),
            });
        }
    }

    if options.error_policy == ImportErrorPolicy::Abort {
        let _ = conn.execute_query("COMMIT").await;
    }

    if let Some(ref progress_cb) = on_progress {
        progress_cb(TransferProgress {
            current_row: total_rows,
            total_rows: Some(total_rows),
            status: "done".to_string(),
        });
    }

    Ok(ImportResult {
        total_rows,
        imported_rows,
        skipped_rows,
        elapsed_ms: start_time.elapsed().as_millis() as u64,
    })
}

fn read_mapped_csv_rows<R: Read>(
    reader: R,
    options: &ImportOptions,
) -> Result<Vec<Vec<String>>, AppError> {
    let delim = options.delimiter.unwrap_or(',');
    let mut csv_reader = csv::ReaderBuilder::new()
        .delimiter(delim as u8)
        .has_headers(options.has_headers)
        .flexible(true)
        .from_reader(reader);

    // Map source column to header index
    let mut col_index_map: HashMap<String, usize> = HashMap::new();
    if options.has_headers {
        let headers = csv_reader
            .headers()
            .map_err(|e| AppError::Other(format!("Failed to read CSV headers: {}", e)))?;
        for (idx, name) in headers.iter().enumerate() {
            col_index_map.insert(name.trim().to_string(), idx);
        }
    }

    let mut rows = Vec::new();

    for result in csv_reader.records() {
        let record = result.map_err(|e| AppError::Other(format!("CSV read error: {}", e)))?;
        let mut row = Vec::with_capacity(options.column_mappings.len());

        for mapping in &options.column_mappings {
            let val = if options.has_headers {
                col_index_map
                    .get(&mapping.source_column)
                    .and_then(|&idx| record.get(idx))
                    .unwrap_or("")
            } else {
                // If no headers, source_column might be an index string "0", "1", ...
                mapping
                    .source_column
                    .parse::<usize>()
                    .ok()
                    .and_then(|idx| record.get(idx))
                    .unwrap_or("")
            };
            row.push(val.trim().to_string());
        }
        rows.push(row);
    }

    Ok(rows)
}

fn read_mapped_json_rows<R: Read>(
    reader: R,
    options: &ImportOptions,
) -> Result<Vec<Vec<String>>, AppError> {
    let mut buf_reader = BufReader::new(reader);
    let mut first_bytes = [0u8; 1];
    let n = buf_reader.read(&mut first_bytes).map_err(|e| AppError::Other(e.to_string()))?;
    if n == 0 {
        return Ok(Vec::new());
    }

    let is_array = first_bytes[0] == b'[';
    let full_reader = std::io::Cursor::new(first_bytes).chain(buf_reader);

    let mut objects: Vec<serde_json::Map<String, serde_json::Value>> = Vec::new();

    if is_array {
        let val: serde_json::Value = serde_json::from_reader(full_reader)
            .map_err(|e| AppError::Other(format!("Invalid JSON array: {}", e)))?;
        if let serde_json::Value::Array(items) = val {
            for item in items {
                if let serde_json::Value::Object(map) = item {
                    objects.push(map);
                }
            }
        }
    } else {
        let reader = BufReader::new(full_reader);
        for line in reader.lines() {
            let l = line.map_err(|e| AppError::Other(e.to_string()))?;
            let trimmed = l.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Ok(serde_json::Value::Object(map)) = serde_json::from_str(trimmed) {
                objects.push(map);
            }
        }
    }

    let mut rows = Vec::new();
    for obj in objects {
        let mut row = Vec::with_capacity(options.column_mappings.len());
        for mapping in &options.column_mappings {
            let val = match obj.get(&mapping.source_column) {
                Some(serde_json::Value::Null) | None => String::new(),
                Some(serde_json::Value::String(s)) => s.clone(),
                Some(v) => v.to_string(),
            };
            row.push(val);
        }
        rows.push(row);
    }

    Ok(rows)
}
