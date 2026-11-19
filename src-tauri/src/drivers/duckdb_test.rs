use super::*;
use crate::drivers::traits::{DatabaseConnection, SchemaNodeType};
use crate::models::connection::{ConnectionConfig, DatabaseDriver};
use crate::models::query::CellValue;

fn create_test_config() -> ConnectionConfig {
    ConnectionConfig {
        id: "test-duckdb".to_string(),
        name: "Test DuckDB".to_string(),
        driver: DatabaseDriver::Duckdb,
        host: None,
        port: None,
        database: ":memory:".to_string(),
        user: None,
        folder: None,
        ssl_mode: None,
        ssl_certs: None,
        ssh_tunnel: None,
        timeout_seconds: None,
        auto_reconnect: None,
        environment: None,
        read_only: Some(false),
    }
}

#[tokio::test]
async fn test_duckdb_basic_queries() {
    let config = create_test_config();
    let conn = DuckdbConnection::from_config(&config).expect("Failed to create DuckDB in-memory");

    // test_connection
    assert!(conn.test_connection().await.is_ok());

    // Create table
    let ddl = "CREATE TABLE items (id INTEGER, name VARCHAR, price DOUBLE);";
    let res = conn
        .execute_query(ddl)
        .await
        .expect("Failed to create table");
    assert_eq!(res.rows_affected, Some(0));

    // Insert records
    let insert = "INSERT INTO items VALUES (1, 'Widget', 19.99), (2, 'Gadget', 49.50);";
    let res = conn.execute_query(insert).await.expect("Failed to insert");
    assert_eq!(res.rows_affected, Some(2));

    // Select query
    let select = "SELECT * FROM items ORDER BY id ASC;";
    let res = conn.execute_query(select).await.expect("Failed to select");
    assert_eq!(res.columns.len(), 3);
    assert_eq!(res.rows.len(), 2);
    assert_eq!(res.rows[0][0], CellValue::Integer(1));
    assert_eq!(res.rows[0][1], CellValue::Text("Widget".to_string()));
    assert_eq!(res.rows[1][0], CellValue::Integer(2));
    assert_eq!(res.rows[1][1], CellValue::Text("Gadget".to_string()));
}

#[tokio::test]
async fn test_duckdb_fetch_table_data_pagination() {
    let config = create_test_config();
    let conn = DuckdbConnection::from_config(&config).expect("Failed to create DuckDB in-memory");

    conn.execute_query("CREATE TABLE users (id INT, email VARCHAR);")
        .await
        .unwrap();
    conn.execute_query("INSERT INTO users VALUES (1, 'a@a.com'), (2, 'b@b.com'), (3, 'c@c.com');")
        .await
        .unwrap();

    let page1 = conn
        .fetch_table_data(None, "users", 2, 0, None, Some("id"), Some("ASC"))
        .await
        .unwrap();
    assert_eq!(page1.rows.len(), 2);
    assert_eq!(page1.rows[0][0], CellValue::Integer(1));
    assert_eq!(page1.rows[1][0], CellValue::Integer(2));

    let page2 = conn
        .fetch_table_data(None, "users", 2, 2, None, Some("id"), Some("ASC"))
        .await
        .unwrap();
    assert_eq!(page2.rows.len(), 1);
    assert_eq!(page2.rows[0][0], CellValue::Integer(3));
}

#[tokio::test]
async fn test_duckdb_schema_tree() {
    let config = create_test_config();
    let conn = DuckdbConnection::from_config(&config).expect("Failed to create DuckDB in-memory");

    conn.execute_query("CREATE TABLE products (sku VARCHAR, qty INT);")
        .await
        .unwrap();
    conn.execute_query("CREATE VIEW low_stock AS SELECT * FROM products WHERE qty < 5;")
        .await
        .unwrap();

    let tree = conn
        .fetch_schema_tree()
        .await
        .expect("Failed to fetch schema tree");
    assert_eq!(tree.len(), 1);
    let db_node = &tree[0];
    let children = &db_node.children;

    let has_products = children
        .iter()
        .any(|c| c.name == "products" && c.node_type == SchemaNodeType::Table);
    let has_view = children
        .iter()
        .any(|c| c.name == "low_stock" && c.node_type == SchemaNodeType::View);
    assert!(has_products, "Should contain products table");
    assert!(has_view, "Should contain low_stock view");
}

