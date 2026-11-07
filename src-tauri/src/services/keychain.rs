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
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;

#[cfg(unix)]
fn set_secure_permissions(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    if let Ok(metadata) = fs::metadata(path) {
        let mut perms = metadata.permissions();
        perms.set_mode(0o600);
        let _ = fs::set_permissions(path, perms);
    }
}

#[cfg(not(unix))]
fn set_secure_permissions(_path: &Path) {}

#[derive(Debug, Clone)]
pub struct Vault {
    vault_dir: PathBuf,
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

    fn get_or_create_key(&self) -> Result<[u8; KEY_LEN], AppError> {
        if !self.vault_dir.exists() {
            fs::create_dir_all(&self.vault_dir)?;
            set_secure_permissions(&self.vault_dir);
        }

        let key_file = self.vault_dir.join(".vault.key");
        if key_file.exists() {
            let key_bytes = fs::read(&key_file)?;
            if key_bytes.len() == KEY_LEN {
                let mut key = [0u8; KEY_LEN];
                key.copy_from_slice(&key_bytes);
                return Ok(key);
            }
        }

        // Generate fresh cryptographically secure 256-bit key
        let mut key_bytes = [0u8; KEY_LEN];
        rand::rng().fill(&mut key_bytes);

        let tmp_key_file = self.vault_dir.join(".vault.key.tmp");
        fs::write(&tmp_key_file, key_bytes)?;
        set_secure_permissions(&tmp_key_file);
        fs::rename(&tmp_key_file, &key_file)?;
        set_secure_permissions(&key_file);

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

        let map: HashMap<String, String> = serde_json::from_slice(&plaintext)
            .unwrap_or_default();

        Ok(map)
    }

    fn save_vault_to_disk(&self, map: &HashMap<String, String>) -> Result<(), AppError> {
        if !self.vault_dir.exists() {
            fs::create_dir_all(&self.vault_dir)?;
            set_secure_permissions(&self.vault_dir);
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
        set_secure_permissions(&tmp_file);
        fs::rename(&tmp_file, &vault_file)?;
        set_secure_permissions(&vault_file);

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
