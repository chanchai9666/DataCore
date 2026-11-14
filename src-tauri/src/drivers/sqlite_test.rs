use crate::drivers::{DatabaseConnection, SqliteConnection};
use crate::models::query::CellValue;

#[tokio::test]
async fn test_sqlite_query_execution() {
    let conn = SqliteConnection::open_in_memory().expect("open sqlite in memory");

    // Create test table
    let ddl = "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER, bio TEXT);";
    let res = conn.execute_query(ddl).await.expect("execute create table");
    assert_eq!(res.rows_affected, Some(0));

    // Insert records: text, number, null
    conn.execute_query("INSERT INTO users (id, name, age, bio) VALUES (1, 'Alice', 30, 'Engineer');").await.expect("insert alice");
    conn.execute_query("INSERT INTO users (id, name, age, bio) VALUES (2, 'Bob', NULL, NULL);").await.expect("insert bob");
    conn.execute_query("INSERT INTO users (id, name, age, bio) VALUES (3, 'Charlie', 25, 'Designer');").await.expect("insert charlie");

    // Query all records
    let result = conn.execute_query("SELECT id, name, age, bio FROM users ORDER BY id;").await.expect("select all users");
    assert_eq!(result.columns.len(), 4);
    assert_eq!(result.columns[0].name, "id");
    assert_eq!(result.columns[0].data_type, "INTEGER");
    assert_eq!(result.columns[1].name, "name");
    assert_eq!(result.columns[1].data_type, "TEXT");
    assert_eq!(result.columns[2].name, "age");
    assert_eq!(result.columns[2].data_type, "INTEGER");
    assert_eq!(result.columns[3].name, "bio");
    assert_eq!(result.columns[3].data_type, "TEXT");
    assert_eq!(result.rows.len(), 3);

    // Row 1
    assert_eq!(result.rows[0][0], CellValue::Integer(1));
    assert_eq!(result.rows[0][1], CellValue::Text("Alice".to_string()));
    assert_eq!(result.rows[0][2], CellValue::Integer(30));
    assert_eq!(result.rows[0][3], CellValue::Text("Engineer".to_string()));

    // Row 2 with Null
    assert_eq!(result.rows[1][0], CellValue::Integer(2));
    assert_eq!(result.rows[1][1], CellValue::Text("Bob".to_string()));
    assert_eq!(result.rows[1][2], CellValue::Null);
    assert_eq!(result.rows[1][3], CellValue::Null);

    // Test fetch_table_data with limit and offset (Pagination)
    let paged = conn.fetch_table_data(None, "users", 2, 1, None, None, None).await.expect("fetch table data with pagination");
    assert_eq!(paged.rows.len(), 2);
    assert_eq!(paged.rows[0][0], CellValue::Integer(2));
    assert_eq!(paged.rows[1][0], CellValue::Integer(3));
    assert_eq!(paged.rows_affected, Some(3)); // Total rows count

    // Test fetch_table_data with filter
    let filtered = conn.fetch_table_data(None, "users", 10, 0, Some("name = 'Bob'"), None, None).await.expect("filter table data");
    assert_eq!(filtered.rows.len(), 1);
    assert_eq!(filtered.rows[0][1], CellValue::Text("Bob".to_string()));
    assert_eq!(filtered.rows_affected, Some(1));

    // Test fetch_table_data with ORDER BY ASC and DESC
    let sorted_desc = conn.fetch_table_data(None, "users", 10, 0, None, Some("id"), Some("DESC")).await.expect("sort table data DESC");
    assert_eq!(sorted_desc.rows.len(), 3);
    assert_eq!(sorted_desc.rows[0][0], CellValue::Integer(3));
    assert_eq!(sorted_desc.rows[2][0], CellValue::Integer(1));

    let sorted_asc = conn.fetch_table_data(None, "users", 10, 0, None, Some("id"), Some("ASC")).await.expect("sort table data ASC");
    assert_eq!(sorted_asc.rows.len(), 3);
    assert_eq!(sorted_asc.rows[0][0], CellValue::Integer(1));
    assert_eq!(sorted_asc.rows[2][0], CellValue::Integer(3));

    // Test fetch_table_data on empty table returns column metadata
    conn.execute_query("CREATE TABLE empty_sample (id INTEGER PRIMARY KEY, note TEXT);").await.expect("create empty table");
    let empty_data = conn.fetch_table_data(None, "empty_sample", 10, 0, None, None, None).await.expect("fetch empty table");
    assert_eq!(empty_data.rows.len(), 0);
    assert_eq!(empty_data.columns.len(), 2);
    assert_eq!(empty_data.columns[0].name, "id");
    assert_eq!(empty_data.columns[1].name, "note");
    conn.execute_query("DROP TABLE empty_sample;").await.expect("drop empty table");

    // Test latency
    let latency = conn.test_connection().await.expect("test latency");
    assert!(latency < 1000);

    // Test fetch_schema_tree with table and view
    conn.execute_query("CREATE VIEW v_active_users AS SELECT id, name FROM users WHERE age > 20;").await.expect("create view");
    let tree = conn.fetch_schema_tree().await.expect("fetch schema tree");
    assert!(!tree.is_empty());
    let db_node = &tree[0];
    assert_eq!(db_node.name, "main");
    assert_eq!(db_node.children.len(), 2);
    let table_node = db_node.children.iter().find(|c| c.name == "users").expect("users table in tree");
    assert_eq!(table_node.node_type, crate::drivers::SchemaNodeType::Table);
    let view_node = db_node.children.iter().find(|c| c.name == "v_active_users").expect("view in tree");
    assert_eq!(view_node.node_type, crate::drivers::SchemaNodeType::View);

    // Test expression query with undeclared type fallback to TEXT
    let expr_res = conn.execute_query("SELECT 1 + 1 AS calc;").await.expect("query expression");
    assert_eq!(expr_res.columns[0].name, "calc");
    assert_eq!(expr_res.columns[0].data_type, "TEXT");

    // Test blob and float insertion & extraction
    conn.execute_query("CREATE TABLE sensor_data (id INTEGER PRIMARY KEY, value REAL, raw_bytes BLOB);").await.expect("create sensor table");
    conn.execute_query("INSERT INTO sensor_data (id, value, raw_bytes) VALUES (1, 3.14159, X'DEADBEEF');").await.expect("insert blob");
    let sensor_res = conn.execute_query("SELECT id, value, raw_bytes FROM sensor_data WHERE id = 1;").await.expect("query sensor");
    assert_eq!(sensor_res.rows.len(), 1);
    match sensor_res.rows[0][1] {
        CellValue::Float(f) => assert!((f - std::f64::consts::PI).abs() < 1e-4),
        ref other => panic!("expected float, got {:?}", other),
    }
    match &sensor_res.rows[0][2] {
        CellValue::Bytes(b64) => {
            use base64::Engine;
            let decoded = base64::engine::general_purpose::STANDARD.decode(b64).expect("decode base64");
            assert_eq!(decoded, vec![0xDE, 0xAD, 0xBE, 0xEF]);
        }
        ref other => panic!("expected bytes, got {:?}", other),
    }

    // Test error handling
    let err_res = conn.execute_query("SELECT * FROM invalid_table_xyz;").await;
    assert!(err_res.is_err());

    // Test transaction commit & rollback
    conn.execute_query("BEGIN TRANSACTION;").await.expect("begin tx 1");
    conn.execute_query("INSERT INTO users (id, name) VALUES (4, 'Dave');").await.expect("insert dave");
    conn.rollback().await.expect("rollback");
    let after_rollback = conn.execute_query("SELECT * FROM users WHERE id = 4;").await.expect("check rollback");
    assert_eq!(after_rollback.rows.len(), 0);

    conn.execute_query("BEGIN TRANSACTION;").await.expect("begin tx 2");
    conn.execute_query("INSERT INTO users (id, name) VALUES (5, 'Eve');").await.expect("insert eve");
    conn.commit().await.expect("commit");
    let after_commit = conn.execute_query("SELECT * FROM users WHERE id = 5;").await.expect("check commit");
    assert_eq!(after_commit.rows.len(), 1);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_sqlite_query_cancellation() {
    let conn = SqliteConnection::open_in_memory().expect("open sqlite");
    let conn_clone = conn.clone();

    // Spawn a long-running recursive query
    let handle = tokio::spawn(async move {
        conn_clone
            .execute_query("WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM cnt) SELECT count(*) FROM cnt;")
            .await
    });

    // Brief delay to ensure query execution has begun
    tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

    // Interrupt/cancel the query
    conn.cancel().await.expect("cancel call succeeds");

    // Execution should be aborted and return an error
    let res = handle.await.expect("task join");
    assert!(res.is_err(), "query should be cancelled and return error");
    let err_str = res.unwrap_err().to_string();
    assert!(
        err_str.to_lowercase().contains("interrupt") || err_str.to_lowercase().contains("interrupted"),
        "error should mention interrupt, got: {}",
        err_str
    );
}

#[tokio::test]
async fn test_sqlite_multi_statement_script_execution() {
    let conn = SqliteConnection::open_in_memory().expect("open sqlite");

    // Execute multi-statement migration (e.g. table rebuild)
    let multi_sql = r#"
        CREATE TABLE original (id INTEGER PRIMARY KEY, title TEXT);
        INSERT INTO original VALUES (1, 'First'), (2, 'Second');
        CREATE TABLE rebuilt (id INTEGER PRIMARY KEY, title TEXT, is_done INT DEFAULT 0);
        INSERT INTO rebuilt (id, title) SELECT id, title FROM original;
        DROP TABLE original;
        ALTER TABLE rebuilt RENAME TO original;
    "#;

    conn.execute_query(multi_sql).await.expect("execute multi statement script");

    let result = conn.execute_query("SELECT id, title, is_done FROM original ORDER BY id;").await.expect("select after rebuild");
    assert_eq!(result.rows.len(), 2);
    assert_eq!(result.rows[0][1], CellValue::Text("First".to_string()));
    assert_eq!(result.rows[1][1], CellValue::Text("Second".to_string()));
}

#[tokio::test]
async fn test_sqlite_table_filter_sanitization() {
    let conn = SqliteConnection::open_in_memory().expect("open sqlite in memory");
    conn.execute_query("CREATE TABLE test_filter (id INTEGER PRIMARY KEY, name TEXT, updated_at TEXT);")
        .await
        .expect("create test table");
    conn.execute_query("INSERT INTO test_filter (id, name, updated_at) VALUES (1, 'Alice', '2026-01-01');")
        .await
        .expect("insert row 1");
    conn.execute_query("INSERT INTO test_filter (id, name, updated_at) VALUES (2, 'Bob', '2026-01-02');")
        .await
        .expect("insert row 2");

    // 1. Valid filters with identifiers containing keywords as substrings (e.g. updated_at contains UPDATE)
    let valid_res = conn
        .fetch_table_data(None, "test_filter", 10, 0, Some("updated_at IS NOT NULL"), None, None)
        .await;
    assert!(valid_res.is_ok(), "valid filter on updated_at should succeed");
    assert_eq!(valid_res.unwrap().rows.len(), 2);

    let valid_res2 = conn
        .fetch_table_data(None, "test_filter", 10, 0, Some("name = 'Alice' AND id = 1"), None, None)
        .await;
    assert!(valid_res2.is_ok(), "valid standard filter should succeed");
    assert_eq!(valid_res2.unwrap().rows.len(), 1);

    // 2. Dangerous SQL injection and stacked query patterns
    let dangerous_filters = vec![
        "id = 1; DROP TABLE test_filter",
        "id = 1; SELECT 1",
        "id = 1 -- comment",
        "id = 1 /* block comment */",
        "id = 1 */",
        "id = 1 UNION SELECT 1, 2, 3",
        "id = 1 union select null, null, null",
        "1=1 DROP TABLE test_filter",
        "1=1 drop table test_filter",
        "1=1 INSERT INTO test_filter VALUES (3, 'Eve', '2026-01-03')",
        "1=1 insert into test_filter VALUES (3, 'Eve', '2026-01-03')",
        "1=1 UPDATE test_filter SET name = 'Mallory'",
        "1=1 update test_filter SET name = 'Mallory'",
        "1=1 DELETE FROM test_filter",
        "1=1 delete from test_filter",
        "1=1 ALTER TABLE test_filter ADD COLUMN evil TEXT",
        "1=1 alter table test_filter ADD COLUMN evil TEXT",
        "1=1 TRUNCATE TABLE test_filter",
        "1=1 truncate table test_filter",
        "1=1 EXEC sp_executesql",
        "1=1 exec sp_executesql",
    ];

    for dangerous in dangerous_filters {
        let res = conn
            .fetch_table_data(None, "test_filter", 10, 0, Some(dangerous), None, None)
            .await;
        assert!(
            res.is_err(),
            "filter '{}' should be rejected as insecure",
            dangerous
        );
        let err = res.unwrap_err();
        let err_msg = err.to_string();
        assert!(
            err_msg.contains("Invalid or insecure filter clause detected"),
            "error for '{}' should contain expected message, got: {}",
            dangerous,
            err_msg
        );
    }
}

#[tokio::test]
async fn test_sqlite_read_only_mode_blocks_writes() {
    use crate::models::connection::{ConnectionConfig, DatabaseDriver};

    let config = ConnectionConfig {
        id: "ro-test".to_string(),
        name: "Read-Only SQLite".to_string(),
        driver: DatabaseDriver::Sqlite,
        host: None,
        port: None,
        database: ":memory:".to_string(),
        user: None,
        folder: None,
        ssl_mode: None,
        ssl_certs: None,
        ssh_tunnel: None,
        timeout_seconds: None,
        auto_reconnect: Some(true),
        environment: Some("production".to_string()),
        read_only: Some(true),
    };

    let conn = SqliteConnection::from_config(&config).expect("create read-only sqlite connection");

    // Read query should succeed
    let res = conn.execute_query("SELECT 42 as num;").await.expect("read query must succeed");
    assert_eq!(res.rows.len(), 1);
    assert_eq!(res.rows[0][0], CellValue::Integer(42));

    // Write operations must fail due to PRAGMA query_only = ON;
    let write_res = conn.execute_query("CREATE TABLE blocked (id INT);").await;
    assert!(write_res.is_err(), "write operation must be blocked in read-only mode");
    let err_str = write_res.err().unwrap().to_string();
    assert!(
        err_str.to_lowercase().contains("readonly") || err_str.to_lowercase().contains("read-only"),
        "error should indicate readonly violation, got: {}",
        err_str
    );
}
