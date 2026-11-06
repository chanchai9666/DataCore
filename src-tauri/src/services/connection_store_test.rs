use crate::models::{ConnectionConfig, DatabaseDriver};
use crate::services::connection_store::ConnectionStore;
use crate::services::keychain;
use std::fs;
use tempfile::tempdir;

#[test]
fn test_connection_storage_and_keychain_isolation() {
    let dir = tempdir().expect("create temp dir");
    let config_file = dir.path().join("connections.json");

    let store = ConnectionStore::new(&config_file);

    let conn1 = ConnectionConfig {
        id: "conn-pg-1".to_string(),
        name: "Production Postgres".to_string(),
        driver: DatabaseDriver::Postgres,
        host: Some("127.0.0.1".to_string()),
        port: Some(5432),
        database: "mydb".to_string(),
        user: Some("postgres".to_string()),
        folder: Some("Production".to_string()),
    };

    let secret_password = "super_secret_pw_123";

    // 1. Save connection with password
    store
        .save_connection(&conn1, Some(secret_password))
        .expect("save connection config");

    // 2. Verify JSON file does not contain password
    let json_content = fs::read_to_string(&config_file).expect("read connections json");
    assert!(
        !json_content.contains(secret_password),
        "Password must not be stored in plain text in JSON"
    );
    assert!(
        !json_content.contains("\"password\""),
        "JSON structure must not contain a password field"
    );
    assert!(json_content.contains("Production Postgres"));
    assert!(json_content.contains("conn-pg-1"));

    // 3. Verify Keychain returns password
    let retrieved_password = keychain::get_password(&conn1.id).expect("get password");
    assert_eq!(retrieved_password.as_deref(), Some(secret_password));

    // Also via store helper
    let store_pwd = store.get_password(&conn1.id).expect("store get password");
    assert_eq!(store_pwd.as_deref(), Some(secret_password));

    // 4. Verify list returns saved connection
    let connections = store.list().expect("list connections");
    assert_eq!(connections.len(), 1);
    assert_eq!(connections[0], conn1);

    // 5. Test SQLite connection without password
    let conn2 = ConnectionConfig {
        id: "conn-sqlite-1".to_string(),
        name: "Local SQLite DB".to_string(),
        driver: DatabaseDriver::Sqlite,
        host: None,
        port: None,
        database: "/tmp/test.db".to_string(),
        user: None,
        folder: None,
    };
    store
        .save_connection(&conn2, None)
        .expect("save sqlite connection");

    let connections = store.list().expect("list connections after adding sqlite");
    assert_eq!(connections.len(), 2);
    let sqlite_pwd = keychain::get_password(&conn2.id).expect("get sqlite password");
    assert_eq!(sqlite_pwd, None);

    // 6. Test delete connection removes both JSON entry and keychain password
    store
        .delete_connection(&conn1.id)
        .expect("delete connection");
    let connections_after_delete = store.list().expect("list connections after delete");
    assert_eq!(connections_after_delete.len(), 1);
    assert_eq!(connections_after_delete[0].id, conn2.id);

    let deleted_pwd = keychain::get_password(&conn1.id).expect("get deleted password");
    assert_eq!(
        deleted_pwd, None,
        "Password should be removed from keychain upon deletion"
    );
}

#[test]
fn test_connection_storage_update_existing() {
    let dir = tempdir().expect("create temp dir");
    let config_file = dir.path().join("connections.json");

    let store = ConnectionStore::new(&config_file);

    let mut conn = ConnectionConfig {
        id: "conn-update-1".to_string(),
        name: "Old Name".to_string(),
        driver: DatabaseDriver::Mysql,
        host: Some("localhost".to_string()),
        port: Some(3306),
        database: "store_db".to_string(),
        user: Some("root".to_string()),
        folder: None,
    };

    store
        .save_connection(&conn, Some("pass1"))
        .expect("initial save");
    assert_eq!(
        store.get_password(&conn.id).expect("pwd").as_deref(),
        Some("pass1")
    );

    // Update name and password
    conn.name = "Updated MySQL Name".to_string();
    store
        .save_connection(&conn, Some("pass2"))
        .expect("update save");

    let loaded = store.get(&conn.id).expect("get connection").expect("exists");
    assert_eq!(loaded.name, "Updated MySQL Name");
    assert_eq!(
        store.get_password(&conn.id).expect("pwd").as_deref(),
        Some("pass2")
    );

    let list = store.list().expect("list");
    assert_eq!(list.len(), 1);
}
