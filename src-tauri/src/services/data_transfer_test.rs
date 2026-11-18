use std::io::Write;
use tempfile::NamedTempFile;
use crate::drivers::{DatabaseConnection, SqliteConnection};
use crate::models::{
    CellValue, ColumnMapping, ColumnMeta, ExportOptions, ImportErrorPolicy, ImportOptions,
    JsonStructure, QueryResult, TransferFormat, TransferProgress,
};
use crate::services::data_transfer::{
    cell_value_to_sql_literal, detect_csv_delimiter, escape_sql_string, export_data_impl,
    export_query_result_to_writer, generate_batch_insert_sql, import_data_impl, parse_csv_preview,
    parse_json_preview, register_cancellation_token, trigger_cancellation,
};

#[test]
fn test_detect_csv_delimiter() {
    let comma_sample = "id,name,age\n1,Alice,30\n2,Bob,25";
    assert_eq!(detect_csv_delimiter(comma_sample), ',');

    let semicolon_sample = "id;name;age\n1;Alice;30\n2;Bob;25";
    assert_eq!(detect_csv_delimiter(semicolon_sample), ';');

    let tab_sample = "id\tname\tage\n1\tAlice\t30\n2\tBob\t25";
    assert_eq!(detect_csv_delimiter(tab_sample), '\t');
}

#[test]
fn test_parse_csv_preview() {
    let csv_content = "id,name,email\n1,John Doe,john@example.com\n2,Jane,jane@example.com";
    let preview = parse_csv_preview(csv_content.as_bytes(), Some(',')).expect("preview csv");

    assert_eq!(preview.detected_delimiter, ',');
    assert_eq!(preview.headers, vec!["id", "name", "email"]);
    assert_eq!(preview.preview_rows.len(), 2);
    assert_eq!(preview.preview_rows[0], vec!["1", "John Doe", "john@example.com"]);
}

#[test]
fn test_parse_json_array_preview() {
    let json_content = r#"[
        {"id": 1, "name": "Alice", "active": true},
        {"id": 2, "name": "Bob", "active": false}
    ]"#;
    let preview = parse_json_preview(json_content.as_bytes()).expect("preview json array");

    assert_eq!(preview.headers, vec!["active", "id", "name"]);
    assert_eq!(preview.preview_rows.len(), 2);
    assert_eq!(preview.preview_rows[0][1], "1");
    assert_eq!(preview.preview_rows[0][2], "Alice");
}

#[test]
fn test_parse_ndjson_preview() {
    let ndjson_content = "{\"id\": 10, \"name\": \"Charlie\"}\n{\"id\": 20, \"name\": \"Dave\"}\n";
    let preview = parse_json_preview(ndjson_content.as_bytes()).expect("preview ndjson");

    assert_eq!(preview.headers, vec!["id", "name"]);
    assert_eq!(preview.preview_rows.len(), 2);
    assert_eq!(preview.preview_rows[1][0], "20");
    assert_eq!(preview.preview_rows[1][1], "Dave");
}

#[test]
fn test_export_query_result_to_csv() {
    let query_result = QueryResult {
        columns: vec![
            ColumnMeta::new("id", "INTEGER", false),
            ColumnMeta::new("name", "TEXT", true),
        ],
        rows: vec![
            vec![CellValue::Integer(1), CellValue::Text("Alice".to_string())],
            vec![CellValue::Integer(2), CellValue::Null],
        ],
        execution_time_ms: 10,
        rows_affected: None,
    };

    let mut buf = Vec::new();
    let options = ExportOptions {
        format: TransferFormat::Csv,
        delimiter: Some(','),
        include_headers: true,
        json_structure: None,
        job_id: None,
        use_native_copy: None,
    };

    let (rows, bytes) = export_query_result_to_writer(&query_result, &mut buf, &options).expect("export csv");
    assert_eq!(rows, 2);
    assert!(bytes > 0);

    let output = String::from_utf8(buf).expect("utf8");
    assert!(output.contains("id,name\n"));
    assert!(output.contains("1,Alice\n"));
    assert!(output.contains("2,\n"));
}

#[test]
fn test_export_query_result_to_json_array() {
    let query_result = QueryResult {
        columns: vec![
            ColumnMeta::new("id", "INTEGER", false),
            ColumnMeta::new("name", "TEXT", true),
        ],
        rows: vec![
            vec![CellValue::Integer(1), CellValue::Text("Alice".to_string())],
        ],
        execution_time_ms: 5,
        rows_affected: None,
    };

    let mut buf = Vec::new();
    let options = ExportOptions {
        format: TransferFormat::Json,
        delimiter: None,
        include_headers: true,
        json_structure: Some(JsonStructure::Array),
        job_id: None,
        use_native_copy: None,
    };

    let (rows, _) = export_query_result_to_writer(&query_result, &mut buf, &options).expect("export json");
    assert_eq!(rows, 1);

    let output = String::from_utf8(buf).expect("utf8");
    let parsed: serde_json::Value = serde_json::from_str(&output).expect("valid json array");
    assert!(parsed.is_array());
    assert_eq!(parsed[0]["name"], "Alice");
}

