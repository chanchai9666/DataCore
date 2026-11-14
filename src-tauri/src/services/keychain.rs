use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock, RwLock};
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm,
};
use rand::RngExt;
use crate::error::AppError;

pub const SERVICE_NAME: &str = "datacore";
pub const NONCE_LEN: usize = 12;
pub const KEY_LEN: usize = 32;
pub const SALT_LEN: usize = 16;
pub const KEY_HEADER_V1: &[u8; 4] = b"DCV1";
pub const KEY_HEADER_V2: &[u8; 4] = b"DCV2";

#[cfg(unix)]
fn set_secure_permissions(path: &Path) -> Result<(), AppError> {
    use std::os::unix::fs::PermissionsExt;
    let metadata = fs::metadata(path)?;
    let mut perms = metadata.permissions();
    perms.set_mode(0o600);
    fs::set_permissions(path, perms)?;
    Ok(())
}

#[cfg(not(unix))]
fn set_secure_permissions(_path: &Path) -> Result<(), AppError> {
    Ok(())
}

#[cfg(unix)]
fn set_secure_dir_permissions(path: &Path) -> Result<(), AppError> {
    use std::os::unix::fs::PermissionsExt;
    let metadata = fs::metadata(path)?;
    let mut perms = metadata.permissions();
    perms.set_mode(0o700);
    fs::set_permissions(path, perms)?;
    Ok(())
}

#[cfg(not(unix))]
fn set_secure_dir_permissions(_path: &Path) -> Result<(), AppError> {
    Ok(())
}

fn get_machine_identifier() -> String {
    if let Ok(id) = std::env::var("DATACORE_MACHINE_ID") {
        if !id.is_empty() {
            return id;
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("ioreg")
            .args(["-rd1", "-c", "IOPlatformExpertDevice"])
            .output()
        {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                for line in text.lines() {
                    if line.contains("IOPlatformUUID") {
                        if let Some(uuid) = line.split('=').nth(1) {
                            let clean = uuid.trim().trim_matches('"').trim();
                            if !clean.is_empty() {
                                return clean.to_string();
                            }
                        }
                    }
                }
            }
        }
    }

    let user = std::env::var("USER").unwrap_or_else(|_| "datacore_user".to_string());
    let host = std::env::var("HOSTNAME").unwrap_or_else(|_| "localhost".to_string());
    format!("{}:{}:datacore-vault-salt", user, host)
}

/// Derive a 256-bit Key Encryption Key (KEK) using Argon2id
pub fn derive_kek_argon2(password: &str, salt: &[u8]) -> Result<[u8; KEY_LEN], AppError> {
    let argon2 = argon2::Argon2::default();
    let mut kek = [0u8; KEY_LEN];
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut kek)
        .map_err(|e| AppError::Other(format!("Argon2id KEK derivation failed: {}", e)))?;
    Ok(kek)
}

