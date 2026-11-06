use std::fs;
use std::path::{Path, PathBuf};
use crate::error::AppError;
use crate::models::ConnectionConfig;
use crate::services::keychain;

#[derive(Debug, Clone)]
pub struct ConnectionStore {
    storage_path: PathBuf,
}

impl ConnectionStore {
    pub fn default_path() -> PathBuf {
        std::env::var("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(".datacore")
            .join("connections.json")
    }

    pub fn new<P: AsRef<Path>>(path: P) -> Self {
        Self {
            storage_path: path.as_ref().to_path_buf(),
        }
    }

    pub fn storage_path(&self) -> &Path {
        &self.storage_path
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

    /// Save or update a connection configuration, and securely store the password in keychain if provided
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
            keychain::save_password(&config.id, pwd)?;
        }

        Ok(())
    }

    /// Delete a connection configuration and its associated password from the keychain
    pub fn delete_connection(&self, id: &str) -> Result<(), AppError> {
        let mut connections = self.list()?;
        connections.retain(|c| c.id != id);

        self.persist_connections(&connections)?;
        let _ = keychain::delete_password(id);

        Ok(())
    }

    /// Retrieve password for a given connection id from the keychain
    pub fn get_password(&self, id: &str) -> Result<Option<String>, AppError> {
        keychain::get_password(id)
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

impl Default for ConnectionStore {
    fn default() -> Self {
        Self::new(Self::default_path())
    }
}
