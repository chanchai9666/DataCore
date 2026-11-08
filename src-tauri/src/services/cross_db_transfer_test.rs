#[cfg(test)]
mod tests {
    use super::super::cross_db_transfer::{
        copy_table_cross_db_impl, generate_create_table_ddl, map_data_type,
    };
    use crate::drivers::sqlite::SqliteConnection;
    use crate::drivers::DatabaseConnection;
    use crate::models::query::ColumnMeta;
    use crate::models::transfer::CrossDbCopyTableOptions;
    use crate::models::{CellValue, DatabaseDriver};

    #[test]
    fn test_map_data_type_conversions() {
        assert_eq!(map_data_type("VARCHAR(100)", "mysql", "sqlite"), "TEXT");
        assert_eq!(map_data_type("INT", "mysql", "sqlite"), "INTEGER");
        assert_eq!(map_data_type("BIGINT", "postgres", "sqlite"), "INTEGER");
        assert_eq!(map_data_type("SERIAL", "postgres", "mysql"), "BIGINT AUTO_INCREMENT PRIMARY KEY");
        assert_eq!(map_data_type("INT", "sqlite", "postgres"), "INTEGER");
        assert_eq!(map_data_type("TINYINT(1)", "mysql", "postgres"), "BOOLEAN");
    }

    #[test]
    fn test_generate_create_table_ddl_sqlite() {
        let cols = vec![
            ColumnMeta {
                name: "id".to_string(),
                data_type: "INTEGER".to_string(),
                nullable: false,
                is_primary_key: Some(true),
                is_auto_increment: Some(true),
            },
            ColumnMeta {
                name: "username".to_string(),
                data_type: "TEXT".to_string(),
                nullable: false,
                is_primary_key: Some(false),
                is_auto_increment: Some(false),
            },
        ];

        let ddl = generate_create_table_ddl("sqlite", None, "members", &cols, "sqlite");
        assert!(ddl.contains("CREATE TABLE \"members\""));
        assert!(ddl.contains("\"id\" INTEGER NOT NULL"));
        assert!(ddl.contains("\"username\" TEXT NOT NULL"));
    }

    #[tokio::test]
    async fn test_copy_table_cross_db_sqlite_to_sqlite() {
        let src_conn = SqliteConnection::open_in_memory().expect("open src sqlite");
        let tgt_conn = SqliteConnection::open_in_memory().expect("open tgt sqlite");

        // Create table and populate in src
        src_conn
            .execute_query(
                "CREATE TABLE \"employees\" (id INTEGER PRIMARY KEY, name TEXT, salary REAL);",
            )
            .await
            .expect("create src table");

        src_conn
            .execute_query(
                "INSERT INTO \"employees\" VALUES (1, 'Alice', 60000.0), (2, 'Bob', 75000.0);",
            )
            .await
            .expect("insert src records");

        let options = CrossDbCopyTableOptions {
            source_connection_id: "src".to_string(),
            source_schema: None,
            source_table: "employees".to_string(),
            target_connection_id: "tgt".to_string(),
            target_schema: None,
            target_table: "employees_migrated".to_string(),
            copy_structure: true,
            drop_target_if_exists: true,
            copy_data: true,
            batch_size: Some(500),
        };

        let res = copy_table_cross_db_impl(
            &src_conn,
            DatabaseDriver::Sqlite,
            &tgt_conn,
            DatabaseDriver::Sqlite,
            &options,
            None::<fn(_)>,
        )
        .await
        .expect("copy table cross db");

        assert_eq!(res.rows_transferred, 2);

        // Verify target table has been created and populated
        let count_res = tgt_conn
            .execute_query("SELECT COUNT(*) FROM \"employees_migrated\";")
            .await
            .expect("query target count");
        assert_eq!(count_res.rows[0][0], CellValue::Integer(2));
    }
}
