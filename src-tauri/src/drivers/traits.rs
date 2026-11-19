use crate::error::AppError;
use crate::models::query::{CellValue, ColumnMeta, QueryResult, TableFilterState};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SchemaNodeType {
    Database,
    Schema,
    Table,
    View,
    #[serde(rename = "materialized_view")]
    MaterializedView,
    Column,
    Index,
    #[serde(rename = "foreign_key", alias = "foreignkey")]
    ForeignKey,
    Trigger,
    Function,
    Procedure,
    Sequence,
    #[serde(rename = "custom_type")]
    CustomType,
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

    pub fn with_meta(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        let map = self.metadata.get_or_insert_with(HashMap::new);
        map.insert(key.into(), value.into());
        self
    }
}

#[derive(Debug, Clone)]
pub struct Chunk {
    pub columns: Arc<Vec<ColumnMeta>>,
    pub rows: Vec<Vec<CellValue>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StreamOutcome {
    pub rows_sent: u64,
    pub stopped_early: bool,
}

#[async_trait]
pub trait DatabaseConnection: Send + Sync {
    async fn test_connection(&self) -> Result<u64, AppError>; // คืนค่า Latency (ms)
    async fn execute_query(&self, sql: &str) -> Result<QueryResult, AppError>;
    /// Stream query results in chunks over a bounded mpsc channel for backpressure.
    async fn stream_query(
        &self,
        sql: &str,
        chunk_rows: usize,
        tx: tokio::sync::mpsc::Sender<Chunk>,
    ) -> Result<StreamOutcome, AppError> {
        let chunk_rows = chunk_rows.max(1);
        let result = self.execute_query(sql).await?;
        let columns = Arc::new(result.columns);
        let mut rows_sent: u64 = 0;

        if result.rows.is_empty() {
            if !columns.is_empty() {
                let chunk = Chunk {
                    columns: Arc::clone(&columns),
                    rows: Vec::new(),
                };
                if tx.send(chunk).await.is_err() {
                    return Ok(StreamOutcome {
                        rows_sent: 0,
                        stopped_early: true,
                    });
                }
            }
            return Ok(StreamOutcome {
                rows_sent: 0,
                stopped_early: false,
            });
        }

        let mut iter = result.rows.into_iter().peekable();
        while iter.peek().is_some() {
            let batch: Vec<Vec<CellValue>> = iter.by_ref().take(chunk_rows).collect();
            let count = batch.len() as u64;
            let chunk = Chunk {
                columns: Arc::clone(&columns),
                rows: batch,
            };
            if tx.send(chunk).await.is_err() {
                return Ok(StreamOutcome {
                    rows_sent,
                    stopped_early: true,
                });
            }
            rows_sent += count;
        }

        Ok(StreamOutcome {
            rows_sent,
            stopped_early: false,
        })
    }
    #[allow(clippy::too_many_arguments)]
    async fn fetch_table_data(
        &self,
        schema: Option<&str>,
        table: &str,
        limit: u32,
        offset: u32,
        filter: Option<&str>,
        sort_col: Option<&str>,
        sort_dir: Option<&str>,
    ) -> Result<QueryResult, AppError>;
    async fn fetch_schema_tree(&self) -> Result<Vec<SchemaNode>, AppError>;
    async fn commit(&self) -> Result<(), AppError>;
    async fn rollback(&self) -> Result<(), AppError>;
    async fn cancel(&self) -> Result<(), AppError>;
    async fn set_autocommit(&self, _enabled: bool) -> Result<(), AppError> {
        Ok(())
    }
    async fn get_object_ddl(
        &self,
        _schema: Option<&str>,
        _name: &str,
        _object_type: &str,
    ) -> Result<String, AppError> {
        Err(AppError::NotSupported(
            "Object DDL retrieval not supported for this driver".into(),
        ))
    }
    /// Streams raw CSV bytes from PostgreSQL `COPY (...) TO STDOUT` into `tx`.
    async fn copy_out_csv(
        &self,
        _sql_or_table: &str,
        _include_headers: bool,
        _delimiter: char,
        _tx: tokio::sync::mpsc::Sender<Vec<u8>>,
    ) -> Result<(), AppError> {
        Err(AppError::NotSupported(
            "Native COPY OUT is not supported for this driver".into(),
        ))
    }
    /// Streams raw CSV bytes from `rx` into PostgreSQL `COPY <table> FROM STDIN`.
    async fn copy_in_csv(
        &self,
        _table: &str,
        _columns: &[String],
        _has_headers: bool,
        _delimiter: char,
        _rx: tokio::sync::mpsc::Receiver<Vec<u8>>,
    ) -> Result<u64, AppError> {
        Err(AppError::NotSupported(
            "Native COPY IN is not supported for this driver".into(),
        ))
    }
}

/// Validates a user-supplied table filter clause to prevent SQL injection,
/// stacked queries, comments, and destructive SQL statements while safely
/// allowing string literals containing keywords, hyphens, and slashes.
pub fn validate_table_filter(filter: &str) -> Result<(), AppError> {
    const FORBIDDEN_KEYWORDS: &[&str] = &[
        "UNION", "DROP", "INSERT", "UPDATE", "DELETE", "EXEC", "EXECUTE", "ALTER", "TRUNCATE",
    ];

    let chars: Vec<char> = filter.chars().collect();
    let len = chars.len();
    let mut i = 0;
    let mut in_single_quote = false;
    let mut current_token = String::new();

    while i < len {
        let ch = chars[i];
        let next = if i + 1 < len {
            Some(chars[i + 1])
        } else {
            None
        };

        if ch == '\'' {
            if in_single_quote {
                if next == Some('\'') {
                    // Escaped single quote '' in SQL literal
                    i += 2;
                    continue;
                } else {
                    in_single_quote = false;
                    i += 1;
                    continue;
                }
            } else {
                in_single_quote = true;
                if !current_token.is_empty() {
                    let upper = current_token.to_ascii_uppercase();
                    if FORBIDDEN_KEYWORDS.contains(&upper.as_str()) {
                        return Err(AppError::InvalidInput(
                            "Invalid or insecure filter clause detected".to_string(),
                        ));
                    }
                    current_token.clear();
                }
                i += 1;
                continue;
            }
        }

        if in_single_quote {
            if ch == '\\' && (next == Some('\'') || next == Some('\\')) {
                i += 2;
                continue;
            }
            i += 1;
            continue;
        }

        if ch == ';'
            || (ch == '-' && next == Some('-'))
            || (ch == '/' && next == Some('*'))
            || (ch == '*' && next == Some('/'))
        {
            return Err(AppError::InvalidInput(
                "Invalid or insecure filter clause detected".to_string(),
            ));
        }

        if ch.is_ascii_alphanumeric() || ch == '_' {
            current_token.push(ch);
        } else if !current_token.is_empty() {
            let upper = current_token.to_ascii_uppercase();
            if FORBIDDEN_KEYWORDS.contains(&upper.as_str()) {
                return Err(AppError::InvalidInput(
                    "Invalid or insecure filter clause detected".to_string(),
                ));
            }
            current_token.clear();
        }
        i += 1;
    }

    if in_single_quote {
        return Err(AppError::InvalidInput(
            "Invalid or insecure filter clause detected: unclosed string literal".to_string(),
        ));
    }

    if !current_token.is_empty() {
        let upper = current_token.to_ascii_uppercase();
        if FORBIDDEN_KEYWORDS.contains(&upper.as_str()) {
            return Err(AppError::InvalidInput(
                "Invalid or insecure filter clause detected".to_string(),
            ));
        }
    }

    Ok(())
}

/// Validates that an identifier (such as column name) is safe from SQL injection.
pub fn validate_safe_column_identifier(name: &str) -> Result<(), AppError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput(
            "Column name cannot be empty".to_string(),
        ));
    }
    // Block dangerous SQL syntax in column names
    if trimmed.contains('\0')
        || trimmed.contains(';')
        || trimmed.contains("--")
        || trimmed.contains("/*")
        || trimmed.contains("*/")
        || trimmed.contains('\'')
        || trimmed.contains('"')
        || trimmed.contains('`')
    {
        return Err(AppError::InvalidInput(format!(
            "Invalid column identifier: '{}'",
            name
        )));
    }
    Ok(())
}

