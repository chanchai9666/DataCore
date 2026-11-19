use serde::{Deserialize, Serialize};
use specta::Type;

/// Represents any database column value in a unified, type-safe data contract.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Type)]
pub enum CellValue {
    Null,
    Text(String),
    Integer(i64),
    Float(f64),
    Boolean(bool),
    Json(serde_json::Value),
    Bytes(String), // base64 encoded string
}

impl CellValue {
    /// Returns true if this value is Null.
    pub fn is_null(&self) -> bool {
        matches!(self, CellValue::Null)
    }

    /// Returns a string slice if this is a Text variant.
    pub fn as_text(&self) -> Option<&str> {
        match self {
            CellValue::Text(s) => Some(s.as_str()),
            _ => None,
        }
    }

    /// Returns i64 if this is an Integer variant.
    pub fn as_i64(&self) -> Option<i64> {
        match self {
            CellValue::Integer(i) => Some(*i),
            _ => None,
        }
    }

    /// Returns f64 if this is a Float variant.
    pub fn as_f64(&self) -> Option<f64> {
        match self {
            CellValue::Float(f) => Some(*f),
            _ => None,
        }
    }

    /// Returns bool if this is a Boolean variant.
    pub fn as_bool(&self) -> Option<bool> {
        match self {
            CellValue::Boolean(b) => Some(*b),
            _ => None,
        }
    }

    /// Returns a reference to the Json value if this is a Json variant.
    pub fn as_json(&self) -> Option<&serde_json::Value> {
        match self {
            CellValue::Json(v) => Some(v),
            _ => None,
        }
    }

    /// Returns base64 string slice if this is a Bytes variant.
    pub fn as_bytes_base64(&self) -> Option<&str> {
        match self {
            CellValue::Bytes(b) => Some(b.as_str()),
            _ => None,
        }
    }

    /// Converts the cell value to a friendly display string for UI rendering.
    pub fn to_display_string(&self) -> String {
        match self {
            CellValue::Null => "NULL".to_string(),
            CellValue::Text(s) => s.clone(),
            CellValue::Integer(i) => i.to_string(),
            CellValue::Float(f) => f.to_string(),
            CellValue::Boolean(b) => b.to_string(),
            CellValue::Json(v) => v.to_string(),
            CellValue::Bytes(b) => format!("[Binary: {} bytes]", b.len()),
        }
    }
}

impl From<String> for CellValue {
    fn from(s: String) -> Self {
        CellValue::Text(s)
    }
}

impl From<&str> for CellValue {
    fn from(s: &str) -> Self {
        CellValue::Text(s.to_string())
    }
}

impl From<i64> for CellValue {
    fn from(i: i64) -> Self {
        CellValue::Integer(i)
    }
}

impl From<i32> for CellValue {
    fn from(i: i32) -> Self {
        CellValue::Integer(i as i64)
    }
}

impl From<i16> for CellValue {
    fn from(i: i16) -> Self {
        CellValue::Integer(i as i64)
    }
}

impl From<i8> for CellValue {
    fn from(i: i8) -> Self {
        CellValue::Integer(i as i64)
    }
}

impl From<u32> for CellValue {
    fn from(u: u32) -> Self {
        CellValue::Integer(u as i64)
    }
}

impl From<u16> for CellValue {
    fn from(u: u16) -> Self {
        CellValue::Integer(u as i64)
    }
}

impl From<u8> for CellValue {
    fn from(u: u8) -> Self {
        CellValue::Integer(u as i64)
    }
}

impl From<f64> for CellValue {
    fn from(f: f64) -> Self {
        CellValue::Float(f)
    }
}

impl From<f32> for CellValue {
    fn from(f: f32) -> Self {
        CellValue::Float(f as f64)
    }
}

impl From<bool> for CellValue {
    fn from(b: bool) -> Self {
        CellValue::Boolean(b)
    }
}

impl From<serde_json::Value> for CellValue {
    fn from(v: serde_json::Value) -> Self {
        CellValue::Json(v)
    }
}

/// Metadata description for a single column in query results.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq, Type)]
pub struct ColumnMeta {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_primary_key: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_auto_increment: Option<bool>,
}

