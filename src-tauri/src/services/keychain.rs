use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{OnceLock, RwLock};
use crate::error::AppError;

pub const SERVICE_NAME: &str = "datacore";

static MOCK_MODE: AtomicBool = AtomicBool::new(false);
static MOCK_KEYRING: OnceLock<RwLock<HashMap<String, String>>> = OnceLock::new();

fn get_mock_store() -> &'static RwLock<HashMap<String, String>> {
    MOCK_KEYRING.get_or_init(|| RwLock::new(HashMap::new()))
}

/// Enable or disable in-memory mock keychain mode (useful for testing or CI environments without macOS UI Keychain).
pub fn set_mock_mode(enabled: bool) {
    MOCK_MODE.store(enabled, Ordering::SeqCst);
}

/// Check if mock mode is active.
pub fn is_mock_mode() -> bool {
    if std::env::var("DATACORE_FORCE_REAL_KEYCHAIN").map(|v| v == "1").unwrap_or(false) {
        return false;
    }
    MOCK_MODE.load(Ordering::SeqCst)
        || std::env::var("DATACORE_MOCK_KEYCHAIN").map(|v| v == "1" || v == "true").unwrap_or(false)
        || cfg!(test)
}

/// Clear all entries in the mock keychain store.
pub fn clear_mock_store() {
    if let Some(store) = MOCK_KEYRING.get() {
        if let Ok(mut lock) = store.write() {
            lock.clear();
        }
    }
}

/// Save password securely for a given connection id in OS Keychain.
pub fn save_password(connection_id: &str, password: &str) -> Result<(), AppError> {
    if is_mock_mode() {
        let store = get_mock_store();
        let mut map = store
            .write()
            .map_err(|e| AppError::Other(format!("Mock lock error: {}", e)))?;
        map.insert(connection_id.to_string(), password.to_string());
        return Ok(());
    }

    let entry = keyring::Entry::new(SERVICE_NAME, connection_id)?;
    entry.set_password(password)?;
    Ok(())
}

/// Retrieve password for a given connection id from OS Keychain. Returns Ok(None) if not found.
pub fn get_password(connection_id: &str) -> Result<Option<String>, AppError> {
    if is_mock_mode() {
        let store = get_mock_store();
        let map = store
            .read()
            .map_err(|e| AppError::Other(format!("Mock lock error: {}", e)))?;
        return Ok(map.get(connection_id).cloned());
    }

    let entry = keyring::Entry::new(SERVICE_NAME, connection_id)?;
    match entry.get_password() {
        Ok(pwd) => Ok(Some(pwd)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::from(e)),
    }
}

/// Delete password for a given connection id from OS Keychain. Returns Ok(()) even if password does not exist.
pub fn delete_password(connection_id: &str) -> Result<(), AppError> {
    if is_mock_mode() {
        let store = get_mock_store();
        let mut map = store
            .write()
            .map_err(|e| AppError::Other(format!("Mock lock error: {}", e)))?;
        map.remove(connection_id);
        return Ok(());
    }

    let entry = keyring::Entry::new(SERVICE_NAME, connection_id)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::from(e)),
    }
}
