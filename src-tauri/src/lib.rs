pub mod commands;
pub mod drivers;
pub mod error;
pub mod models;
pub mod services;
pub mod session;

pub use commands::*;
pub use drivers::*;
pub use error::*;
pub use models::*;
pub use services::*;
pub use session::*;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ConnectionStore::default())
        .manage(SessionManager::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            test_connection,
            get_connections,
            save_connection,
            delete_connection,
            get_stored_password,
            delete_stored_password,
            open_session,
            close_session,
            disconnect_connection,
            execute_query,
            fetch_table_data,
            cancel_query,
            set_autocommit,
            commit_transaction,
            rollback_transaction,
            get_schema_tree,
            preview_import_file,
            export_data,
            import_data,
            get_table_list_metadata,
            duplicate_table,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