impl ColumnMeta {
    pub fn new(name: impl Into<String>, data_type: impl Into<String>, nullable: bool) -> Self {
        Self {
            name: name.into(),
            data_type: data_type.into(),
            nullable,
            is_primary_key: None,
            is_auto_increment: None,
        }
    }

    pub fn with_primary_key(mut self, is_pk: bool) -> Self {
        self.is_primary_key = Some(is_pk);
        self
    }

    pub fn with_auto_increment(mut self, is_auto: bool) -> Self {
        self.is_auto_increment = Some(is_auto);
        self
    }
}

/// Reason why a streaming read query result was truncated before completion.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Type)]
pub enum TruncationReason {
    RowCapReached,
    ByteCapReached,
}

/// Unified query result payload returned from Rust backend to frontend.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Type)]
pub struct QueryResult {
    pub columns: Vec<ColumnMeta>,
    pub rows: Vec<Vec<CellValue>>,
    pub execution_time_ms: u64,
    pub rows_affected: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub truncated: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub truncation_reason: Option<TruncationReason>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub truncated_bytes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_approximate_count: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<Vec<CellValue>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_more: Option<bool>,
}

impl QueryResult {
    pub fn new(
        columns: Vec<ColumnMeta>,
        rows: Vec<Vec<CellValue>>,
        execution_time_ms: u64,
        rows_affected: Option<u64>,
    ) -> Self {
        Self {
            columns,
            rows,
            execution_time_ms,
            rows_affected,
            truncated: None,
            truncation_reason: None,
            truncated_bytes: None,
            is_approximate_count: None,
            next_cursor: None,
            has_more: None,
        }
    }

    pub fn empty() -> Self {
        Self {
            columns: Vec::new(),
            rows: Vec::new(),
            execution_time_ms: 0,
            rows_affected: None,
            truncated: None,
            truncation_reason: None,
            truncated_bytes: None,
            is_approximate_count: None,
            next_cursor: None,
            has_more: None,
        }
    }

    pub fn with_truncation(mut self, reason: TruncationReason, bytes: u64) -> Self {
        self.truncated = Some(true);
        self.truncation_reason = Some(reason);
        self.truncated_bytes = Some(bytes);
        self
    }

    pub fn with_approximate_count(mut self, is_approx: bool) -> Self {
        self.is_approximate_count = Some(is_approx);
        self
    }

    pub fn with_keyset_cursor(
        mut self,
        next_cursor: Option<Vec<CellValue>>,
        has_more: bool,
    ) -> Self {
        self.next_cursor = next_cursor;
        self.has_more = Some(has_more);
        self
    }
}

/// Simulation result for impact preview before running DELETE or UPDATE queries.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq, Type)]
pub struct ImpactSimulationResult {
    pub is_mutation: bool,
    pub table_name: Option<String>,
    pub affected_rows: u64,
    pub execution_time_ms: u64,
    pub preview_warning: Option<String>,
}

impl ImpactSimulationResult {
    pub fn new(
        is_mutation: bool,
        table_name: Option<String>,
        affected_rows: u64,
        execution_time_ms: u64,
        preview_warning: Option<String>,
    ) -> Self {
        Self {
            is_mutation,
            table_name,
            affected_rows,
            execution_time_ms,
            preview_warning,
        }
    }

    pub fn non_mutation(warning: Option<String>) -> Self {
        Self {
            is_mutation: false,
            table_name: None,
            affected_rows: 0,
            execution_time_ms: 0,
            preview_warning: warning,
        }
    }
}

fn default_true() -> bool {
    true
}

fn default_conjunction() -> String {
    "AND".to_string()
}

/// A structured single filter condition.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq, Type)]
#[serde(rename_all = "camelCase")]
pub struct FilterCondition {
    #[serde(default)]
    pub id: Option<String>,
    pub column: String,
    pub operator: String,
    #[serde(default)]
    pub value: Option<String>,
}

/// A structured table filter AST representing conjunction and a list of conditions.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq, Type)]
#[serde(rename_all = "camelCase")]
pub struct TableFilterState {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_conjunction")]
    pub conjunction: String,
    #[serde(default)]
    pub conditions: Vec<FilterCondition>,
}