#[tokio::test]
async fn test_streaming_export_data_impl_across_multiple_batches() {
    let conn = SqliteConnection::open_in_memory().expect("open sqlite");
    conn.execute_query("CREATE TABLE big_export (id INTEGER PRIMARY KEY, label TEXT);")
        .await
        .expect("create table");

    // Insert 2,500 rows (spans 3 batches of 1,000 rows in export_data_impl)
    let mut values = Vec::new();
    for i in 1..=2500 {
        values.push(format!("({}, 'Row_{}')", i, i));
    }
    let insert_sql = format!("INSERT INTO big_export (id, label) VALUES {};", values.join(","));
    conn.execute_query(&insert_sql).await.expect("insert 2500 rows");

    let temp_csv = NamedTempFile::new().expect("temp csv");
    let csv_path = temp_csv.path().to_str().unwrap().to_string();

    let csv_opts = ExportOptions {
        format: TransferFormat::Csv,
        delimiter: Some(','),
        include_headers: true,
        json_structure: None,
        job_id: None,
        use_native_copy: None,
    };

    let res = export_data_impl(&conn, "SELECT * FROM big_export", &csv_path, &csv_opts)
        .await
        .expect("streaming csv export");

    assert_eq!(res.total_rows, 2500);
    assert!(res.file_size_bytes > 10000);

    let content = std::fs::read_to_string(&csv_path).expect("read exported csv");
    let line_count = content.lines().count();
    assert_eq!(line_count, 2501); // 1 header + 2500 rows
}

#[test]
fn test_export_cancellation() {
    use crate::services::data_transfer::{register_cancellation_token, trigger_cancellation};

    let query_result = QueryResult {
        columns: vec![
            ColumnMeta::new("id", "INTEGER", false),
            ColumnMeta::new("name", "TEXT", true),
        ],
        rows: (0..500)
            .map(|i| vec![CellValue::Integer(i), CellValue::Text(format!("User {}", i))])
            .collect(),
        execution_time_ms: 5,
        rows_affected: None,
    };

    let job_id = "test-export-cancel-job";
    register_cancellation_token(job_id);
    trigger_cancellation(job_id);

    let mut buf = Vec::new();
    let options = ExportOptions {
        format: TransferFormat::Csv,
        delimiter: Some(','),
        include_headers: true,
        json_structure: None,
        job_id: Some(job_id.to_string()),
        use_native_copy: None,
    };

    let res = export_query_result_to_writer(&query_result, &mut buf, &options);
    assert!(res.is_err(), "Export must fail when cancellation token is triggered");
    assert!(res.unwrap_err().to_string().contains("cancelled"));
}

#[test]
fn test_generate_batch_insert_sql() {
    let table = "users";
    let target_columns = vec!["name".to_string(), "age".to_string(), "is_active".to_string()];
    let rows = vec![
        vec!["O'Connor".to_string(), "28".to_string(), "true".to_string()],
        vec!["".to_string(), "null".to_string(), "false".to_string()],
    ];

    let sql = generate_batch_insert_sql(table, &target_columns, &rows, "sqlite");
    assert!(sql.contains("INSERT INTO \"users\" (\"name\", \"age\", \"is_active\") VALUES"));
    assert!(sql.contains("('O''Connor', 28, 1)"));
    assert!(sql.contains("(NULL, NULL, 0)"));
}

#[tokio::test]
async fn test_import_csv_sqlite() {
    let conn = SqliteConnection::open_in_memory().expect("open sqlite");
    conn.execute_query("CREATE TABLE employees (name TEXT, age INTEGER, email TEXT);")
        .await
        .expect("create table");

    let mut temp_csv = NamedTempFile::new().expect("create temp file");
    writeln!(temp_csv, "Full Name,User Age,Email Address").unwrap();
    writeln!(temp_csv, "Alice Smith,30,alice@example.com").unwrap();
    writeln!(temp_csv, "Bob Jones,25,bob@example.com").unwrap();
    temp_csv.flush().unwrap();

    let options = ImportOptions {
        file_path: temp_csv.path().to_str().unwrap().to_string(),
        format: TransferFormat::Csv,
        delimiter: Some(','),
        has_headers: true,
        column_mappings: vec![
            ColumnMapping {
                source_column: "Full Name".to_string(),
                target_column: "name".to_string(),
                target_type: None,
            },
            ColumnMapping {
                source_column: "User Age".to_string(),
                target_column: "age".to_string(),
                target_type: None,
            },
            ColumnMapping {
                source_column: "Email Address".to_string(),
                target_column: "email".to_string(),
                target_type: None,
            },
        ],
        error_policy: ImportErrorPolicy::Abort,
        batch_size: Some(10),
        treat_empty_as_null: None,
        job_id: None,
        import_mode: None,
        chunk_commit_rows: None,
        resume_from_checkpoint: None,
        use_native_copy: None,
    };

    let result = import_data_impl(&conn, "employees", &options, "sqlite", None::<fn(TransferProgress)>)
        .await
        .expect("import csv");

    assert_eq!(result.total_rows, 2);
    assert_eq!(result.imported_rows, 2);
    assert_eq!(result.skipped_rows, 0);

    let query_res = conn.execute_query("SELECT COUNT(*) FROM employees;").await.expect("count");
    assert_eq!(query_res.rows[0][0], CellValue::Integer(2));
}

#[tokio::test]
async fn test_import_csv_skip_invalid_rows() {
    let conn = SqliteConnection::open_in_memory().expect("open sqlite");
    conn.execute_query("CREATE TABLE products (id INTEGER PRIMARY KEY, sku TEXT UNIQUE, price REAL);")
        .await
        .expect("create table");

    let mut temp_csv = NamedTempFile::new().expect("create temp file");
    writeln!(temp_csv, "sku,price").unwrap();
    writeln!(temp_csv, "SKU-001,19.99").unwrap();
    writeln!(temp_csv, "SKU-001,29.99").unwrap(); // Duplicate SKU, will violate UNIQUE constraint
    writeln!(temp_csv, "SKU-002,49.99").unwrap();
    temp_csv.flush().unwrap();

    let options = ImportOptions {
        file_path: temp_csv.path().to_str().unwrap().to_string(),
        format: TransferFormat::Csv,
        delimiter: Some(','),
        has_headers: true,
        column_mappings: vec![
            ColumnMapping {
                source_column: "sku".to_string(),
                target_column: "sku".to_string(),
                target_type: None,
            },
            ColumnMapping {
                source_column: "price".to_string(),
                target_column: "price".to_string(),
                target_type: None,
            },
        ],
        error_policy: ImportErrorPolicy::Skip,
        batch_size: Some(2),
        treat_empty_as_null: None,
        job_id: None,
        import_mode: None,
        chunk_commit_rows: None,
        resume_from_checkpoint: None,
        use_native_copy: None,
    };

    let result = import_data_impl(&conn, "products", &options, "sqlite", None::<fn(TransferProgress)>)
        .await
        .expect("import csv skip");

    assert_eq!(result.total_rows, 3);
    assert_eq!(result.imported_rows, 2);
    assert_eq!(result.skipped_rows, 1);
}

