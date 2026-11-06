use serde::{Deserialize, Serialize};

/// Represents any database column value in a unified, type-safe data contract.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
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
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct ColumnMeta {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
}

impl ColumnMeta {
    pub fn new(name: impl Into<String>, data_type: impl Into<String>, nullable: bool) -> Self {
        Self {
            name: name.into(),
            data_type: data_type.into(),
            nullable,
        }
    }
}

/// Unified query result payload returned from Rust backend to frontend.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct QueryResult {
    pub columns: Vec<ColumnMeta>,
    pub rows: Vec<Vec<CellValue>>,
    pub execution_time_ms: u64,
    pub rows_affected: Option<u64>,
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
        }
    }

    pub fn empty() -> Self {
        Self {
            columns: Vec::new(),
            rows: Vec::new(),
            execution_time_ms: 0,
            rows_affected: None,
        }
    }
}
