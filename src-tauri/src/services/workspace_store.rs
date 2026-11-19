use crate::error::AppError;
use crate::models::WorkspaceState;
use crate::services::keychain::{set_secure_dir_permissions, set_secure_permissions, Vault};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct WorkspaceStore {
    storage_path: PathBuf,
}

impl Default for WorkspaceStore {
    fn default() -> Self {
        Self::new(Self::default_path())
    }
}

impl WorkspaceStore {
    pub fn default_path() -> PathBuf {
        Vault::default_dir().join("workspace_state.json")
    }

    pub fn new<P: AsRef<Path>>(path: P) -> Self {
        Self {
            storage_path: path.as_ref().to_path_buf(),
        }
    }

    /// Load saved workspace state from disk
    pub fn load(&self) -> Result<Option<WorkspaceState>, AppError> {
        if !self.storage_path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(&self.storage_path)?;
        if content.trim().is_empty() {
            return Ok(None);
        }

        let state: WorkspaceState = serde_json::from_str(&content)?;
        Ok(Some(state))
    }

    /// Persist workspace state to disk atomically with POSIX 0600 permissions
    pub fn save(&self, state: &WorkspaceState) -> Result<(), AppError> {
        if let Some(parent) = self.storage_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)?;
                set_secure_dir_permissions(parent)?;
            }
        }

        let json = serde_json::to_string_pretty(state)?;
        let file_name = self
            .storage_path
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or("workspace_state.json");
        let tmp_path = self
            .storage_path
            .with_file_name(format!("{}.tmp", file_name));

        fs::write(&tmp_path, json)?;
        set_secure_permissions(&tmp_path)?;
        fs::rename(&tmp_path, &self.storage_path)?;
        set_secure_permissions(&self.storage_path)?;

        Ok(())
    }

    /// Delete stored workspace state file
    pub fn clear(&self) -> Result<(), AppError> {
        if self.storage_path.exists() {
            fs::remove_file(&self.storage_path)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_workspace_store_lifecycle() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("workspace_state.json");
        let store = WorkspaceStore::new(&path);

        // 1. Initial state is None
        assert_eq!(store.load().unwrap(), None);

        // 2. Save workspace state
        let mut state = WorkspaceState::new();
        state.active_connection_id = Some("conn-postgres-prod".to_string());
        state.active_tab_id = Some("tab-sql-1".to_string());
        state.sidebar_width = Some(280.0);
        state.sidebar_collapsed = Some(false);
        state.sql_editor_ratio = Some(0.45);
        state.tabs = vec![serde_json::json!({
            "id": "tab-sql-1",
            "title": "Query 1",
            "type": "sql",
            "queryContent": "SELECT * FROM users;"
        })];

        store.save(&state).expect("save workspace state");
        assert!(path.exists());

        // 3. Load back and verify equality
        let loaded = store.load().unwrap().expect("loaded workspace state");
        assert_eq!(
            loaded.active_connection_id.as_deref(),
            Some("conn-postgres-prod")
        );
        assert_eq!(loaded.active_tab_id.as_deref(), Some("tab-sql-1"));
        assert_eq!(loaded.sidebar_width, Some(280.0));
        assert_eq!(loaded.sidebar_collapsed, Some(false));
        assert_eq!(loaded.sql_editor_ratio, Some(0.45));
        assert_eq!(loaded.tabs.len(), 1);

        // 4. Clear workspace state
        store.clear().expect("clear workspace state");
        assert!(!path.exists());
        assert_eq!(store.load().unwrap(), None);
    }
}
