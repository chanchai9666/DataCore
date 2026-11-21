use datacore_lib::drivers::sqlite::{split_sql_statements, SqliteConnection};
use datacore_lib::drivers::traits::{DatabaseConnection, SchemaNodeType};
use datacore_lib::models::connection::{ConnectionConfig, DatabaseDriver};
use datacore_lib::models::query::CellValue;
use datacore_lib::services::path_guard::validate_safe_transfer_path;
use tempfile::tempdir;

#[tokio::test]
async fn real_sqlite_crud_unicode_null_constraints_and_schema() {
    let dir = tempdir().expect("tempdir");
    let db_path = dir.path().join("e2e_crud.db");
    let conn = SqliteConnection::open(db_path.to_str().unwrap()).expect("open sqlite");

    assert!(conn.test_connection().await.is_ok());

    // Create parent + child tables with UNIQUE, NOT NULL, CHECK, and FK ON DELETE CASCADE
    conn.execute_query(
        "PRAGMA foreign_keys = ON;
         CREATE TABLE categories (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             slug TEXT NOT NULL UNIQUE
         );
         CREATE TABLE items (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
             title TEXT NOT NULL,
             note TEXT,
             price REAL CHECK(price >= 0)
         );",
    )
    .await
    .expect("create schema");

    conn.execute_query("INSERT INTO categories (slug) VALUES ('books');")
        .await
        .expect("insert category");

    // 1. Classic NULL vs '' vs 'NULL' + Thai/Emoji/newlines/quotes/backslash
    conn.execute_query(
        "INSERT INTO items (category_id, title, note, price) VALUES
         (1, 'สวัสดี 🚀\n\t''\"\\', NULL, 10.5),
         (1, '', '', 0.0),
         (1, 'NULL', 'NULL', 99.95);",
    )
    .await
    .expect("insert special values");

    let page = conn
        .fetch_table_data(None, "items", 10, 0, None, Some("id"), Some("ASC"))
        .await
        .expect("fetch_table_data");
    assert_eq!(page.rows.len(), 3);
    assert_eq!(page.rows_affected, Some(3));
    assert_eq!(page.rows[0][2], CellValue::Text("สวัสดี 🚀\n\t'\"\\".into()));
    assert_eq!(page.rows[0][3], CellValue::Null);
    assert_eq!(page.rows[1][2], CellValue::Text("".into()));
    assert_eq!(page.rows[1][3], CellValue::Text("".into()));
    assert_eq!(page.rows[2][2], CellValue::Text("NULL".into()));
    assert_eq!(page.rows[2][3], CellValue::Text("NULL".into()));

    // 2. Constraint violations must fail cleanly without corrupting existing data
    assert!(conn
        .execute_query("INSERT INTO categories (slug) VALUES ('books');")
        .await
        .is_err()); // UNIQUE
    assert!(conn
        .execute_query("INSERT INTO items (category_id, title, price) VALUES (1, NULL, 5);")
        .await
        .is_err()); // NOT NULL
    assert!(conn
        .execute_query("INSERT INTO items (category_id, title, price) VALUES (999, 'orphan', 5);")
        .await
        .is_err()); // FK
    assert!(conn
        .execute_query("INSERT INTO items (category_id, title, price) VALUES (1, 'neg', -1);")
        .await
        .is_err()); // CHECK

    // 3. Verify schema tree and DDL retrieval
    let tree = conn.fetch_schema_tree().await.expect("fetch_schema_tree");
    assert_eq!(tree.len(), 1);
    assert!(tree[0]
        .children
        .iter()
        .any(|n| n.name == "items" && n.node_type == SchemaNodeType::Table));

    let ddl = conn
        .get_object_ddl(None, "items", "table")
        .await
        .expect("get_object_ddl");
    assert!(ddl.contains("CREATE TABLE items"));
}

