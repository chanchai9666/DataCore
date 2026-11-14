use super::audit_logger::*;
use tempfile::tempdir;
use std::fs;

#[test]
fn test_append_only_logging_and_hash_chain() {
    let dir = tempdir().unwrap();
    let logger = AuditLogger::new(dir.path());

    // 1. Initial entry
    let e1 = logger
        .log(AuditLogEntryInput {
            action: "QUERY".to_string(),
            user: Some("alice".to_string()),
            query: Some("SELECT * FROM users;".to_string()),
            status: "SUCCESS".to_string(),
            execution_time_ms: Some(10),
            rows_affected: Some(5),
            ..Default::default()
        })
        .unwrap();

    assert_eq!(e1.prev_hash.as_deref(), Some(GENESIS_HASH));
    assert!(e1.entry_hash.is_some());
    let h1 = e1.entry_hash.clone().unwrap();

    // 2. Second entry must chain to first entry's hash
    let e2 = logger
        .log(AuditLogEntryInput {
            action: "DML".to_string(),
            user: Some("bob".to_string()),
            query: Some("UPDATE users SET name = 'Bob';".to_string()),
            status: "SUCCESS".to_string(),
            execution_time_ms: Some(25),
            rows_affected: Some(1),
            ..Default::default()
        })
        .unwrap();

    assert_eq!(e2.prev_hash.as_deref(), Some(h1.as_str()));
    assert!(e2.entry_hash.is_some());
    let h2 = e2.entry_hash.clone().unwrap();
    assert_ne!(h1, h2);

    // 3. Third entry must chain to second entry's hash
    let e3 = logger
        .log(AuditLogEntryInput {
            action: "DDL".to_string(),
            user: Some("admin".to_string()),
            query: Some("CREATE TABLE logs (id INT);".to_string()),
            status: "SUCCESS".to_string(),
            ..Default::default()
        })
        .unwrap();

    assert_eq!(e3.prev_hash.as_deref(), Some(h2.as_str()));

    // 4. Verification passes
    let integrity = logger.verify_integrity().unwrap();
    assert!(integrity.is_valid);
    assert_eq!(integrity.total_entries, 3);
    assert!(integrity.error.is_none());

    // 5. Query logs (newest first)
    let logs = logger.get_logs(Some(10), Some(0)).unwrap();
    assert_eq!(logs.len(), 3);
    assert_eq!(logs[0].id, e3.id);
    assert_eq!(logs[1].id, e2.id);
    assert_eq!(logs[2].id, e1.id);
}

#[test]
fn test_tamper_detection_on_mutated_field() {
    let dir = tempdir().unwrap();
    let logger = AuditLogger::new(dir.path());

    let _e1 = logger
        .log(AuditLogEntryInput {
            action: "QUERY".to_string(),
            query: Some("SELECT 1;".to_string()),
            status: "SUCCESS".to_string(),
            ..Default::default()
        })
        .unwrap();

    let e2 = logger
        .log(AuditLogEntryInput {
            action: "DML".to_string(),
            query: Some("DELETE FROM accounts;".to_string()),
            status: "SUCCESS".to_string(),
            ..Default::default()
        })
        .unwrap();

    // Verify initially valid
    assert!(logger.verify_integrity().unwrap().is_valid);

    // Tamper with the file: mutate DELETE to SELECT
    let log_path = logger.main_log_path();
    let content = fs::read_to_string(&log_path).unwrap();
    let tampered = content.replace("DELETE FROM accounts;", "SELECT * FROM safe;");
    fs::write(&log_path, tampered).unwrap();

    // Verification must detect the tampering
    let check = logger.verify_integrity().unwrap();
    assert!(!check.is_valid);
    assert!(check.error.unwrap().contains("Tamper detected"));
    assert_eq!(check.tampered_entry_id.as_deref(), Some(e2.id.as_str()));
}