#[tokio::test]
async fn test_import_json_sqlite() {
    let conn = SqliteConnection::open_in_memory().expect("open sqlite");
    conn.execute_query("CREATE TABLE books (title TEXT, author TEXT, year INTEGER);")
        .await
        .expect("create table");

    let mut temp_json = NamedTempFile::new().expect("create temp file");
    let json_data = r#"[
        {"title": "The Rust Book", "author": "Steve Klabnik", "year": 2018},
        {"title": "Programming Rust", "author": "Jim Blandy", "year": 2021}
    ]"#;
    write!(temp_json, "{}", json_data).unwrap();
    temp_json.flush().unwrap();

    let options = ImportOptions {
        file_path: temp_json.path().to_str().unwrap().to_string(),
        format: TransferFormat::Json,
        delimiter: None,
        has_headers: true,
        column_mappings: vec![
            ColumnMapping {
                source_column: "title".to_string(),
                target_column: "title".to_string(),
                target_type: None,
            },
            ColumnMapping {
                source_column: "author".to_string(),
                target_column: "author".to_string(),
                target_type: None,
            },
            ColumnMapping {
                source_column: "year".to_string(),
                target_column: "year".to_string(),
                target_type: None,
            },
        ],
        error_policy: ImportErrorPolicy::Abort,
        batch_size: Some(10),
        treat_empty_as_null: None,
        job_id: None,
        import_mode: None,
        chunk_commit_rows: None,
        resume_from_checkpoint: None,
        use_native_copy: None,
    };

    let result = import_data_impl(&conn, "books", &options, "sqlite", None::<fn(TransferProgress)>)
        .await
        .expect("import json");

    assert_eq!(result.total_rows, 2);
    assert_eq!(result.imported_rows, 2);
}

#[tokio::test]
async fn test_import_preserves_empty_string_and_leading_zeros() {
    let conn = SqliteConnection::open_in_memory().expect("open sqlite");
    conn.execute_query("CREATE TABLE items (code TEXT, name TEXT, notes TEXT);")
        .await
        .expect("create table");

    let mut temp_csv = NamedTempFile::new().expect("create temp file");
    writeln!(temp_csv, "code,name,notes").unwrap();
    writeln!(temp_csv, "01234,Alpha,").unwrap();
    temp_csv.flush().unwrap();

    let options = ImportOptions {
        file_path: temp_csv.path().to_str().unwrap().to_string(),
        format: TransferFormat::Csv,
        delimiter: Some(','),
        has_headers: true,
        column_mappings: vec![
            ColumnMapping {
                source_column: "code".to_string(),
                target_column: "code".to_string(),
                target_type: Some("TEXT".to_string()),
            },
            ColumnMapping {
                source_column: "name".to_string(),
                target_column: "name".to_string(),
                target_type: Some("TEXT".to_string()),
            },
            ColumnMapping {
                source_column: "notes".to_string(),
                target_column: "notes".to_string(),
                target_type: Some("TEXT".to_string()),
            },
        ],
        error_policy: ImportErrorPolicy::Abort,
        batch_size: Some(10),
        treat_empty_as_null: Some(false),
        job_id: None,
        import_mode: None,
        chunk_commit_rows: None,
        resume_from_checkpoint: None,
        use_native_copy: None,
    };

    let result = import_data_impl(&conn, "items", &options, "sqlite", None::<fn(TransferProgress)>)
        .await
        .expect("import csv");

    assert_eq!(result.imported_rows, 1);

    let query_res = conn
        .execute_query("SELECT code, name, notes FROM items;")
        .await
        .expect("query items");

    assert_eq!(query_res.rows[0][0], CellValue::Text("01234".to_string()));
    assert_eq!(query_res.rows[0][1], CellValue::Text("Alpha".to_string()));
    assert_eq!(query_res.rows[0][2], CellValue::Text("".to_string())); // Preserved as empty string!
}

#[tokio::test]
async fn test_import_abort_policy_rolls_back_and_returns_error() {
    let conn = SqliteConnection::open_in_memory().expect("open sqlite");
    conn.execute_query("CREATE TABLE unique_items (id INTEGER PRIMARY KEY, sku TEXT UNIQUE);")
        .await
        .expect("create table");

    // Pre-insert an existing sku
    conn.execute_query("INSERT INTO unique_items VALUES (1, 'SKU-EXISTING');")
        .await
        .expect("insert existing");

    let mut temp_csv = NamedTempFile::new().expect("create temp file");
    writeln!(temp_csv, "id,sku").unwrap();
    writeln!(temp_csv, "2,SKU-NEW").unwrap();
    writeln!(temp_csv, "3,SKU-EXISTING").unwrap(); // Duplicate!
    temp_csv.flush().unwrap();

    let options = ImportOptions {
        file_path: temp_csv.path().to_str().unwrap().to_string(),
        format: TransferFormat::Csv,
        delimiter: Some(','),
        has_headers: true,
        column_mappings: vec![
            ColumnMapping {
                source_column: "id".to_string(),
                target_column: "id".to_string(),
                target_type: Some("INTEGER".to_string()),
            },
            ColumnMapping {
                source_column: "sku".to_string(),
                target_column: "sku".to_string(),
                target_type: Some("TEXT".to_string()),
            },
        ],
        error_policy: ImportErrorPolicy::Abort,
        batch_size: Some(10),
        treat_empty_as_null: None,
        job_id: None,
        import_mode: None,
        chunk_commit_rows: None,
        resume_from_checkpoint: None,
        use_native_copy: None,
    };

    let err = import_data_impl(&conn, "unique_items", &options, "sqlite", None::<fn(TransferProgress)>)
        .await
        .expect_err("should abort on duplicate");

    let err_str = err.to_string();
    assert!(err_str.contains("Import failed during batch"), "Error should mention batch failure: {}", err_str);
    assert!(err_str.contains("Transaction rolled back successfully"), "Error should report rollback status: {}", err_str);

    // Verify row 2 was rolled back and only the initial row 1 exists
    let count_res = conn
        .execute_query("SELECT COUNT(*) FROM unique_items;")
        .await
        .expect("count");
    assert_eq!(count_res.rows[0][0], CellValue::Integer(1));
}