/// Encrypt a 32-byte Vault Master Key using AES-256-GCM with an Argon2id-derived KEK
pub fn encrypt_master_key_v2(
    master_key: &[u8; KEY_LEN],
    password: &str,
) -> Result<Vec<u8>, AppError> {
    let mut salt = [0u8; SALT_LEN];
    rand::rng().fill(&mut salt);

    let kek = derive_kek_argon2(password, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(&kek)
        .map_err(|e| AppError::Other(format!("Failed to initialize KEK cipher: {}", e)))?;

    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::rng().fill(&mut nonce_bytes);
    let nonce = (&nonce_bytes[..])
        .try_into()
        .map_err(|e| AppError::Other(format!("Invalid nonce: {}", e)))?;

    let ciphertext = cipher
        .encrypt(nonce, master_key.as_ref())
        .map_err(|e| AppError::Other(format!("Failed to encrypt vault key with KEK: {}", e)))?;

    let mut payload = Vec::with_capacity(4 + SALT_LEN + NONCE_LEN + ciphertext.len());
    payload.extend_from_slice(KEY_HEADER_V2);
    payload.extend_from_slice(&salt);
    payload.extend_from_slice(&nonce_bytes);
    payload.extend_from_slice(&ciphertext);
    Ok(payload)
}

/// Decrypt an 80-byte DCV2 payload to recover the 32-byte Vault Master Key
pub fn decrypt_master_key_v2(
    key_bytes: &[u8],
    password: &str,
) -> Result<[u8; KEY_LEN], AppError> {
    let expected_len = 4 + SALT_LEN + NONCE_LEN + KEY_LEN + 16;
    if key_bytes.len() != expected_len || &key_bytes[..4] != KEY_HEADER_V2 {
        return Err(AppError::Other(
            "Invalid DCV2 key format or header".to_string(),
        ));
    }

    let salt = &key_bytes[4..4 + SALT_LEN];
    let nonce_bytes = &key_bytes[4 + SALT_LEN..4 + SALT_LEN + NONCE_LEN];
    let ciphertext = &key_bytes[4 + SALT_LEN + NONCE_LEN..];

    let kek = derive_kek_argon2(password, salt)?;
    let cipher = Aes256Gcm::new_from_slice(&kek)
        .map_err(|e| AppError::Other(format!("Failed to initialize KEK cipher: {}", e)))?;
    let nonce = nonce_bytes
        .try_into()
        .map_err(|e| AppError::Other(format!("Invalid nonce: {}", e)))?;

    let decrypted = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| AppError::Other("Invalid master password or corrupted key".to_string()))?;

    if decrypted.len() != KEY_LEN {
        return Err(AppError::Other("Corrupted decrypted key length".to_string()));
    }
    let mut key = [0u8; KEY_LEN];
    key.copy_from_slice(&decrypted);
    Ok(key)
}

#[derive(Debug, Clone)]
pub struct Vault {
    vault_dir: PathBuf,
    machine_id: Option<String>,
    master_password: Arc<RwLock<Option<String>>>,
    cache: Arc<RwLock<Option<HashMap<String, String>>>>,
}

