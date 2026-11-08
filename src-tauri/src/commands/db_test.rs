use tempfile::tempdir;
use crate::commands::db::*;
use crate::models::{CellValue, ConnectionConfig, DatabaseDriver};
use crate::services::connection_store::ConnectionStore;
use crate::session::SessionManager;

#[tokio::test]
async fn test_session_lifecycle() {
    let dir = tempdir().expect("create temp dir");
    let store_file = dir.path().join("connections.json");
    let store = ConnectionStore::new(&store_file);
    let session_mgr = SessionManager::new();

    // 1. Prepare SQLite in-memory connection
    let config = ConnectionConfig {
        id: "conn-sqlite-mem".to_string(),
        name: "Test In-Memory SQLite".to_string(),
        driver: DatabaseDriver::Sqlite,
        host: None,
        port: None,
        database: ":memory:".to_string(),
        user: None,
        folder: None,
    };
    save_connection_impl(&store, &config, None).expect("save connection config");

    // Verify get_connections
    let connections = get_connections_impl(&store).expect("get connections");
    assert_eq!(connections.len(), 1);
    assert_eq!(connections[0].id, "conn-sqlite-mem");

    // 2. Test latency check (test_connection)
    let latency = test_connection_impl(&store, &config, None).await.expect("test connection");
    assert!(latency < 1000);

    // 3. Open dedicated sessions for two tabs: tab-1 and tab-2
    open_session_impl(&store, &session_mgr, "conn-sqlite-mem", "tab-1")
        .await
        .expect("open session tab-1");
    open_session_impl(&store, &session_mgr, "conn-sqlite-mem", "tab-2")
        .await
        .expect("open session tab-2");

    assert_eq!(session_mgr.active_session_count().await, 2);
    assert!(session_mgr.has_session("tab-1").await);
    assert!(session_mgr.has_session("tab-2").await);

    // 4. Verify tab-1 and tab-2 are dedicated handles (isolated in-memory SQLite instances)
    execute_query_impl(
        &session_mgr,
        "tab-1",
        "CREATE TABLE tab1_table (id INTEGER PRIMARY KEY, note TEXT);",
    )
    .await
    .expect("create table in tab-1");

    execute_query_impl(
        &session_mgr,
        "tab-1",
        "INSERT INTO tab1_table (id, note) VALUES (1, 'created in tab 1');",
    )
    .await
    .expect("insert in tab-1");

    let tab1_res = execute_query_impl(&session_mgr, "tab-1", "SELECT id, note FROM tab1_table;")
        .await
        .expect("select tab1_table in tab-1");
    assert_eq!(tab1_res.rows.len(), 1);
    assert_eq!(tab1_res.rows[0][1], CellValue::Text("created in tab 1".to_string()));

    // In tab-2, tab1_table must not exist because tab-2 has its own dedicated handle
    let tab2_check = execute_query_impl(&session_mgr, "tab-2", "SELECT * FROM tab1_table;").await;
    assert!(
        tab2_check.is_err(),
        "tab-2 must have an isolated connection handle, not sharing in-memory SQLite of tab-1"
    );

    // 5. Test pagination (fetch_table_data) on tab-1
    let paged = fetch_table_data_impl(&session_mgr, "tab-1", None, "tab1_table", 10, 0, None, None, None)
        .await
        .expect("fetch table data");
    assert_eq!(paged.rows.len(), 1);
    assert_eq!(paged.rows_affected, Some(1));

    // 5b. Test fetch_table_data with filter
    let filtered_empty = fetch_table_data_impl(&session_mgr, "tab-1", None, "tab1_table", 10, 0, Some("note = 'non-existent'"), None, None)
        .await
        .expect("fetch filtered data");
    assert_eq!(filtered_empty.rows.len(), 0);
    assert_eq!(filtered_empty.rows_affected, Some(0));

    let filtered_match = fetch_table_data_impl(&session_mgr, "tab-1", None, "tab1_table", 10, 0, Some("note LIKE '%created%'"), None, None)
        .await
        .expect("fetch filtered match");
    assert_eq!(filtered_match.rows.len(), 1);
    assert_eq!(filtered_match.rows_affected, Some(1));

    // 5c. Test fetch_table_data with sort
    let sorted_desc = fetch_table_data_impl(&session_mgr, "tab-1", None, "tab1_table", 10, 0, None, Some("id"), Some("DESC"))
        .await
        .expect("fetch sorted data");
    assert_eq!(sorted_desc.rows.len(), 1);

    // 6. Test transaction management (set_autocommit, rollback, commit) on tab-1
    set_autocommit_impl(&session_mgr, "tab-1", false)
        .await
        .expect("disable autocommit");

    execute_query_impl(
        &session_mgr,
        "tab-1",
        "INSERT INTO tab1_table (id, note) VALUES (2, 'to be rolled back');",
    )
    .await
    .expect("insert before rollback");

    rollback_transaction_impl(&session_mgr, "tab-1")
        .await
        .expect("rollback");

    let after_rollback = execute_query_impl(
        &session_mgr,
        "tab-1",
        "SELECT id FROM tab1_table WHERE id = 2;",
    )
    .await
    .expect("query after rollback");
    assert_eq!(after_rollback.rows.len(), 0, "Rolled back row must not exist");

    execute_query_impl(
        &session_mgr,
        "tab-1",
        "INSERT INTO tab1_table (id, note) VALUES (3, 'to be committed');",
    )
    .await
    .expect("insert before commit");

    commit_transaction_impl(&session_mgr, "tab-1")
        .await
        .expect("commit");

    let after_commit = execute_query_impl(
        &session_mgr,
        "tab-1",
        "SELECT id, note FROM tab1_table WHERE id = 3;",
    )
    .await
    .expect("query after commit");
    assert_eq!(after_commit.rows.len(), 1, "Committed row must exist");

    // 7. Test schema tree retrieval
    let schema_tree = get_schema_tree_impl(&store, "conn-sqlite-mem")
        .await
        .expect("get schema tree");
    assert!(!schema_tree.is_empty());

    // 8. Test close session and resource release
    close_session_impl(&session_mgr, "tab-1")
        .await
        .expect("close session tab-1");

    assert!(!session_mgr.has_session("tab-1").await);
    assert_eq!(session_mgr.active_session_count().await, 1);

    // Executing query on closed tab-1 should fail
    let closed_err = execute_query_impl(&session_mgr, "tab-1", "SELECT 1;").await;
    assert!(closed_err.is_err(), "Query on closed tab must fail");

    // tab-2 should still be open
    assert!(session_mgr.has_session("tab-2").await);
    close_session_impl(&session_mgr, "tab-2")
        .await
        .expect("close session tab-2");
    assert_eq!(session_mgr.active_session_count().await, 0);

    // 9. Test delete_connection
    delete_connection_impl(&store, "conn-sqlite-mem").expect("delete connection");
    let after_delete = get_connections_impl(&store).expect("get connections");
    assert_eq!(after_delete.len(), 0);
}

