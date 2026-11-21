use async_trait::async_trait;
use base64::Engine;
use futures::TryStreamExt;
use sqlx::{Column, Connection, Either, Row, TypeInfo, ValueRef};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;
use zeroize::{Zeroize, Zeroizing};

use crate::drivers::traits::{
    build_safe_where_clause, Chunk, DatabaseConnection, SchemaNode, SchemaNodeType, StreamOutcome,
};
use crate::error::AppError;
use crate::models::connection::ConnectionConfig;
use crate::models::query::{CellValue, ColumnMeta, QueryResult};
use crate::services::ssh_tunnel::SshTunnelHandle;

pub struct PostgresConnection {
    conn: Arc<Mutex<sqlx::PgConnection>>,
    ssh_tunnel: Arc<Mutex<Option<SshTunnelHandle>>>,
    database_name: String,
    config: ConnectionConfig,
    password: Option<Zeroizing<String>>,
    connect_options: Arc<Mutex<sqlx::postgres::PgConnectOptions>>,
    backend_pid: Arc<AtomicI32>,
    in_manual_tx: Arc<AtomicBool>,
}

impl PostgresConnection {
    async fn establish_raw(
        config: &ConnectionConfig,
        password: Option<&str>,
    ) -> Result<
        (
            sqlx::PgConnection,
            sqlx::postgres::PgConnectOptions,
            i32,
            Option<SshTunnelHandle>,
        ),
        AppError,
    > {
        let timeout_secs = config.timeout_seconds.unwrap_or(15).max(1) as u64;
        let remote_host = config.host.as_deref().unwrap_or("localhost");
        let remote_port = config.port.unwrap_or(5432);

        let mut tunnel_handle: Option<SshTunnelHandle> = None;
        let (target_host, target_port) = if let Some(ref ssh) = config.ssh_tunnel {
            if ssh.enabled {
                let handle =
                    SshTunnelHandle::establish(ssh, remote_host, remote_port, timeout_secs).await?;
                let port = handle.local_port();
                tunnel_handle = Some(handle);
                ("127.0.0.1".to_string(), port)
            } else {
                (remote_host.to_string(), remote_port)
            }
        } else {
            (remote_host.to_string(), remote_port)
        };

        let mut options = sqlx::postgres::PgConnectOptions::new()
            .host(&target_host)
            .port(target_port)
            .database(&config.database)
            .statement_cache_capacity(0);

        if let Some(user) = &config.user {
            options = options.username(user);
        }
        if let Some(pwd) = password {
            options = options.password(pwd);
        }

        options = options.ssl_mode(resolve_pg_ssl_mode(config.ssl_mode.as_deref()));

        if let Some(ref certs) = config.ssl_certs {
            if let Some(ref ca) = certs.ca_cert_path {
                if !ca.trim().is_empty() {
                    options = options.ssl_root_cert(ca);
                }
            }
            if let Some(ref cert) = certs.client_cert_path {
                if !cert.trim().is_empty() {
                    options = options.ssl_client_cert(cert);
                }
            }
            if let Some(ref key) = certs.client_key_path {
                if !key.trim().is_empty() {
                    options = options.ssl_client_key(key);
                }
            }
        }

        let connect_fut = sqlx::PgConnection::connect_with(&options);
        let mut conn =
            tokio::time::timeout(std::time::Duration::from_secs(timeout_secs), connect_fut)
                .await
                .map_err(|_| {
                    AppError::Other(format!(
                        "Connection timed out after {} seconds",
                        timeout_secs
                    ))
                })??;
        let backend_pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid();")
            .fetch_one(&mut conn)
            .await
            .unwrap_or(0);

        if config.read_only.unwrap_or(false) {
            sqlx::query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;")
                .execute(&mut conn)
                .await?;
        }

        Ok((conn, options, backend_pid, tunnel_handle))
    }