impl Vault {
    pub fn default_dir() -> PathBuf {
        std::env::var("DATACORE_VAULT_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                std::env::var("HOME")
                    .map(PathBuf::from)
                    .unwrap_or_else(|_| PathBuf::from("."))
                    .join(".datacore")
            })
    }

    pub fn new<P: AsRef<Path>>(dir: P) -> Self {
        Self {
            vault_dir: dir.as_ref().to_path_buf(),
            machine_id: None,
            master_password: Arc::new(RwLock::new(None)),
            cache: Arc::new(RwLock::new(None)),
        }
    }

    pub fn with_machine_id<P: AsRef<Path>>(dir: P, machine_id: String) -> Self {
        Self {
            vault_dir: dir.as_ref().to_path_buf(),
            machine_id: Some(machine_id),
            master_password: Arc::new(RwLock::new(None)),
            cache: Arc::new(RwLock::new(None)),
        }
    }

    pub fn with_master_password<P: AsRef<Path>>(dir: P, master_password: &str) -> Self {
        Self {
            vault_dir: dir.as_ref().to_path_buf(),
            machine_id: None,
            master_password: Arc::new(RwLock::new(Some(master_password.to_string()))),
            cache: Arc::new(RwLock::new(None)),
        }
    }

    pub fn vault_dir(&self) -> &Path {
        &self.vault_dir
    }

    pub fn clear_cache(&self) {
        if let Ok(mut guard) = self.cache.write() {
            *guard = None;
        }
    }

    pub fn has_master_password(&self) -> Result<bool, AppError> {
        let key_file = self.vault_dir.join(".vault.key");
        if !key_file.exists() {
            return Ok(false);
        }
        let key_bytes = fs::read(&key_file)?;
        Ok(key_bytes.len() >= 4 && &key_bytes[..4] == KEY_HEADER_V2)
    }

    pub fn verify_master_password(&self, password: &str) -> Result<bool, AppError> {
        let key_file = self.vault_dir.join(".vault.key");
        if !key_file.exists() {
            return Ok(false);
        }
        let key_bytes = fs::read(&key_file)?;
        if key_bytes.len() < 4 || &key_bytes[..4] != KEY_HEADER_V2 {
            return Ok(false);
        }
        match decrypt_master_key_v2(&key_bytes, password) {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }

    pub fn unlock(&self, password: &str) -> Result<(), AppError> {
        let key_file = self.vault_dir.join(".vault.key");
        if key_file.exists() {
            let key_bytes = fs::read(&key_file)?;
            if key_bytes.len() >= 4 && &key_bytes[..4] == KEY_HEADER_V2 {
                decrypt_master_key_v2(&key_bytes, password)?;
            }
        }
        let mut guard = self
            .master_password
            .write()
            .map_err(|e| AppError::Other(format!("Lock error: {}", e)))?;
        *guard = Some(password.to_string());
        self.clear_cache();
        Ok(())
    }

    pub fn lock(&self) {
        if let Ok(mut guard) = self.master_password.write() {
            *guard = None;
        }
        self.clear_cache();
    }

    pub fn set_master_password(&self, password: &str) -> Result<(), AppError> {
        if password.is_empty() {
            return Err(AppError::Other(
                "Master password cannot be empty".to_string(),
            ));
        }

        if !self.vault_dir.exists() {
            fs::create_dir_all(&self.vault_dir)?;
            set_secure_dir_permissions(&self.vault_dir)?;
        }

        let key_file = self.vault_dir.join(".vault.key");
        let master_key = if key_file.exists() {
            let key_bytes = fs::read(&key_file)?;
            if key_bytes.len() >= 4 && &key_bytes[..4] == KEY_HEADER_V2 {
                // If it already is DCV2, verify current session master password or unlock first
                let pwd_guard = self
                    .master_password
                    .read()
                    .map_err(|e| AppError::Other(format!("Lock error: {}", e)))?;
                if let Some(existing_pwd) = pwd_guard.as_ref() {
                    decrypt_master_key_v2(&key_bytes, existing_pwd)?
                } else {
                    return Err(AppError::Other(
                        "Vault is locked by an existing master password. Use change_master_password or unlock first."
                            .to_string(),
                    ));
                }
            } else if key_bytes.len() == 4 + KEY_LEN && &key_bytes[..4] == KEY_HEADER_V1 {
                // DCV1 format: de-obfuscate using machine key
                let mdk = self.derive_machine_key();
                let mut key = [0u8; KEY_LEN];
                for i in 0..KEY_LEN {
                    key[i] = key_bytes[4 + i] ^ mdk[i];
                }
                key
            } else if key_bytes.len() == KEY_LEN {
                let mut key = [0u8; KEY_LEN];
                key.copy_from_slice(&key_bytes);
                key
            } else {
                let mut key = [0u8; KEY_LEN];
                rand::rng().fill(&mut key);
                key
            }
        } else {
            let mut key = [0u8; KEY_LEN];
            rand::rng().fill(&mut key);
            key
        };

        let payload = encrypt_master_key_v2(&master_key, password)?;
        let tmp_key_file = self.vault_dir.join(".vault.key.tmp");
        fs::write(&tmp_key_file, &payload)?;
        set_secure_permissions(&tmp_key_file)?;
        fs::rename(&tmp_key_file, &key_file)?;
        set_secure_permissions(&key_file)?;

        let mut guard = self
            .master_password
            .write()
            .map_err(|e| AppError::Other(format!("Lock error: {}", e)))?;
        *guard = Some(password.to_string());

        Ok(())
    }

    pub fn change_master_password(
        &self,
        old_password: &str,
        new_password: &str,
    ) -> Result<(), AppError> {
        if new_password.is_empty() {
            return Err(AppError::Other(
                "New master password cannot be empty".to_string(),
            ));
        }

        let key_file = self.vault_dir.join(".vault.key");
        if !key_file.exists() {
            return Err(AppError::Other("Vault key not found".to_string()));
        }

        let key_bytes = fs::read(&key_file)?;
        if key_bytes.len() < 4 || &key_bytes[..4] != KEY_HEADER_V2 {
            return Err(AppError::Other(
                "Vault is not protected by a master password".to_string(),
            ));
        }

        // Decrypt master key using old password (fails on incorrect password)
        let master_key = decrypt_master_key_v2(&key_bytes, old_password)?;

        // Re-encrypt master key using new password (new salt and nonce)
        let payload = encrypt_master_key_v2(&master_key, new_password)?;

        let tmp_key_file = self.vault_dir.join(".vault.key.tmp");
        fs::write(&tmp_key_file, &payload)?;
        set_secure_permissions(&tmp_key_file)?;
        fs::rename(&tmp_key_file, &key_file)?;
        set_secure_permissions(&key_file)?;

        let mut guard = self
            .master_password
            .write()
            .map_err(|e| AppError::Other(format!("Lock error: {}", e)))?;
        *guard = Some(new_password.to_string());

        Ok(())
    }

    pub fn remove_master_password(&self, current_password: &str) -> Result<(), AppError> {
        let key_file = self.vault_dir.join(".vault.key");
        if !key_file.exists() {
            return Ok(());
        }

        let key_bytes = fs::read(&key_file)?;
        if key_bytes.len() < 4 || &key_bytes[..4] != KEY_HEADER_V2 {
            return Ok(());
        }

        let master_key = decrypt_master_key_v2(&key_bytes, current_password)?;

        let mdk = self.derive_machine_key();
        let mut payload = Vec::with_capacity(4 + KEY_LEN);
        payload.extend_from_slice(KEY_HEADER_V1);
        for i in 0..KEY_LEN {
            payload.push(master_key[i] ^ mdk[i]);
        }

        let tmp_key_file = self.vault_dir.join(".vault.key.tmp");
        fs::write(&tmp_key_file, &payload)?;
        set_secure_permissions(&tmp_key_file)?;
        fs::rename(&tmp_key_file, &key_file)?;
        set_secure_permissions(&key_file)?;

        let mut guard = self
            .master_password
            .write()
            .map_err(|e| AppError::Other(format!("Lock error: {}", e)))?;
        *guard = None;

        Ok(())
    }

    fn derive_machine_key(&self) -> [u8; KEY_LEN] {
        use sha2::{Digest, Sha256};
        let machine_id = self.machine_id.clone().unwrap_or_else(get_machine_identifier);
        let mut hasher = Sha256::new();
        hasher.update(b"datacore-machine-secret-v1:");
        hasher.update(machine_id.as_bytes());
        let result = hasher.finalize();
        let mut key = [0u8; KEY_LEN];
        key.copy_from_slice(&result);
        key
    }

    fn get_or_create_key(&self) -> Result<[u8; KEY_LEN], AppError> {
        if !self.vault_dir.exists() {
            fs::create_dir_all(&self.vault_dir)?;
            set_secure_dir_permissions(&self.vault_dir)?;
        }

        let key_file = self.vault_dir.join(".vault.key");
        if key_file.exists() {
            let key_bytes = fs::read(&key_file)?;

            // 1. Version 2 Format: Master Password Mode (Argon2id + AES-256-GCM)
            // 4 magic + 16 salt + 12 nonce + 48 (32 key + 16 tag) = 80 bytes
            let expected_v2_len = 4 + SALT_LEN + NONCE_LEN + KEY_LEN + 16;
            if key_bytes.len() == expected_v2_len && &key_bytes[..4] == KEY_HEADER_V2 {
                let pwd_guard = self
                    .master_password
                    .read()
                    .map_err(|e| AppError::Other(format!("Lock error: {}", e)))?;
                match pwd_guard.as_ref() {
                    Some(pwd) => return decrypt_master_key_v2(&key_bytes, pwd),
                    None => {
                        return Err(AppError::Other(
                            "Vault is locked: Master password required".to_string(),
                        ));
                    }
                }
            }

            // 2. Version 1 Format: 4-byte Magic "DCV1" + 32-byte obfuscated key = 36 bytes
            if key_bytes.len() == 4 + KEY_LEN && &key_bytes[..4] == KEY_HEADER_V1 {
                let mdk = self.derive_machine_key();
                let mut key = [0u8; KEY_LEN];
                for i in 0..KEY_LEN {
                    key[i] = key_bytes[4 + i] ^ mdk[i];
                }
                return Ok(key);
            }

            // 3. Legacy Format: 32-byte raw AES key without magic header (Auto-migrate to DCV1)
            if key_bytes.len() == KEY_LEN {
                let mut legacy_key = [0u8; KEY_LEN];
                legacy_key.copy_from_slice(&key_bytes);

                let mdk = self.derive_machine_key();
                let mut payload = Vec::with_capacity(4 + KEY_LEN);
                payload.extend_from_slice(KEY_HEADER_V1);
                for i in 0..KEY_LEN {
                    payload.push(legacy_key[i] ^ mdk[i]);
                }

                let tmp_key_file = self.vault_dir.join(".vault.key.tmp");
                if let Ok(()) = fs::write(&tmp_key_file, &payload) {
                    let _ = set_secure_permissions(&tmp_key_file);
                    let _ = fs::rename(&tmp_key_file, &key_file);
                    let _ = set_secure_permissions(&key_file);
                }

                return Ok(legacy_key);
            }
        }

        // Generate fresh cryptographically secure 256-bit key
        let mut key_bytes = [0u8; KEY_LEN];
        rand::rng().fill(&mut key_bytes);

        let pwd_guard = self
            .master_password
            .read()
            .map_err(|e| AppError::Other(format!("Lock error: {}", e)))?;
        let payload = if let Some(pwd) = pwd_guard.as_ref() {
            encrypt_master_key_v2(&key_bytes, pwd)?
        } else {
            // Obfuscate with machine-derived secret and write with DCV1 header
            let mdk = self.derive_machine_key();
            let mut payload = Vec::with_capacity(4 + KEY_LEN);
            payload.extend_from_slice(KEY_HEADER_V1);
            for i in 0..KEY_LEN {
                payload.push(key_bytes[i] ^ mdk[i]);
            }
            payload
        };

        let tmp_key_file = self.vault_dir.join(".vault.key.tmp");
        fs::write(&tmp_key_file, &payload)?;
        set_secure_permissions(&tmp_key_file)?;
        fs::rename(&tmp_key_file, &key_file)?;
        set_secure_permissions(&key_file)?;

        Ok(key_bytes)
    }

    fn load_vault_from_disk(&self) -> Result<HashMap<String, String>, AppError> {
        let vault_file = self.vault_dir.join("vault.enc");

        if !vault_file.exists() {
            return Ok(HashMap::new());
        }

        let key = self.get_or_create_key()?;
        let cipher = Aes256Gcm::new_from_slice(&key)
            .map_err(|e| AppError::Other(format!("Failed to initialize cipher: {}", e)))?;

        let file_data = fs::read(&vault_file)?;
        if file_data.len() < NONCE_LEN {
            return Ok(HashMap::new());
        }

        let nonce = (&file_data[..NONCE_LEN])
            .try_into()
            .map_err(|e| AppError::Other(format!("Invalid nonce: {}", e)))?;
        let ciphertext = &file_data[NONCE_LEN..];

        let plaintext = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| AppError::Other(format!("Failed to decrypt vault: {}", e)))?;

        let map: HashMap<String, String> =
            serde_json::from_slice(&plaintext).unwrap_or_default();

        Ok(map)
    }

    fn save_vault_to_disk(&self, map: &HashMap<String, String>) -> Result<(), AppError> {
        if !self.vault_dir.exists() {
            fs::create_dir_all(&self.vault_dir)?;
            set_secure_dir_permissions(&self.vault_dir)?;
        }

        let key = self.get_or_create_key()?;
        let cipher = Aes256Gcm::new_from_slice(&key)
            .map_err(|e| AppError::Other(format!("Failed to initialize cipher: {}", e)))?;

        let plaintext = serde_json::to_vec(map)?;
        let mut nonce_bytes = [0u8; NONCE_LEN];
        rand::rng().fill(&mut nonce_bytes);
        let nonce = (&nonce_bytes[..])
            .try_into()
            .map_err(|e| AppError::Other(format!("Invalid nonce: {}", e)))?;

        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_ref())
            .map_err(|e| AppError::Other(format!("Failed to encrypt vault: {}", e)))?;

        let mut output = Vec::with_capacity(NONCE_LEN + ciphertext.len());
        output.extend_from_slice(&nonce_bytes);
        output.extend_from_slice(&ciphertext);

        let vault_file = self.vault_dir.join("vault.enc");
        let tmp_file = self.vault_dir.join("vault.enc.tmp");

        fs::write(&tmp_file, output)?;
        set_secure_permissions(&tmp_file)?;
        fs::rename(&tmp_file, &vault_file)?;
        set_secure_permissions(&vault_file)?;

        Ok(())
    }

    pub fn save_password(&self, connection_id: &str, password: &str) -> Result<(), AppError> {
        let mut guard = self
            .cache
            .write()
            .map_err(|e| AppError::Other(format!("Vault lock error: {}", e)))?;

        if guard.is_none() {
            *guard = Some(self.load_vault_from_disk()?);
        }

        if let Some(ref mut map) = *guard {
            map.insert(connection_id.to_string(), password.to_string());
            self.save_vault_to_disk(map)?;
        }

        Ok(())
    }

    pub fn get_password(&self, connection_id: &str) -> Result<Option<String>, AppError> {
        {
            let guard = self
                .cache
                .read()
                .map_err(|e| AppError::Other(format!("Vault lock error: {}", e)))?;
            if let Some(ref map) = *guard {
                return Ok(map.get(connection_id).cloned());
            }
        }

        // Cache miss / not loaded yet: load from disk
        let mut guard = self
            .cache
            .write()
            .map_err(|e| AppError::Other(format!("Vault lock error: {}", e)))?;
        if guard.is_none() {
            *guard = Some(self.load_vault_from_disk()?);
        }

        Ok(guard.as_ref().and_then(|map| map.get(connection_id).cloned()))
    }

    pub fn delete_password(&self, connection_id: &str) -> Result<(), AppError> {
        let mut guard = self
            .cache
            .write()
            .map_err(|e| AppError::Other(format!("Vault lock error: {}", e)))?;

        if guard.is_none() {
            *guard = Some(self.load_vault_from_disk()?);
        }

        if let Some(ref mut map) = *guard {
            if map.remove(connection_id).is_some() {
                self.save_vault_to_disk(map)?;
            }
        }

        Ok(())
    }
}