#[tokio::test]
async fn test_import_cancellation() {
    let conn = SqliteConnection::open_in_memory().expect("open in-memory sqlite");
    conn.execute_query("CREATE TABLE cancel_test (id INTEGER, name TEXT);")
        .await
        .expect("create table");

    let mut temp_csv = NamedTempFile::new().expect("create temp file");
    writeln!(temp_csv, "id,name").unwrap();
    for i in 1..=50 {
        writeln!(temp_csv, "{},Name{}", i, i).unwrap();
    }
    temp_csv.flush().unwrap();

    let job_id = "test_cancel_job_123".to_string();
    register_cancellation_token(&job_id);
    // Trigger cancellation immediately before/at start of import
    trigger_cancellation(&job_id);

    let options = ImportOptions {
        file_path: temp_csv.path().to_str().unwrap().to_string(),
        format: TransferFormat::Csv,
        delimiter: Some(','),
        has_headers: true,
        column_mappings: vec![
            ColumnMapping {
                source_column: "id".to_string(),
                target_column: "id".to_string(),
                target_type: Some("INTEGER".to_string()),
            },
            ColumnMapping {
                source_column: "name".to_string(),
                target_column: "name".to_string(),
                target_type: Some("TEXT".to_string()),
            },
        ],
        error_policy: ImportErrorPolicy::Abort,
        batch_size: Some(5),
        treat_empty_as_null: None,
        job_id: Some(job_id),
        import_mode: None,
        chunk_commit_rows: None,
        resume_from_checkpoint: None,
        use_native_copy: None,
    };

    let err = import_data_impl(&conn, "cancel_test", &options, "sqlite", None::<fn(TransferProgress)>)
        .await
        .expect_err("should cancel");

    assert!(err.to_string().contains("Import cancelled by user"));

    let count_res = conn.execute_query("SELECT COUNT(*) FROM cancel_test;").await.expect("count");
    assert_eq!(count_res.rows[0][0], CellValue::Integer(0));
}

#[test]
fn test_escape_sql_string_mysql_and_others() {
    let input = "C:\\path\\to\\'file'";
    // MySQL: escapes both ' and \
    let escaped_mysql = escape_sql_string(input, "mysql");
    assert_eq!(escaped_mysql, "C:\\\\path\\\\to\\\\''file''");

    // SQLite: escapes only ', \ is left as literal
    let escaped_sqlite = escape_sql_string(input, "sqlite");
    assert_eq!(escaped_sqlite, "C:\\path\\to\\''file''");

    // Postgres: escapes only ', \ is left as literal
    let escaped_pg = escape_sql_string(input, "postgres");
    assert_eq!(escaped_pg, "C:\\path\\to\\''file''");
}

#[test]
fn test_cell_value_to_sql_literal_binary_hex() {
    use base64::Engine;
    let raw_bytes = vec![0xDE, 0xAD, 0xBE, 0xEF];
    let b64 = base64::engine::general_purpose::STANDARD.encode(&raw_bytes);
    let cell = CellValue::Bytes(b64);

    // SQLite format: X'DEADBEEF'
    assert_eq!(cell_value_to_sql_literal(&cell, "sqlite"), "X'DEADBEEF'");

    // MySQL format: X'DEADBEEF'
    assert_eq!(cell_value_to_sql_literal(&cell, "mysql"), "X'DEADBEEF'");

    // Postgres format: '\xDEADBEEF'::bytea
    assert_eq!(cell_value_to_sql_literal(&cell, "postgres"), "'\\xDEADBEEF'::bytea");
}


// ============================================================================
// Issue #164: Eliminate silent NULL conversions + rejects logging
// ============================================================================

#[test]
fn test_format_sql_literal_rejects_invalid_numeric_and_boolean_no_silent_null() {
    use crate::services::data_transfer::format_sql_literal_with_options;

    // Invalid integer must return Err, NOT "NULL"
    let int_err = format_sql_literal_with_options("not_an_int", Some("INTEGER"), false, "sqlite")
        .expect_err("dirty integer must not silently become NULL");
    assert_eq!(int_err.value, "not_an_int");
    assert_eq!(int_err.expected_type, "INTEGER");

    // Invalid float/decimal must return Err, NOT "NULL"
    let float_err = format_sql_literal_with_options("12.34.56", Some("DECIMAL(10,2)"), false, "postgres")
        .expect_err("dirty float must not silently become NULL");
    assert_eq!(float_err.value, "12.34.56");

    let nan_err = format_sql_literal_with_options("NaN", Some("DOUBLE"), false, "postgres")
        .expect_err("NaN must not silently become NULL");
    assert_eq!(nan_err.value, "NaN");

    // Invalid boolean must return Err, NOT "NULL"
    let bool_err = format_sql_literal_with_options("maybe", Some("BOOLEAN"), false, "postgres")
        .expect_err("dirty boolean must not silently become NULL");
    assert_eq!(bool_err.value, "maybe");

    // Valid values and explicit empty / "NULL" still work
    assert_eq!(
        format_sql_literal_with_options("42", Some("INTEGER"), false, "sqlite").unwrap(),
        "42"
    );
    assert_eq!(
        format_sql_literal_with_options("", Some("INTEGER"), false, "sqlite").unwrap(),
        "NULL"
    );
    assert_eq!(
        format_sql_literal_with_options("NULL", Some("BOOLEAN"), false, "postgres").unwrap(),
        "NULL"
    );
    assert_eq!(
        format_sql_literal_with_options("true", Some("BOOLEAN"), false, "sqlite").unwrap(),
        "1"
    );
    assert_eq!(
        format_sql_literal_with_options("true", Some("BOOLEAN"), false, "postgres").unwrap(),
        "TRUE"
    );
}

