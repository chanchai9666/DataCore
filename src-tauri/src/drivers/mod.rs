pub mod traits;
pub mod keyset;
pub mod sqlite;
pub mod postgres;
pub mod mysql;
pub mod duckdb;
pub mod mssql;

pub use traits::*;
pub use keyset::*;
pub use sqlite::*;
pub use postgres::*;
pub use mysql::*;
pub use duckdb::*;
pub use mssql::*;

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
mod sqlite_test;
#[cfg(test)]
mod duckdb_test;

/// Returns true if the SQL statement starts with a write/DDL/DCL keyword
/// after stripping leading whitespace and SQL comments.
pub(crate) fn is_write_sql(sql: &str) -> bool {
    let mut s = sql.trim_start();
    loop {
        if s.starts_with("--") {
            match s.find('\n') {
                Some(idx) => s = s[idx + 1..].trim_start(),
                None => return false,
            }
        } else if s.starts_with("/*") {
            match s.find("*/") {
                Some(idx) => s = s[idx + 2..].trim_start(),
                None => return false,
            }
        } else {
            break;
        }
    }

    let first_word = s
        .split(|c: char| c.is_whitespace() || c == '(' || c == ';')
        .next()
        .unwrap_or("")
        .to_ascii_uppercase();

    matches!(
        first_word.as_str(),
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::CellValue;

    fn make_result_with_rows(count: usize) -> QueryResult {
        let mut res = QueryResult::new(vec![], vec![], 1, None);
        res.rows = (0..count).map(|i| vec![CellValue::Integer(i as i64)]).collect();
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
}
