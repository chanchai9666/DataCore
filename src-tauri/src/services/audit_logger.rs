use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use crate::error::AppError;

pub const GENESIS_HASH: &str = "0000000000000000000000000000000000000000000000000000000000000000";
pub const DEFAULT_MAX_FILE_SIZE_BYTES: u64 = 10 * 1024 * 1024; // 10MB

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AuditLogEntry {
    pub id: String,
    pub timestamp: String,
    #[serde(alias = "eventType", alias = "event_type")]
    pub action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connection_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connection_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub database: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_time_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rows_affected: Option<u64>,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prev_hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entry_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AuditLogEntryInput {
    pub id: Option<String>,
    pub timestamp: Option<String>,
    #[serde(alias = "eventType", alias = "event_type")]
    pub action: String,
    pub user: Option<String>,
    pub connection_id: Option<String>,
    pub connection_name: Option<String>,
    pub database: Option<String>,
    pub query: Option<String>,
    pub execution_time_ms: Option<u64>,
    pub rows_affected: Option<u64>,
    pub status: String,
    pub error_message: Option<String>,
    pub details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AuditIntegrityResult {
    pub is_valid: bool,
    pub total_entries: usize,
    pub verified_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tampered_entry_id: Option<String>,
}

/// Computes SHA-256 tamper-evident hash over (prev_hash, timestamp, action/event_type, details)
pub fn compute_entry_hash(
    prev_hash: &str,
    timestamp: &str,
    action: &str,
    details: &str,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(prev_hash.as_bytes());
    hasher.update(b"|");
    hasher.update(timestamp.as_bytes());
    hasher.update(b"|");
    hasher.update(action.as_bytes());
    hasher.update(b"|");
    hasher.update(details.as_bytes());
    format!("{:x}", hasher.finalize())
}

#[cfg(unix)]
fn set_file_permissions_0600(path: &Path) -> Result<(), AppError> {
    use std::os::unix::fs::PermissionsExt;
    if path.exists() {
        let metadata = fs::metadata(path)?;
        let mut perms = metadata.permissions();
        perms.set_mode(0o600);
        fs::set_permissions(path, perms)?;
    }
    Ok(())
}

#[cfg(not(unix))]
fn set_file_permissions_0600(_path: &Path) -> Result<(), AppError> {
    Ok(())
}

#[cfg(unix)]
fn ensure_dir_0700(dir: &Path) -> Result<(), AppError> {
    use std::os::unix::fs::PermissionsExt;
    if !dir.exists() {
        fs::create_dir_all(dir)?;
    }
    let metadata = fs::metadata(dir)?;
    let mut perms = metadata.permissions();
    perms.set_mode(0o700);
    fs::set_permissions(dir, perms)?;
    Ok(())
}

#[cfg(not(unix))]
fn ensure_dir_0700(dir: &Path) -> Result<(), AppError> {
    if !dir.exists() {
        fs::create_dir_all(dir)?;
    }
    Ok(())
}

/// Redacts passwords in SQL queries (CREATE USER, ALTER USER, etc.) before writing to audit logs.
pub fn redact_sensitive_sql(sql: &str) -> String {
    let mut out = sql.to_string();

    // Check IDENTIFIED [WITH ...] BY '...'
    if let Some(pos) = out.to_uppercase().find("IDENTIFIED") {
        if let Some(by_rel) = out[pos..].to_uppercase().find("BY") {
            let by_pos = pos + by_rel + 2;
            let rest = &out[by_pos..];
            let first_quote = rest.char_indices().find(|(_, c)| *c == '\'' || *c == '"');
            if let Some((quote_offset, q)) = first_quote {
                let start_quote = by_pos + quote_offset;
                if let Some(end_quote_rel) = out[start_quote + 1..].find(q) {
                    let end_quote = start_quote + 1 + end_quote_rel;
                    out.replace_range(start_quote..=end_quote, "'[REDACTED]'");
                }
            }
        }
    }

    let keywords = [
        "WITH PASSWORD",
        "PASSWORD =",
        "PASSWORD=",
        "PASSWORD",
    ];

    for kw in &keywords {
        let mut search_start = 0;
        while search_start < out.len() {
            let upper = out[search_start..].to_uppercase();
            if let Some(rel_pos) = upper.find(kw) {
                let kw_pos = search_start + rel_pos;
                let after_kw = kw_pos + kw.len();
                let rest = &out[after_kw..];

                // Check next non-whitespace char for quote
                let first_quote = rest.char_indices().find(|(_, c)| !c.is_whitespace());
                if let Some((quote_offset, q)) = first_quote {
                    if q == '\'' || q == '"' {
                        let start_quote = after_kw + quote_offset;
                        if let Some(end_quote_rel) = out[start_quote + 1..].find(q) {
                            let end_quote = start_quote + 1 + end_quote_rel;
                            out.replace_range(start_quote..=end_quote, "'[REDACTED]'");
                            search_start = start_quote + "'[REDACTED]'".len();
                            continue;
                        }
                    }
                }
                search_start = after_kw;
            } else {
                break;
            }
        }
    }

    out
}

#[derive(Clone)]
pub struct AuditLogger {
    log_dir: PathBuf,
    max_file_size: u64,
    last_hash_cache: Arc<Mutex<Option<String>>>,
    write_lock: Arc<Mutex<()>>,
}

impl AuditLogger {
    pub fn new<P: AsRef<Path>>(log_dir: P) -> Self {
        Self::with_max_size(log_dir, DEFAULT_MAX_FILE_SIZE_BYTES)
    }

    pub fn with_max_size<P: AsRef<Path>>(log_dir: P, max_file_size: u64) -> Self {
        Self {
            log_dir: log_dir.as_ref().to_path_buf(),
            max_file_size,
            last_hash_cache: Arc::new(Mutex::new(None)),
            write_lock: Arc::new(Mutex::new(())),
        }
    }

    pub fn default_dir() -> PathBuf {
        if let Ok(dir) = std::env::var("DATACORE_LOG_DIR") {
            return PathBuf::from(dir);
        }
        if let Ok(dir) = std::env::var("DATACORE_VAULT_DIR") {
            return PathBuf::from(dir);
        }
        if let Ok(dir) = std::env::var("DATACORE_DIR") {
            return PathBuf::from(dir);
        }
        std::env::var("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(".datacore")
    }

    pub fn global() -> &'static AuditLogger {
        static INSTANCE: OnceLock<AuditLogger> = OnceLock::new();
        INSTANCE.get_or_init(|| AuditLogger::new(Self::default_dir()))
    }

    pub fn main_log_path(&self) -> PathBuf {
        self.log_dir.join("audit.jsonl")
    }

    /// Read the latest entry hash from disk if cache is uninitialized
    fn get_or_recover_last_hash(&self) -> Result<String, AppError> {
        let mut cache = self.last_hash_cache.lock().unwrap();
        if let Some(ref h) = *cache {
            return Ok(h.clone());
        }

        let main_path = self.main_log_path();
        if main_path.exists() {
            if let Some(last_hash) = Self::read_last_hash_from_file(&main_path)? {
                *cache = Some(last_hash.clone());
                return Ok(last_hash);
            }
        }

        // Check if rotated files exist to continue chain across rotation
        if let Some(last_rotated_hash) = self.find_latest_rotated_hash()? {
            *cache = Some(last_rotated_hash.clone());
            return Ok(last_rotated_hash);
        }

        let genesis = GENESIS_HASH.to_string();
        *cache = Some(genesis.clone());
        Ok(genesis)
    }

    fn read_last_hash_from_file(path: &Path) -> Result<Option<String>, AppError> {
        let file = File::open(path)?;
        let reader = BufReader::new(file);
        let mut last_hash = None;
        for line in reader.lines() {
            let line = line?;
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                if let Ok(entry) = serde_json::from_str::<AuditLogEntry>(trimmed) {
                    if let Some(h) = entry.entry_hash {
                        last_hash = Some(h);
                    }
                }
            }
        }
        Ok(last_hash)
    }

    fn find_latest_rotated_hash(&self) -> Result<Option<String>, AppError> {
        let rotated_files = self.list_rotated_files()?;
        for path in rotated_files.into_iter().rev() {
            if let Some(h) = Self::read_last_hash_from_file(&path)? {
                return Ok(Some(h));
            }
        }
        Ok(None)
    }

    pub fn list_rotated_files(&self) -> Result<Vec<PathBuf>, AppError> {
        if !self.log_dir.exists() {
            return Ok(Vec::new());
        }
        let mut files = Vec::new();
        for entry in fs::read_dir(&self.log_dir)? {
            let entry = entry?;
            let path = entry.path();
            if let Some(fname) = path.file_name().and_then(|f| f.to_str()) {
                if fname.starts_with("audit.") && fname.ends_with(".jsonl") && fname != "audit.jsonl" {
                    files.push(path);
                }
            }
        }
        files.sort();
        Ok(files)
    }

    /// Append a new audit entry to the audit log
    pub fn log(&self, input: AuditLogEntryInput) -> Result<AuditLogEntry, AppError> {
        let _guard = self.write_lock.lock().unwrap();
        ensure_dir_0700(&self.log_dir)?;

        let mut input = input;
        if let Some(ref mut q) = input.query {
            *q = redact_sensitive_sql(q);
        }
        if let Some(ref mut d) = input.details {
            *d = redact_sensitive_sql(d);
        }

        let prev_hash = self.get_or_recover_last_hash()?;

        let id = input
            .id
            .unwrap_or_else(|| format!("audit-{}", uuid::Uuid::new_v4()));
        let timestamp = input
            .timestamp
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

        // Canonical deterministic details
        let details = input.details.clone().unwrap_or_else(|| {
            let mut parts = Vec::new();
            if let Some(ref q) = input.query {
                parts.push(format!("query={}", q));
            }
            if let Some(ref u) = input.user {
                parts.push(format!("user={}", u));
            }
            if let Some(ref c) = input.connection_name {
                parts.push(format!("connection={}", c));
            }
            if let Some(ref d) = input.database {
                parts.push(format!("database={}", d));
            }
            parts.push(format!("status={}", input.status));
            if let Some(ref e) = input.error_message {
                parts.push(format!("error={}", e));
            }
            if let Some(r) = input.rows_affected {
                parts.push(format!("rows={}", r));
            }
            if let Some(ms) = input.execution_time_ms {
                parts.push(format!("ms={}", ms));
            }
            parts.join(";")
        });

        let entry_hash = compute_entry_hash(&prev_hash, &timestamp, &input.action, &details);

        let entry = AuditLogEntry {
            id,
            timestamp,
            action: input.action,
            user: input.user,
            connection_id: input.connection_id,
            connection_name: input.connection_name,
            database: input.database,
            query: input.query,
            execution_time_ms: input.execution_time_ms,
            rows_affected: input.rows_affected,
            status: input.status,
            error_message: input.error_message,
            details: Some(details),
            prev_hash: Some(prev_hash),
            entry_hash: Some(entry_hash.clone()),
        };

        let serialized = serde_json::to_string(&entry)?;
        let log_path = self.main_log_path();

        // Check file rotation if existing file exceeds max_file_size
        if log_path.exists() {
            let current_len = fs::metadata(&log_path).map(|m| m.len()).unwrap_or(0);
            if current_len >= self.max_file_size {
                self.rotate_log_file()?;
            }
        }

        // Open or create log file with mode 0600 on Unix
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)?;

        writeln!(file, "{}", serialized)?;
        file.flush()?;

        set_file_permissions_0600(&log_path)?;

        // Update cached last hash
        let mut cache = self.last_hash_cache.lock().unwrap();
        *cache = Some(entry_hash);

        Ok(entry)
    }

    /// Rotate active audit.jsonl to audit.<timestamp>.jsonl
    pub fn rotate_log_file(&self) -> Result<PathBuf, AppError> {
        let main_path = self.main_log_path();
        if !main_path.exists() {
            return Ok(main_path);
        }

        let now_str = chrono::Utc::now().format("%Y%m%d_%H%M%S").to_string();
        let mut target = self.log_dir.join(format!("audit.{}.jsonl", now_str));
        let mut counter = 1;
        while target.exists() {
            target = self.log_dir.join(format!("audit.{}_{}.jsonl", now_str, counter));
            counter += 1;
        }

        fs::rename(&main_path, &target)?;
        set_file_permissions_0600(&target)?;
        Ok(target)
    }

    /// Retrieve audit logs in newest-first order with pagination
    pub fn get_logs(
        &self,
        limit: Option<usize>,
        offset: Option<usize>,
    ) -> Result<Vec<AuditLogEntry>, AppError> {
        let _guard = self.write_lock.lock().unwrap();
        let mut all_entries = Vec::new();

        // Read active audit.jsonl
        let main_path = self.main_log_path();
        if main_path.exists() {
            Self::read_entries_from_file(&main_path, &mut all_entries)?;
        }

        // If need more, read rotated files (most recent first)
        let rotated_files = self.list_rotated_files()?;
        for path in rotated_files.into_iter().rev() {
            let mut rotated_entries = Vec::new();
            Self::read_entries_from_file(&path, &mut rotated_entries)?;
            // Rotated files are older, so append them before reversing
            all_entries.splice(0..0, rotated_entries);
        }

        // Reverse to have newest first
        all_entries.reverse();

        let offset = offset.unwrap_or(0);
        let limit = limit.unwrap_or(1000);

        let result = all_entries
            .into_iter()
            .skip(offset)
            .take(limit)
            .collect();

        Ok(result)
    }

    fn read_entries_from_file(path: &Path, list: &mut Vec<AuditLogEntry>) -> Result<(), AppError> {
        let file = File::open(path)?;
        let reader = BufReader::new(file);
        for line in reader.lines() {
            let line = line?;
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                if let Ok(entry) = serde_json::from_str::<AuditLogEntry>(trimmed) {
                    list.push(entry);
                }
            }
        }
        Ok(())
    }

    /// Verify cryptographic hash chain integrity across all records in active audit log
    pub fn verify_integrity(&self) -> Result<AuditIntegrityResult, AppError> {
        let _guard = self.write_lock.lock().unwrap();
        let main_path = self.main_log_path();
        let verified_at = chrono::Utc::now().to_rfc3339();

        if !main_path.exists() {
            return Ok(AuditIntegrityResult {
                is_valid: true,
                total_entries: 0,
                verified_at,
                error: None,
                tampered_entry_id: None,
            });
        }

        let file = File::open(&main_path)?;
        let reader = BufReader::new(file);

        let mut expected_prev_hash: Option<String> = None;
        let mut count = 0;

        for (idx, line) in reader.lines().enumerate() {
            let line = line?;
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let entry: AuditLogEntry = match serde_json::from_str(trimmed) {
                Ok(e) => e,
                Err(err) => {
                    return Ok(AuditIntegrityResult {
                        is_valid: false,
                        total_entries: count,
                        verified_at,
                        error: Some(format!("Invalid JSON format at line {}: {}", idx + 1, err)),
                        tampered_entry_id: None,
                    });
                }
            };

            let entry_prev = entry.prev_hash.as_deref().unwrap_or(GENESIS_HASH);

            match expected_prev_hash {
                None => {
                    // First entry in current file:
                    // Either GENESIS_HASH or matches last entry of newest rotated file
                    if entry_prev != GENESIS_HASH {
                        if let Ok(Some(rotated_hash)) = self.find_latest_rotated_hash() {
                            if entry_prev != rotated_hash {
                                return Ok(AuditIntegrityResult {
                                    is_valid: false,
                                    total_entries: count,
                                    verified_at,
                                    error: Some(format!(
                                        "Chain broken at entry {}: prev_hash '{}' does not link to rotated file hash '{}'",
                                        entry.id, entry_prev, rotated_hash
                                    )),
                                    tampered_entry_id: Some(entry.id),
                                });
                            }
                        } else {
                            return Ok(AuditIntegrityResult {
                                is_valid: false,
                                total_entries: count,
                                verified_at,
                                error: Some(format!(
                                    "Chain broken at initial entry {}: unexpected prev_hash '{}'",
                                    entry.id, entry_prev
                                )),
                                tampered_entry_id: Some(entry.id),
                            });
                        }
                    }
                }
                Some(ref expected) => {
                    if entry_prev != expected {
                        return Ok(AuditIntegrityResult {
                            is_valid: false,
                            total_entries: count,
                            verified_at,
                            error: Some(format!(
                                "Chain broken at entry {}: prev_hash '{}' does not match expected '{}'",
                                entry.id, entry_prev, expected
                            )),
                            tampered_entry_id: Some(entry.id),
                        });
                    }
                }
            }

            // Verify entry hash computation
            let details = entry.details.as_deref().unwrap_or("");
            let computed_hash = compute_entry_hash(entry_prev, &entry.timestamp, &entry.action, details);

            if entry.entry_hash.as_deref() != Some(&computed_hash) {
                return Ok(AuditIntegrityResult {
                    is_valid: false,
                    total_entries: count,
                    verified_at,
                    error: Some(format!(
                        "Tamper detected at entry {}: entry_hash '{:?}' does not match computed '{:?}'",
                        entry.id, entry.entry_hash, computed_hash
                    )),
                    tampered_entry_id: Some(entry.id),
                });
            }

            expected_prev_hash = entry.entry_hash;
            count += 1;
        }

        Ok(AuditIntegrityResult {
            is_valid: true,
            total_entries: count,
            verified_at,
            error: None,
            tampered_entry_id: None,
        })
    }

    /// Clear all audit logs (removes audit.jsonl and rotated archives)
    pub fn clear_logs(&self) -> Result<(), AppError> {
        let _guard = self.write_lock.lock().unwrap();
        let main_path = self.main_log_path();
        if main_path.exists() {
            fs::remove_file(&main_path)?;
        }

        if let Ok(rotated) = self.list_rotated_files() {
            for path in rotated {
                let _ = fs::remove_file(path);
            }
        }

        let mut cache = self.last_hash_cache.lock().unwrap();
        *cache = None;

        Ok(())
    }
}

impl Default for AuditLogger {
    fn default() -> Self {
        Self::new(Self::default_dir())
    }
}