#[tokio::test]
async fn real_sqlite_transaction_commit_and_rollback() {
    let dir = tempdir().expect("tempdir");
    let db_path = dir.path().join("e2e_tx.db");
    let conn = SqliteConnection::open(db_path.to_str().unwrap()).expect("open sqlite");

    conn.execute_query("CREATE TABLE ledger (id INTEGER PRIMARY KEY, amount INTEGER);")
        .await
        .expect("create table");

    // Begin manual transaction -> insert -> rollback
    conn.set_autocommit(false).await.expect("autocommit off");
    conn.execute_query("INSERT INTO ledger (id, amount) VALUES (1, 500);")
        .await
        .expect("insert uncommitted");
    conn.rollback().await.expect("rollback");

    let after_rollback = conn
        .execute_query("SELECT COUNT(*) FROM ledger;")
        .await
        .expect("count after rollback");
    assert_eq!(after_rollback.rows[0][0], CellValue::Integer(0));

    // Insert -> commit
    conn.execute_query("INSERT INTO ledger (id, amount) VALUES (2, 900);")
        .await
        .expect("insert committed");
    conn.commit().await.expect("commit");
    conn.set_autocommit(true).await.expect("autocommit on");

    let after_commit = conn
        .execute_query("SELECT amount FROM ledger WHERE id = 2;")
        .await
        .expect("select after commit");
    assert_eq!(after_commit.rows[0][0], CellValue::Integer(900));
}

#[tokio::test]
async fn real_sqlite_readonly_mode_blocks_writes_and_bypasses() {
    let dir = tempdir().expect("tempdir");
    let db_path = dir.path().join("e2e_ro.db");

    // Seed data first with read-write connection
    {
        let rw = SqliteConnection::open(db_path.to_str().unwrap()).expect("open rw");
        rw.execute_query("CREATE TABLE secrets (id INTEGER PRIMARY KEY, val TEXT); INSERT INTO secrets VALUES (1, 'ok');")
            .await
            .expect("seed");
    }

    let ro_config = ConnectionConfig {
        id: "ro-1".into(),
        name: "Read Only SQLite".into(),
        driver: DatabaseDriver::Sqlite,
        database: db_path.to_string_lossy().into_owned(),
        read_only: Some(true),
        auto_reconnect: Some(false),
        ..Default::default()
    };

    let ro = SqliteConnection::from_config(&ro_config).expect("open ro");
    let read_res = ro
        .execute_query("SELECT val FROM secrets WHERE id = 1;")
        .await
        .expect("select allowed in read-only");
    assert_eq!(read_res.rows[0][0], CellValue::Text("ok".into()));

    // All write & bypass attempts must be rejected
    assert!(ro
        .execute_query("INSERT INTO secrets VALUES (2, 'hack');")
        .await
        .is_err());
    assert!(ro.execute_query("DROP TABLE secrets;").await.is_err());
    assert!(ro.execute_query("PRAGMA query_only = OFF;").await.is_err());
    assert!(ro
        .execute_query("WITH d AS (DELETE FROM secrets) SELECT 1;")
        .await
        .is_err());
}

#[tokio::test]
async fn real_sqlite_sqli_filter_and_path_traversal_guards() {
    let conn = SqliteConnection::open_in_memory().expect("in-memory");
    conn.execute_query("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT); INSERT INTO notes VALUES (1, 'it''s an update');")
        .await
        .expect("seed");

    // Malicious SQLi filters must be rejected
    assert!(conn
        .fetch_table_data(
            None,
            "notes",
            10,
            0,
            Some("1=1; DROP TABLE notes;"),
            None,
            None
        )
        .await
        .is_err());
    assert!(conn
        .fetch_table_data(
            None,
            "notes",
            10,
            0,
            Some("id = 1 UNION SELECT 1, 2"),
            None,
            None
        )
        .await
        .is_err());
    assert!(conn
        .fetch_table_data(None, "notes", 10, 0, Some("body = 'unclosed"), None, None)
        .await
        .is_err());

    // Safe string literal filter containing keyword works
    let safe_res = conn
        .fetch_table_data(
            None,
            "notes",
            10,
            0,
            Some("body = 'it''s an update'"),
            None,
            None,
        )
        .await
        .expect("safe filter");
    assert_eq!(safe_res.rows.len(), 1);

    // Path traversal & sensitive file export paths must be rejected
    assert!(validate_safe_transfer_path("../../../etc/passwd.csv", &["csv"]).is_err());
    assert!(validate_safe_transfer_path("~/.datacore/vault.enc", &["enc"]).is_err());
    assert!(validate_safe_transfer_path(r"\\192.168.1.10\share\out.sql", &["sql"]).is_err());
}

#[test]
fn sql_splitter_preserves_semicolons_in_strings_and_comments() {
    let script = "
        -- comment with ; semicolon
        /* block ; comment */
        INSERT INTO logs (msg) VALUES ('a;b;c');
        SELECT 'done;' AS status;
    ";
    let stmts = split_sql_statements(script);
    assert_eq!(stmts.len(), 2);
    assert!(stmts[0].contains("'a;b;c'"));
    assert!(stmts[1].contains("'done;'"));
}
