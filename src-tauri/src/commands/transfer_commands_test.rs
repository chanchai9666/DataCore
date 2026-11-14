use tempfile::tempdir;
use crate::commands::transfer_commands::preview_import_file;
use crate::services::path_guard::validate_safe_transfer_path;

#[tokio::test]
async fn test_preview_import_file_blocks_directory_traversal() {
    let res = preview_import_file("../../../etc/passwd".to_string(), None).await;
    assert!(res.is_err());
    let err = res.err().unwrap();
    assert!(
        err.contains("Directory traversal") || err.contains("dangerous system location"),
        "Unexpected error: {}",
        err
    );
}

#[tokio::test]
async fn test_preview_import_file_blocks_dangerous_system_path() {
    let res = preview_import_file("/etc/hosts.csv".to_string(), None).await;
    assert!(res.is_err());
    let err = res.err().unwrap();
    assert!(
        err.contains("dangerous system location"),
        "Unexpected error: {}",
        err
    );
}

#[tokio::test]
async fn test_preview_import_file_blocks_invalid_extension() {
    let res = preview_import_file("/tmp/payload.sh".to_string(), None).await;
    assert!(res.is_err());
    let err = res.err().unwrap();
    assert!(
        err.contains("not allowed"),
        "Unexpected error: {}",
        err
    );
}

#[tokio::test]
async fn test_preview_import_file_blocks_sensitive_user_dir() {
    let res = preview_import_file("~/.ssh/id_rsa.csv".to_string(), None).await;
    assert!(res.is_err());
    let err = res.err().unwrap();
    assert!(
        err.contains("sensitive") || err.contains("denied"),
        "Unexpected error: {}",
        err
    );
}

#[test]
fn test_validate_safe_transfer_path_valid_paths() {
    let dir = tempdir().unwrap();
    let csv_path = dir.path().join("users.csv");
    let json_path = dir.path().join("orders.json");

    let validated_csv = validate_safe_transfer_path(
        csv_path.to_str().unwrap(),
        &["csv", "tsv", "json", "sql", "txt"],
    );
    assert!(validated_csv.is_ok());

    let validated_json = validate_safe_transfer_path(
        json_path.to_str().unwrap(),
        &["csv", "tsv", "json", "sql", "txt"],
    );
    assert!(validated_json.is_ok());
}

#[test]
fn test_validate_safe_transfer_path_directory_traversal_attempts() {
    let attempts = [
        "../../../etc/passwd",
        "../../../../../../etc/shadow.csv",
        "/tmp/../etc/hosts.sql",
        "nested/../../secret.json",
        "%2e%2e/evil.txt",
    ];

    for attempt in attempts {
        let res = validate_safe_transfer_path(attempt, &["csv", "tsv", "json", "sql", "txt"]);
        assert!(res.is_err(), "Path '{}' should have been blocked", attempt);
    }
}

#[test]
fn test_validate_safe_transfer_path_blocked_system_locations() {
    let blocked = [
        "/etc/passwd.csv",
        "/private/etc/sudoers.txt",
        "/System/Library/test.sql",
        "/usr/local/bin/malicious.csv",
        "/bin/bash.json",
        "/sbin/route.txt",
        "/dev/random.sql",
        "/proc/version.txt",
        "/sys/devices/test.csv",
    ];

    for path in blocked {
        let res = validate_safe_transfer_path(path, &["csv", "tsv", "json", "sql", "txt"]);
        assert!(res.is_err(), "System path '{}' should have been blocked", path);
        let err = res.err().unwrap();
        assert!(
            err.contains("dangerous system location"),
            "Error for '{}' was: {}",
            path,
            err
        );
    }
}

#[test]
fn test_validate_safe_transfer_path_sensitive_user_locations() {
    let sensitive = [
        "~/.ssh/id_ed25519.csv",
        "~/.gnupg/trustdb.gpg.json",
        "~/.datacore/vault.enc",
        "~/.datacore/.vault.key",
    ];

    for path in sensitive {
        let res = validate_safe_transfer_path(path, &["csv", "tsv", "json", "sql", "txt", "enc", "key"]);
        assert!(res.is_err(), "Sensitive path '{}' should have been blocked", path);
        let err = res.err().unwrap();
        assert!(
            err.contains("sensitive") || err.contains("denied"),
            "Error for '{}' was: {}",
            path,
            err
        );
    }
}

#[test]
fn test_validate_safe_transfer_path_invalid_extensions() {
    let dir = tempdir().unwrap();
    let bin_path = dir.path().join("exploit.bin");
    let php_path = dir.path().join("webshell.php");
    let no_ext_path = dir.path().join("no_extension");

    let allowed = &["csv", "tsv", "json", "sql", "txt"];

    assert!(validate_safe_transfer_path(bin_path.to_str().unwrap(), allowed).is_err());
    assert!(validate_safe_transfer_path(php_path.to_str().unwrap(), allowed).is_err());
    assert!(validate_safe_transfer_path(no_ext_path.to_str().unwrap(), allowed).is_err());
}
