use crate::services::keychain;

#[test]
fn test_keychain_crud_lifecycle() {
    keychain::set_mock_mode(true);
    keychain::clear_mock_store();

    let conn_id = "test-conn-uuid-1";

    // 1. Password doesn't exist initially
    let initial = keychain::get_password(conn_id).expect("get initial password");
    assert_eq!(initial, None);

    // 2. Save password
    keychain::save_password(conn_id, "my-p@ssw0rd!").expect("save password");

    // 3. Retrieve password
    let retrieved = keychain::get_password(conn_id).expect("get password");
    assert_eq!(retrieved.as_deref(), Some("my-p@ssw0rd!"));

    // 4. Overwrite password
    keychain::save_password(conn_id, "new-p@ssw0rd!").expect("update password");
    let updated = keychain::get_password(conn_id).expect("get updated password");
    assert_eq!(updated.as_deref(), Some("new-p@ssw0rd!"));

    // 5. Delete password
    keychain::delete_password(conn_id).expect("delete password");
    let after_delete = keychain::get_password(conn_id).expect("get after delete");
    assert_eq!(after_delete, None);

    // 6. Delete again is idempotent and does not fail
    keychain::delete_password(conn_id).expect("delete non-existent password");
}
