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
