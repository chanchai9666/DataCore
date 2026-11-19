pub mod duckdb;
pub mod keyset;
pub mod mssql;
pub mod mysql;
pub mod postgres;
pub mod sqlite;
pub mod traits;

pub use duckdb::*;
pub use keyset::*;
pub use mssql::*;
pub use mysql::*;
pub use postgres::*;
pub use sqlite::*;
pub use traits::*;

use crate::models::QueryResult;

/// Minimum estimated row count required before trusting fast metadata approximations
/// instead of running an exact `SELECT COUNT(*)`.
pub(crate) const APPROX_COUNT_THRESHOLD: u64 = 10_000;

/// Reconciles the reported `rows_affected` and `is_approximate_count` of a paged query
/// against the actual rows returned for the current page.
pub(crate) fn reconcile_page_row_count(
    res: &mut QueryResult,
    total_count: Option<u64>,
    is_approx: bool,
    limit: u32,
    offset: u32,
) {
    let fetched = res.rows.len();
    let limit_usize = limit as usize;
    let offset_usize = offset as usize;
    if fetched < limit_usize && (offset_usize == 0 || fetched > 0) {
        // Fewer rows returned than the page limit guarantees we reached the end of the result set.
        res.rows_affected = Some((offset_usize + fetched) as u64);
        res.is_approximate_count = None;
        return;
    }

    if let Some(count) = total_count {
        let min_possible = (offset_usize + fetched) as u64;
        if is_approx {
            res.rows_affected = Some(count.max(min_possible));
            res.is_approximate_count = Some(true);
        } else {
            res.rows_affected = Some(count);
            res.is_approximate_count = None;
        }
    }
}

#[cfg(test)]
mod duckdb_test;
#[cfg(test)]
mod sqlite_test;

/// Extracts uppercase SQL identifier/keyword tokens per statement, skipping comments and string literals.
fn tokenize_sql_statements(sql: &str) -> Vec<Vec<(String, usize)>> {
    let bytes = sql.as_bytes();
    let len = bytes.len();
    let mut i = 0;
    let mut paren_depth: usize = 0;
    let mut statements: Vec<Vec<(String, usize)>> = vec![Vec::new()];

    while i < len {
        let b = bytes[i];

        // Skip whitespace
        if b.is_ascii_whitespace() {
            i += 1;
            continue;
        }

        // Single-line comment --
        if b == b'-' && i + 1 < len && bytes[i + 1] == b'-' {
            i += 2;
            while i < len && bytes[i] != b'\n' {
                i += 1;
            }
            continue;
        }

        // Block comment /* ... */
        if b == b'/' && i + 1 < len && bytes[i + 1] == b'*' {
            i += 2;
            while i + 1 < len && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                i += 1;
            }
            i = (i + 2).min(len);
            continue;
        }

        // String literals ('...', "...", `...`)
        if b == b'\'' || b == b'"' || b == b'`' {
            let quote = b;
            i += 1;
            while i < len {
                if bytes[i] == quote {
                    if i + 1 < len && bytes[i + 1] == quote {
                        i += 2; // escaped quote
                        continue;
                    }
                    i += 1;
                    break;
                }
                if quote != b'"' && bytes[i] == b'\\' && i + 1 < len {
                    i += 2;
                    continue;
                }
                i += 1;
            }
            continue;
        }

        // Track parentheses depth
        if b == b'(' {
            paren_depth += 1;
            i += 1;
            continue;
        }
        if b == b')' {
            paren_depth = paren_depth.saturating_sub(1);
            i += 1;
            continue;
        }

        // Statement separator
        if b == b';' {
            if !statements.last().map(|s| s.is_empty()).unwrap_or(true) {
                statements.push(Vec::new());
            }
            i += 1;
            continue;
        }

        // Word/identifier token
        if b.is_ascii_alphanumeric() || b == b'_' {
            let start = i;
            while i < len && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_') {
                i += 1;
            }
            let word = sql[start..i].to_ascii_uppercase();
            if let Some(cur) = statements.last_mut() {
                cur.push((word, paren_depth));
            }
            continue;
        }

        i += 1;
    }

    statements.into_iter().filter(|s| !s.is_empty()).collect()
}

fn is_write_keyword(word: &str) -> bool {
    matches!(
        word,
        "INSERT"
            | "UPDATE"
            | "DELETE"
            | "DROP"
            | "ALTER"
            | "CREATE"
            | "TRUNCATE"
            | "REPLACE"
            | "MERGE"
            | "UPSERT"
            | "GRANT"
            | "REVOKE"
    )
}

/// Returns true if any SQL statement in the batch performs a write/DDL/DCL operation,
/// including CTE writes (`WITH ... DELETE/UPDATE/INSERT`) and `SELECT ... INTO`.
pub(crate) fn is_write_sql(sql: &str) -> bool {
    for stmt in tokenize_sql_statements(sql) {
        let Some((first_word, _)) = stmt.first() else {
            continue;
        };
        if is_write_keyword(first_word) {
            return true;
        }
        if first_word == "WITH" && stmt.iter().any(|(w, _)| is_write_keyword(w)) {
            return true;
        }
        if first_word == "SELECT" && stmt.iter().any(|(w, depth)| *depth == 0 && w == "INTO") {
            return true;
        }
    }
    false
}