#[tokio::test]
async fn test_command_error_handling_and_cancellation() {
    let dir = tempdir().expect("create temp dir");
    let store_file = dir.path().join("connections.json");
    let store = ConnectionStore::new(&store_file);
    let session_mgr = SessionManager::new();

    // Opening non-existent connection should error
    let open_err = open_session_impl(&store, &session_mgr, "non-existent-id", "tab-x").await;
    assert!(open_err.is_err());

    // Executing query on non-existent tab should error
    let exec_err = execute_query_impl(&session_mgr, "tab-non-existent", "SELECT 1;").await;
    assert!(exec_err.is_err());

    // Cancel on non-existent tab should error
    let cancel_err = cancel_query_impl(&session_mgr, "tab-non-existent").await;
    assert!(cancel_err.is_err());

    // Schema tree on non-existent connection should error
    let schema_err = get_schema_tree_impl(&store, "non-existent-id").await;
    assert!(schema_err.is_err());

    // Test test_connection_impl wrapper with store
    let config = ConnectionConfig {
        id: "mem-test".to_string(),
        name: "Mem Test".to_string(),
        driver: DatabaseDriver::Sqlite,
        host: None,
        port: None,
        database: ":memory:".to_string(),
        user: None,
        folder: None,
    };
    let latency_res = test_connection_impl(&store, &config, None).await;
    assert!(latency_res.is_ok());

    // Cancel on valid tab session succeeds
    store.save_connection(&ConnectionConfig {
        id: "mem-test".to_string(),
        name: "Mem Test".to_string(),
        driver: DatabaseDriver::Sqlite,
        host: None,
        port: None,
        database: ":memory:".to_string(),
        user: None,
        folder: None,
    }, None).unwrap();
    open_session_impl(&store, &session_mgr, "mem-test", "tab-cancel").await.unwrap();
    let cancel_ok = cancel_query_impl(&session_mgr, "tab-cancel").await;
    assert!(cancel_ok.is_ok());
}