#[tokio::test]
async fn test_import_abort_mode_reports_row_and_column_on_dirty_data() {
    let conn = SqliteConnection::open_in_memory().expect("sqlite");
    conn.execute_query("CREATE TABLE typed_items (id INTEGER, price REAL, active INTEGER);")
        .await
        .expect("create table");

    let mut temp_csv = NamedTempFile::new().expect("temp csv");
    writeln!(temp_csv, "id,price,active").unwrap();
    writeln!(temp_csv, "1,10.5,true").unwrap();
    writeln!(temp_csv, "2,bad_float,false").unwrap();
    temp_csv.flush().unwrap();

    let options = ImportOptions {
        file_path: temp_csv.path().to_str().unwrap().to_string(),
        format: TransferFormat::Csv,
        delimiter: Some(','),
        has_headers: true,
        column_mappings: vec![
            ColumnMapping {
                source_column: "id".to_string(),
                target_column: "id".to_string(),
                target_type: Some("INTEGER".to_string()),
            },
            ColumnMapping {
                source_column: "price".to_string(),
                target_column: "price".to_string(),
                target_type: Some("REAL".to_string()),
            },
            ColumnMapping {
                source_column: "active".to_string(),
                target_column: "active".to_string(),
                target_type: Some("BOOLEAN".to_string()),
            },
        ],
        error_policy: ImportErrorPolicy::Abort,
        batch_size: Some(10),
        treat_empty_as_null: None,
        job_id: None,
        import_mode: None,
        chunk_commit_rows: None,
        resume_from_checkpoint: None,
        use_native_copy: None,
    };

    let err = import_data_impl(&conn, "typed_items", &options, "sqlite", None::<fn(TransferProgress)>)
        .await
        .expect_err("abort mode should fail on dirty float");
    let msg = err.to_string();
    assert!(msg.contains("Row 2"), "Expected row 2 in error: {}", msg);
    assert!(msg.contains("price"), "Expected column 'price' in error: {}", msg);
    assert!(msg.contains("bad_float"), "Expected bad value in error: {}", msg);

    // Rolled back — 0 rows inserted
    let cnt = conn.execute_query("SELECT COUNT(*) FROM typed_items;").await.unwrap();
    assert_eq!(cnt.rows[0][0], CellValue::Integer(0));
}

#[tokio::test]
async fn test_import_skip_mode_writes_rejects_csv() {
    let conn = SqliteConnection::open_in_memory().expect("sqlite");
    conn.execute_query("CREATE TABLE typed_skip (id INTEGER, price REAL, active INTEGER);")
        .await
        .expect("create table");

    let dir = tempfile::tempdir().expect("tempdir");
    let csv_path = dir.path().join("dirty.csv");
    std::fs::write(
        &csv_path,
        "id,price,active\n1,10.5,true\nbad_id,20.0,false\n3,30.0,not_bool\n4,40.5,false\n",
    )
    .unwrap();

    let options = ImportOptions {
        file_path: csv_path.to_str().unwrap().to_string(),
        format: TransferFormat::Csv,
        delimiter: Some(','),
        has_headers: true,
        column_mappings: vec![
            ColumnMapping {
                source_column: "id".to_string(),
                target_column: "id".to_string(),
                target_type: Some("INTEGER".to_string()),
            },
            ColumnMapping {
                source_column: "price".to_string(),
                target_column: "price".to_string(),
                target_type: Some("REAL".to_string()),
            },
            ColumnMapping {
                source_column: "active".to_string(),
                target_column: "active".to_string(),
                target_type: Some("BOOLEAN".to_string()),
            },
        ],
        error_policy: ImportErrorPolicy::Skip,
        batch_size: Some(10),
        treat_empty_as_null: None,
        job_id: None,
        import_mode: None,
        chunk_commit_rows: None,
        resume_from_checkpoint: None,
        use_native_copy: None,
    };

    let res = import_data_impl(&conn, "typed_skip", &options, "sqlite", None::<fn(TransferProgress)>)
        .await
        .expect("skip mode should succeed");
    assert_eq!(res.imported_rows, 2);
    assert_eq!(res.skipped_rows, 2);

    let rejects_path = res.rejects_file_path.expect("rejects_file_path should be set");
    assert!(rejects_path.ends_with(".rejects.csv"));
    let rejects_content = std::fs::read_to_string(&rejects_path).expect("read rejects file");
    assert!(rejects_content.contains("row_number,reject_reason,id,price,active"));
    assert!(rejects_content.contains("bad_id"));
    assert!(rejects_content.contains("not_bool"));
}

// ============================================================================
// Issue #167: Transfer job registry, server-side cancellation & progress
// ============================================================================

struct MockCancelConn {
    cancel_called: std::sync::Arc<std::sync::atomic::AtomicBool>,
    query_count: std::sync::Arc<std::sync::atomic::AtomicUsize>,
    fail_on_batch: bool,
}