static DEFAULT_VAULT: OnceLock<Vault> = OnceLock::new();

fn default_vault() -> &'static Vault {
    DEFAULT_VAULT.get_or_init(|| Vault::new(Vault::default_dir()))
}

/// Compatibility flag (always in local encrypted vault, no OS keychain access)
pub fn set_mock_mode(_enabled: bool) {}

/// Compatibility check (always in local encrypted vault, no OS keychain access)
pub fn is_mock_mode() -> bool {
    true
}

/// Clear cache in memory of the default vault
pub fn clear_mock_store() {
    default_vault().clear_cache();
}

/// Save password securely in persistent Local Encrypted Vault (AES-256-GCM).
/// Never calls OS Keychain (Zero authorization popups).
pub fn save_password(connection_id: &str, password: &str) -> Result<(), AppError> {
    default_vault().save_password(connection_id, password)
}

/// Retrieve password from persistent Local Encrypted Vault. Returns Ok(None) if not found.
pub fn get_password(connection_id: &str) -> Result<Option<String>, AppError> {
    default_vault().get_password(connection_id)
}

/// Delete password from persistent Local Encrypted Vault. Idempotent.
pub fn delete_password(connection_id: &str) -> Result<(), AppError> {
    default_vault().delete_password(connection_id)
}

/// Configure Master Password for the default vault
pub fn set_master_password(password: &str) -> Result<(), AppError> {
    default_vault().set_master_password(password)
}

/// Verify if the given password matches the default vault's Master Password
pub fn verify_master_password(password: &str) -> Result<bool, AppError> {
    default_vault().verify_master_password(password)
}

/// Change Master Password for the default vault
pub fn change_master_password(old_password: &str, new_password: &str) -> Result<(), AppError> {
    default_vault().change_master_password(old_password, new_password)
}

/// Check if the default vault is protected by a Master Password
pub fn has_master_password() -> Result<bool, AppError> {
    default_vault().has_master_password()
}

/// Unlock the default vault using the Master Password
pub fn unlock_vault(password: &str) -> Result<(), AppError> {
    default_vault().unlock(password)
}

/// Lock the default vault and clear sensitive data from in-memory cache
pub fn lock_vault() {
    default_vault().lock();
}
