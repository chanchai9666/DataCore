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
