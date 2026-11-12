#[cfg(test)]
mod tests {
    use crate::models::connection::{ConnectionConfig, DatabaseDriver};

    #[test]
    fn test_connection_config_deserialization_with_ssl_mode_and_camel_case() {
        let json_snake = r#"{
            "id": "c1",
            "name": "PG Test",
            "driver": "postgres",
            "database": "testdb",
            "ssl_mode": "verify-full"
        }"#;

        let config: ConnectionConfig = serde_json::from_str(json_snake).unwrap();
        assert_eq!(config.driver, DatabaseDriver::Postgres);
        assert_eq!(config.ssl_mode.as_deref(), Some("verify-full"));

        let json_camel = r#"{
            "id": "c2",
            "name": "PG Test 2",
            "driver": "postgres",
            "database": "testdb",
            "sslMode": "require"
        }"#;

        let config2: ConnectionConfig = serde_json::from_str(json_camel).unwrap();
        assert_eq!(config2.ssl_mode.as_deref(), Some("require"));
    }
}
