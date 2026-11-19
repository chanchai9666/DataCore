use crate::drivers::traits::validate_safe_column_identifier;
use crate::error::AppError;
use crate::models::query::CellValue;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeysetDirection {
    Next,
    Prev,
}

impl KeysetDirection {
    pub fn from_str_opt(s: Option<&str>) -> Self {
        match s {
            Some(v) if v.eq_ignore_ascii_case("prev") => Self::Prev,
            _ => Self::Next,
        }
    }
}

pub fn quote_keyset_identifier(name: &str, driver: &str) -> String {
    match driver {
        "mysql" => format!("`{}`", name.replace('`', "``")),
        "mssql" => format!("[{}]", name.replace(']', "]]")),
        _ => format!("\"{}\"", name.replace('"', "\"\"")),
    }
}

pub fn quote_keyset_table_ref(schema: Option<&str>, table: &str, driver: &str) -> String {
    match schema {
        Some(sch) if !sch.trim().is_empty() => format!(
            "{}.{}",
            quote_keyset_identifier(sch.trim(), driver),
            quote_keyset_identifier(table, driver)
        ),
        _ => quote_keyset_identifier(table, driver),
    }
}

fn format_cell_literal(val: &CellValue, driver: &str) -> Result<String, AppError> {
    match val {
        CellValue::Integer(i) => Ok(i.to_string()),
        CellValue::Float(f) => {
            if f.is_finite() {
                Ok(f.to_string())
            } else {
                Err(AppError::InvalidInput(
                    "Non-finite float in keyset cursor".into(),
                ))
            }
        }
        CellValue::Boolean(b) => {
            if driver == "mssql" {
                Ok(if *b { "1" } else { "0" }.to_string())
            } else {
                Ok(if *b { "TRUE" } else { "FALSE" }.to_string())
            }
        }
        CellValue::Text(s) => {
            let escaped = s.replace('\'', "''");
            let final_val = if driver == "mysql" {
                escaped.replace('\\', "\\\\")
            } else {
                escaped
            };
            Ok(format!("'{}'", final_val))
        }
        CellValue::Null => Err(AppError::InvalidInput(
            "Keyset cursor value cannot be NULL".into(),
        )),
        CellValue::Json(_) | CellValue::Bytes(_) => Err(AppError::InvalidInput(
            "Unsupported keyset cursor column type".into(),
        )),
    }
}

/// Builds a keyset pagination predicate and ORDER BY clause supporting single and composite keys.
/// Returns `(optional_where_predicate, order_by_clause, needs_row_reversal)`.
pub fn build_keyset_clause(
    key_columns: &[String],
    cursor_values: Option<&[CellValue]>,
    direction: KeysetDirection,
    sort_dir: &str,
    driver: &str,
) -> Result<(Option<String>, String, bool), AppError> {
    if key_columns.is_empty() {
        return Err(AppError::InvalidInput(
            "At least one key column is required for keyset pagination".into(),
        ));
    }

    for col in key_columns {
        validate_safe_column_identifier(col)?;
    }

    let base_asc = !sort_dir.eq_ignore_ascii_case("DESC");
    let has_cursor = cursor_values.is_some();
    let needs_reverse = direction == KeysetDirection::Prev && has_cursor;
    let effective_asc = if needs_reverse { !base_asc } else { base_asc };

    let op = if effective_asc { ">" } else { "<" };
    let order_dir = if effective_asc { "ASC" } else { "DESC" };

    let order_by_parts: Vec<String> = key_columns
        .iter()
        .map(|col| {
            format!(
                "{} {}",
                quote_keyset_identifier(col.trim(), driver),
                order_dir
            )
        })
        .collect();
    let order_by_clause = format!(" ORDER BY {}", order_by_parts.join(", "));

    let Some(vals) = cursor_values else {
        return Ok((None, order_by_clause, false));
    };

    if vals.len() != key_columns.len() {
        return Err(AppError::InvalidInput(format!(
            "Keyset cursor length ({}) does not match key columns length ({})",
            vals.len(),
            key_columns.len()
        )));
    }

    let quoted_cols: Vec<String> = key_columns
        .iter()
        .map(|c| quote_keyset_identifier(c.trim(), driver))
        .collect();
    let formatted_vals: Vec<String> = vals
        .iter()
        .map(|v| format_cell_literal(v, driver))
        .collect::<Result<Vec<_>, _>>()?;

    let mut or_terms = Vec::with_capacity(key_columns.len());
    for i in 0..key_columns.len() {
        let mut and_parts = Vec::with_capacity(i + 1);
        for j in 0..i {
            and_parts.push(format!("{} = {}", quoted_cols[j], formatted_vals[j]));
        }
        and_parts.push(format!("{} {} {}", quoted_cols[i], op, formatted_vals[i]));
        if and_parts.len() == 1 {
            or_terms.push(and_parts.into_iter().next().unwrap());
        } else {
            or_terms.push(format!("({})", and_parts.join(" AND ")));
        }
    }

    let predicate = if or_terms.len() == 1 {
        or_terms.into_iter().next().unwrap()
    } else {
        format!("({})", or_terms.join(" OR "))
    };

    Ok((Some(predicate), order_by_clause, needs_reverse))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_single_key_next_asc() {
        let keys = vec!["id".to_string()];
        let cursor = vec![CellValue::Integer(100)];
        let (pred, order, rev) = build_keyset_clause(
            &keys,
            Some(&cursor),
            KeysetDirection::Next,
            "ASC",
            "postgres",
        )
        .expect("build single key");
        assert_eq!(pred.as_deref(), Some("\"id\" > 100"));
        assert_eq!(order, " ORDER BY \"id\" ASC");
        assert!(!rev);
    }

    #[test]
    fn test_single_key_prev_asc() {
        let keys = vec!["id".to_string()];
        let cursor = vec![CellValue::Integer(100)];
        let (pred, order, rev) =
            build_keyset_clause(&keys, Some(&cursor), KeysetDirection::Prev, "ASC", "mysql")
                .expect("build prev key");
        assert_eq!(pred.as_deref(), Some("`id` < 100"));
        assert_eq!(order, " ORDER BY `id` DESC");
        assert!(rev);
    }

    #[test]
    fn test_composite_key_next_asc() {
        let keys = vec!["tenant_id".to_string(), "created_id".to_string()];
        let cursor = vec![
            CellValue::Text("acme's".to_string()),
            CellValue::Integer(42),
        ];
        let (pred, order, rev) =
            build_keyset_clause(&keys, Some(&cursor), KeysetDirection::Next, "ASC", "sqlite")
                .expect("build composite key");
        assert_eq!(
            pred.as_deref(),
            Some("(\"tenant_id\" > 'acme''s' OR (\"tenant_id\" = 'acme''s' AND \"created_id\" > 42))")
        );
        assert_eq!(order, " ORDER BY \"tenant_id\" ASC, \"created_id\" ASC");
        assert!(!rev);
    }

    #[test]
    fn test_first_page_without_cursor() {
        let keys = vec!["id".to_string()];
        let (pred, order, rev) =
            build_keyset_clause(&keys, None, KeysetDirection::Next, "DESC", "mssql")
                .expect("build first page");
        assert!(pred.is_none());
        assert_eq!(order, " ORDER BY [id] DESC");
        assert!(!rev);
    }

    #[test]
    fn test_rejects_unsafe_key_column() {
        let keys = vec!["id; DROP TABLE users".to_string()];
        assert!(build_keyset_clause(&keys, None, KeysetDirection::Next, "ASC", "sqlite").is_err());
    }
}