    pub async fn connect(
        config: &ConnectionConfig,
        password: Option<&str>,
    ) -> Result<Self, AppError> {
        let (conn, options, backend_pid, tunnel_handle) =
            Self::establish_raw(config, password).await?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            ssh_tunnel: Arc::new(Mutex::new(tunnel_handle)),
            database_name: config.database.clone(),
            config: config.clone(),
            password: password.map(|s| Zeroizing::new(s.to_string())),
            connect_options: Arc::new(Mutex::new(options)),
            backend_pid: Arc::new(AtomicI32::new(backend_pid)),
            in_manual_tx: Arc::new(AtomicBool::new(false)),
        })
    }

    fn is_disconnect_error(err: &sqlx::Error) -> bool {
        matches!(
            err,
            sqlx::Error::Io(_)
                | sqlx::Error::Protocol(_)
                | sqlx::Error::PoolTimedOut
                | sqlx::Error::PoolClosed
        )
    }

    async fn run_raw_sql(
        conn: &mut sqlx::PgConnection,
        sql: &str,
        start: std::time::Instant,
    ) -> Result<QueryResult, sqlx::Error> {
        let mut stream = sqlx::raw_sql(sql).fetch_many(&mut *conn);
        let mut columns = Vec::new();
        let mut rows_out = Vec::new();
        let mut rows_affected = None;

        while let Some(item) = stream.try_next().await? {
            match item {
                Either::Left(result) => {
                    rows_affected = Some(result.rows_affected());
                }
                Either::Right(row) => {
                    if columns.is_empty() {
                        columns = row
                            .columns()
                            .iter()
                            .map(|col| ColumnMeta::new(col.name(), col.type_info().name(), true))
                            .collect();
                    }
                    let col_len = row.columns().len();
                    let mut row_values = Vec::with_capacity(col_len);
                    for i in 0..col_len {
                        row_values.push(decode_pg_cell(&row, i));
                    }
                    rows_out.push(row_values);
                }
            }
        }

        drop(stream);
        let elapsed = start.elapsed().as_millis() as u64;
        Ok(QueryResult::new(columns, rows_out, elapsed, rows_affected))
    }

    async fn stream_raw_sql(
        conn: &mut sqlx::PgConnection,
        sql: &str,
        chunk_rows: usize,
        tx: &tokio::sync::mpsc::Sender<Chunk>,
        any_sent: &mut bool,
    ) -> Result<StreamOutcome, sqlx::Error> {
        let chunk_rows = chunk_rows.max(1);
        let mut stream = sqlx::raw_sql(sql).fetch_many(&mut *conn);
        let mut columns: Option<Arc<Vec<ColumnMeta>>> = None;
        let mut batch: Vec<Vec<CellValue>> = Vec::with_capacity(chunk_rows);
        let mut rows_sent: u64 = 0;

        while let Some(item) = stream.try_next().await? {
            match item {
                Either::Left(_) => {}
                Either::Right(row) => {
                    if columns.is_none() {
                        let cols: Vec<ColumnMeta> = row
                            .columns()
                            .iter()
                            .map(|col| ColumnMeta::new(col.name(), col.type_info().name(), true))
                            .collect();
                        columns = Some(Arc::new(cols));
                    }
                    let col_len = row.columns().len();
                    let mut row_values = Vec::with_capacity(col_len);
                    for i in 0..col_len {
                        row_values.push(decode_pg_cell(&row, i));
                    }
                    batch.push(row_values);

                    if batch.len() >= chunk_rows {
                        let count = batch.len() as u64;
                        let chunk = Chunk {
                            columns: Arc::clone(columns.as_ref().unwrap()),
                            rows: std::mem::replace(&mut batch, Vec::with_capacity(chunk_rows)),
                        };
                        if tx.send(chunk).await.is_err() {
                            drop(stream);
                            return Ok(StreamOutcome {
                                rows_sent,
                                stopped_early: true,
                            });
                        }
                        *any_sent = true;
                        rows_sent += count;
                    }
                }
            }
        }

        drop(stream);

        if !batch.is_empty() {
            let count = batch.len() as u64;
            let chunk = Chunk {
                columns: Arc::clone(columns.as_ref().unwrap()),
                rows: batch,
            };
            if tx.send(chunk).await.is_err() {
                return Ok(StreamOutcome {
                    rows_sent,
                    stopped_early: true,
                });
            }
            *any_sent = true;
            rows_sent += count;
        }

        Ok(StreamOutcome {
            rows_sent,
            stopped_early: false,
        })
    }
}