/// Returns true if any SQL statement in the batch must be blocked in Read-Only mode.
/// Extends `is_write_sql` with administrative/procedural/mode-changing statements
/// (`PRAGMA`, `EXEC`, `EXECUTE`, `CALL`, `COPY`, `ATTACH`, `DETACH`, `VACUUM`, `REINDEX`).
pub(crate) fn is_read_only_blocked_sql(sql: &str) -> bool {
    if is_write_sql(sql) {
        return true;
    }
    for stmt in tokenize_sql_statements(sql) {
        let Some((first_word, _)) = stmt.first() else {
            continue;
        };
        if matches!(
            first_word.as_str(),
            "PRAGMA"
                | "EXEC"
                | "EXECUTE"
                | "CALL"
                | "COPY"
                | "ATTACH"
                | "DETACH"
                | "VACUUM"
                | "REINDEX"
                | "LOAD"
                | "EXPORT"
                | "IMPORT"
                | "COMMENT"
                | "LOCK"
                | "RENAME"
        ) {
            return true;
        }
        if first_word == "EXPLAIN"
            && stmt
                .iter()
                .skip(1)
                .any(|(w, _)| is_write_keyword(w) || w == "PRAGMA" || w == "EXEC" || w == "CALL")
        {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::CellValue;

    fn make_result_with_rows(count: usize) -> QueryResult {
        let mut res = QueryResult::new(vec![], vec![], 1, None);
        res.rows = (0..count)
            .map(|i| vec![CellValue::Integer(i as i64)])
            .collect();
        res
    }

    #[test]
    fn reconcile_uses_exact_count_when_first_page_fewer_than_limit() {
        let mut res = make_result_with_rows(76);
        reconcile_page_row_count(&mut res, Some(45), true, 100, 0);
        assert_eq!(res.rows_affected, Some(76));
        assert_eq!(res.is_approximate_count, None);
    }

    #[test]
    fn reconcile_uses_exact_count_when_later_page_partial_non_empty() {
        let mut res = make_result_with_rows(23);
        reconcile_page_row_count(&mut res, Some(100), true, 100, 100);
        assert_eq!(res.rows_affected, Some(123));
        assert_eq!(res.is_approximate_count, None);
    }

    #[test]
    fn reconcile_clamps_underestimated_approx_when_full_page_fetched() {
        let mut res = make_result_with_rows(100);
        reconcile_page_row_count(&mut res, Some(45), true, 100, 0);
        assert_eq!(res.rows_affected, Some(100));
        assert_eq!(res.is_approximate_count, Some(true));
    }

    #[test]
    fn reconcile_preserves_large_approx_when_full_page_fetched() {
        let mut res = make_result_with_rows(100);
        reconcile_page_row_count(&mut res, Some(12_500_000), true, 100, 0);
        assert_eq!(res.rows_affected, Some(12_500_000));
        assert_eq!(res.is_approximate_count, Some(true));
    }

    #[test]
    fn reconcile_preserves_exact_count_when_not_approx() {
        let mut res = make_result_with_rows(100);
        reconcile_page_row_count(&mut res, Some(500), false, 100, 0);
        assert_eq!(res.rows_affected, Some(500));
        assert_eq!(res.is_approximate_count, None);
    }

    #[test]
    fn read_only_sql_blocks_bypass_vectors() {
        assert!(is_read_only_blocked_sql("SELECT 1; DELETE FROM users;"));
        assert!(is_read_only_blocked_sql(
            "WITH d AS (DELETE FROM users RETURNING *) SELECT * FROM d"
        ));
        assert!(is_read_only_blocked_sql(
            "WITH u AS (UPDATE users SET a = 1) SELECT 1"
        ));
        assert!(is_read_only_blocked_sql(
            "SELECT * INTO backup_users FROM users"
        ));
        assert!(is_read_only_blocked_sql("PRAGMA query_only = OFF;"));
        assert!(is_read_only_blocked_sql(
            "EXEC sp_executesql N'DROP TABLE users'"
        ));
        assert!(is_read_only_blocked_sql("CALL dangerous_proc()"));
        assert!(is_read_only_blocked_sql("COPY users TO '/tmp/out.csv'"));
        assert!(is_read_only_blocked_sql(
            "EXPLAIN ANALYZE DELETE FROM users"
        ));

        // Safe queries including keywords inside string literals or comments
        assert!(!is_read_only_blocked_sql(
            "SELECT 'DELETE FROM users; PRAGMA query_only = OFF' AS msg"
        ));
        assert!(!is_read_only_blocked_sql("-- INSERT INTO users\n/* DROP TABLE x */ SELECT id, name FROM users WHERE note = 'INTO'"));
        assert!(!is_read_only_blocked_sql(
            "WITH cte AS (SELECT id FROM users) SELECT * FROM cte"
        ));
    }
}
