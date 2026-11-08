#[cfg(test)]
mod tests {
    use super::super::sql_transfer::{export_sql_impl, import_sql_impl, split_sql_script};
    use crate::drivers::sqlite::SqliteConnection;
    use crate::drivers::DatabaseConnection;
    use crate::models::transfer::{SqlExportOptions, SqlImportOptions};
    use crate::models::{CellValue, DatabaseDriver};

    #[test]
    fn test_split_sql_script_with_delimiter_directive() {
        let script = r#"
CREATE TABLE users (id INT, name VARCHAR(50));
INSERT INTO users VALUES (1, 'Hello; world');

DELIMITER $$
CREATE PROCEDURE GetUsers()
BEGIN
    SELECT * FROM users;
END$$
DELIMITER ;

SELECT * FROM users;
"#;

        let stmts = split_sql_script(script);
        assert_eq!(stmts.len(), 4);
        assert!(stmts[0].contains("CREATE TABLE users"));
        assert!(stmts[1].contains("INSERT INTO users VALUES (1, 'Hello; world')"));
        assert!(stmts[2].contains("CREATE PROCEDURE GetUsers"));
        assert!(!stmts[2].contains("DELIMITER"));
        assert_eq!(stmts[3], "SELECT * FROM users");
    }

    #[tokio::test]
    async fn test_export_and_import_sql_sqlite() {
        let conn = SqliteConnection::open_in_memory().expect("open sqlite");

        // Prepare source database
        conn.execute_query(
            "CREATE TABLE \"products\" (id INTEGER PRIMARY KEY, title TEXT NOT NULL, price REAL);",
        )
        .await
        .expect("create table");

        conn.execute_query(
            "INSERT INTO \"products\" (id, title, price) VALUES (1, 'MacBook', 1999.99), (2, 'iPad', 799.50);",
        )
        .await
        .expect("insert products");

        let temp_dir = std::env::temp_dir();
        let dump_path = temp_dir.join(format!("datacore_test_dump_{}.sql", uuid::Uuid::new_v4()));
        let dump_file_str = dump_path.to_str().unwrap().to_string();

        let export_opts = SqlExportOptions {
            connection_id: "test".to_string(),
            schema: None,
            tables: vec!["products".to_string()],
            file_path: dump_file_str.clone(),
            include_drop_table: true,
            include_structure: true,
            include_data: true,
            batch_size: Some(500),
        };

        let export_res = export_sql_impl(&conn, DatabaseDriver::Sqlite, &export_opts)
            .await
            .expect("export sql");

        assert_eq!(export_res.total_tables, 1);
        assert_eq!(export_res.total_rows, 2);
        assert!(export_res.file_size_bytes > 0);

        // Now import into a fresh in-memory SQLite connection
        let conn2 = SqliteConnection::open_in_memory().expect("open second sqlite");

        let import_opts = SqlImportOptions {
            connection_id: "test2".to_string(),
            schema: None,
            file_path: dump_file_str.clone(),
            error_policy: "abort".to_string(),
        };

        let import_res = import_sql_impl(&conn2, &import_opts, None::<fn(_)>)
            .await
            .expect("import sql");

        assert!(import_res.successful_statements >= 2);
        assert_eq!(import_res.failed_statements, 0);

        // Verify imported data
        let res = conn2
            .execute_query("SELECT COUNT(*) FROM \"products\";")
            .await
            .expect("query imported table");
        assert_eq!(res.rows[0][0], CellValue::Integer(2));

        // Clean up temp file
        let _ = std::fs::remove_file(dump_path);
    }
}