fn decode_pg_cell(row: &sqlx::postgres::PgRow, index: usize) -> CellValue {
    let raw = match row.try_get_raw(index) {
        Ok(r) => r,
        Err(_) => return CellValue::Null,
    };

    if raw.is_null() {
        return CellValue::Null;
    }

    let col = &row.columns()[index];
    let type_name = col.type_info().name();

    match type_name {
        "BOOL" => row
            .try_get::<bool, _>(index)
            .map(CellValue::Boolean)
            .unwrap_or(CellValue::Null),
        "INT2" => row
            .try_get::<i16, _>(index)
            .map(|v| CellValue::Integer(v as i64))
            .unwrap_or(CellValue::Null),
        "INT4" => row
            .try_get::<i32, _>(index)
            .map(|v| CellValue::Integer(v as i64))
            .unwrap_or(CellValue::Null),
        "INT8" => row
            .try_get::<i64, _>(index)
            .map(CellValue::Integer)
            .unwrap_or(CellValue::Null),
        "FLOAT4" => row
            .try_get::<f32, _>(index)
            .map(|v| CellValue::Float(v as f64))
            .unwrap_or(CellValue::Null),
        "FLOAT8" => row
            .try_get::<f64, _>(index)
            .map(CellValue::Float)
            .unwrap_or(CellValue::Null),
        "NUMERIC" => {
            if let Ok(s) = row.try_get::<String, _>(index) {
                CellValue::Text(s)
            } else if let Ok(f) = row.try_get::<f64, _>(index) {
                CellValue::Float(f)
            } else {
                CellValue::Text("NUMERIC".to_string())
            }
        }
        "JSON" | "JSONB" => row
            .try_get::<serde_json::Value, _>(index)
            .map(CellValue::Json)
            .unwrap_or(CellValue::Null),
        "BYTEA" => row
            .try_get::<Vec<u8>, _>(index)
            .map(|b| CellValue::Bytes(base64::engine::general_purpose::STANDARD.encode(b)))
            .unwrap_or(CellValue::Null),
        "UUID" => {
            if let Ok(u) = row.try_get::<uuid::Uuid, _>(index) {
                CellValue::Text(u.to_string())
            } else if let Ok(s) = row.try_get::<String, _>(index) {
                CellValue::Text(s)
            } else {
                CellValue::Null
            }
        }
        "TIMESTAMPTZ" => {
            if let Ok(dt) = row.try_get::<chrono::DateTime<chrono::Utc>, _>(index) {
                CellValue::Text(dt.to_rfc3339())
            } else if let Ok(s) = row.try_get::<String, _>(index) {
                CellValue::Text(s)
            } else {
                CellValue::Null
            }
        }
        "TIMESTAMP" => {
            if let Ok(dt) = row.try_get::<chrono::NaiveDateTime, _>(index) {
                CellValue::Text(dt.to_string())
            } else if let Ok(s) = row.try_get::<String, _>(index) {
                CellValue::Text(s)
            } else {
                CellValue::Null
            }
        }
        "DATE" => {
            if let Ok(d) = row.try_get::<chrono::NaiveDate, _>(index) {
                CellValue::Text(d.to_string())
            } else if let Ok(s) = row.try_get::<String, _>(index) {
                CellValue::Text(s)
            } else {
                CellValue::Null
            }
        }
        "TIME" => {
            if let Ok(t) = row.try_get::<chrono::NaiveTime, _>(index) {
                CellValue::Text(t.to_string())
            } else if let Ok(s) = row.try_get::<String, _>(index) {
                CellValue::Text(s)
            } else {
                CellValue::Null
            }
        }
        "VARCHAR" | "CHAR" | "TEXT" | "NAME" | "BPCHAR" => row
            .try_get::<String, _>(index)
            .map(CellValue::Text)
            .unwrap_or(CellValue::Null),
        _ => {
            if let Ok(s) = row.try_get::<String, _>(index) {
                CellValue::Text(s)
            } else if let Ok(n) = row.try_get::<i64, _>(index) {
                CellValue::Integer(n)
            } else if let Ok(f) = row.try_get::<f64, _>(index) {
                CellValue::Float(f)
            } else if let Ok(b) = row.try_get::<bool, _>(index) {
                CellValue::Boolean(b)
            } else {
                CellValue::Text(format!("<unsupported: {}>", type_name))
            }
        }
    }
}

#[async_trait]
impl DatabaseConnection for PostgresConnection {
    async fn test_connection(&self) -> Result<u64, AppError> {
        let start = std::time::Instant::now();
        self.execute_query("SELECT 1;").await?;
        let elapsed = start.elapsed().as_millis() as u64;
        Ok(elapsed)
    }

