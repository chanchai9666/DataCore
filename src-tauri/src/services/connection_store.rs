use std::fs;
use std::path::{Path, PathBuf};
use crate::error::AppError;
use crate::models::ConnectionConfig;
use crate::services::keychain::Vault;

#[derive(Debug, Clone)]
pub struct ConnectionStore {
    storage_path: PathBuf,
    vault: Vault,
}

impl Default for ConnectionStore {
    fn default() -> Self {
        Self::new(Self::default_path())
    }
}

impl ConnectionStore {
    pub fn default_path() -> PathBuf {
        Vault::default_dir().join("connections.json")
    }

    pub fn new<P: AsRef<Path>>(path: P) -> Self {
        let storage_path = path.as_ref().to_path_buf();
        let vault_dir = storage_path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(Vault::default_dir);
        Self {
            storage_path,
            vault: Vault::new(vault_dir),
        }
    }

    pub fn storage_path(&self) -> &Path {
        &self.storage_path
    }

    pub fn vault(&self) -> &Vault {
        &self.vault
    }

    /// List all stored connection configurations
    pub fn list(&self) -> Result<Vec<ConnectionConfig>, AppError> {
        if !self.storage_path.exists() {
            return Ok(Vec::new());
        }

        let content = fs::read_to_string(&self.storage_path)?;
        if content.trim().is_empty() {
            return Ok(Vec::new());
        }

        let connections: Vec<ConnectionConfig> = serde_json::from_str(&content)?;
        Ok(connections)
    }

    /// Get a single connection configuration by id
    pub fn get(&self, id: &str) -> Result<Option<ConnectionConfig>, AppError> {
        let connections = self.list()?;
        Ok(connections.into_iter().find(|c| c.id == id))
    }

    /// Save or update a connection configuration, and securely store the password in vault if provided
    pub fn save_connection(
        &self,
        config: &ConnectionConfig,
        password: Option<&str>,
    ) -> Result<(), AppError> {
        let mut connections = self.list()?;

        if let Some(pos) = connections.iter().position(|c| c.id == config.id) {
            connections[pos] = config.clone();
        } else {
            connections.push(config.clone());
        }

        self.persist_connections(&connections)?;

        if let Some(pwd) = password {
            self.vault.save_password(&config.id, pwd)?;
        }

        Ok(())
    }

    /// Delete a connection configuration and its associated password from the vault
    pub fn delete_connection(&self, id: &str) -> Result<(), AppError> {
        let mut connections = self.list()?;
        connections.retain(|c| c.id != id);

        self.persist_connections(&connections)?;
        let _ = self.vault.delete_password(id);

        Ok(())
    }

    /// Retrieve password for a given connection id from the vault
    pub fn get_password(&self, id: &str) -> Result<Option<String>, AppError> {
        self.vault.get_password(id)
    }

    /// Delete password for a given connection id from the vault
    pub fn delete_password(&self, id: &str) -> Result<(), AppError> {
        self.vault.delete_password(id)
    }

    /// Save password directly into the vault
    pub fn save_password(&self, id: &str, password: &str) -> Result<(), AppError> {
        self.vault.save_password(id, password)
    }

    /// Helper to write connection list to disk atomically with directory creation
    fn persist_connections(&self, connections: &[ConnectionConfig]) -> Result<(), AppError> {
        if let Some(parent) = self.storage_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)?;
            }
        }

        let json = serde_json::to_string_pretty(connections)?;
        let file_name = self
            .storage_path
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or("connections.json");
        let tmp_path = self
            .storage_path
            .with_file_name(format!("{}.tmp", file_name));

        fs::write(&tmp_path, json)?;
        fs::rename(&tmp_path, &self.storage_path)?;

        Ok(())
    }
}
