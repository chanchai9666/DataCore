pub mod commands;
pub mod drivers;
pub mod error;
pub mod menu;
pub mod models;
pub mod services;
pub mod session;

pub use commands::*;
pub use drivers::*;
pub use error::*;
pub use models::*;
pub use services::*;
pub use session::*;
use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let app_menu = menu::build_app_menu(app.handle())?;
            app.set_menu(app_menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if menu::is_known_menu_action(id) {
                let _ = app.emit("menu://action", id);
            }
        })
        .manage(ConnectionStore::default())
        .manage(SessionManager::default())
        .manage(AuditLogger::default())
        .manage(WorkspaceStore::default())
        .invoke_handler(tauri::generate_handler![
            test_connection,
            get_connections,
            save_connection,
            delete_connection,
            has_stored_password,
            delete_stored_password,
            vault_is_keychain_enabled,
            vault_set_keychain_enabled,
            vault_has_master_password,
            vault_set_master_password,
            vault_change_master_password,
            vault_remove_master_password,
            vault_unlock,
            vault_lock,
            open_session,
            close_session,
            disconnect_connection,
            execute_query,
            fetch_table_data,
            count_table_rows,
            fetch_table_data_keyset,
            cancel_query,
            set_autocommit,
            commit_transaction,
            rollback_transaction,
            get_schema_tree,
            get_object_ddl,
            set_session_password,
            clear_session_password,
            set_session_ssh_passphrase,
            preview_import_file,
            export_data,
            import_data,
            get_table_list_metadata,
            duplicate_table,
            export_sql,
            import_sql,
            copy_table_cross_db,
            cancel_transfer,
            check_native_cli_availability,
            start_native_backup,
            start_native_restore,
            cancel_native_task,
            save_text_file,
            simulate_query_impact,
            get_workspace_state,
            save_workspace_state,
            clear_workspace_state,
            get_audit_logs,
            verify_audit_log_integrity,
            clear_audit_logs,
            record_audit_log,
            set_screen_protection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
