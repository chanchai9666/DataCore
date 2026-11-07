use std::collections::HashMap;
use std::sync::{OnceLock, RwLock};
use crate::error::AppError;

pub const SERVICE_NAME: &str = "datacore";

// In-Memory volatile session password store only.
// NO ACCESS TO OS KEYCHAIN (macOS Keychain, Windows Credential Manager, Linux Secret Service).
// Passwords are typed manually by the user and kept only in volatile RAM during runtime.
static IN_MEMORY_STORE: OnceLock<RwLock<HashMap<String, String>>> = OnceLock::new();

fn get_store() -> &'static RwLock<HashMap<String, String>> {
    IN_MEMORY_STORE.get_or_init(|| RwLock::new(HashMap::new()))
}

/// Compatibility flag (always in memory only, no OS keychain access)
pub fn set_mock_mode(_enabled: bool) {}

/// Compatibility check (always in memory only)
pub fn is_mock_mode() -> bool {
    true
}

/// Clear all entries in the in-memory store.
pub fn clear_mock_store() {
    if let Some(store) = IN_MEMORY_STORE.get() {
        if let Ok(mut lock) = store.write() {
            lock.clear();
        }
    }
}

/// Save password in volatile session memory only. Never touches OS Keychain.
pub fn save_password(connection_id: &str, password: &str) -> Result<(), AppError> {
    let store = get_store();
    let mut map = store
        .write()
        .map_err(|e| AppError::Other(format!("Memory lock error: {}", e)))?;
    map.insert(connection_id.to_string(), password.to_string());
    Ok(())
}

/// Retrieve password from volatile session memory. Returns Ok(None) if not present.
pub fn get_password(connection_id: &str) -> Result<Option<String>, AppError> {
    let store = get_store();
    let map = store
        .read()
        .map_err(|e| AppError::Other(format!("Memory lock error: {}", e)))?;
    Ok(map.get(connection_id).cloned())
}

/// Delete password from volatile session memory.
pub fn delete_password(connection_id: &str) -> Result<(), AppError> {
    let store = get_store();
    let mut map = store
        .write()
        .map_err(|e| AppError::Other(format!("Memory lock error: {}", e)))?;
    map.remove(connection_id);
    Ok(())
}
