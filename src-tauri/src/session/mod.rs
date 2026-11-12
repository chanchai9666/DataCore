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
    session_passwords: Arc<RwLock<HashMap<String, String>>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            session_passwords: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Stores password temporarily in RAM for the lifetime of this session/connection
    pub async fn set_session_password(&self, connection_id: impl Into<String>, password: impl Into<String>) {
        let mut map = self.session_passwords.write().await;
        map.insert(connection_id.into(), password.into());
    }

    /// Retrieves in-memory RAM password for a connection
    pub async fn get_session_password(&self, connection_id: &str) -> Option<String> {
        let map = self.session_passwords.read().await;
        map.get(connection_id).cloned()
    }

    /// Clears in-memory RAM password for a connection
    pub async fn clear_session_password(&self, connection_id: &str) {
        let mut map = self.session_passwords.write().await;
        map.remove(connection_id);
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

    /// Close and remove a session for a tab_id, rolling back any uncommitted transaction
    pub async fn close_session(&self, tab_id: &str) -> Result<(), AppError> {
        let entry = {
            let mut map = self.sessions.write().await;
            map.remove(tab_id)
        };

        if let Some(entry) = entry {
            let _ = entry.connection.rollback().await;
        }

        Ok(())
    }

    /// Close and remove all sessions associated with a connection_id, rolling back any transactions.
    pub async fn close_sessions_for_connection(&self, connection_id: &str) -> Result<usize, AppError> {
        let entries_to_close: Vec<SessionEntry> = {
            let mut map = self.sessions.write().await;
            let tab_ids_to_remove: Vec<String> = map
                .values()
                .filter(|entry| entry.connection_id == connection_id)
                .map(|entry| entry.tab_id.clone())
                .collect();

            let mut removed = Vec::with_capacity(tab_ids_to_remove.len());
            for tid in tab_ids_to_remove {
                if let Some(entry) = map.remove(&tid) {
                    removed.push(entry);
                }
            }
            removed
        };

        self.clear_session_password(connection_id).await;
        let count = entries_to_close.len();
        for entry in entries_to_close {
            let _ = entry.connection.rollback().await;
        }

        Ok(count)
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
}