/// Builds a safe WHERE clause supporting both Structured JSON AST (`TableFilterState`)
/// and validated Raw SQL filter clauses.
pub fn build_safe_where_clause(filter: Option<&str>, driver: &str) -> Result<String, AppError> {
    let f = match filter {
        Some(s) if !s.trim().is_empty() => s.trim(),
        _ => return Ok(String::new()),
    };

    // 1. Check if filter is a structured JSON AST representation
    if f.starts_with('{') {
        if let Ok(ast) = serde_json::from_str::<TableFilterState>(f) {
            if !ast.enabled {
                return Ok(String::new());
            }

            let conjunction = if ast.conjunction.eq_ignore_ascii_case("OR") {
                "OR"
            } else {
                "AND"
            };

            let mut conditions_sql = Vec::new();
            for cond in ast.conditions {
                let col = cond.column.trim();
                if col.is_empty() {
                    continue;
                }
                validate_safe_column_identifier(col)?;

                let quoted_col = if driver == "mysql" {
                    format!("`{}`", col)
                } else {
                    format!("\"{}\"", col)
                };

                let op_upper = cond.operator.trim().to_ascii_uppercase();
                match op_upper.as_str() {
                    "IS NULL" => conditions_sql.push(format!("{} IS NULL", quoted_col)),
                    "IS NOT NULL" => conditions_sql.push(format!("{} IS NOT NULL", quoted_col)),
                    "=" | "!=" | "<>" | ">" | "<" | ">=" | "<=" => {
                        let raw_val = cond.value.as_deref().unwrap_or("").trim();
                        // Check numeric literal (without leading zero loss)
                        let is_numeric = !raw_val.is_empty()
                            && !raw_val.starts_with('0')
                            && !raw_val.starts_with("-0")
                            && raw_val.parse::<f64>().is_ok();

                        let formatted_val = if is_numeric {
                            raw_val.to_string()
                        } else {
                            let escaped = raw_val.replace('\'', "''");
                            let final_val = if driver == "mysql" {
                                escaped.replace('\\', "\\\\")
                            } else {
                                escaped
                            };
                            format!("'{}'", final_val)
                        };
                        let op = if op_upper == "<>" { "!=" } else { &op_upper };
                        conditions_sql.push(format!("{} {} {}", quoted_col, op, formatted_val));
                    }
                    "LIKE" | "NOT LIKE" => {
                        let raw_val = cond.value.as_deref().unwrap_or("").trim();
                        let escaped = raw_val.replace('\'', "''");
                        let final_val = if driver == "mysql" {
                            escaped.replace('\\', "\\\\")
                        } else {
                            escaped
                        };
                        let pattern = if final_val.contains('%') || final_val.contains('_') {
                            final_val
                        } else {
                            format!("%{}%", final_val)
                        };
                        conditions_sql.push(format!("{} {} '{}'", quoted_col, op_upper, pattern));
                    }
                    _ => {
                        return Err(AppError::InvalidInput(format!(
                            "Unsupported filter operator: '{}'",
                            cond.operator
                        )));
                    }
                }
            }

            if conditions_sql.is_empty() {
                return Ok(String::new());
            }

            return Ok(format!(
                " WHERE {}",
                conditions_sql.join(&format!(" {} ", conjunction))
            ));
        }
    }

    // 2. Fallback: Raw SQL Filter Clause (protected by validate_table_filter)
    validate_table_filter(f)?;
    Ok(format!(" WHERE {}", f))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_safe_where_clause_structured_ast() {
        let json_filter = r#"{
            "enabled": true,
            "conjunction": "AND",
            "conditions": [
                {"column": "age", "operator": ">=", "value": "18"},
                {"column": "status", "operator": "=", "value": "active"},
                {"column": "name", "operator": "LIKE", "value": "John"}
            ]
        }"#;

        let where_clause =
            build_safe_where_clause(Some(json_filter), "sqlite").expect("parse structured filter");
        assert_eq!(
            where_clause,
            " WHERE \"age\" >= 18 AND \"status\" = 'active' AND \"name\" LIKE '%John%'"
        );

        let mysql_where =
            build_safe_where_clause(Some(json_filter), "mysql").expect("parse mysql filter");
        assert_eq!(
            mysql_where,
            " WHERE `age` >= 18 AND `status` = 'active' AND `name` LIKE '%John%'"
        );
    }

    #[test]
    fn test_build_safe_where_clause_structured_ast_rejects_column_injection() {
        let malicious_col = r#"{
            "enabled": true,
            "conjunction": "AND",
            "conditions": [
                {"column": "id; DROP TABLE users; --", "operator": "=", "value": "1"}
            ]
        }"#;
        assert!(build_safe_where_clause(Some(malicious_col), "sqlite").is_err());
    }

    #[test]
    fn test_build_safe_where_clause_raw_fallback() {
        let raw = "status = 'active'";
        let res = build_safe_where_clause(Some(raw), "sqlite").expect("raw filter");
        assert_eq!(res, " WHERE status = 'active'");

        let malicious_raw = "1=1; DROP TABLE users;";
        assert!(build_safe_where_clause(Some(malicious_raw), "sqlite").is_err());
    }

    #[test]
    fn test_validate_table_filter_allows_keywords_in_string_literals() {
        assert!(validate_table_filter("status = 'pending update'").is_ok());
        assert!(validate_table_filter("action = 'delete'").is_ok());
        assert!(validate_table_filter("street = 'Union Ave'").is_ok());
        assert!(validate_table_filter("description = 'drop by tomorrow'").is_ok());
        assert!(validate_table_filter("note LIKE '%--%'").is_ok());
        assert!(validate_table_filter("path = '/*not a comment*/'").is_ok());
        assert!(validate_table_filter("msg = 'hello; world'").is_ok());
        assert!(validate_table_filter("text = 'it''s an update'").is_ok());
    }

    #[test]
    fn test_validate_table_filter_rejects_unclosed_string_literal() {
        let res = validate_table_filter("status = 'pending");
        assert!(res.is_err());
        match res.unwrap_err() {
            AppError::InvalidInput(msg) => {
                assert!(msg.contains("unclosed string literal"));
            }
            other => panic!(
                "Expected InvalidInput with unclosed string literal, got {:?}",
                other
            ),
        }
    }

    #[test]
    fn test_validate_table_filter_rejects_dangerous_keywords_outside_quotes() {
        assert!(validate_table_filter("id = 1 UNION SELECT 1, 2").is_err());
        assert!(validate_table_filter("1=1 DROP TABLE users").is_err());
        assert!(validate_table_filter("1=1 DELETE FROM users").is_err());
        assert!(validate_table_filter("1=1 UPDATE users SET role = 'admin'").is_err());
        assert!(validate_table_filter("id = 1; SELECT 1").is_err());
        assert!(validate_table_filter("id = 1 -- comment").is_err());
        assert!(validate_table_filter("id = 1 /* comment */").is_err());
    }

    struct MockStreamConn {
        result: QueryResult,
    }

    #[async_trait]
    impl DatabaseConnection for MockStreamConn {
        async fn test_connection(&self) -> Result<u64, AppError> {
            Ok(1)
        }
        async fn execute_query(&self, _sql: &str) -> Result<QueryResult, AppError> {
            Ok(self.result.clone())
        }
        async fn fetch_table_data(
            &self,
            _s: Option<&str>,
            _t: &str,
            _l: u32,
            _o: u32,
            _f: Option<&str>,
            _sc: Option<&str>,
            _sd: Option<&str>,
        ) -> Result<QueryResult, AppError> {
            Ok(self.result.clone())
        }
        async fn fetch_schema_tree(&self) -> Result<Vec<SchemaNode>, AppError> {
            Ok(vec![])
        }
        async fn commit(&self) -> Result<(), AppError> {
            Ok(())
        }
        async fn rollback(&self) -> Result<(), AppError> {
            Ok(())
        }
        async fn cancel(&self) -> Result<(), AppError> {
            Ok(())
        }
    }

    #[tokio::test]
    async fn test_default_stream_query_chunks_and_early_stop() {
        let cols = vec![ColumnMeta::new("id", "INTEGER", false)];
        let rows: Vec<Vec<CellValue>> = (1..=10).map(|i| vec![CellValue::Integer(i)]).collect();
        let conn = MockStreamConn {
            result: QueryResult::new(cols, rows, 0, None),
        };

        let (tx, mut rx) = tokio::sync::mpsc::channel(2);
        let stream_fut = conn.stream_query("SELECT id FROM t", 3, tx);
        let consume_fut = async move {
            let mut sizes = Vec::new();
            while let Some(chunk) = rx.recv().await {
                assert_eq!(chunk.columns.len(), 1);
                sizes.push(chunk.rows.len());
            }
            sizes
        };
        let (outcome_res, sizes) = tokio::join!(stream_fut, consume_fut);
        let outcome = outcome_res.expect("default stream_query");
        assert_eq!(sizes, vec![3, 3, 3, 1]);
        assert_eq!(
            outcome,
            StreamOutcome {
                rows_sent: 10,
                stopped_early: false
            }
        );

        // Early stop when rx is dropped
        let (tx2, mut rx2) = tokio::sync::mpsc::channel(1);
        let stream_fut2 = conn.stream_query("SELECT id FROM t", 3, tx2);
        let consume_fut2 = async move {
            let first = rx2.recv().await.expect("first chunk");
            assert_eq!(first.rows.len(), 3);
            drop(rx2);
        };
        let (outcome_res2, ()) = tokio::join!(stream_fut2, consume_fut2);
        let outcome2 = outcome_res2.expect("early stop stream_query");
        assert!(outcome2.stopped_early);
        assert!(outcome2.rows_sent < 10);
    }

    #[tokio::test]
    async fn test_default_stream_query_empty_with_columns() {
        let cols = vec![ColumnMeta::new("id", "INTEGER", false)];
        let conn = MockStreamConn {
            result: QueryResult::new(cols, vec![], 0, None),
        };
        let (tx, mut rx) = tokio::sync::mpsc::channel(2);
        let (outcome_res, chunks) = tokio::join!(
            conn.stream_query("SELECT id FROM empty_t", 10, tx),
            async move {
                let mut out = Vec::new();
                while let Some(c) = rx.recv().await {
                    out.push(c);
                }
                out
            }
        );
        let outcome = outcome_res.expect("empty stream_query");
        assert_eq!(
            outcome,
            StreamOutcome {
                rows_sent: 0,
                stopped_early: false
            }
        );
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].columns.len(), 1);
        assert!(chunks[0].rows.is_empty());
    }
}
