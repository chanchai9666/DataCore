use std::fs;
use tempfile::tempdir;
use crate::services::keychain::{
    decrypt_master_key_v2, derive_kek_argon2, encrypt_master_key_v2, Vault, KEY_HEADER_V1,
    KEY_HEADER_V2, KEY_LEN, NONCE_LEN, SALT_LEN,
};

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

#[test]
fn test_vault_key_legacy_migration_from_raw_32byte_key() {
    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::Aes256Gcm;
    use std::collections::HashMap;

    let dir = tempdir().expect("create temp dir");

    // 1. Manually synthesize legacy vault files:
    // Raw 32-byte AES key written directly to .vault.key without any header or XOR obfuscation
    let raw_aes_key: [u8; 32] = [42u8; 32];
    let key_file = dir.path().join(".vault.key");
    fs::write(&key_file, raw_aes_key).expect("write legacy 32-byte key file");
    assert_eq!(fs::metadata(&key_file).unwrap().len(), 32);

    // Encrypt legacy payload with this raw key into vault.enc
    let mut payload_map = HashMap::new();
    payload_map.insert("legacy-conn-1".to_string(), "old-remembered-password-xyz".to_string());
    let plaintext = serde_json::to_vec(&payload_map).expect("serialize payload");

    let cipher = Aes256Gcm::new_from_slice(&raw_aes_key).unwrap();
    let nonce = [7u8; 12];
    let ciphertext = cipher.encrypt((&nonce).into(), plaintext.as_ref()).unwrap();

    let mut vault_file_bytes = Vec::new();
    vault_file_bytes.extend_from_slice(&nonce);
    vault_file_bytes.extend_from_slice(&ciphertext);
    let vault_file = dir.path().join("vault.enc");
    fs::write(&vault_file, &vault_file_bytes).expect("write legacy vault.enc");

    // 2. Open Vault with modern code (simulating app upgrade)
    let machine_id = "test-upgrade-machine-uuid";
    let upgraded_vault = Vault::with_machine_id(dir.path(), machine_id.to_string());

    // 3. Must successfully read password from legacy encrypted vault
    let retrieved = upgraded_vault.get_password("legacy-conn-1").expect("read legacy password");
    assert_eq!(retrieved.as_deref(), Some("old-remembered-password-xyz"));

    // 4. Verify that .vault.key was automatically migrated to DCV1 format (36 bytes: 4 magic + 32 key)
    let migrated_bytes = fs::read(&key_file).expect("read migrated key file");
    assert_eq!(migrated_bytes.len(), 36, "Migrated key file must be 36 bytes (4 magic + 32 key)");
    assert_eq!(&migrated_bytes[..4], KEY_HEADER_V1, "Header must be DCV1");

    // 5. Verify that in subsequent session, modern vault continues to read seamlessly from migrated key
    let next_session_vault = Vault::with_machine_id(dir.path(), machine_id.to_string());
    let next_retrieved = next_session_vault.get_password("legacy-conn-1").expect("read after migration");
    assert_eq!(next_retrieved.as_deref(), Some("old-remembered-password-xyz"));
}

