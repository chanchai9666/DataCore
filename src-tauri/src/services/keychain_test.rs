use std::fs;
use tempfile::tempdir;
use crate::services::keychain::Vault;

#[test]
fn test_keychain_crud_lifecycle() {
    let dir = tempdir().expect("create temp dir");
    let vault = Vault::new(dir.path());

    let conn_id = "test-conn-uuid-1";

    // 1. Password doesn't exist initially
    let initial = vault.get_password(conn_id).expect("get initial password");
    assert_eq!(initial, None);

    // 2. Save password
    vault.save_password(conn_id, "my-p@ssw0rd!").expect("save password");

    // 3. Retrieve password
    let retrieved = vault.get_password(conn_id).expect("get password");
    assert_eq!(retrieved.as_deref(), Some("my-p@ssw0rd!"));

    // 4. Overwrite password
    vault.save_password(conn_id, "new-p@ssw0rd!").expect("update password");
    let updated = vault.get_password(conn_id).expect("get updated password");
    assert_eq!(updated.as_deref(), Some("new-p@ssw0rd!"));

    // 5. Delete password
    vault.delete_password(conn_id).expect("delete password");
    let after_delete = vault.get_password(conn_id).expect("get after delete");
    assert_eq!(after_delete, None);

    // 6. Delete again is idempotent and does not fail
    vault.delete_password(conn_id).expect("delete non-existent password");
}

#[test]
fn test_vault_persistence_across_sessions() {
    let dir = tempdir().expect("create temp dir");
    let vault = Vault::new(dir.path());

    let conn_id = "conn-supabase-pos";
    let password = "SecretDatabasePassword123!";

    // 1. Save password to vault
    vault.save_password(conn_id, password).expect("save password");

    // 2. Verify vault files were created on disk
    let vault_file = dir.path().join("vault.enc");
    let key_file = dir.path().join(".vault.key");
    assert!(vault_file.exists(), "vault.enc must exist on disk");
    assert!(key_file.exists(), ".vault.key must exist on disk");

    // 3. Verify plaintext password is NOT stored openly in the encrypted vault file
    let raw_bytes = fs::read(&vault_file).expect("read vault.enc");
    let raw_string = String::from_utf8_lossy(&raw_bytes);
    assert!(
        !raw_string.contains(password),
        "vault.enc must be encrypted and not contain plaintext password"
    );

    // 4. Simulate App Restart: Create a completely new Vault instance pointing to same dir
    let reloaded_vault = Vault::new(dir.path());

    // 5. Retrieve password again - should reload and decrypt from vault.enc
    let retrieved = reloaded_vault.get_password(conn_id).expect("retrieve after restart");
    assert_eq!(
        retrieved.as_deref(),
        Some(password),
        "Password must persist across app sessions / restarts"
    );

    // 6. Delete password and verify it persists as deleted
    reloaded_vault.delete_password(conn_id).expect("delete password");
    let third_vault = Vault::new(dir.path());
    let after_clear = third_vault.get_password(conn_id).expect("retrieve after delete");
    assert_eq!(after_clear, None);
}

#[test]
fn test_vault_key_is_machine_bound_and_not_raw_aes_key() {
    let dir = tempdir().expect("create temp dir");
    let vault_alpha = Vault::with_machine_id(dir.path(), "machine-alpha-1234".to_string());

    vault_alpha.save_password("c1", "SecretP@ss").expect("save");
    assert_eq!(vault_alpha.get_password("c1").unwrap().as_deref(), Some("SecretP@ss"));

    // Verify .vault.key file exists and has 0o600 permissions on unix
    let key_file = dir.path().join(".vault.key");
    assert!(key_file.exists());
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = fs::metadata(&key_file).unwrap().permissions();
        assert_eq!(perms.mode() & 0o777, 0o600);
    }

    // Now switch to another machine ID: attempting to decrypt using vault from machine-beta must fail
    let vault_beta = Vault::with_machine_id(dir.path(), "machine-beta-9999".to_string());
    let result = vault_beta.get_password("c1");
    // Due to machine key mismatch, decryption must fail
    assert!(result.is_err(), "Vault must fail decryption when machine-derived key differs");
}
