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
}
