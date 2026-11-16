use crate::error::AppError;
use std::process::Command;

pub const KEYCHAIN_SERVICE_DEFAULT: &str = "com.datacore.vault";
pub const KEYCHAIN_ACCOUNT_MASTER_KEK: &str = "master-kek";

/// Check whether macOS Keychain CLI is supported on this platform
pub fn is_macos_keychain_supported() -> bool {
    cfg!(target_os = "macos")
}

/// Save a secret to macOS Keychain (via security CLI)
pub fn save_to_macos_keychain(service: &str, account: &str, secret: &str) -> Result<(), AppError> {
    if !is_macos_keychain_supported() {
        return Err(AppError::Other(
            "macOS Keychain is only supported on macOS".to_string(),
        ));
    }

    let output = Command::new("security")
        .args([
            "add-generic-password",
            "-a",
            account,
            "-s",
            service,
            "-w",
            secret,
            "-U", // Update if item already exists
        ])
        .output()
        .map_err(|e| AppError::Other(format!("Failed to execute security CLI: {}", e)))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Other(format!(
            "Failed to save to macOS Keychain: {}",
            err_msg.trim()
        )));
    }

    Ok(())
}

/// Retrieve a secret from macOS Keychain (via security CLI)
pub fn get_from_macos_keychain(service: &str, account: &str) -> Result<Option<String>, AppError> {
    if !is_macos_keychain_supported() {
        return Ok(None);
    }

    let output = Command::new("security")
        .args([
            "find-generic-password",
            "-a",
            account,
            "-s",
            service,
            "-w", // Display password only
        ])
        .output()
        .map_err(|e| AppError::Other(format!("Failed to execute security CLI: {}", e)))?;

    if output.status.success() {
        let secret = String::from_utf8_lossy(&output.stdout).trim_end().to_string();
        return Ok(Some(secret));
    }

    // Return None if item was not found (status code 44 on macOS)
    let err_msg = String::from_utf8_lossy(&output.stderr);
    if err_msg.contains("The specified item could not be found") || output.status.code() == Some(44) {
        return Ok(None);
    }

    Err(AppError::Other(format!(
        "Failed to read from macOS Keychain: {}",
        err_msg.trim()
    )))
}

/// Delete a secret from macOS Keychain
pub fn delete_from_macos_keychain(service: &str, account: &str) -> Result<(), AppError> {
    if !is_macos_keychain_supported() {
        return Ok(());
    }

    let output = Command::new("security")
        .args([
            "delete-generic-password",
            "-a",
            account,
            "-s",
            service,
        ])
        .output()
        .map_err(|e| AppError::Other(format!("Failed to execute security CLI: {}", e)))?;

    // If item was deleted or already not found, consider it success
    let err_msg = String::from_utf8_lossy(&output.stderr);
    if output.status.success()
        || err_msg.contains("The specified item could not be found")
        || output.status.code() == Some(44)
    {
        return Ok(());
    }

    Err(AppError::Other(format!(
        "Failed to delete from macOS Keychain: {}",
        err_msg.trim()
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_macos_keychain_supported() {
        #[cfg(target_os = "macos")]
        assert!(is_macos_keychain_supported());

        #[cfg(not(target_os = "macos"))]
        assert!(!is_macos_keychain_supported());
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn test_macos_keychain_crud_lifecycle() {
        let test_service = "com.datacore.test.keychain";
        let test_account = "test-user-vault";
        let test_secret = "test-secret-value-12345";

        // 1. Ensure clean initial state
        let _ = delete_from_macos_keychain(test_service, test_account);
        assert_eq!(get_from_macos_keychain(test_service, test_account).unwrap(), None);

        // 2. Save secret
        save_to_macos_keychain(test_service, test_account, test_secret)
            .expect("save to keychain should succeed");

        // 3. Retrieve secret
        let retrieved = get_from_macos_keychain(test_service, test_account)
            .expect("get from keychain should succeed");
        assert_eq!(retrieved, Some(test_secret.to_string()));

        // 4. Update secret
        let updated_secret = "test-secret-value-updated-67890";
        save_to_macos_keychain(test_service, test_account, updated_secret)
            .expect("update in keychain should succeed");
        let retrieved_updated = get_from_macos_keychain(test_service, test_account)
            .expect("get updated from keychain should succeed");
        assert_eq!(retrieved_updated, Some(updated_secret.to_string()));

        // 5. Clean up delete
        delete_from_macos_keychain(test_service, test_account)
            .expect("delete from keychain should succeed");
        assert_eq!(get_from_macos_keychain(test_service, test_account).unwrap(), None);
    }
}