    async fn execute_query(&self, sql: &str) -> Result<QueryResult, AppError> {
        let start = std::time::Instant::now();
        let mut conn = self.conn.lock().await;

        match Self::run_raw_sql(&mut conn, sql, start).await {
            Ok(res) => Ok(res),
            Err(err) => {
                let auto_reconnect = self.config.auto_reconnect.unwrap_or(true);
                let in_tx = self.in_manual_tx.load(Ordering::SeqCst);
                if auto_reconnect && !in_tx && Self::is_disconnect_error(&err) {
                    if let Ok((new_conn, new_opts, new_pid, new_tunnel)) = Self::establish_raw(
                        &self.config,
                        self.password.as_ref().map(|s| s.as_str()),
                    )
                    .await
                    {
                        *conn = new_conn;
                        *self.connect_options.lock().await = new_opts;
                        self.backend_pid.store(new_pid, Ordering::SeqCst);
                        *self.ssh_tunnel.lock().await = new_tunnel;
                        return Self::run_raw_sql(&mut conn, sql, std::time::Instant::now())
                            .await
                            .map_err(AppError::from);
                    }
                }
                Err(AppError::from(err))
            }
        }
    }

    async fn stream_query(
        &self,
        sql: &str,
        chunk_rows: usize,
        tx: tokio::sync::mpsc::Sender<Chunk>,
    ) -> Result<StreamOutcome, AppError> {
        let mut conn = self.conn.lock().await;
        let mut any_sent = false;

        match Self::stream_raw_sql(&mut conn, sql, chunk_rows, &tx, &mut any_sent).await {
            Ok(outcome) => Ok(outcome),
            Err(err) => {
                let auto_reconnect = self.config.auto_reconnect.unwrap_or(true);
                let in_tx = self.in_manual_tx.load(Ordering::SeqCst);
                if !any_sent && auto_reconnect && !in_tx && Self::is_disconnect_error(&err) {
                    if let Ok((new_conn, new_opts, new_pid, new_tunnel)) = Self::establish_raw(
                        &self.config,
                        self.password.as_ref().map(|s| s.as_str()),
                    )
                    .await
                    {
                        *conn = new_conn;
                        *self.connect_options.lock().await = new_opts;
                        self.backend_pid.store(new_pid, Ordering::SeqCst);
                        *self.ssh_tunnel.lock().await = new_tunnel;
                        return Self::stream_raw_sql(
                            &mut conn,
                            sql,
                            chunk_rows,
                            &tx,
                            &mut any_sent,
                        )
                        .await
                        .map_err(AppError::from);
                    }
                }
                Err(AppError::from(err))
            }
        }
    }

