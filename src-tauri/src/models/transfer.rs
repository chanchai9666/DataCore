use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TransferFormat {
    Csv,
    Json,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum JsonStructure {
    Array,
    Ndjson,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ImportErrorPolicy {
    Abort,
    Skip,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct ImportPreview {
    pub detected_delimiter: char,
    pub headers: Vec<String>,
    pub preview_rows: Vec<Vec<String>>,
    pub total_preview_rows: usize,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct ExportOptions {
    pub format: TransferFormat,
    #[serde(default)]
    pub delimiter: Option<char>,
    #[serde(default = "default_true")]
    pub include_headers: bool,
    #[serde(default)]
    pub json_structure: Option<JsonStructure>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct ExportResult {
    pub total_rows: usize,
    pub file_size_bytes: u64,
    pub elapsed_ms: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct ColumnMapping {
    pub source_column: String,
    pub target_column: String,
}

fn default_error_policy() -> ImportErrorPolicy {
    ImportErrorPolicy::Abort
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct ImportOptions {
    pub file_path: String,
    pub format: TransferFormat,
    #[serde(default)]
    pub delimiter: Option<char>,
    #[serde(default = "default_true")]
    pub has_headers: bool,
    pub column_mappings: Vec<ColumnMapping>,
    #[serde(default = "default_error_policy")]
    pub error_policy: ImportErrorPolicy,
    #[serde(default)]
    pub batch_size: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct ImportResult {
    pub total_rows: usize,
    pub imported_rows: usize,
    pub skipped_rows: usize,
    pub elapsed_ms: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct TransferProgress {
    pub current_row: usize,
    pub total_rows: Option<usize>,
    pub status: String,
}
