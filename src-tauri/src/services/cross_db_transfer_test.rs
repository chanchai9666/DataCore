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
        assert!(ddl.contains("PRIMARY KEY (\"id\")"));
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
            job_id: None,
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

    #[tokio::test]
    async fn test_copy_table_cross_db_preserves_text_null_and_leading_zeros() {
        let src_conn = SqliteConnection::open_in_memory().expect("open src sqlite");
        let tgt_conn = SqliteConnection::open_in_memory().expect("open tgt sqlite");

        src_conn
            .execute_query(
                "CREATE TABLE \"test_data\" (id INTEGER PRIMARY KEY, code TEXT, raw_val TEXT);",
            )
            .await
            .expect("create src table");

        src_conn
            .execute_query(
                "INSERT INTO \"test_data\" VALUES \
                 (1, '012345', 'NULL'), \
                 (2, '', '123'), \
                 (3, 'normal', NULL);",
            )
            .await
            .expect("insert records");

        let options = CrossDbCopyTableOptions {
            source_connection_id: "src".to_string(),
            source_schema: None,
            source_table: "test_data".to_string(),
            target_connection_id: "tgt".to_string(),
            target_schema: None,
            target_table: "test_data_copy".to_string(),
            copy_structure: true,
            drop_target_if_exists: true,
            copy_data: true,
            batch_size: Some(10),
            job_id: None,
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
        .expect("copy table");

        assert_eq!(res.rows_transferred, 3);

        let query_res = tgt_conn
            .execute_query("SELECT id, code, raw_val FROM \"test_data_copy\" ORDER BY id;")
            .await
            .expect("query copied data");

        // Row 1: code should preserve leading zeros "012345", raw_val should be text "NULL" not sql NULL
        assert_eq!(query_res.rows[0][1], CellValue::Text("012345".to_string()));
        assert_eq!(query_res.rows[0][2], CellValue::Text("NULL".to_string()));

        // Row 2: code is empty string "", raw_val is string "123"
        assert_eq!(query_res.rows[1][1], CellValue::Text("".to_string()));
        assert_eq!(query_res.rows[1][2], CellValue::Text("123".to_string()));

        // Row 3: raw_val is actual SQL NULL
        assert_eq!(query_res.rows[2][1], CellValue::Text("normal".to_string()));
        assert_eq!(query_res.rows[2][2], CellValue::Null);
    }

    #[test]
    fn test_cross_db_copy_options_deserialization() {
        // Test camelCase serialization as sent from frontend
        let json_camel = r#"{
            "sourceConnectionId": "c1",
            "sourceTable": "t1",
            "targetConnectionId": "c2",
            "targetTable": "t2",
            "copyStructure": true,
            "dropTargetIfExists": false,
            "copyData": true,
            "jobId": "job-camel-123"
        }"#;
        let opts: CrossDbCopyTableOptions = serde_json::from_str(json_camel).expect("deserialize camelCase");
        assert_eq!(opts.source_connection_id, "c1");
        assert_eq!(opts.source_table, "t1");
        assert_eq!(opts.target_connection_id, "c2");
        assert_eq!(opts.target_table, "t2");
        assert_eq!(opts.job_id, Some("job-camel-123".to_string()));

        // Test snake_case alias deserialization
        let json_snake = r#"{
            "source_connection_id": "c1",
            "source_table": "t1",
            "target_connection_id": "c2",
            "target_table": "t2",
            "copy_structure": true,
            "drop_target_if_exists": false,
            "copy_data": true,
            "job_id": "job-snake-456"
        }"#;
        let opts_snake: CrossDbCopyTableOptions = serde_json::from_str(json_snake).expect("deserialize snake_case");
        assert_eq!(opts_snake.job_id, Some("job-snake-456".to_string()));
    }

    #[tokio::test]
    async fn test_copy_table_cross_db_emits_progress_with_accurate_counts() {
        use std::sync::{Arc, Mutex};
        use crate::models::transfer::TransferProgress;

        let src_conn = SqliteConnection::open_in_memory().expect("open src");
        let tgt_conn = SqliteConnection::open_in_memory().expect("open tgt");

        src_conn
            .execute_query("CREATE TABLE \"items\" (id INTEGER PRIMARY KEY, title TEXT);")
            .await
            .unwrap();

        for i in 1..=5 {
            src_conn
                .execute_query(&format!("INSERT INTO \"items\" VALUES ({}, 'item-{}');", i, i))
                .await
                .unwrap();
        }

        let options = CrossDbCopyTableOptions {
            source_connection_id: "src".to_string(),
            source_schema: None,
            source_table: "items".to_string(),
            target_connection_id: "tgt".to_string(),
            target_schema: None,
            target_table: "items_copy".to_string(),
            copy_structure: true,
            drop_target_if_exists: true,
            copy_data: true,
            batch_size: Some(2),
            job_id: None,
        };

        let progress_events: Arc<Mutex<Vec<TransferProgress>>> = Arc::new(Mutex::new(Vec::new()));
        let p_clone = progress_events.clone();

        let cb = move |p: TransferProgress| {
            p_clone.lock().unwrap().push(p);
        };

        let res = copy_table_cross_db_impl(
            &src_conn,
            DatabaseDriver::Sqlite,
            &tgt_conn,
            DatabaseDriver::Sqlite,
            &options,
            Some(cb),
        )
        .await
        .expect("copy table");

        assert_eq!(res.rows_transferred, 5);

        let events = progress_events.lock().unwrap();
        assert!(!events.is_empty(), "Progress events should be emitted");

        // First event should show 0 transferred and total_rows Some(5)
        let first = &events[0];
        assert_eq!(first.current_row, 0);
        assert_eq!(first.total_rows, Some(5));

        // Last event should indicate completion with 5 rows
        let last = events.last().unwrap();
        assert_eq!(last.current_row, 5);
        assert_eq!(last.total_rows, Some(5));
        assert!(last.status.contains("completed") || last.status.contains("Transferring rows"));
    }
}