    async fn fetch_table_data(
        &self,
        schema: Option<&str>,
        table: &str,
        limit: u32,
        offset: u32,
        filter: Option<&str>,
        sort_col: Option<&str>,
        sort_dir: Option<&str>,
    ) -> Result<QueryResult, AppError> {
        let escaped_table = table.replace('"', "\"\"");
        let from_clause = if let Some(sch) = schema {
            let escaped_schema = sch.replace('"', "\"\"");
            format!("\"{}\".\"{}\"", escaped_schema, escaped_table)
        } else {
            format!("\"{}\"", escaped_table)
        };

        let where_clause = build_safe_where_clause(filter, "postgres")?;

        let order_clause = match sort_col {
            Some(col) if !col.trim().is_empty() => {
                let escaped_col = col.trim().replace('"', "\"\"");
                let dir = if sort_dir == Some("DESC") {
                    "DESC"
                } else {
                    "ASC"
                };
                format!(" ORDER BY \"{}\" {}", escaped_col, dir)
            }
            _ => String::new(),
        };

        let mut is_approx = false;
        let approx_count = if where_clause.is_empty() {
            let sch = schema.unwrap_or("public").replace('\'', "''");
            let tbl = table.replace('\'', "''");
            let approx_sql = format!(
                "SELECT c.reltuples::bigint FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = '{}' AND c.relname = '{}';",
                sch, tbl
            );
            match self.execute_query(&approx_sql).await {
                Ok(r) => r
                    .rows
                    .first()
                    .and_then(|row| row.first())
                    .and_then(|v| match v {
                        CellValue::Integer(n) if *n >= 0 => Some(*n as u64),
                        _ => None,
                    }),
                Err(_) => None,
            }
        } else {
            None
        };

        let total_count = match approx_count {
            Some(n) if n >= super::APPROX_COUNT_THRESHOLD => {
                is_approx = true;
                Some(n)
            }
            _ => {
                let count_sql = format!("SELECT COUNT(*) FROM {}{};", from_clause, where_clause);
                match self.execute_query(&count_sql).await {
                    Ok(count_res) => {
                        if let Some(first_row) = count_res.rows.first() {
                            match first_row.first() {
                                Some(CellValue::Integer(n)) => Some(*n as u64),
                                _ => None,
                            }
                        } else {
                            None
                        }
                    }
                    Err(_) => None,
                }
            }
        };

        let sql = format!(
            "SELECT * FROM {}{}{} LIMIT {} OFFSET {};",
            from_clause, where_clause, order_clause, limit, offset
        );
        let mut res = self.execute_query(&sql).await?;
        super::reconcile_page_row_count(&mut res, total_count, is_approx, limit, offset);
        if res.columns.is_empty() {
            let sch = schema.unwrap_or("public");
            let col_sql = format!(
                "SELECT a.attname AS column_name, \
                        pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type, \
                        (NOT a.attnotnull) AS is_nullable \
                 FROM pg_catalog.pg_attribute a \
                 JOIN pg_catalog.pg_class c ON c.oid = a.attrelid \
                 JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace \
                 WHERE n.nspname = '{}' AND c.relname = '{}' \
                   AND a.attnum > 0 AND NOT a.attisdropped \
                 ORDER BY a.attnum;",
                sch.replace('\'', "''"),
                table.replace('\'', "''")
            );
            if let Ok(col_res) = self.execute_query(&col_sql).await {
                res.columns = col_res
                    .rows
                    .into_iter()
                    .filter_map(|r| {
                        let name = r.first()?.as_text()?.to_string();
                        let dtype = r.get(1)?.as_text()?.to_string();
                        let nullable = matches!(r.get(2), Some(CellValue::Boolean(true)));
                        Some(ColumnMeta::new(name, dtype, nullable))
                    })
                    .collect();
            }
        }

        if !res.columns.is_empty() {
            let sch = schema.unwrap_or("public");
            let meta_sql = format!(
                "SELECT a.attname AS column_name, \
                        COALESCE(i.indisprimary, false) AS is_pk, \
                        (a.attidentity IN ('a', 'd') OR COALESCE(pg_catalog.pg_get_expr(ad.adbin, ad.adrelid), '') LIKE 'nextval(%') AS is_auto \
                 FROM pg_catalog.pg_attribute a \
                 JOIN pg_catalog.pg_class c ON c.oid = a.attrelid \
                 JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace \
                 LEFT JOIN pg_catalog.pg_index i ON i.indrelid = c.oid AND i.indisprimary AND a.attnum = ANY(i.indkey) \
                 LEFT JOIN pg_catalog.pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum \
                 WHERE n.nspname = '{}' AND c.relname = '{}' \
                   AND a.attnum > 0 AND NOT a.attisdropped;",
                sch.replace('\'', "''"),
                table.replace('\'', "''")
            );
            if let Ok(meta_res) = self.execute_query(&meta_sql).await {
                let mut flags: std::collections::HashMap<String, (bool, bool)> =
                    std::collections::HashMap::new();
                for r in &meta_res.rows {
                    if let Some(CellValue::Text(name)) = r.first() {
                        let is_pk = matches!(r.get(1), Some(CellValue::Boolean(true)));
                        let is_auto = matches!(r.get(2), Some(CellValue::Boolean(true)));
                        flags.insert(name.clone(), (is_pk, is_auto));
                    }
                }
                for col in &mut res.columns {
                    if let Some(&(is_pk, is_auto)) = flags.get(&col.name) {
                        col.is_primary_key = Some(is_pk);
                        col.is_auto_increment = Some(is_auto);
                    }
                }
            }
        }
        Ok(res)
    }