#[async_trait::async_trait]
impl DatabaseConnection for MockCancelConn {
    async fn test_connection(&self) -> Result<u64, crate::error::AppError> {
        Ok(1)
    }
    async fn execute_query(&self, sql: &str) -> Result<QueryResult, crate::error::AppError> {
        self.query_count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        if self.fail_on_batch && sql.contains("bad_row") {
            return Err(crate::error::AppError::Database("UNIQUE constraint failed".to_string()));
        }
        Ok(QueryResult {
            columns: vec![ColumnMeta::new("id", "INTEGER", false)],
            rows: vec![vec![CellValue::Integer(1)]],
            execution_time_ms: 1,
            rows_affected: Some(1),
        })
    }
    async fn fetch_table_data(
        &self,
        _schema: Option<&str>,
        _table: &str,
        _limit: u32,
        _offset: u32,
        _filter: Option<&str>,
        _sort_col: Option<&str>,
        _sort_dir: Option<&str>,
    ) -> Result<QueryResult, crate::error::AppError> {
        unreachable!()
    }
    async fn fetch_schema_tree(&self) -> Result<Vec<crate::drivers::SchemaNode>, crate::error::AppError> {
        Ok(vec![])
    }
    async fn commit(&self) -> Result<(), crate::error::AppError> {
        Ok(())
    }
    async fn rollback(&self) -> Result<(), crate::error::AppError> {
        Ok(())
    }
    async fn cancel(&self) -> Result<(), crate::error::AppError> {
        self.cancel_called.store(true, std::sync::atomic::Ordering::SeqCst);
        Ok(())
    }
}

#[tokio::test]
async fn test_transfer_job_registry_calls_server_cancel() {
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::Arc;
    use crate::services::data_transfer::{
        cancel_transfer_job, is_transfer_cancelled, register_transfer_job, remove_cancellation_token,
    };

    let cancel_called = Arc::new(AtomicBool::new(false));
    let conn: Arc<dyn DatabaseConnection> = Arc::new(MockCancelConn {
        cancel_called: cancel_called.clone(),
        query_count: Arc::new(AtomicUsize::new(0)),
        fail_on_batch: false,
    });

    let job_id = "job_server_cancel_test";
    register_transfer_job(job_id, conn);
    assert!(!is_transfer_cancelled(job_id));
    assert!(!cancel_called.load(Ordering::SeqCst));

    let found = cancel_transfer_job(job_id).await;
    assert!(found);
    assert!(is_transfer_cancelled(job_id));
    assert!(cancel_called.load(Ordering::SeqCst));

    remove_cancellation_token(job_id);
}

#[tokio::test]
async fn test_export_data_with_progress_emits_events_and_cleans_up_on_cancel() {
    use std::sync::{Arc, Mutex};
    use crate::services::data_transfer::export_data_with_progress_impl;

    let conn = SqliteConnection::open_in_memory().expect("sqlite");
    conn.execute_query("CREATE TABLE exp_prog (id INTEGER, name TEXT);")
        .await
        .unwrap();
    conn.execute_query("INSERT INTO exp_prog VALUES (1, 'a'), (2, 'b');")
        .await
        .unwrap();

    let dir = tempfile::tempdir().unwrap();
    let out_path = dir.path().join("out.csv");
    let out_str = out_path.to_str().unwrap().to_string();

    let events: Arc<Mutex<Vec<TransferProgress>>> = Arc::new(Mutex::new(Vec::new()));
    let events_clone = events.clone();

    let opts = ExportOptions {
        format: TransferFormat::Csv,
        delimiter: Some(','),
        include_headers: true,
        json_structure: None,
        job_id: Some("exp_prog_job".to_string()),
        use_native_copy: None,
    };

    let res = export_data_with_progress_impl(
        &conn,
        "SELECT * FROM exp_prog",
        &out_str,
        &opts,
        Some(move |p: TransferProgress| {
            events_clone.lock().unwrap().push(p);
        }),
    )
    .await
    .expect("export with progress");
    assert_eq!(res.total_rows, 2);

    let captured = events.lock().unwrap();
    assert!(!captured.is_empty());
    let last = captured.last().unwrap();
    assert_eq!(last.status, "done");
    assert_eq!(last.rows_processed, Some(2));
    assert!(last.bytes_written.unwrap_or(0) > 0);
    assert_eq!(last.job_id.as_deref(), Some("exp_prog_job"));

    // Now test partial file cleanup on cancellation
    let cancel_path = dir.path().join("cancelled.csv");
    let cancel_str = cancel_path.to_str().unwrap().to_string();
    let cancel_job = "exp_cancel_cleanup";
    register_cancellation_token(cancel_job);
    trigger_cancellation(cancel_job);

    let cancel_opts = ExportOptions {
        format: TransferFormat::Csv,
        delimiter: Some(','),
        include_headers: true,
        json_structure: None,
        job_id: Some(cancel_job.to_string()),
        use_native_copy: None,
    };
    let err = export_data_with_progress_impl(
        &conn,
        "SELECT * FROM exp_prog",
        &cancel_str,
        &cancel_opts,
        None::<fn(TransferProgress)>,
    )
    .await
    .expect_err("cancelled export must err");
    assert!(err.to_string().contains("cancelled"));
    assert!(
        !cancel_path.exists(),
        "Partially created export file must be removed on cancellation"
    );
}

// ============================================================================
// Issue #170: Multi-mode import, checkpoint/resume, bisect skip, MSSQL clamp
// ============================================================================

#[test]
fn test_clamp_import_batch_size_mssql_vs_other() {
    use crate::services::data_transfer::clamp_import_batch_size;
    assert_eq!(clamp_import_batch_size(Some(2000), "mssql"), 1000);
    assert_eq!(clamp_import_batch_size(Some(1500), "mssql"), 1000);
    assert_eq!(clamp_import_batch_size(Some(500), "mssql"), 500);
    assert_eq!(clamp_import_batch_size(Some(2000), "postgres"), 2000);
    assert_eq!(clamp_import_batch_size(Some(5000), "sqlite"), 2000);
}

