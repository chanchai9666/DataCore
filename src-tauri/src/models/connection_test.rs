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

        let json_full = r#"{
            "id": "c3",
            "name": "Remote Cluster",
            "driver": "postgres",
            "database": "production",
            "sslMode": "verify-full",
            "sslCerts": {
                "caCertPath": "/certs/ca.pem",
                "clientCertPath": "/certs/client.crt",
                "clientKeyPath": "/certs/client.key"
            },
            "sshTunnel": {
                "enabled": true,
                "host": "bastion.example.com",
                "port": 2222,
                "user": "ubuntu",
                "authType": "key",
                "privateKeyPath": "~/.ssh/id_ed25519"
            },
            "timeoutSeconds": 30,
            "autoReconnect": true
        }"#;

        let config3: ConnectionConfig = serde_json::from_str(json_full).unwrap();
        assert_eq!(config3.timeout_seconds, Some(30));
        assert_eq!(config3.auto_reconnect, Some(true));

        let certs = config3.ssl_certs.unwrap();
        assert_eq!(certs.ca_cert_path.as_deref(), Some("/certs/ca.pem"));
        assert_eq!(certs.client_cert_path.as_deref(), Some("/certs/client.crt"));

        let ssh = config3.ssh_tunnel.unwrap();
        assert!(ssh.enabled);
        assert_eq!(ssh.host.as_deref(), Some("bastion.example.com"));
        assert_eq!(ssh.port, Some(2222));
        assert_eq!(ssh.user.as_deref(), Some("ubuntu"));
        assert_eq!(ssh.auth_type.as_deref(), Some("key"));
    }

    #[tokio::test]
    async fn test_ssh_tunnel_safety_guard_blocks_unauthorized_direct_connection() {
        use crate::drivers::postgres::PostgresConnection;
        use crate::drivers::mysql::MySqlConnection;
        use crate::models::connection::SshTunnelConfig;

        let mut config = ConnectionConfig {
            id: "pg-ssh-test".to_string(),
            name: "Bastion Protected PG".to_string(),
            driver: DatabaseDriver::Postgres,
            host: Some("internal-db.ec2.internal".to_string()),
            port: Some(5432),
            database: "prod_db".to_string(),
            user: Some("app".to_string()),
            folder: None,
            ssl_mode: None,
            ssl_certs: None,
            ssh_tunnel: Some(SshTunnelConfig {
                enabled: true,
                host: Some("jumpbox.corp.com".to_string()),
                port: Some(22),
                user: Some("bastion_admin".to_string()),
                auth_type: Some("key".to_string()),
                private_key_path: Some("~/.ssh/id_rsa".to_string()),
                passphrase: None,
            }),
            timeout_seconds: Some(5),
            auto_reconnect: Some(true),
        };

        // Attempting direct Postgres connection with ssh_tunnel enabled must fail with security bypass error
        let pg_res = PostgresConnection::connect(&config, Some("pass")).await;
        assert!(pg_res.is_err(), "Postgres connection must be blocked when SSH tunnel is enabled but not forwarded");
        let pg_err = pg_res.err().unwrap().to_string();
        assert!(pg_err.contains("SSH Tunnel to 'jumpbox.corp.com'"));
        assert!(pg_err.contains("Direct connection to database host blocked to prevent security bypass"));

        // Switch to MySQL and verify the same security guard applies
        config.driver = DatabaseDriver::Mysql;
        let my_res = MySqlConnection::connect(&config, Some("pass")).await;
        assert!(my_res.is_err(), "MySQL connection must be blocked when SSH tunnel is enabled but not forwarded");
        let my_err = my_res.err().unwrap().to_string();
        assert!(my_err.contains("SSH Tunnel to 'jumpbox.corp.com'"));
        assert!(my_err.contains("Direct connection to database host blocked to prevent security bypass"));
    }
}
