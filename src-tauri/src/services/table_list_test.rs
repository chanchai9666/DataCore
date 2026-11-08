#[cfg(test)]
mod tests {
    use crate::drivers::sqlite::SqliteConnection;
    use crate::drivers::DatabaseConnection;
    use crate::models::DatabaseDriver;
    use crate::services::table_list::get_table_list_metadata_impl;

    #[tokio::test]
    async fn test_get_table_list_metadata_sqlite() {
        let conn = SqliteConnection::open_in_memory().expect("Failed to create memory db");
        
        conn.execute_query("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);")
            .await
            .expect("Failed to create users table");
        conn.execute_query("CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT);")
            .await
            .expect("Failed to create posts table");

        let tables = get_table_list_metadata_impl(&conn, DatabaseDriver::Sqlite, None)
            .await
            .expect("Failed to get table list metadata");

        assert_eq!(tables.len(), 2);
        let names: Vec<String> = tables.into_iter().map(|t| t.name).collect();
        assert!(names.contains(&"users".to_string()));
        assert!(names.contains(&"posts".to_string()));
    }
}