#[tokio::test]
async fn test_close_session_performs_explicit_rollback() {
    let dir = tempdir().expect("create temp dir");
    let db_path = dir.path().join("test_rollback_on_close.db");
    let store_file = dir.path().join("connections.json");
    let store = ConnectionStore::new(&store_file);
    let session_mgr = SessionManager::new();

    let config = ConnectionConfig {
        id: "file-db-1".to_string(),
        name: "File SQLite".to_string(),
        driver: DatabaseDriver::Sqlite,
        host: None,
        port: None,
        database: db_path.to_str().unwrap().to_string(),
        user: None,
        folder: None,
    };
    store.save_connection(&config, None).unwrap();

    // 1. Initial setup: create table and insert initial committed row
    open_session_impl(&store, &session_mgr, "file-db-1", "tab-init").await.unwrap();
    execute_query_impl(
        &session_mgr,
        "tab-init",
        "CREATE TABLE accounts (id INTEGER PRIMARY KEY, balance REAL);",
    )
    .await
    .unwrap();
    execute_query_impl(
        &session_mgr,
        "tab-init",
        "INSERT INTO accounts (id, balance) VALUES (1, 100.0);",
    )
    .await
    .unwrap();
    close_session_impl(&session_mgr, "tab-init").await.unwrap();

    // 2. Open tab-work, turn off autocommit (start manual transaction), insert uncommitted row
    open_session_impl(&store, &session_mgr, "file-db-1", "tab-work").await.unwrap();
    set_autocommit_impl(&session_mgr, "tab-work", false).await.unwrap();
    execute_query_impl(
        &session_mgr,
        "tab-work",
        "INSERT INTO accounts (id, balance) VALUES (2, 999.0);",
    )
    .await
    .unwrap();

    // 3. User closes tab-work without explicit commit
    close_session_impl(&session_mgr, "tab-work").await.unwrap();

    // 4. Open tab-verify to check accounts: row 2 must NOT exist because it was rolled back on close
    open_session_impl(&store, &session_mgr, "file-db-1", "tab-verify").await.unwrap();
    let res = execute_query_impl(
        &session_mgr,
        "tab-verify",
        "SELECT id, balance FROM accounts WHERE id = 2;",
    )
    .await
    .unwrap();
    assert_eq!(
        res.rows.len(),
        0,
        "Uncommitted data in tab-work must be automatically rolled back when closing the tab"
    );
    close_session_impl(&session_mgr, "tab-verify").await.unwrap();
}

#[tokio::test]
async fn test_schema_tree_uses_dedicated_connection_independent_of_tab_transactions() {
    let dir = tempdir().expect("create temp dir");
    let db_path = dir.path().join("test_schema_isolated.db");
    let store_file = dir.path().join("connections.json");
    let store = ConnectionStore::new(&store_file);
    let session_mgr = SessionManager::new();

    let config = ConnectionConfig {
        id: "file-db-schema".to_string(),
        name: "Schema File SQLite".to_string(),
        driver: DatabaseDriver::Sqlite,
        host: None,
        port: None,
        database: db_path.to_str().unwrap().to_string(),
        user: None,
        folder: None,
    };
    store.save_connection(&config, None).unwrap();

    // Tab 1 creates table and enters manual transaction
    open_session_impl(&store, &session_mgr, "file-db-schema", "tab-tx").await.unwrap();
    execute_query_impl(
        &session_mgr,
        "tab-tx",
        "CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT);",
    )
    .await
    .unwrap();

    set_autocommit_impl(&session_mgr, "tab-tx", false).await.unwrap();
    execute_query_impl(
        &session_mgr,
        "tab-tx",
        "INSERT INTO customers (id, name) VALUES (1, 'Uncommitted Bob');",
    )
    .await
    .unwrap();

    // Fetching schema tree must succeed on a dedicated metadata connection and not borrow or interfere with tab-tx
    let tree = get_schema_tree_impl(&store, "file-db-schema").await.unwrap();
    assert!(!tree.is_empty());
    let db_node = &tree[0];
    assert!(db_node.children.iter().any(|c| c.name == "customers"));

    // tab-tx can still rollback cleanly
    rollback_transaction_impl(&session_mgr, "tab-tx").await.unwrap();
    close_session_impl(&session_mgr, "tab-tx").await.unwrap();
}

