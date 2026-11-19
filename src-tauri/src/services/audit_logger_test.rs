use super::audit_logger::*;
use std::fs;
use tempfile::tempdir;

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
    let line2_tampered = lines[1].replace(
        &lines[1][lines[1].find("\"prevHash\":\"").unwrap() + 12
            ..lines[1].find("\"prevHash\":\"").unwrap() + 76],
        fake_hash,
    );
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
            query: Some(
                "SELECT a, b, c FROM very_large_table_name_here_to_take_up_bytes;".to_string(),
            ),
            status: "SUCCESS".to_string(),
            ..Default::default()
        })
        .unwrap();

    let e2 = logger
        .log(AuditLogEntryInput {
            action: "QUERY".to_string(),
            query: Some(
                "SELECT second_large_query_to_push_file_size_over_limit_threshold;".to_string(),
            ),
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

#[test]
fn test_redact_sensitive_sql_patterns() {
    assert_eq!(
        redact_sensitive_sql("CREATE USER 'app'@'%' IDENTIFIED BY 'MySecret123';"),
        "CREATE USER 'app'@'%' IDENTIFIED BY '[REDACTED]';"
    );
    assert_eq!(
        redact_sensitive_sql("ALTER USER alice WITH PASSWORD 'MySecret123';"),
        "ALTER USER alice WITH PASSWORD '[REDACTED]';"
    );
    assert_eq!(
        redact_sensitive_sql("ALTER USER alice PASSWORD 'MySecret123';"),
        "ALTER USER alice PASSWORD '[REDACTED]';"
    );
    assert_eq!(
        redact_sensitive_sql("SET PASSWORD = 'MySecret123';"),
        "SET PASSWORD = '[REDACTED]';"
    );
    assert_eq!(
        redact_sensitive_sql(
            "CREATE USER 'bob' IDENTIFIED WITH mysql_native_password BY 'pass456';"
        ),
        "CREATE USER 'bob' IDENTIFIED WITH mysql_native_password BY '[REDACTED]';"
    );
    assert_eq!(
        redact_sensitive_sql("SELECT * FROM users WHERE name = 'Alice';"),
        "SELECT * FROM users WHERE name = 'Alice';"
    );
}

#[test]
fn test_audit_logger_redacts_passwords_automatically() {
    let dir = tempdir().unwrap();
    let logger = AuditLogger::new(dir.path());

    let entry = logger
        .log(AuditLogEntryInput {
            action: "USER_MGMT".to_string(),
            query: Some("CREATE USER 'app'@'%' IDENTIFIED BY 'SuperSecretPassword!';".to_string()),
            status: "SUCCESS".to_string(),
            ..Default::default()
        })
        .unwrap();

    assert_eq!(
        entry.query.as_deref(),
        Some("CREATE USER 'app'@'%' IDENTIFIED BY '[REDACTED]';")
    );
    assert!(!entry
        .details
        .as_ref()
        .unwrap()
        .contains("SuperSecretPassword!"));
    assert!(entry.details.as_ref().unwrap().contains("[REDACTED]"));

    // Ensure raw file on disk also does not contain plaintext password
    let disk_content = fs::read_to_string(logger.main_log_path()).unwrap();
    assert!(!disk_content.contains("SuperSecretPassword!"));
    assert!(disk_content.contains("[REDACTED]"));
}

#[test]
fn test_hmac_prevents_unkeyed_rehash_forgery() {
    let dir = tempdir().unwrap();
    let logger = AuditLogger::new(dir.path());

    let e1 = logger
        .log(AuditLogEntryInput {
            action: "QUERY".to_string(),
            query: Some("DROP TABLE secrets;".to_string()),
            status: "SUCCESS".to_string(),
            ..Default::default()
        })
        .unwrap();

    // Attacker modifies query and recomputes unkeyed SHA-256 hash without HMAC key
    let mut forged = e1.clone();
    forged.query = Some("SELECT 1;".to_string());
    let forged_hash = compute_entry_hash(
        forged.prev_hash.as_deref().unwrap_or(GENESIS_HASH),
        &forged.timestamp,
        &forged.action,
        forged.details.as_deref().unwrap_or(""),
    );
    forged.entry_hash = Some(forged_hash);

    fs::write(
        logger.main_log_path(),
        format!("{}\n", serde_json::to_string(&forged).unwrap()),
    )
    .unwrap();

    let check = logger.verify_integrity().unwrap();
    assert!(!check.is_valid);
    assert_eq!(check.tampered_entry_id.as_deref(), Some(e1.id.as_str()));
}

#[test]
fn test_missing_hmac_key_fails_closed() {
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

    // Key is stored outside log_dir
    assert!(!logger.hmac_key_path().starts_with(dir.path()));
    assert!(logger.hmac_key_path().exists());

    // Delete HMAC key -> verification must fail-closed
    fs::remove_file(logger.hmac_key_path()).unwrap();
    let check = logger.verify_integrity().unwrap();
    assert!(!check.is_valid);
    assert!(check.error.unwrap().contains("HMAC key missing"));
}

#[test]
fn test_legacy_sha256_plus_new_hmac_entries_verify_passes() {
    let dir = tempdir().unwrap();
    let logger = AuditLogger::new(dir.path());

    let legacy_ts = "2026-11-18T10:00:00Z".to_string();
    let legacy_details = "query=SELECT 1;;status=SUCCESS".to_string();
    let legacy_hash = compute_entry_hash(GENESIS_HASH, &legacy_ts, "QUERY", &legacy_details);
    let legacy_entry = AuditLogEntry {
        id: "audit-legacy-1".to_string(),
        timestamp: legacy_ts,
        action: "QUERY".to_string(),
        user: None,
        connection_id: None,
        connection_name: None,
        database: None,
        query: Some("SELECT 1;".to_string()),
        execution_time_ms: Some(2),
        rows_affected: Some(1),
        status: "SUCCESS".to_string(),
        error_message: None,
        details: Some(legacy_details),
        prev_hash: Some(GENESIS_HASH.to_string()),
        entry_hash: Some(legacy_hash),
        hash_algo: None,
    };

    fs::write(
        logger.main_log_path(),
        format!("{}\n", serde_json::to_string(&legacy_entry).unwrap()),
    )
    .unwrap();

    // Append new HMAC entry on top of legacy entry
    logger
        .log(AuditLogEntryInput {
            action: "QUERY".to_string(),
            query: Some("SELECT 2;".to_string()),
            status: "SUCCESS".to_string(),
            ..Default::default()
        })
        .unwrap();

    let check = logger.verify_integrity().unwrap();
    assert!(
        check.is_valid,
        "Expected valid chain, got {:?}",
        check.error
    );
    assert_eq!(check.total_entries, 2);
}

#[test]
fn test_tampering_error_message_is_detected() {
    let dir = tempdir().unwrap();
    let logger = AuditLogger::new(dir.path());

    let e1 = logger
        .log(AuditLogEntryInput {
            action: "QUERY".to_string(),
            query: Some("SELECT * FROM secret;".to_string()),
            status: "FAILED".to_string(),
            error_message: Some("permission denied for table secret".to_string()),
            details: Some("custom_details".to_string()),
            ..Default::default()
        })
        .unwrap();

    assert!(logger.verify_integrity().unwrap().is_valid);

    let content = fs::read_to_string(logger.main_log_path()).unwrap();
    let tampered = content.replace("permission denied for table secret", "syntax error");
    fs::write(logger.main_log_path(), tampered).unwrap();

    let check = logger.verify_integrity().unwrap();
    assert!(!check.is_valid);
    assert_eq!(check.tampered_entry_id.as_deref(), Some(e1.id.as_str()));
}

#[test]
fn test_whole_file_sha256_downgrade_rewrite_is_detected() {
    let dir = tempdir().unwrap();
    let logger = AuditLogger::new(dir.path());

    // Log a real HMAC entry to initialize key + anchor
    logger
        .log(AuditLogEntryInput {
            action: "QUERY".to_string(),
            query: Some("SELECT 1;".to_string()),
            status: "SUCCESS".to_string(),
            ..Default::default()
        })
        .unwrap();

    // Attacker deletes audit.jsonl and rewrites an entire unkeyed SHA-256 chain
    let forged_ts = chrono::Utc::now().to_rfc3339();
    let forged_details = "query=SELECT 999;;status=SUCCESS".to_string();
    let forged_hash = compute_entry_hash(GENESIS_HASH, &forged_ts, "QUERY", &forged_details);
    let forged_entry = AuditLogEntry {
        id: "audit-forged-1".to_string(),
        timestamp: forged_ts,
        action: "QUERY".to_string(),
        user: None,
        connection_id: None,
        connection_name: None,
        database: None,
        query: Some("SELECT 999;".to_string()),
        execution_time_ms: None,
        rows_affected: None,
        status: "SUCCESS".to_string(),
        error_message: None,
        details: Some(forged_details),
        prev_hash: Some(GENESIS_HASH.to_string()),
        entry_hash: Some(forged_hash),
        hash_algo: Some("sha256".to_string()),
    };
    fs::write(
        logger.main_log_path(),
        format!("{}\n", serde_json::to_string(&forged_entry).unwrap()),
    )
    .unwrap();

    let check = logger.verify_integrity().unwrap();
    assert!(!check.is_valid);
    assert!(check.error.unwrap().contains("downgrade"));
}

#[test]
fn test_log_tail_truncation_is_detected() {
    let dir = tempdir().unwrap();
    let logger = AuditLogger::new(dir.path());

    logger
        .log(AuditLogEntryInput {
            action: "QUERY".to_string(),
            query: Some("SELECT 1;".to_string()),
            status: "SUCCESS".to_string(),
            ..Default::default()
        })
        .unwrap();
    logger
        .log(AuditLogEntryInput {
            action: "DML".to_string(),
            query: Some("DELETE FROM sensitive_table;".to_string()),
            status: "SUCCESS".to_string(),
            ..Default::default()
        })
        .unwrap();

    assert!(logger.verify_integrity().unwrap().is_valid);

    // Truncate the last entry from audit.jsonl
    let content = fs::read_to_string(logger.main_log_path()).unwrap();
    let first_line = content.lines().next().unwrap();
    fs::write(logger.main_log_path(), format!("{}\n", first_line)).unwrap();

    let check = logger.verify_integrity().unwrap();
    assert!(!check.is_valid);
    assert!(check.error.unwrap().contains("truncation"));
}

#[test]
fn test_legacy_hmac_key_migrates_to_external_key_path() {
    let dir = tempdir().unwrap();
    let legacy_key_path = dir.path().join(".audit.hmac.key");
    let expected_key = [42u8; 32];
    fs::write(&legacy_key_path, expected_key).unwrap();

    let logger = AuditLogger::new(dir.path());
    logger
        .log(AuditLogEntryInput {
            action: "QUERY".to_string(),
            query: Some("SELECT 1;".to_string()),
            status: "SUCCESS".to_string(),
            ..Default::default()
        })
        .unwrap();

    assert!(!legacy_key_path.exists());
    assert!(logger.hmac_key_path().exists());
    assert_eq!(fs::read(logger.hmac_key_path()).unwrap(), expected_key);
    assert!(logger.verify_integrity().unwrap().is_valid);
}
