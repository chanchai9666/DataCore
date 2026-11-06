use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::error::AppError;
use crate::models::query::QueryResult;

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SchemaNodeType {
    Database,
    Schema,
    Table,
    View,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct SchemaNode {
    pub name: String,
    pub node_type: SchemaNodeType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<SchemaNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, String>>,
}

impl SchemaNode {
    pub fn new(name: impl Into<String>, node_type: SchemaNodeType) -> Self {
        Self {
            name: name.into(),
            node_type,
            schema: None,
            children: Vec::new(),
            metadata: None,
        }
    }

    pub fn with_schema(mut self, schema: impl Into<String>) -> Self {
        self.schema = Some(schema.into());
        self
    }

    pub fn with_children(mut self, children: Vec<SchemaNode>) -> Self {
        self.children = children;
        self
    }

    pub fn with_metadata(mut self, metadata: HashMap<String, String>) -> Self {
        self.metadata = Some(metadata);
        self
    }
}

#[async_trait]
pub trait DatabaseConnection: Send + Sync {
    async fn test_connection(&self) -> Result<u64, AppError>; // คืนค่า Latency (ms)
    async fn execute_query(&self, sql: &str) -> Result<QueryResult, AppError>;
    async fn fetch_table_data(&self, schema: Option<&str>, table: &str, limit: u32, offset: u32) -> Result<QueryResult, AppError>;
    async fn fetch_schema_tree(&self) -> Result<Vec<SchemaNode>, AppError>;
    async fn commit(&self) -> Result<(), AppError>;
    async fn rollback(&self) -> Result<(), AppError>;
    async fn cancel(&self) -> Result<(), AppError>;
}
