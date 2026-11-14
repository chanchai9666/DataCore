use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DatabaseDriver {
    #[serde(alias = "Sqlite", alias = "SQLITE")]
    Sqlite,
    #[serde(alias = "Postgres", alias = "POSTGRES", alias = "postgresql", alias = "PostgreSQL")]
    Postgres,
    #[serde(alias = "Mysql", alias = "MYSQL", alias = "MySQL")]
    Mysql,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SshTunnelConfig {
    #[serde(default)]
    pub enabled: bool,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub user: Option<String>,
    #[serde(alias = "auth_type")]
    pub auth_type: Option<String>, // "password" | "key"
    #[serde(alias = "private_key_path")]
    pub private_key_path: Option<String>,
    #[serde(skip_serializing)]
    pub passphrase: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SslCertConfig {
    #[serde(alias = "ca_cert_path")]
    pub ca_cert_path: Option<String>,
    #[serde(alias = "client_cert_path")]
    pub client_cert_path: Option<String>,
    #[serde(alias = "client_key_path")]
    pub client_key_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct ConnectionConfig {
    pub id: String,
    pub name: String,
    pub driver: DatabaseDriver,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub database: String,
    pub user: Option<String>,
    pub folder: Option<String>,
    #[serde(default, alias = "sslMode")]
    pub ssl_mode: Option<String>,
    #[serde(default, alias = "sslCerts")]
    pub ssl_certs: Option<SslCertConfig>,
    #[serde(default, alias = "sshTunnel")]
    pub ssh_tunnel: Option<SshTunnelConfig>,
    #[serde(default, alias = "timeoutSeconds")]
    pub timeout_seconds: Option<u32>,
    #[serde(default, alias = "autoReconnect")]
    pub auto_reconnect: Option<bool>,
}
