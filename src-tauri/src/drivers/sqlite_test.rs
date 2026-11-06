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
    assert_eq!(result.columns[1].name, "name");
    assert_eq!(result.columns[2].name, "age");
    assert_eq!(result.columns[3].name, "bio");
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
    let paged = conn.fetch_table_data(None, "users", 2, 1).await.expect("fetch table data with pagination");
    assert_eq!(paged.rows.len(), 2);
    assert_eq!(paged.rows[0][0], CellValue::Integer(2));
    assert_eq!(paged.rows[1][0], CellValue::Integer(3));

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

    // Test blob and float insertion & extraction
    conn.execute_query("CREATE TABLE sensor_data (id INTEGER PRIMARY KEY, value REAL, raw_bytes BLOB);").await.expect("create sensor table");
    conn.execute_query("INSERT INTO sensor_data (id, value, raw_bytes) VALUES (1, 3.14159, X'DEADBEEF');").await.expect("insert blob");
    let sensor_res = conn.execute_query("SELECT id, value, raw_bytes FROM sensor_data WHERE id = 1;").await.expect("query sensor");
    assert_eq!(sensor_res.rows.len(), 1);
    match sensor_res.rows[0][1] {
        CellValue::Float(f) => assert!((f - 3.14159).abs() < 1e-5),
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