    async fn fetch_schema_tree(&self) -> Result<Vec<SchemaNode>, AppError> {
        let mut schema_map: HashMap<String, Vec<SchemaNode>> = HashMap::new();
        schema_map.entry("public".to_string()).or_default();

        let objects_sql = "SELECT nspname AS schema_name, '' AS obj_name, 'schema' AS obj_type, '' AS table_name \
            FROM pg_catalog.pg_namespace \
            WHERE nspname NOT IN ('pg_catalog', 'information_schema') \
              AND nspname NOT LIKE 'pg_toast%' \
              AND nspname NOT LIKE 'pg_temp%' \
            UNION ALL \
            SELECT n.nspname AS schema_name, c.relname AS obj_name, \
                CASE c.relkind \
                    WHEN 'v' THEN 'view' \
                    WHEN 'm' THEN 'materialized_view' \
                    WHEN 'S' THEN 'sequence' \
                    ELSE 'table' \
                END AS obj_type, \
                '' AS table_name \
            FROM pg_catalog.pg_class c \
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace \
            WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S') \
              AND n.nspname NOT IN ('pg_catalog', 'information_schema') \
              AND n.nspname NOT LIKE 'pg_toast%' \
              AND n.nspname NOT LIKE 'pg_temp%' \
            UNION ALL \
            SELECT n.nspname AS schema_name, p.proname AS obj_name, \
                CASE p.prokind WHEN 'p' THEN 'procedure' ELSE 'function' END AS obj_type, \
                '' AS table_name \
            FROM pg_catalog.pg_proc p \
            JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace \
            WHERE p.prokind IN ('f', 'p') \
              AND n.nspname NOT IN ('pg_catalog', 'information_schema') \
              AND n.nspname NOT LIKE 'pg_toast%' \
              AND n.nspname NOT LIKE 'pg_temp%' \
            UNION ALL \
            SELECT n.nspname AS schema_name, t.tgname AS obj_name, \
                'trigger' AS obj_type, \
                c.relname AS table_name \
            FROM pg_catalog.pg_trigger t \
            JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid \
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace \
            WHERE NOT t.tgisinternal \
              AND n.nspname NOT IN ('pg_catalog', 'information_schema') \
              AND n.nspname NOT LIKE 'pg_toast%' \
              AND n.nspname NOT LIKE 'pg_temp%' \
            ORDER BY schema_name, obj_type, obj_name;";
        let query_res = self.execute_query(objects_sql).await?;

        for row in query_res.rows {
            let schema_name = row
                .first()
                .and_then(|c| c.as_text())
                .unwrap_or("public")
                .to_string();
            let obj_name = row
                .get(1)
                .and_then(|c| c.as_text())
                .unwrap_or("")
                .to_string();
            let obj_type = row.get(2).and_then(|c| c.as_text()).unwrap_or("table");
            let table_name = row.get(3).and_then(|c| c.as_text()).unwrap_or("");

            if obj_type == "schema" {
                schema_map.entry(schema_name).or_default();
                continue;
            }

            let node_type = match obj_type {
                "view" => SchemaNodeType::View,
                "materialized_view" => SchemaNodeType::MaterializedView,
                "sequence" => SchemaNodeType::Sequence,
                "procedure" => SchemaNodeType::Procedure,
                "function" => SchemaNodeType::Function,
                "trigger" => SchemaNodeType::Trigger,
                _ => SchemaNodeType::Table,
            };

            let mut node = SchemaNode::new(obj_name, node_type).with_schema(&schema_name);
            if node_type == SchemaNodeType::Trigger && !table_name.is_empty() {
                node = node.with_meta("table_name", table_name.to_string());
            }
            schema_map.entry(schema_name).or_default().push(node);
        }

        let mut schema_nodes = Vec::new();
        for (schema_name, tables) in schema_map {
            let node = SchemaNode::new(schema_name, SchemaNodeType::Schema).with_children(tables);
            schema_nodes.push(node);
        }

        schema_nodes.sort_by(|a, b| {
            if a.name == "public" {
                return std::cmp::Ordering::Less;
            }
            if b.name == "public" {
                return std::cmp::Ordering::Greater;
            }
            let is_system = |name: &str| {
                matches!(
                    name,
                    "auth"
                        | "extensions"
                        | "graphql"
                        | "graphql_public"
                        | "net"
                        | "pgbouncer"
                        | "realtime"
                        | "storage"
                        | "vault"
                        | "supabase_functions"
                        | "supabase_migrations"
                        | "tiger"
                        | "tiger_data"
                        | "topology"
                ) || name.starts_with("pg_")
            };
            let a_sys = is_system(&a.name);
            let b_sys = is_system(&b.name);
            match (a_sys, b_sys) {
                (false, true) => std::cmp::Ordering::Less,
                (true, false) => std::cmp::Ordering::Greater,
                _ => a.name.cmp(&b.name),
            }
        });

        let root = SchemaNode::new(&self.database_name, SchemaNodeType::Database)
            .with_children(schema_nodes);
        Ok(vec![root])
    }