#[tokio::test]
async fn test_import_chunked_mode_and_checkpoint_resume() {
    use crate::models::ImportMode;
    use crate::services::transfer_checkpoint::{checkpoint_file_path, save_checkpoint, ImportCheckpoint};

    let conn = SqliteConnection::open_in_memory().expect("sqlite");
    conn.execute_query("CREATE TABLE chunked_t (id INTEGER PRIMARY KEY, val TEXT);")
        .await
        .unwrap();

    let dir = tempfile::tempdir().unwrap();
    let csv_path = dir.path().join("chunked.csv");
    std::fs::write(&csv_path, "id,val\n1,a\n2,b\n3,c\n4,d\n5,e\n").unwrap();

    let options = ImportOptions {
        file_path: csv_path.to_str().unwrap().to_string(),
        format: TransferFormat::Csv,
        delimiter: Some(','),
        has_headers: true,
        column_mappings: vec![
            ColumnMapping {
                source_column: "id".to_string(),
                target_column: "id".to_string(),
                target_type: Some("INTEGER".to_string()),
            },
            ColumnMapping {
                source_column: "val".to_string(),
                target_column: "val".to_string(),
                target_type: Some("TEXT".to_string()),
            },
        ],
        error_policy: ImportErrorPolicy::Abort,
        batch_size: Some(2),
        treat_empty_as_null: None,
        job_id: None,
        import_mode: Some(ImportMode::Chunked),
        chunk_commit_rows: Some(2),
        resume_from_checkpoint: None,
        use_native_copy: None,
    };

    let res = import_data_impl(&conn, "chunked_t", &options, "sqlite", None::<fn(TransferProgress)>)
        .await
        .expect("chunked import");
    assert_eq!(res.imported_rows, 5);
    assert!(
        !checkpoint_file_path(csv_path.to_str().unwrap()).exists(),
        "Checkpoint should be removed on completion"
    );

    // Test resume from checkpoint: simulate 3 rows already committed
    conn.execute_query("DELETE FROM chunked_t WHERE id > 3;").await.unwrap();
    save_checkpoint(
        csv_path.to_str().unwrap(),
        &ImportCheckpoint {
            file_path: csv_path.to_str().unwrap().to_string(),
            table: "chunked_t".to_string(),
            committed_rows: 3,
            imported_rows: 3,
            skipped_rows: 0,
        },
    )
    .unwrap();

    let mut resume_opts = options.clone();
    resume_opts.resume_from_checkpoint = Some(true);
    let res2 = import_data_impl(&conn, "chunked_t", &resume_opts, "sqlite", None::<fn(TransferProgress)>)
        .await
        .expect("resumed import");
    assert_eq!(res2.imported_rows, 5);
    let cnt = conn.execute_query("SELECT COUNT(*) FROM chunked_t;").await.unwrap();
    assert_eq!(cnt.rows[0][0], CellValue::Integer(5));
}

#[tokio::test]
async fn test_import_staging_mode() {
    use crate::models::ImportMode;

    let conn = SqliteConnection::open_in_memory().expect("sqlite");
    conn.execute_query("CREATE TABLE staging_t (id INTEGER PRIMARY KEY, name TEXT);")
        .await
        .unwrap();

    let dir = tempfile::tempdir().unwrap();
    let csv_path = dir.path().join("staging.csv");
    std::fs::write(&csv_path, "id,name\n1,Alice\n2,Bob\n3,Charlie\n").unwrap();

    let options = ImportOptions {
        file_path: csv_path.to_str().unwrap().to_string(),
        format: TransferFormat::Csv,
        delimiter: Some(','),
        has_headers: true,
        column_mappings: vec![
            ColumnMapping {
                source_column: "id".to_string(),
                target_column: "id".to_string(),
                target_type: Some("INTEGER".to_string()),
            },
            ColumnMapping {
                source_column: "name".to_string(),
                target_column: "name".to_string(),
                target_type: Some("TEXT".to_string()),
            },
        ],
        error_policy: ImportErrorPolicy::Abort,
        batch_size: Some(2),
        treat_empty_as_null: None,
        job_id: None,
        import_mode: Some(ImportMode::Staging),
        chunk_commit_rows: None,
        resume_from_checkpoint: None,
        use_native_copy: None,
    };

    let res = import_data_impl(&conn, "staging_t", &options, "sqlite", None::<fn(TransferProgress)>)
        .await
        .expect("staging import");
    assert_eq!(res.imported_rows, 3);
    let cnt = conn.execute_query("SELECT COUNT(*) FROM staging_t;").await.unwrap();
    assert_eq!(cnt.rows[0][0], CellValue::Integer(3));
}