#[test]
fn test_tamper_detection_on_broken_hash_chain() {
    let dir = tempdir().unwrap();
    let logger = AuditLogger::new(dir.path());

    let _e1 = logger
        .log(AuditLogEntryInput {
            action: "CONNECT".to_string(),
            status: "SUCCESS".to_string(),
            ..Default::default()
        })
        .unwrap();

    let e2 = logger
        .log(AuditLogEntryInput {
            action: "QUERY".to_string(),
            query: Some("SELECT 1;".to_string()),
            status: "SUCCESS".to_string(),
            ..Default::default()
        })
        .unwrap();

    // Tamper with prevHash of second entry
    let log_path = logger.main_log_path();
    let content = fs::read_to_string(&log_path).unwrap();
    let fake_hash = "1111111111111111111111111111111111111111111111111111111111111111";
    let lines: Vec<&str> = content.lines().collect();
    let line2_tampered = lines[1].replace(&lines[1][lines[1].find("\"prevHash\":\"").unwrap() + 12..lines[1].find("\"prevHash\":\"").unwrap() + 76], fake_hash);
    let tampered = format!("{}\n{}\n", lines[0], line2_tampered);
    fs::write(&log_path, tampered).unwrap();

    let check = logger.verify_integrity().unwrap();
    assert!(!check.is_valid);
    assert_eq!(check.tampered_entry_id.as_deref(), Some(e2.id.as_str()));
}

#[test]
fn test_log_rotation_when_exceeding_threshold() {
    let dir = tempdir().unwrap();
    // Very small threshold (350 bytes) to trigger rotation after 1-2 entries
    let logger = AuditLogger::with_max_size(dir.path(), 350);

    let e1 = logger
        .log(AuditLogEntryInput {
            action: "QUERY".to_string(),
            query: Some("SELECT a, b, c FROM very_large_table_name_here_to_take_up_bytes;".to_string()),
            status: "SUCCESS".to_string(),
            ..Default::default()
        })
        .unwrap();

    let e2 = logger
        .log(AuditLogEntryInput {
            action: "QUERY".to_string(),
            query: Some("SELECT second_large_query_to_push_file_size_over_limit_threshold;".to_string()),
            status: "SUCCESS".to_string(),
            ..Default::default()
        })
        .unwrap();

    // Third entry triggers rotation because file size exceeds 350 bytes
    let e3 = logger
        .log(AuditLogEntryInput {
            action: "QUERY".to_string(),
            query: Some("SELECT third_query_after_rotation;".to_string()),
            status: "SUCCESS".to_string(),
            ..Default::default()
        })
        .unwrap();

    // Verify rotated file exists
    let rotated = logger.list_rotated_files().unwrap();
    assert!(!rotated.is_empty(), "Should have at least 1 rotated file");

    // The new entry in active file should chain from the rotated entry's hash
    assert_eq!(e3.prev_hash.as_deref(), e2.entry_hash.as_deref());

    // get_logs should retrieve logs across rotated files and active file
    let all_logs = logger.get_logs(Some(10), Some(0)).unwrap();
    assert_eq!(all_logs.len(), 3);
    assert_eq!(all_logs[0].id, e3.id);
    assert_eq!(all_logs[1].id, e2.id);
    assert_eq!(all_logs[2].id, e1.id);
}

#[test]
fn test_clear_logs() {
    let dir = tempdir().unwrap();
    let logger = AuditLogger::new(dir.path());

    logger
        .log(AuditLogEntryInput {
            action: "CONNECT".to_string(),
            status: "SUCCESS".to_string(),
            ..Default::default()
        })
        .unwrap();

    assert_eq!(logger.get_logs(None, None).unwrap().len(), 1);

    logger.clear_logs().unwrap();
    assert_eq!(logger.get_logs(None, None).unwrap().len(), 0);

    // Logging after clear should start with GENESIS_HASH again
    let next_entry = logger
        .log(AuditLogEntryInput {
            action: "QUERY".to_string(),
            status: "SUCCESS".to_string(),
            ..Default::default()
        })
        .unwrap();

    assert_eq!(next_entry.prev_hash.as_deref(), Some(GENESIS_HASH));
}

#[cfg(unix)]
#[test]
fn test_unix_file_permissions_0600() {
    use std::os::unix::fs::PermissionsExt;

    let dir = tempdir().unwrap();
    let logger = AuditLogger::new(dir.path());

    logger
        .log(AuditLogEntryInput {
            action: "CONNECT".to_string(),
            status: "SUCCESS".to_string(),
            ..Default::default()
        })
        .unwrap();

    let meta = fs::metadata(logger.main_log_path()).unwrap();
    let mode = meta.permissions().mode() & 0o777;
    assert_eq!(mode, 0o600, "Log file mode must be 0600 on Unix");
}