    async fn commit(&self) -> Result<(), AppError> {
        self.execute_query("COMMIT;").await?;
        if self.in_manual_tx.load(Ordering::SeqCst) {
            let _ = self.execute_query("BEGIN;").await;
        }
        Ok(())
    }

    async fn rollback(&self) -> Result<(), AppError> {
        self.execute_query("ROLLBACK;").await?;
        if self.in_manual_tx.load(Ordering::SeqCst) {
            let _ = self.execute_query("BEGIN;").await;
        }
        Ok(())
    }

    async fn cancel(&self) -> Result<(), AppError> {
        let pid = self.backend_pid.load(Ordering::SeqCst);
        if pid > 0 {
            let opts = self.connect_options.lock().await.clone();
            if let Ok(mut cancel_conn) = sqlx::PgConnection::connect_with(&opts).await {
                let _ = sqlx::query("SELECT pg_cancel_backend($1);")
                    .bind(pid)
                    .execute(&mut cancel_conn)
                    .await;
            }
        }
        Ok(())
    }

    async fn set_autocommit(&self, enabled: bool) -> Result<(), AppError> {
        self.in_manual_tx.store(!enabled, Ordering::SeqCst);
        if !enabled {
            self.execute_query("BEGIN;").await?;
        }
        Ok(())
    }

    async fn get_object_ddl(
        &self,
        schema: Option<&str>,
        name: &str,
        object_type: &str,
    ) -> Result<String, AppError> {
        let sch = schema.unwrap_or("public");
        let safe_sch = sch.replace('\'', "''");
        let safe_name = name.replace('\'', "''");
        let lower_type = object_type.to_lowercase();

        if lower_type.contains("view") {
            let sql = format!(
                "SELECT pg_get_viewdef(c.oid, true) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = '{}' AND c.relname = '{}';",
                safe_sch, safe_name
            );
            let res = self.execute_query(&sql).await?;
            if let Some(row) = res.rows.into_iter().next() {
                if let Some(def) = row.first().and_then(|c| c.as_text()) {
                    return Ok(format!(
                        "CREATE OR REPLACE VIEW \"{}\".\"{}\" AS\n{}",
                        sch, name, def
                    ));
                }
            }
        } else if lower_type.contains("trigger") {
            let sql = format!(
                "SELECT pg_get_triggerdef(t.oid, true) FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid JOIN pg_namespace n ON c.relnamespace = n.oid WHERE n.nspname = '{}' AND t.tgname = '{}';",
                safe_sch, safe_name
            );
            let res = self.execute_query(&sql).await?;
            if let Some(row) = res.rows.into_iter().next() {
                if let Some(def) = row.first().and_then(|c| c.as_text()) {
                    return Ok(format!("{};", def));
                }
            }
        } else if lower_type.contains("function") || lower_type.contains("procedure") {
            let sql = format!(
                "SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = '{}' AND p.proname = '{}';",
                safe_sch, safe_name
            );
            let res = self.execute_query(&sql).await?;
            if let Some(row) = res.rows.into_iter().next() {
                if let Some(def) = row.first().and_then(|c| c.as_text()) {
                    return Ok(def.to_string());
                }
            }
        }

        // Default or Table fallback: query columns
        let ddl_sql = format!(
            "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = '{}' AND table_name = '{}' ORDER BY ordinal_position;",
            safe_sch, safe_name
        );
        let res = self.execute_query(&ddl_sql).await?;
        if res.rows.is_empty() {
            return Err(AppError::NotFound(format!(
                "Object '{}'.'{}' not found",
                sch, name
            )));
        }

        let mut lines = Vec::new();
        for r in res.rows {
            let col = r.first().and_then(|c| c.as_text()).unwrap_or("");
            let dtype = r.get(1).and_then(|c| c.as_text()).unwrap_or("");
            let nullable = r.get(2).and_then(|c| c.as_text()).unwrap_or("YES");
            let default_val = r.get(3).and_then(|c| c.as_text());
            let null_str = if nullable == "NO" { " NOT NULL" } else { "" };
            let def_str = default_val
                .map(|d| format!(" DEFAULT {}", d))
                .unwrap_or_default();
            lines.push(format!("  \"{}\" {}{}{}", col, dtype, null_str, def_str));
        }

        Ok(format!(
            "CREATE TABLE \"{}\".\"{}\" (\n{}\n);",
            sch,
            name,
            lines.join(",\n")
        ))
    }