#[test]
fn test_argon2id_kek_derivation_and_aes_gcm_direct() {
    let password = "SuperSecretMasterPassword!2026";
    let salt1 = b"unique_salt_1234";
    let salt2 = b"unique_salt_5678";

    // 1. KEK derivation produces deterministic 32-byte key for same salt
    let kek1_a = derive_kek_argon2(password, salt1).expect("derive kek1_a");
    let kek1_b = derive_kek_argon2(password, salt1).expect("derive kek1_b");
    assert_eq!(kek1_a, kek1_b, "Argon2id must be deterministic for identical password and salt");

    // 2. Different salts must produce distinct KEKs
    let kek2 = derive_kek_argon2(password, salt2).expect("derive kek2");
    assert_ne!(kek1_a, kek2, "Different salts must produce distinct KEKs");

    // 3. Encrypt and decrypt a 32-byte master key
    let original_master_key: [u8; KEY_LEN] = [99u8; KEY_LEN];
    let payload = encrypt_master_key_v2(&original_master_key, password).expect("encrypt master key");
    assert_eq!(
        payload.len(),
        4 + SALT_LEN + NONCE_LEN + KEY_LEN + 16,
        "Payload length must be 80 bytes"
    );
    assert_eq!(&payload[..4], KEY_HEADER_V2);

    let decrypted = decrypt_master_key_v2(&payload, password).expect("decrypt master key");
    assert_eq!(decrypted, original_master_key);

    // 4. Decrypt with wrong password must return error
    let wrong_result = decrypt_master_key_v2(&payload, "WrongMasterPassword!");
    assert!(wrong_result.is_err(), "Decryption with wrong password must fail");

    // 5. Tampered ciphertext must fail authentication
    let mut tampered = payload.clone();
    let last = tampered.len() - 1;
    tampered[last] ^= 0x01;
    let tamper_result = decrypt_master_key_v2(&tampered, password);
    assert!(tamper_result.is_err(), "Tampered ciphertext must fail auth tag verification");
}

#[test]
fn test_master_password_set_and_verify_lifecycle() {
    let dir = tempdir().expect("create temp dir");
    let vault = Vault::new(dir.path());

    // Initially, no master password is set
    assert_eq!(vault.has_master_password().unwrap(), false);
    assert_eq!(vault.verify_master_password("AnyPassword").unwrap(), false);

    // Set master password
    let master_pass = "VaultMasterKeyPass!99";
    vault.set_master_password(master_pass).expect("set master password");

    assert_eq!(vault.has_master_password().unwrap(), true);
    assert_eq!(vault.verify_master_password(master_pass).unwrap(), true);
    assert_eq!(vault.verify_master_password("IncorrectPass").unwrap(), false);

    // Verify key file format on disk
    let key_file = dir.path().join(".vault.key");
    assert!(key_file.exists());
    let key_bytes = fs::read(&key_file).unwrap();
    assert_eq!(key_bytes.len(), 4 + SALT_LEN + NONCE_LEN + KEY_LEN + 16);
    assert_eq!(&key_bytes[..4], KEY_HEADER_V2);

    // Save and retrieve password using active master password
    vault.save_password("conn-1", "db-pass-alpha").expect("save password");
    assert_eq!(
        vault.get_password("conn-1").unwrap().as_deref(),
        Some("db-pass-alpha")
    );
}

#[test]
fn test_locked_vault_requires_master_password_and_unlock_error_handling() {
    let dir = tempdir().expect("create temp dir");
    let vault = Vault::new(dir.path());
    let master_pass = "MasterLock123!@#";

    vault.set_master_password(master_pass).expect("set master password");
    vault.save_password("conn-locked", "secret_oracle_pwd").expect("save password");

    // Simulate brand new application session (new Vault instance without password)
    let locked_vault = Vault::new(dir.path());
    assert_eq!(locked_vault.has_master_password().unwrap(), true);

    // Attempting to get password without unlocking must fail with locked error
    let locked_get = locked_vault.get_password("conn-locked");
    assert!(
        locked_get.is_err(),
        "Vault access must fail when locked without master password"
    );

    // Attempting to unlock with wrong password must return error
    let unlock_wrong = locked_vault.unlock("WrongPassword");
    assert!(
        unlock_wrong.is_err(),
        "Unlock with wrong password must return error"
    );

    // Unlocking with correct password must succeed
    locked_vault.unlock(master_pass).expect("unlock with correct password");

    // Retrieving password now succeeds
    let retrieved = locked_vault.get_password("conn-locked").expect("get password after unlock");
    assert_eq!(retrieved.as_deref(), Some("secret_oracle_pwd"));

    // Lock vault again
    locked_vault.lock();
    assert!(locked_vault.get_password("conn-locked").is_err(), "Access after lock must fail");
}

