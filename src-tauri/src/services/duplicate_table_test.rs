#[cfg(test)]
mod tests {
    use super::super::duplicate_table::duplicate_table_impl;
    use crate::drivers::sqlite::SqliteConnection;
    use crate::drivers::DatabaseConnection;
    use crate::models::transfer::DuplicateTableOptions;
    use crate::models::{CellValue, DatabaseDriver};

    #[tokio::test]
    async fn test_duplicate_table_sqlite_structure_and_data() {
        let conn = SqliteConnection::open_in_memory()
            .expect("Failed to open sqlite in memory");

        // Create sample table and insert rows
        conn.execute_query(
            "CREATE TABLE \"users\" (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, score REAL);",
        )
        .await
        .expect("Failed to create table");

        conn.execute_query(
            "INSERT INTO \"users\" (name, score) VALUES ('Alice', 95.5), ('Bob', 82.0);",
        )
        .await
        .expect("Failed to insert rows");

        // Duplicate with data
        let options = DuplicateTableOptions {
            connection_id: "test-conn".to_string(),
            schema: None,
            source_table: "users".to_string(),
            new_table_name: "users_backup".to_string(),
            copy_data: true,
        };

        let result = duplicate_table_impl(&conn, DatabaseDriver::Sqlite, &options).await;
        assert!(result.is_ok(), "Duplicate table should succeed: {:?}", result);

        // Verify target table exists and has identical row count
        let count_res = conn
            .execute_query("SELECT COUNT(*) FROM \"users_backup\";")
            .await
            .expect("Query backup table count failed");

        let count_row = count_res.rows.first().unwrap();
        assert_eq!(count_row[0], CellValue::Integer(2));

        // Duplicate structure only (copy_data = false)
        let empty_options = DuplicateTableOptions {
            connection_id: "test-conn".to_string(),
            schema: None,
            source_table: "users".to_string(),
            new_table_name: "users_empty".to_string(),
            copy_data: false,
        };

        let empty_result = duplicate_table_impl(&conn, DatabaseDriver::Sqlite, &empty_options).await;
        assert!(empty_result.is_ok(), "Duplicate structure only should succeed");

        let empty_count_res = conn
            .execute_query("SELECT COUNT(*) FROM \"users_empty\";")
            .await
            .expect("Query empty table count failed");
        assert_eq!(
            empty_count_res.rows.first().unwrap()[0],
            CellValue::Integer(0)
        );
    }

    #[tokio::test]
    async fn test_duplicate_table_validation_errors() {
        let conn = SqliteConnection::open_in_memory()
            .expect("Failed to open sqlite in memory");

        // Target equals source
        let same_name_opts = DuplicateTableOptions {
            connection_id: "test-conn".to_string(),
            schema: None,
            source_table: "users".to_string(),
            new_table_name: "users".to_string(),
            copy_data: true,
        };
        let res = duplicate_table_impl(&conn, DatabaseDriver::Sqlite, &same_name_opts).await;
        assert!(res.is_err());

        // Empty target name
        let empty_target_opts = DuplicateTableOptions {
            connection_id: "test-conn".to_string(),
            schema: None,
            source_table: "users".to_string(),
            new_table_name: "   ".to_string(),
            copy_data: true,
        };
        let res2 = duplicate_table_impl(&conn, DatabaseDriver::Sqlite, &empty_target_opts).await;
        assert!(res2.is_err());
    }
}