#[tokio::test]
async fn test_duckdb_read_csv_analytical_query() {
    use std::io::Write;
    let mut temp = tempfile::NamedTempFile::new().unwrap();
    writeln!(temp, "city,population\nBangkok,10500000\nChiangMai,127000").unwrap();

    let config = create_test_config();
    let conn = DuckdbConnection::from_config(&config).expect("Failed to create DuckDB in-memory");

    let path_str = temp.path().to_str().unwrap();
    let sql = format!(
        "SELECT city, population FROM read_csv_auto('{}') ORDER BY population DESC;",
        path_str
    );
    let res = conn
        .execute_query(&sql)
        .await
        .expect("Failed to query CSV directly");
    assert_eq!(res.rows.len(), 2);
    assert_eq!(res.rows[0][0], CellValue::Text("Bangkok".to_string()));
    assert_eq!(res.rows[0][1], CellValue::Integer(10500000));
}

#[tokio::test]
async fn test_duckdb_read_only_blocks_writes() {
    let mut config = create_test_config();
    config.read_only = Some(true);
    let conn = DuckdbConnection::from_config(&config).expect("Failed to create DuckDB in-memory");

    let select_res = conn.execute_query("SELECT 1 AS ok;").await;
    assert!(select_res.is_ok());

    let create_res = conn.execute_query("CREATE TABLE t (id INT);").await;
    assert!(create_res.is_err());
    assert!(create_res.unwrap_err().to_string().contains("read-only"));

    let comment_insert = conn
        .execute_query("-- comment\nINSERT INTO t VALUES (1);")
        .await;
    assert!(comment_insert.is_err());
}

#[tokio::test]
async fn test_duckdb_stream_query_chunks_and_early_stop() {
    use crate::drivers::Chunk;

    let config = create_test_config();
    let conn = DuckdbConnection::from_config(&config).expect("Failed to create DuckDB in-memory");
    conn.execute_query("CREATE TABLE duck_stream (id INTEGER, label VARCHAR);")
        .await
        .expect("create table");

    for i in 1..=15 {
        conn.execute_query(&format!(
            "INSERT INTO duck_stream VALUES ({}, 'row_{}');",
            i, i
        ))
        .await
        .expect("insert");
    }

    let (tx, mut rx) = tokio::sync::mpsc::channel::<Chunk>(2);
    let (outcome_res, chunk_sizes) = tokio::join!(
        conn.stream_query("SELECT id, label FROM duck_stream ORDER BY id;", 4, tx),
        async move {
            let mut sizes = Vec::new();
            while let Some(chunk) = rx.recv().await {
                assert_eq!(chunk.columns.len(), 2);
                sizes.push(chunk.rows.len());
            }
            sizes
        }
    );
    let outcome = outcome_res.expect("duckdb stream_query");
    assert_eq!(outcome.rows_sent, 15);
    assert!(!outcome.stopped_early);
    assert_eq!(chunk_sizes, vec![4, 4, 4, 3]);

    // Early stop
    let (tx2, mut rx2) = tokio::sync::mpsc::channel::<Chunk>(1);
    let (outcome_res2, ()) = tokio::join!(
        conn.stream_query("SELECT id FROM duck_stream ORDER BY id;", 4, tx2),
        async move {
            let first = rx2.recv().await.expect("first chunk");
            assert_eq!(first.rows.len(), 4);
            drop(rx2);
        }
    );
    let outcome2 = outcome_res2.expect("duckdb early stop");
    assert!(outcome2.stopped_early);
    assert!(outcome2.rows_sent < 15);
}