#[tokio::test]
async fn test_connection_impl_uses_stored_keychain_password_when_none_provided() {
    let dir = tempdir().expect("create temp dir");
    let store_file = dir.path().join("connections.json");
    let store = ConnectionStore::new(&store_file);

    let config = ConnectionConfig {
        id: "conn-keychain-lookup-test".to_string(),
        name: "Keychain Lookup Test DB".to_string(),
        driver: DatabaseDriver::Sqlite,
        host: None,
        port: None,
        database: ":memory:".to_string(),
        user: None,
        folder: None,
    };

    // Store connection with password in keychain
    store
        .save_connection(&config, Some("secret_keychain_pwd"))
        .expect("save connection with password");
    assert_eq!(
        store
            .get_password(&config.id)
            .expect("retrieve password")
            .as_deref(),
        Some("secret_keychain_pwd")
    );

    // Call test_connection_impl with password: None -> should retrieve stored password from keychain and succeed
    let latency = test_connection_impl(&store, &config, None)
        .await
        .expect("test connection with password: None");
    assert!(latency < 1000);

    // Also verify with password: Some("") (empty string)
    let latency_empty = test_connection_impl(&store, &config, Some(""))
        .await
        .expect("test connection with empty password");
    assert!(latency_empty < 1000);

    // Clean up
    let _ = store.delete_connection(&config.id);
}

#[tokio::test]
async fn test_disconnect_connection_teardown_all_sessions() {
    let dir = tempdir().expect("create temp dir");
    let store_file = dir.path().join("connections.json");
    let store = ConnectionStore::new(&store_file);
    let session_mgr = SessionManager::new();

    let config1 = ConnectionConfig {
        id: "conn-1".to_string(),
        name: "Conn 1".to_string(),
        driver: DatabaseDriver::Sqlite,
        host: None,
        port: None,
        database: ":memory:".to_string(),
        user: None,
        folder: None,
    };
    let config2 = ConnectionConfig {
        id: "conn-2".to_string(),
        name: "Conn 2".to_string(),
        driver: DatabaseDriver::Sqlite,
        host: None,
        port: None,
        database: ":memory:".to_string(),
        user: None,
        folder: None,
    };

    store.save_connection(&config1, None).expect("save conn 1");
    store.save_connection(&config2, None).expect("save conn 2");

    // Open two sessions under conn-1 and one session under conn-2
    open_session_impl(&store, &session_mgr, "conn-1", "tab-1a")
        .await
        .expect("open 1a");
    open_session_impl(&store, &session_mgr, "conn-1", "tab-1b")
        .await
        .expect("open 1b");
    open_session_impl(&store, &session_mgr, "conn-2", "tab-2a")
        .await
        .expect("open 2a");

    assert_eq!(session_mgr.active_session_count().await, 3);
    assert!(session_mgr.has_session("tab-1a").await);
    assert!(session_mgr.has_session("tab-1b").await);
    assert!(session_mgr.has_session("tab-2a").await);

    // Disconnect conn-1
    let closed_count = disconnect_connection_impl(&session_mgr, "conn-1")
        .await
        .expect("disconnect conn-1");
    assert_eq!(closed_count, 2);

    // Verify conn-1 sessions are gone, conn-2 session remains
    assert!(!session_mgr.has_session("tab-1a").await);
    assert!(!session_mgr.has_session("tab-1b").await);
    assert!(session_mgr.has_session("tab-2a").await);
    assert_eq!(session_mgr.active_session_count().await, 1);
}
