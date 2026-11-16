use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Default, Type)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceState {
    pub active_connection_id: Option<String>,
    #[serde(default)]
    pub tabs: Vec<serde_json::Value>,
    pub active_tab_id: Option<String>,
    pub sidebar_width: Option<f64>,
    pub sidebar_collapsed: Option<bool>,
    pub sql_editor_ratio: Option<f64>,
    pub custom_settings: Option<serde_json::Value>,
}

impl WorkspaceState {
    pub fn new() -> Self {
        Self::default()
    }
}
