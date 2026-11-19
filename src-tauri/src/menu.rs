use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Runtime};

pub const MENU_NEW_CONNECTION: &str = "new-connection";
pub const MENU_NEW_QUERY: &str = "new-query";
pub const MENU_CLOSE_TAB: &str = "close-tab";
pub const MENU_REFRESH_SCHEMA: &str = "refresh-schema";
pub const MENU_TOGGLE_THEME: &str = "toggle-theme";
pub const MENU_TOGGLE_SCREEN_PROTECTION: &str = "toggle-screen-protection";
pub const MENU_COMMAND_PALETTE: &str = "command-palette";
pub const MENU_KEYBOARD_SHORTCUTS: &str = "keyboard-shortcuts";
pub const MENU_CHECK_UPDATES: &str = "check-updates";
pub const MENU_EXPORT_DIAGNOSTICS: &str = "export-diagnostics";
pub const MENU_ABOUT: &str = "about";

pub const KNOWN_MENU_ACTIONS: &[&str] = &[
    MENU_ABOUT,
    MENU_NEW_CONNECTION,
    MENU_NEW_QUERY,
    MENU_CLOSE_TAB,
    MENU_REFRESH_SCHEMA,
    MENU_TOGGLE_THEME,
    MENU_TOGGLE_SCREEN_PROTECTION,
    MENU_COMMAND_PALETTE,
    MENU_KEYBOARD_SHORTCUTS,
    MENU_CHECK_UPDATES,
    MENU_EXPORT_DIAGNOSTICS,
];

pub fn is_known_menu_action(id: &str) -> bool {
    KNOWN_MENU_ACTIONS.contains(&id)
}

pub fn build_app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let app_menu = SubmenuBuilder::new(app, "DataCore")
        .item(&MenuItemBuilder::with_id(MENU_ABOUT, "About DataCore").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id(MENU_CHECK_UPDATES, "Check for Updates...").build(app)?)
        .item(
            &MenuItemBuilder::with_id(MENU_EXPORT_DIAGNOSTICS, "Export Diagnostic Bundle...")
                .build(app)?,
        )
        .separator()
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .item(&PredefinedMenuItem::show_all(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(
            &MenuItemBuilder::with_id(MENU_NEW_CONNECTION, "New Connection...")
                .accelerator("CmdOrCtrl+N")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id(MENU_NEW_QUERY, "New Query Tab")
                .accelerator("CmdOrCtrl+T")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id(MENU_CLOSE_TAB, "Close Tab")
                .accelerator("CmdOrCtrl+W")
                .build(app)?,
        )
        .item(&PredefinedMenuItem::close_window(app, None)?)
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(
            &MenuItemBuilder::with_id(MENU_COMMAND_PALETTE, "Command Palette...")
                .accelerator("CmdOrCtrl+K")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id(MENU_TOGGLE_THEME, "Toggle Light / Dark Theme")
                .accelerator("CmdOrCtrl+D")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id(
                MENU_TOGGLE_SCREEN_PROTECTION,
                "Toggle Screen Sharing Protection",
            )
            .build(app)?,
        )
        .separator()
        .item(&MenuItemBuilder::with_id(MENU_REFRESH_SCHEMA, "Refresh Schema").build(app)?)
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::maximize(app, None)?)
        .build()?;

    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(
            &MenuItemBuilder::with_id(MENU_KEYBOARD_SHORTCUTS, "Keyboard Shortcuts...")
                .accelerator("CmdOrCtrl+/")
                .build(app)?,
        )
        .build()?;

    MenuBuilder::new(app)
        .items(&[
            &app_menu,
            &file_menu,
            &edit_menu,
            &view_menu,
            &window_menu,
            &help_menu,
        ])
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_known_menu_actions_contains_all_expected_ids() {
        assert_eq!(KNOWN_MENU_ACTIONS.len(), 11);
        assert!(is_known_menu_action("about"));
        assert!(is_known_menu_action("new-connection"));
        assert!(is_known_menu_action("new-query"));
        assert!(is_known_menu_action("close-tab"));
        assert!(is_known_menu_action("refresh-schema"));
        assert!(is_known_menu_action("toggle-theme"));
        assert!(is_known_menu_action("toggle-screen-protection"));
        assert!(is_known_menu_action("command-palette"));
        assert!(is_known_menu_action("keyboard-shortcuts"));
        assert!(is_known_menu_action("check-updates"));
        assert!(is_known_menu_action("export-diagnostics"));
        assert!(!is_known_menu_action("unknown-action"));
    }
}
