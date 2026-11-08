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

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TableMetadata {
    pub name: String,
    #[serde(alias = "approx_row_count")]
    pub approx_row_count: i64,
    #[serde(alias = "data_size_bytes")]
    pub data_size_bytes: u64,
    #[serde(alias = "index_size_bytes")]
    pub index_size_bytes: u64,
    #[serde(alias = "total_size_bytes")]
    pub total_size_bytes: u64,
    pub engine: Option<String>,
    pub collation: Option<String>,
    pub comment: Option<String>,
    #[serde(alias = "created_at")]
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateTableOptions {
    #[serde(alias = "connection_id")]
    pub connection_id: String,
    pub schema: Option<String>,
    #[serde(alias = "source_table")]
    pub source_table: String,
    #[serde(alias = "new_table_name")]
    pub new_table_name: String,
    #[serde(alias = "copy_data")]
    pub copy_data: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SqlExportOptions {
    #[serde(alias = "connection_id")]
    pub connection_id: String,
    pub schema: Option<String>,
    pub tables: Vec<String>,
    #[serde(alias = "file_path")]
    pub file_path: String,
    #[serde(alias = "include_drop_table")]
    pub include_drop_table: bool,
    #[serde(alias = "include_structure")]
    pub include_structure: bool,
    #[serde(alias = "include_data")]
    pub include_data: bool,
    #[serde(default, alias = "batch_size")]
    pub batch_size: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SqlImportOptions {
    #[serde(alias = "connection_id")]
    pub connection_id: String,
    pub schema: Option<String>,
    #[serde(alias = "file_path")]
    pub file_path: String,
    #[serde(alias = "error_policy")]
    pub error_policy: String, // "abort" | "continue"
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SqlExportResult {
    #[serde(alias = "total_tables")]
    pub total_tables: usize,
    #[serde(alias = "total_rows")]
    pub total_rows: usize,
    #[serde(alias = "file_size_bytes")]
    pub file_size_bytes: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SqlImportResult {
    #[serde(alias = "total_statements")]
    pub total_statements: usize,
    #[serde(alias = "successful_statements")]
    pub successful_statements: usize,
    #[serde(alias = "failed_statements")]
    pub failed_statements: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CrossDbCopyTableOptions {
    #[serde(alias = "source_connection_id")]
    pub source_connection_id: String,
    #[serde(alias = "source_schema")]
    pub source_schema: Option<String>,
    #[serde(alias = "source_table")]
    pub source_table: String,
    #[serde(alias = "target_connection_id")]
    pub target_connection_id: String,
    #[serde(alias = "target_schema")]
    pub target_schema: Option<String>,
    #[serde(alias = "target_table")]
    pub target_table: String,
    #[serde(alias = "copy_structure")]
    pub copy_structure: bool,
    #[serde(alias = "drop_target_if_exists")]
    pub drop_target_if_exists: bool,
    #[serde(alias = "copy_data")]
    pub copy_data: bool,
    #[serde(default, alias = "batch_size")]
    pub batch_size: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CrossDbCopyResult {
    #[serde(alias = "rows_transferred")]
    pub rows_transferred: usize,
    #[serde(alias = "elapsed_ms")]
    pub elapsed_ms: u64,
}
