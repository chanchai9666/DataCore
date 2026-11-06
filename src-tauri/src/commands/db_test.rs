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
    let latency = test_connection_impl(&config, None).await.expect("test connection");
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
    let paged = fetch_table_data_impl(&session_mgr, "tab-1", None, "tab1_table", 10, 0)
        .await
        .expect("fetch table data");
    assert_eq!(paged.rows.len(), 1);

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
    let schema_tree = get_schema_tree_impl(&store, &session_mgr, "conn-sqlite-mem")
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
    let schema_err = get_schema_tree_impl(&store, &session_mgr, "non-existent-id").await;
    assert!(schema_err.is_err());

    // Test direct test_connection command wrapper
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
    let latency_res = test_connection(config, None).await;
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