    async fn copy_out_csv(
        &self,
        sql_or_table: &str,
        include_headers: bool,
        delimiter: char,
        tx: tokio::sync::mpsc::Sender<Vec<u8>>,
    ) -> Result<(), AppError> {
        let trimmed = sql_or_table.trim().trim_end_matches(';').trim();
        let delim_escaped = delimiter.to_string().replace('\'', "''");
        let header_clause = if include_headers { ", HEADER" } else { "" };
        let target = if trimmed.contains(' ') || trimmed.contains('(') {
            format!("({})", trimmed)
        } else {
            trimmed
                .split('.')
                .map(|p| format!("\"{}\"", p.replace('"', "\"\"")))
                .collect::<Vec<_>>()
                .join(".")
        };
        let copy_sql = format!(
            "COPY {} TO STDOUT WITH (FORMAT csv{}, DELIMITER '{}')",
            target, header_clause, delim_escaped
        );

        let mut guard = self.conn.lock().await;
        let mut stream = guard.copy_out_raw(&copy_sql).await?;
        while let Some(chunk) = stream.try_next().await? {
            if tx.send(chunk.to_vec()).await.is_err() {
                break;
            }
        }
        Ok(())
    }

    async fn copy_in_csv(
        &self,
        table: &str,
        columns: &[String],
        has_headers: bool,
        delimiter: char,
        mut rx: tokio::sync::mpsc::Receiver<Vec<u8>>,
    ) -> Result<u64, AppError> {
        let quoted_table = table
            .split('.')
            .map(|p| format!("\"{}\"", p.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(".");
        let quoted_cols = columns
            .iter()
            .map(|c| format!("\"{}\"", c.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(", ");
        let delim_escaped = delimiter.to_string().replace('\'', "''");
        let header_clause = if has_headers { ", HEADER" } else { "" };
        let copy_sql = format!(
            "COPY {} ({}) FROM STDIN WITH (FORMAT csv{}, DELIMITER '{}')",
            quoted_table, quoted_cols, header_clause, delim_escaped
        );

        let mut guard = self.conn.lock().await;
        let mut copy_in = guard.copy_in_raw(&copy_sql).await?;
        while let Some(chunk) = rx.recv().await {
            copy_in.send(chunk).await?;
        }
        let rows_affected = copy_in.finish().await?;
        Ok(rows_affected)
    }
}

impl Drop for PostgresConnection {
    fn drop(&mut self) {
        if let Some(ref mut pwd) = self.password {
            pwd.zeroize();
        }
    }
}

pub(crate) fn resolve_pg_ssl_mode(mode: Option<&str>) -> sqlx::postgres::PgSslMode {
    match mode.map(|s| s.to_lowercase()).as_deref() {
        Some("disable") => sqlx::postgres::PgSslMode::Disable,
        Some("allow") => sqlx::postgres::PgSslMode::Allow,
        Some("prefer") => sqlx::postgres::PgSslMode::Prefer,
        Some("verify-ca") => sqlx::postgres::PgSslMode::VerifyCa,
        Some("verify-full") => sqlx::postgres::PgSslMode::VerifyFull,
        _ => sqlx::postgres::PgSslMode::Require,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_pg_ssl_mode_defaults_to_require() {
        assert!(matches!(
            resolve_pg_ssl_mode(None),
            sqlx::postgres::PgSslMode::Require
        ));
        assert!(matches!(
            resolve_pg_ssl_mode(Some("unknown")),
            sqlx::postgres::PgSslMode::Require
        ));
        assert!(matches!(
            resolve_pg_ssl_mode(Some("verify-full")),
            sqlx::postgres::PgSslMode::VerifyFull
        ));
        assert!(matches!(
            resolve_pg_ssl_mode(Some("prefer")),
            sqlx::postgres::PgSslMode::Prefer
        ));
    }
}
