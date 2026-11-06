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
}
