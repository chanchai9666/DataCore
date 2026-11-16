use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::error::AppError;
use crate::models::query::{QueryResult, TableFilterState};

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SchemaNodeType {
    Database,
    Schema,
    Table,
    View,
    Column,
    Index,
    #[serde(rename = "foreign_key", alias = "foreignkey")]
    ForeignKey,
    Trigger,
    Function,
    Procedure,
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
    #[allow(clippy::too_many_arguments)]
    async fn fetch_table_data(&self, schema: Option<&str>, table: &str, limit: u32, offset: u32, filter: Option<&str>, sort_col: Option<&str>, sort_dir: Option<&str>) -> Result<QueryResult, AppError>;
    async fn fetch_schema_tree(&self) -> Result<Vec<SchemaNode>, AppError>;
    async fn commit(&self) -> Result<(), AppError>;
    async fn rollback(&self) -> Result<(), AppError>;
    async fn cancel(&self) -> Result<(), AppError>;
    async fn set_autocommit(&self, _enabled: bool) -> Result<(), AppError> {
        Ok(())
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
        let next = if i + 1 < len { Some(chars[i + 1]) } else { None };

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
        return Err(AppError::InvalidInput("Column name cannot be empty".to_string()));
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
        return Err(AppError::InvalidInput(format!("Invalid column identifier: '{}'", name)));
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

            return Ok(format!(" WHERE {}", conditions_sql.join(&format!(" {} ", conjunction))));
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

        let where_clause = build_safe_where_clause(Some(json_filter), "sqlite").expect("parse structured filter");
        assert_eq!(where_clause, " WHERE \"age\" >= 18 AND \"status\" = 'active' AND \"name\" LIKE '%John%'");

        let mysql_where = build_safe_where_clause(Some(json_filter), "mysql").expect("parse mysql filter");
        assert_eq!(mysql_where, " WHERE `age` >= 18 AND `status` = 'active' AND `name` LIKE '%John%'");
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
            other => panic!("Expected InvalidInput with unclosed string literal, got {:?}", other),
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
}