#[tokio::test]
async fn test_import_bisect_skip_isolates_bad_rows_efficiently() {
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::Arc;

    let query_count = Arc::new(AtomicUsize::new(0));
    let conn = MockCancelConn {
        cancel_called: Arc::new(AtomicBool::new(false)),
        query_count: query_count.clone(),
        fail_on_batch: true,
    };

    let dir = tempfile::tempdir().unwrap();
    let csv_path = dir.path().join("bisect.csv");
    let mut csv_body = String::from("id,name\n");
    for i in 1..=32 {
        if i == 17 {
            csv_body.push_str(&format!("{},bad_row\n", i));
        } else {
            csv_body.push_str(&format!("{},ok_{}\n", i, i));
        }
    }
    std::fs::write(&csv_path, csv_body).unwrap();

    let options = ImportOptions {
        file_path: csv_path.to_str().unwrap().to_string(),
        format: TransferFormat::Csv,
        delimiter: Some(','),
        has_headers: true,
        column_mappings: vec![
            ColumnMapping {
                source_column: "id".to_string(),
                target_column: "id".to_string(),
                target_type: Some("INTEGER".to_string()),
            },
            ColumnMapping {
                source_column: "name".to_string(),
                target_column: "name".to_string(),
                target_type: Some("TEXT".to_string()),
            },
        ],
        error_policy: ImportErrorPolicy::Skip,
        batch_size: Some(32),
        treat_empty_as_null: None,
        job_id: None,
        import_mode: None,
        chunk_commit_rows: None,
        resume_from_checkpoint: None,
        use_native_copy: None,
    };

    let res = import_data_impl(&conn, "bisect_t", &options, "sqlite", None::<fn(TransferProgress)>)
        .await
        .expect("bisect skip import");
    assert_eq!(res.imported_rows, 31);
    assert_eq!(res.skipped_rows, 1);

    // Bisect on 32 rows with 1 bad row should execute far fewer than 32 queries (~11 queries)
    let calls = query_count.load(Ordering::SeqCst);
    assert!(
        calls < 20,
        "Bisect should isolate 1 bad row in O(log N) queries, took {} queries",
        calls
    );

    let rejects_path = res.rejects_file_path.expect("rejects file should exist");
    let rejects_content = std::fs::read_to_string(&rejects_path).unwrap();
    assert!(rejects_content.contains("bad_row"));
}

// ============================================================================
// Issue #171: Async on-the-fly Gzip & Zstd compression export/import
// ============================================================================

#[tokio::test]
async fn test_export_and_import_gzip_and_zstd_on_the_fly() {
    let conn = SqliteConnection::open_in_memory().expect("sqlite");
    conn.execute_query("CREATE TABLE comp_src (id INTEGER, label TEXT);")
        .await
        .unwrap();
    conn.execute_query("INSERT INTO comp_src VALUES (1, 'alpha'), (2, 'beta'), (3, 'gamma');")
        .await
        .unwrap();

    conn.execute_query("CREATE TABLE comp_dst_gz (id INTEGER, label TEXT);")
        .await
        .unwrap();
    conn.execute_query("CREATE TABLE comp_dst_zst (id INTEGER, label TEXT);")
        .await
        .unwrap();

    let dir = tempfile::tempdir().unwrap();
    let gz_path = dir.path().join("data.csv.gz");
    let zst_path = dir.path().join("data.csv.zst");

    let gz_opts = ExportOptions {
        format: TransferFormat::Csv,
        delimiter: Some(','),
        include_headers: true,
        json_structure: None,
        job_id: None,
        use_native_copy: None,
    };

    let exp_gz = export_data_impl(&conn, "SELECT * FROM comp_src", gz_path.to_str().unwrap(), &gz_opts)
        .await
        .expect("export .csv.gz");
    assert_eq!(exp_gz.total_rows, 3);
    // Gzip magic bytes 0x1f 0x8b
    let gz_bytes = std::fs::read(&gz_path).unwrap();
    assert!(gz_bytes.starts_with(&[0x1f, 0x8b]));

    let exp_zst = export_data_impl(&conn, "SELECT * FROM comp_src", zst_path.to_str().unwrap(), &gz_opts)
        .await
        .expect("export .csv.zst");
    assert_eq!(exp_zst.total_rows, 3);
    // Zstd magic bytes 0x28 0xb5 0x2f 0xfd
    let zst_bytes = std::fs::read(&zst_path).unwrap();
    assert!(zst_bytes.starts_with(&[0x28, 0xb5, 0x2f, 0xfd]));

    // Preview compressed files directly
    let prev_gz = crate::services::data_transfer::preview_import_file_impl(gz_path.to_str().unwrap(), None)
        .expect("preview gz");
    assert_eq!(prev_gz.headers, vec!["id", "label"]);
    assert_eq!(prev_gz.preview_rows.len(), 3);

    let prev_zst = crate::services::data_transfer::preview_import_file_impl(zst_path.to_str().unwrap(), None)
        .expect("preview zst");
    assert_eq!(prev_zst.headers, vec!["id", "label"]);
    assert_eq!(prev_zst.preview_rows.len(), 3);

    // Import directly from .csv.gz and .csv.zst
    let mappings = vec![
        ColumnMapping {
            source_column: "id".to_string(),
            target_column: "id".to_string(),
            target_type: Some("INTEGER".to_string()),
        },
        ColumnMapping {
            source_column: "label".to_string(),
            target_column: "label".to_string(),
            target_type: Some("TEXT".to_string()),
        },
    ];

    let imp_gz = import_data_impl(
        &conn,
        "comp_dst_gz",
        &ImportOptions {
            file_path: gz_path.to_str().unwrap().to_string(),
            format: TransferFormat::Csv,
            delimiter: Some(','),
            has_headers: true,
            column_mappings: mappings.clone(),
            error_policy: ImportErrorPolicy::Abort,
            batch_size: Some(10),
            treat_empty_as_null: None,
            job_id: None,
            import_mode: None,
            chunk_commit_rows: None,
            resume_from_checkpoint: None,
            use_native_copy: None,
        },
        "sqlite",
        None::<fn(TransferProgress)>,
    )
    .await
    .expect("import .csv.gz");
    assert_eq!(imp_gz.imported_rows, 3);

    let imp_zst = import_data_impl(
        &conn,
        "comp_dst_zst",
        &ImportOptions {
            file_path: zst_path.to_str().unwrap().to_string(),
            format: TransferFormat::Csv,
            delimiter: Some(','),
            has_headers: true,
            column_mappings: mappings,
            error_policy: ImportErrorPolicy::Abort,
            batch_size: Some(10),
            treat_empty_as_null: None,
            job_id: None,
            import_mode: None,
            chunk_commit_rows: None,
            resume_from_checkpoint: None,
            use_native_copy: None,
        },
        "sqlite",
        None::<fn(TransferProgress)>,
    )
    .await
    .expect("import .csv.zst");
    assert_eq!(imp_zst.imported_rows, 3);
}