#[test]
fn test_change_master_password() {
    let dir = tempdir().expect("create temp dir");
    let vault = Vault::new(dir.path());
    let old_pass = "InitialMasterPass1";
    let new_pass = "UpdatedMasterPass2";

    vault.set_master_password(old_pass).expect("set master pass");
    vault.save_password("c1", "db_pass_123").expect("save password");

    // Changing with wrong old password must fail with error
    let bad_change = vault.change_master_password("WrongOldPass", new_pass);
    assert!(bad_change.is_err(), "Change master password with wrong old password must fail");

    // Changing with correct old password must succeed
    vault.change_master_password(old_pass, new_pass).expect("change master password");

    // Old password no longer verifies
    assert_eq!(vault.verify_master_password(old_pass).unwrap(), false);
    // New password verifies
    assert_eq!(vault.verify_master_password(new_pass).unwrap(), true);

    // Reload in brand new session
    let session2 = Vault::with_master_password(dir.path(), new_pass);
    let pass = session2.get_password("c1").expect("retrieve password with new master key");
    assert_eq!(pass.as_deref(), Some("db_pass_123"));
}

#[test]
fn test_migration_from_machine_mode_to_master_password_mode() {
    let dir = tempdir().expect("create temp dir");
    let machine_vault = Vault::with_machine_id(dir.path(), "my-laptop-hwid".to_string());

    // Save passwords in default machine mode (DCV1)
    machine_vault.save_password("mysql-prod", "MySQLP@ssword2026").expect("save in machine mode");
    assert_eq!(machine_vault.has_master_password().unwrap(), false);

    // Enable master password on existing vault
    let master_pwd = "NewMasterGuardPassword!";
    machine_vault.set_master_password(master_pwd).expect("upgrade to master password mode");
    assert_eq!(machine_vault.has_master_password().unwrap(), true);

    // Check key file upgraded to DCV2
    let key_file = dir.path().join(".vault.key");
    let key_bytes = fs::read(&key_file).unwrap();
    assert_eq!(&key_bytes[..4], KEY_HEADER_V2);

    // Passwords saved before upgrade must still decrypt properly
    let decrypted = machine_vault.get_password("mysql-prod").expect("get migrated password");
    assert_eq!(decrypted.as_deref(), Some("MySQLP@ssword2026"));

    // Reload in separate session with master password
    let session_reloaded = Vault::with_master_password(dir.path(), master_pwd);
    let pass_after_reload = session_reloaded.get_password("mysql-prod").expect("read after reload");
    assert_eq!(pass_after_reload.as_deref(), Some("MySQLP@ssword2026"));
}

#[test]
fn test_remove_master_password_reverts_to_machine_mode() {
    let dir = tempdir().expect("create temp dir");
    let machine_id = "test-revert-machine-id".to_string();
    let vault = Vault::with_machine_id(dir.path(), machine_id.clone());
    let master_pwd = "TemporaryMasterPwd!";

    vault.set_master_password(master_pwd).expect("set master pwd");
    vault.save_password("c-revert", "super_secret_value").expect("save pass");

    // Remove master password with wrong password fails
    assert!(vault.remove_master_password("WrongPassword").is_err());

    // Remove master password with correct password succeeds
    vault.remove_master_password(master_pwd).expect("remove master password");
    assert_eq!(vault.has_master_password().unwrap(), false);

    // Verify key file is DCV1
    let key_file = dir.path().join(".vault.key");
    let key_bytes = fs::read(&key_file).unwrap();
    assert_eq!(&key_bytes[..4], KEY_HEADER_V1);

    // Fresh session without master password now decrypts using machine key
    let machine_session = Vault::with_machine_id(dir.path(), machine_id);
    let retrieved = machine_session.get_password("c-revert").expect("read in machine mode");
    assert_eq!(retrieved.as_deref(), Some("super_secret_value"));
}
