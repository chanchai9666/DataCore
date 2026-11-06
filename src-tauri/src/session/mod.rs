use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::drivers::mysql::MySqlConnection;
use crate::drivers::postgres::PostgresConnection;
use crate::drivers::sqlite::SqliteConnection;
use crate::drivers::traits::DatabaseConnection;
use crate::error::AppError;
use crate::models::connection::{ConnectionConfig, DatabaseDriver};

#[derive(Clone)]
pub struct SessionEntry {
    pub tab_id: String,
    pub connection_id: String,
    pub connection: Arc<dyn DatabaseConnection>,
}

#[derive(Clone, Default)]
pub struct SessionManager {
    sessions: Arc<RwLock<HashMap<String, SessionEntry>>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Factory method to create a database connection based on config and optional password
    pub async fn create_connection(
        config: &ConnectionConfig,
        password: Option<&str>,
    ) -> Result<Arc<dyn DatabaseConnection>, AppError> {
        match config.driver {
            DatabaseDriver::Sqlite => {
                let conn = SqliteConnection::from_config(config)?;
                Ok(Arc::new(conn))
            }
            DatabaseDriver::Postgres => {
                let conn = PostgresConnection::connect(config, password).await?;
                Ok(Arc::new(conn))
            }
            DatabaseDriver::Mysql => {
                let conn = MySqlConnection::connect(config, password).await?;
                Ok(Arc::new(conn))
            }
        }
    }

    /// Open or register a session for a given tab_id
    pub async fn register_session(
        &self,
        tab_id: impl Into<String>,
        connection_id: impl Into<String>,
        connection: Arc<dyn DatabaseConnection>,
    ) {
        let tab_id = tab_id.into();
        let connection_id = connection_id.into();
        let mut map = self.sessions.write().await;
        map.insert(
            tab_id.clone(),
            SessionEntry {
                tab_id,
                connection_id,
                connection,
            },
        );
    }

    /// Open a session by creating a new dedicated connection
    pub async fn open_session(
        &self,
        tab_id: impl Into<String>,
        connection_id: impl Into<String>,
        config: &ConnectionConfig,
        password: Option<&str>,
    ) -> Result<Arc<dyn DatabaseConnection>, AppError> {
        let conn = Self::create_connection(config, password).await?;
        let tab_id = tab_id.into();
        let connection_id = connection_id.into();
        self.register_session(tab_id.clone(), connection_id, conn.clone()).await;
        Ok(conn)
    }

    /// Retrieve active connection for a tab_id
    pub async fn get_session(&self, tab_id: &str) -> Result<Arc<dyn DatabaseConnection>, AppError> {
        let map = self.sessions.read().await;
        map.get(tab_id)
            .map(|entry| entry.connection.clone())
            .ok_or_else(|| AppError::NotFound(format!("Session for tab '{}' not found", tab_id)))
    }

    /// Retrieve session entry (including connection_id) for a tab_id
    pub async fn get_session_entry(&self, tab_id: &str) -> Result<SessionEntry, AppError> {
        let map = self.sessions.read().await;
        map.get(tab_id)
            .cloned()
            .ok_or_else(|| AppError::NotFound(format!("Session for tab '{}' not found", tab_id)))
    }

    /// Close and remove a session for a tab_id
    pub async fn close_session(&self, tab_id: &str) -> Result<(), AppError> {
        let mut map = self.sessions.write().await;
        map.remove(tab_id);
        Ok(())
    }

    /// Check if tab has an active session
    pub async fn has_session(&self, tab_id: &str) -> bool {
        let map = self.sessions.read().await;
        map.contains_key(tab_id)
    }

    /// Total count of active sessions
    pub async fn active_session_count(&self) -> usize {
        let map = self.sessions.read().await;
        map.len()
    }

    /// Find an active connection for a given connection_id (if any tab has it open)
    pub async fn find_connection(&self, connection_id: &str) -> Option<Arc<dyn DatabaseConnection>> {
        let map = self.sessions.read().await;
        for entry in map.values() {
            if entry.connection_id == connection_id {
                return Some(entry.connection.clone());
            }
        }
        None
    }
}
