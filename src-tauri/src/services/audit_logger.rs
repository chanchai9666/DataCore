use crate::error::AppError;
use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

pub const GENESIS_HASH: &str = "0000000000000000000000000000000000000000000000000000000000000000";
pub const DEFAULT_MAX_FILE_SIZE_BYTES: u64 = 2 * 1024 * 1024; // 2MB
const AUDIT_KEY_MAGIC: &[u8; 4] = b"DCK2";
const AUDIT_KEY_RAW_LEN: usize = 32;
const AUDIT_KEY_RECORD_LEN: usize = 4 + 32 + 8;

#[derive(Debug, Clone)]
struct AuditKeyMaterial {
    key: [u8; 32],
    initialized: bool,
    epoch: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
struct ArchiveState {
    file_name: String,
    entries: usize,
    last_entry_hash: String,
}

fn is_zero_u64(v: &u64) -> bool {
    *v == 0
}

fn key_fingerprint(key: &[u8; 32], epoch: u64) -> String {
    compute_hmac_sha256(key, format!("dc-key-binding|{epoch}").as_bytes())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuditAnchorPayload {
    hmac_enabled_since: String,
    active_entries: usize,
    last_entry_hash: String,
    #[serde(default)]
    archives: Vec<ArchiveState>,
    #[serde(default)]
    archives_adopted: bool,
    #[serde(default, skip_serializing_if = "is_zero_u64")]
    key_epoch: u64,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    key_fingerprint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuditAnchorState {
    hmac_enabled_since: String,
    active_entries: usize,
    last_entry_hash: String,
    #[serde(default)]
    archives: Vec<ArchiveState>,
    #[serde(default)]
    archives_adopted: bool,
    #[serde(default, skip_serializing_if = "is_zero_u64")]
    key_epoch: u64,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    key_fingerprint: String,
    anchor_hmac: String,
}

impl AuditAnchorState {
    fn payload(&self) -> AuditAnchorPayload {
        AuditAnchorPayload {
            hmac_enabled_since: self.hmac_enabled_since.clone(),
            active_entries: self.active_entries,
            last_entry_hash: self.last_entry_hash.clone(),
            archives: self.archives.clone(),
            archives_adopted: self.archives_adopted,
            key_epoch: self.key_epoch,
            key_fingerprint: self.key_fingerprint.clone(),
        }
    }
}

fn compute_anchor_hmac(key: &[u8], payload: &AuditAnchorPayload) -> String {
    let serialized = serde_json::to_string(payload).unwrap_or_default();
    compute_hmac_sha256(key, serialized.as_bytes())
}

fn compute_legacy_anchor_hmac(key: &[u8], a: &AuditAnchorState) -> String {
    compute_hmac_sha256(
        key,
        format!(
            "anchor|{}|{}|{}",
            a.hmac_enabled_since, a.active_entries, a.last_entry_hash
        )
        .as_bytes(),
    )
}

fn parse_ts(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|d| d.with_timezone(&Utc))
}

fn normalize_utc_rfc3339(ts: DateTime<Utc>) -> String {
    ts.to_rfc3339_opts(SecondsFormat::Nanos, true)
}

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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hash_algo: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AuditHealth {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditRepairResult {
    pub action: String,
    pub untracked_files: Vec<String>,
    pub quarantined_files: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quarantine_dir: Option<String>,
    pub integrity_valid: bool,
}

/// Computes legacy SHA-256 tamper-evident hash over (prev_hash, timestamp, action/event_type, details)
pub fn compute_entry_hash(prev_hash: &str, timestamp: &str, action: &str, details: &str) -> String {
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

/// Computes RFC 2104 HMAC-SHA256 using `key` over all critical audit fields.
pub fn compute_hmac_sha256(key: &[u8], message: &[u8]) -> String {
    const BLOCK_SIZE: usize = 64;
    let mut key_block = [0u8; BLOCK_SIZE];
    if key.len() > BLOCK_SIZE {
        let mut hasher = Sha256::new();
        hasher.update(key);
        let digest = hasher.finalize();
        key_block[..digest.len()].copy_from_slice(&digest);
    } else {
        key_block[..key.len()].copy_from_slice(key);
    }

    let mut o_key_pad = [0x5cu8; BLOCK_SIZE];
    let mut i_key_pad = [0x36u8; BLOCK_SIZE];
    for i in 0..BLOCK_SIZE {
        o_key_pad[i] ^= key_block[i];
        i_key_pad[i] ^= key_block[i];
    }

    let mut inner = Sha256::new();
    inner.update(i_key_pad);
    inner.update(message);
    let inner_hash = inner.finalize();

    let mut outer = Sha256::new();
    outer.update(o_key_pad);
    outer.update(inner_hash);
    format!("{:x}", outer.finalize())
}

/// Computes keyed HMAC-SHA256 over canonical JSON serialization of all audit entry fields
/// (with `entry_hash` cleared) so tampering with any field is detected.
pub fn compute_entry_hmac(key: &[u8], _prev_hash: &str, entry: &AuditLogEntry) -> String {
    let mut canonical = entry.clone();
    canonical.entry_hash = None;
    let payload = serde_json::to_string(&canonical).unwrap_or_default();
    compute_hmac_sha256(key, payload.as_bytes())
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

    let keywords = ["WITH PASSWORD", "PASSWORD =", "PASSWORD=", "PASSWORD"];

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

struct FileSummary {
    count: usize,
    last_hash: Option<String>,
    first_hmac_ts: Option<DateTime<Utc>>,
    last_legacy_ts: Option<DateTime<Utc>>,
}

enum ChainVerifyOutcome {
    Valid {
        count: usize,
        last_hash: String,
        seen_hmac: bool,
        file_seen_hmac: bool,
    },
    Invalid {
        count: usize,
        error: String,
        tampered_entry_id: Option<String>,
    },
}

#[derive(Clone)]
pub struct AuditLogger {
    log_dir: PathBuf,
    max_file_size: u64,
    last_hash_cache: Arc<Mutex<Option<String>>>,
    active_entries_cache: Arc<Mutex<Option<usize>>>,
    verified_prefix_cache: Arc<Mutex<Option<(usize, String)>>>,
    last_known_file_len: Arc<Mutex<Option<u64>>>,
    write_lock: Arc<Mutex<()>>,
    last_write_error: Arc<Mutex<Option<String>>>,
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
            active_entries_cache: Arc::new(Mutex::new(None)),
            verified_prefix_cache: Arc::new(Mutex::new(None)),
            last_known_file_len: Arc::new(Mutex::new(None)),
            write_lock: Arc::new(Mutex::new(())),
            last_write_error: Arc::new(Mutex::new(None)),
        }
    }

    pub fn health(&self) -> AuditHealth {
        let last_error = self.last_write_error.lock().unwrap().clone();
        AuditHealth {
            ok: last_error.is_none(),
            last_error,
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
        #[cfg(test)]
        let dir = std::env::temp_dir().join(format!("datacore-test-audit-{}", std::process::id()));
        #[cfg(not(test))]
        let dir = std::env::var("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(".datacore");
        dir
    }

    pub fn global() -> &'static AuditLogger {
        static INSTANCE: OnceLock<AuditLogger> = OnceLock::new();
        INSTANCE.get_or_init(|| AuditLogger::new(Self::default_dir()))
    }

    pub fn main_log_path(&self) -> PathBuf {
        self.log_dir.join("audit.jsonl")
    }

    pub fn hmac_key_path(&self) -> PathBuf {
        if let Ok(p) = std::env::var("DATACORE_AUDIT_KEY_PATH") {
            return PathBuf::from(p);
        }
        let dir_name = self
            .log_dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("datacore");
        if let Some(parent) = self.log_dir.parent() {
            parent
                .join(".datacore_audit_keys")
                .join(format!("{}.hmac.key", dir_name))
        } else {
            self.log_dir.join(".audit.hmac.key")
        }
    }

    pub fn hmac_anchor_path(&self) -> PathBuf {
        if let Ok(p) = std::env::var("DATACORE_AUDIT_ANCHOR_PATH") {
            return PathBuf::from(p);
        }
        self.hmac_key_path().with_extension("anchor.json")
    }

    fn legacy_hmac_key_path(&self) -> PathBuf {
        self.log_dir.join(".audit.hmac.key")
    }

    fn migrate_legacy_key_if_needed(&self) {
        let new_path = self.hmac_key_path();
        let legacy_path = self.legacy_hmac_key_path();
        if !new_path.exists() && new_path != legacy_path && legacy_path.exists() {
            if let Some(key_dir) = new_path.parent() {
                let _ = ensure_dir_0700(key_dir);
            }
            if fs::rename(&legacy_path, &new_path).is_ok() {
                let _ = set_file_permissions_0600(&new_path);
            }
        }
    }

    fn read_key_material(&self) -> Result<Option<AuditKeyMaterial>, AppError> {
        self.migrate_legacy_key_if_needed();
        let key_path = self.hmac_key_path();
        if !key_path.exists() {
            return Ok(None);
        }
        let bytes = fs::read(&key_path)?;
        match bytes.len() {
            AUDIT_KEY_RAW_LEN => {
                let mut key = [0u8; 32];
                key.copy_from_slice(&bytes);
                Ok(Some(AuditKeyMaterial {
                    key,
                    initialized: false,
                    epoch: 0,
                }))
            }
            AUDIT_KEY_RECORD_LEN if &bytes[..4] == AUDIT_KEY_MAGIC => {
                let mut key = [0u8; 32];
                key.copy_from_slice(&bytes[4..36]);
                let mut epoch_bytes = [0u8; 8];
                epoch_bytes.copy_from_slice(&bytes[36..44]);
                let epoch = u64::from_be_bytes(epoch_bytes);
                Ok(Some(AuditKeyMaterial {
                    key,
                    initialized: true,
                    epoch,
                }))
            }
            _ => Err(AppError::Other(
                "Audit HMAC key file is corrupted".to_string(),
            )),
        }
    }

    fn write_dck2_key(&self, key: &[u8; 32]) -> Result<u64, AppError> {
        let key_path = self.hmac_key_path();
        if let Some(key_dir) = key_path.parent() {
            ensure_dir_0700(key_dir)?;
        }
        let epoch = Utc::now().timestamp().max(1) as u64;
        let mut buf = Vec::with_capacity(AUDIT_KEY_RECORD_LEN);
        buf.extend_from_slice(AUDIT_KEY_MAGIC);
        buf.extend_from_slice(key);
        buf.extend_from_slice(&epoch.to_be_bytes());
        let tmp_path = key_path.with_extension("key.tmp");
        fs::write(&tmp_path, &buf)?;
        if let Err(err) = set_file_permissions_0600(&tmp_path) {
            let _ = fs::remove_file(&tmp_path);
            return Err(err);
        }
        if let Err(err) = fs::rename(&tmp_path, &key_path) {
            let _ = fs::remove_file(&tmp_path);
            return Err(err.into());
        }
        set_file_permissions_0600(&key_path)?;
        Ok(epoch)
    }

    fn ensure_key_initialized(&self, material: &mut AuditKeyMaterial) -> Result<(), AppError> {
        if !material.initialized || material.epoch == 0 {
            let epoch = self.write_dck2_key(&material.key)?;
            material.initialized = true;
            material.epoch = epoch;
        }
        Ok(())
    }

    fn get_or_create_key_material(&self) -> Result<(AuditKeyMaterial, bool), AppError> {
        ensure_dir_0700(&self.log_dir)?;
        if let Some(material) = self.read_key_material()? {
            return Ok((material, false));
        }
        if self.hmac_anchor_path().exists() {
            return Err(AppError::Other(
                "HMAC key missing while audit anchor exists (fail-closed)".to_string(),
            ));
        }
        use rand::RngExt;
        let mut key = [0u8; 32];
        rand::rng().fill(&mut key);
        let epoch = self.write_dck2_key(&key)?;
        Ok((
            AuditKeyMaterial {
                key,
                initialized: true,
                epoch,
            },
            true,
        ))
    }

    fn read_anchor_if_exists(&self) -> Option<AuditAnchorState> {
        let anchor_path = self.hmac_anchor_path();
        if !anchor_path.exists() {
            return None;
        }
        let raw = fs::read_to_string(&anchor_path).ok()?;
        serde_json::from_str::<AuditAnchorState>(&raw).ok()
    }

    /// Read the anchor file and verify its HMAC (and key epoch/fingerprint binding) before returning it.
    /// - Missing file: `Err` if key is initialized DCK2 (fail-closed), `Ok(None)` otherwise.
    /// - Unparseable/corrupt JSON or invalid signature: `Err` (fail-closed, refusing to re-sign).
    /// - Legacy anchor (`anchor|since|entries|last`): verifies, promotes DCK1->DCK2, rewrites anchor in current format.
    fn read_verified_anchor(
        &self,
        material: &mut AuditKeyMaterial,
    ) -> Result<Option<AuditAnchorState>, AppError> {
        let path = self.hmac_anchor_path();
        match fs::metadata(&path) {
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
                if material.initialized {
                    return Err(AppError::Other(
                        "Audit anchor missing for initialized key (fail-closed)".to_string(),
                    ));
                }
                return Ok(None);
            }
            Err(err) => return Err(err.into()),
            Ok(_) => {}
        }

        let Some(mut anchor) = self.read_anchor_if_exists() else {
            return Err(AppError::Other(
                "Audit anchor file is corrupted (fail-closed, refusing to re-sign)".to_string(),
            ));
        };

        if anchor.key_epoch > 0 || !anchor.key_fingerprint.is_empty() {
            if !material.initialized {
                return Err(AppError::Other(
                    "Audit key downgrade detected: DCK1 key found for DCK2-bound anchor (fail-closed)"
                        .to_string(),
                ));
            }
            if material.epoch != anchor.key_epoch {
                return Err(AppError::Other(
                    "Audit key epoch mismatch against anchor (fail-closed)".to_string(),
                ));
            }
            if anchor.key_fingerprint != key_fingerprint(&material.key, material.epoch) {
                return Err(AppError::Other(
                    "Audit key fingerprint mismatch against anchor (fail-closed)".to_string(),
                ));
            }
        }

        if anchor.anchor_hmac == compute_anchor_hmac(&material.key, &anchor.payload()) {
            if !material.initialized
                || anchor.key_epoch == 0
                || anchor.key_fingerprint.is_empty()
                || !anchor.archives_adopted
            {
                self.ensure_key_initialized(material)?;
                let fp = key_fingerprint(&material.key, material.epoch);
                let _ = self.write_anchor(
                    &material.key,
                    material.epoch,
                    anchor.hmac_enabled_since.clone(),
                    anchor.active_entries,
                    anchor.last_entry_hash.clone(),
                    anchor.archives.clone(),
                    true,
                );
                anchor.key_epoch = material.epoch;
                anchor.key_fingerprint = fp;
                anchor.archives_adopted = true;
            }
            return Ok(Some(anchor));
        }

        // Compatibility: legacy anchor written before AuditAnchorPayload JSON signing (<= 5f2f313)
        if anchor.archives.is_empty()
            && anchor.key_epoch == 0
            && anchor.key_fingerprint.is_empty()
            && anchor.anchor_hmac == compute_legacy_anchor_hmac(&material.key, &anchor)
        {
            self.ensure_key_initialized(material)?;
            self.write_anchor(
                &material.key,
                material.epoch,
                anchor.hmac_enabled_since.clone(),
                anchor.active_entries,
                anchor.last_entry_hash.clone(),
                Vec::new(),
                false,
            )?;
            return Ok(self.read_anchor_if_exists());
        }

        Err(AppError::Other(
            "Audit anchor signature verification failed (fail-closed, refusing to re-sign)"
                .to_string(),
        ))
    }

    #[allow(clippy::too_many_arguments)]
    fn write_anchor(
        &self,
        key: &[u8; 32],
        epoch: u64,
        hmac_enabled_since: String,
        active_entries: usize,
        last_entry_hash: String,
        archives: Vec<ArchiveState>,
        archives_adopted: bool,
    ) -> Result<(), AppError> {
        let anchor_path = self.hmac_anchor_path();
        if let Some(dir) = anchor_path.parent() {
            ensure_dir_0700(dir)?;
        }
        let (key_epoch, fp) = if epoch > 0 {
            (epoch, key_fingerprint(key, epoch))
        } else {
            (0, String::new())
        };
        let payload = AuditAnchorPayload {
            hmac_enabled_since: hmac_enabled_since.clone(),
            active_entries,
            last_entry_hash: last_entry_hash.clone(),
            archives: archives.clone(),
            archives_adopted,
            key_epoch,
            key_fingerprint: fp.clone(),
        };
        let anchor_hmac = compute_anchor_hmac(key, &payload);
        let state = AuditAnchorState {
            hmac_enabled_since,
            active_entries,
            last_entry_hash,
            archives,
            archives_adopted,
            key_epoch,
            key_fingerprint: fp,
            anchor_hmac,
        };
        let serialized = serde_json::to_string(&state)?;
        let tmp_path = anchor_path.with_extension("anchor.tmp");
        fs::write(&tmp_path, serialized)?;
        if let Err(err) = set_file_permissions_0600(&tmp_path) {
            let _ = fs::remove_file(&tmp_path);
            return Err(err);
        }
        if let Err(err) = fs::rename(&tmp_path, &anchor_path) {
            let _ = fs::remove_file(&tmp_path);
            return Err(err.into());
        }
        set_file_permissions_0600(&anchor_path)?;
        Ok(())
    }

    fn scan_file_summary(path: &Path) -> FileSummary {
        let Ok(file) = File::open(path) else {
            return FileSummary {
                count: 0,
                last_hash: None,
                first_hmac_ts: None,
                last_legacy_ts: None,
            };
        };
        let mut count = 0usize;
        let mut last_hash = None;
        let mut first_hmac_ts: Option<DateTime<Utc>> = None;
        let mut last_legacy_ts: Option<DateTime<Utc>> = None;

        for line in BufReader::new(file).lines().map_while(Result::ok) {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            count += 1;
            if let Ok(entry) = serde_json::from_str::<AuditLogEntry>(trimmed) {
                if let Some(h) = entry.entry_hash {
                    last_hash = Some(h);
                }
                let algo = entry.hash_algo.as_deref().unwrap_or("sha256");
                if let Some(ts) = parse_ts(&entry.timestamp) {
                    if algo == "hmac-sha256" {
                        if first_hmac_ts.is_none() {
                            first_hmac_ts = Some(ts);
                        }
                    } else {
                        last_legacy_ts = Some(match last_legacy_ts {
                            Some(prev) => prev.max(ts),
                            None => ts,
                        });
                    }
                }
            }
        }
        FileSummary {
            count,
            last_hash,
            first_hmac_ts,
            last_legacy_ts,
        }
    }

    /// One-time bootstrap for legacy DCK1 (32-byte) keys upgraded from older builds.
    /// Does nothing if anchor exists or if key is already DCK2 (fail-closed when anchor missing).
    fn bootstrap_anchor_if_needed(&self) -> Result<(), AppError> {
        if self.hmac_anchor_path().exists() {
            return Ok(());
        }
        let Some(material) = self.read_key_material()? else {
            return Ok(());
        };
        if material.initialized {
            // DCK2 without anchor: fail-closed, do not re-bootstrap
            return Ok(());
        }

        let mut archives = Vec::new();
        let mut last_hash = GENESIS_HASH.to_string();
        let mut first_hmac_ts: Option<DateTime<Utc>> = None;
        let mut last_legacy_ts: Option<DateTime<Utc>> = None;

        if let Ok(rotated) = self.list_rotated_files() {
            for path in rotated {
                let Some(fname) = path.file_name().and_then(|n| n.to_str()) else {
                    continue;
                };
                let summary = Self::scan_file_summary(&path);
                if let Some(h) = summary.last_hash {
                    last_hash = h;
                }
                if first_hmac_ts.is_none() {
                    first_hmac_ts = summary.first_hmac_ts;
                }
                if let Some(ts) = summary.last_legacy_ts {
                    last_legacy_ts = Some(last_legacy_ts.map_or(ts, |p| p.max(ts)));
                }
                archives.push(ArchiveState {
                    file_name: fname.to_string(),
                    entries: summary.count,
                    last_entry_hash: last_hash.clone(),
                });
            }
        }

        let main_path = self.main_log_path();
        let main_summary = if main_path.exists() {
            Self::scan_file_summary(&main_path)
        } else {
            FileSummary {
                count: 0,
                last_hash: None,
                first_hmac_ts: None,
                last_legacy_ts: None,
            }
        };
        let active_entries = main_summary.count;
        if let Some(h) = main_summary.last_hash {
            last_hash = h;
        }
        if first_hmac_ts.is_none() {
            first_hmac_ts = main_summary.first_hmac_ts;
        }
        if let Some(ts) = main_summary.last_legacy_ts {
            last_legacy_ts = Some(last_legacy_ts.map_or(ts, |p| p.max(ts)));
        }

        let enabled_since = match (first_hmac_ts, last_legacy_ts) {
            (Some(t), _) => t,
            (None, Some(t)) => t + chrono::Duration::nanoseconds(1),
            (None, None) => Utc::now(),
        };

        let epoch = self.write_dck2_key(&material.key)?;
        self.write_anchor(
            &material.key,
            epoch,
            normalize_utc_rfc3339(enabled_since),
            active_entries,
            last_hash,
            archives,
            true,
        )?;
        Ok(())
    }

    fn count_existing_non_empty_lines(path: &Path) -> usize {
        use std::io::Read;
        let Ok(mut file) = File::open(path) else {
            return 0;
        };
        let mut buf = [0u8; 65536];
        let mut count = 0usize;
        let mut line_has_non_ws = false;
        loop {
            let n = match file.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => n,
                Err(_) => return 0,
            };
            for &b in &buf[..n] {
                if b == b'\n' {
                    if line_has_non_ws {
                        count += 1;
                        line_has_non_ws = false;
                    }
                } else if !b.is_ascii_whitespace() {
                    line_has_non_ws = true;
                }
            }
        }
        if line_has_non_ws {
            count += 1;
        }
        count
    }

    fn hash_at_entry_index(path: &Path, target_count: usize) -> Option<String> {
        if target_count == 0 {
            return Some(GENESIS_HASH.to_string());
        }
        let file = File::open(path).ok()?;
        let mut count = 0usize;
        for line in BufReader::new(file).lines().map_while(Result::ok) {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            count += 1;
            if count == target_count {
                let entry = serde_json::from_str::<AuditLogEntry>(trimmed).ok()?;
                return entry.entry_hash;
            }
        }
        None
    }

    fn file_contains_entry_hash(path: &Path, target_hash: &str) -> bool {
        let Ok(file) = File::open(path) else {
            return false;
        };
        for line in BufReader::new(file).lines().map_while(Result::ok) {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Ok(entry) = serde_json::from_str::<AuditLogEntry>(trimmed) {
                if entry.entry_hash.as_deref() == Some(target_hash) {
                    return true;
                }
            }
        }
        false
    }

    /// Read the latest entry hash from disk if cache is uninitialized
    fn get_or_recover_last_hash(
        &self,
        anchor: Option<&AuditAnchorState>,
    ) -> Result<String, AppError> {
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

        if let Some(anc) = anchor {
            if anc.active_entries > 0 {
                return Ok(anc.last_entry_hash.clone());
            }
        }

        let genesis = GENESIS_HASH.to_string();
        *cache = Some(genesis.clone());
        Ok(genesis)
    }

    fn read_last_hash_from_file(path: &Path) -> Result<Option<String>, AppError> {
        use std::io::{Read, Seek, SeekFrom};
        let mut file = File::open(path)?;
        let len = file.metadata()?.len();
        if len > 65536 {
            let offset = len - 65536;
            file.seek(SeekFrom::Start(offset))?;
            let mut tail = Vec::new();
            file.read_to_end(&mut tail)?;
            let text = String::from_utf8_lossy(&tail);
            // Skip the first partial line since we sought mid-file
            let slice = text.split_once('\n').map(|(_, rest)| rest).unwrap_or("");
            for line in slice.lines().rev() {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    if let Ok(entry) = serde_json::from_str::<AuditLogEntry>(trimmed) {
                        if let Some(h) = entry.entry_hash {
                            return Ok(Some(h));
                        }
                    }
                }
            }
            file.seek(SeekFrom::Start(0))?;
        }
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
                if fname.starts_with("audit.")
                    && fname.ends_with(".jsonl")
                    && fname != "audit.jsonl"
                {
                    files.push(path);
                }
            }
        }
        files.sort();
        Ok(files)
    }

    /// Append a new audit entry to the audit log
    pub fn log(&self, input: AuditLogEntryInput) -> Result<AuditLogEntry, AppError> {
        match self.log_inner(input) {
            Ok(entry) => {
                *self.last_write_error.lock().unwrap() = None;
                Ok(entry)
            }
            Err(err) => {
                let msg = err.to_string();
                eprintln!("[audit] write failed: {msg}");
                *self.last_write_error.lock().unwrap() = Some(msg);
                Err(err)
            }
        }
    }

    fn log_inner(&self, input: AuditLogEntryInput) -> Result<AuditLogEntry, AppError> {
        let _guard = self.write_lock.lock().unwrap();
        ensure_dir_0700(&self.log_dir)?;

        self.bootstrap_anchor_if_needed()?;
        let (mut material, is_new_key) = self.get_or_create_key_material()?;
        let mut existing_anchor = if is_new_key {
            None
        } else {
            self.read_verified_anchor(&mut material)?
        };

        if let Some(ref anc) = existing_anchor {
            let tracked: std::collections::HashSet<&str> =
                anc.archives.iter().map(|a| a.file_name.as_str()).collect();
            let has_untracked = self.list_rotated_files()?.into_iter().any(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|name| !tracked.contains(name))
            });
            if has_untracked {
                let reconciled = self.verify_integrity_locked()?;
                if !reconciled.is_valid {
                    return Err(AppError::Other(reconciled.error.unwrap_or_else(|| {
                        "Audit archive reconciliation failed".to_string()
                    })));
                }
                existing_anchor = self.read_verified_anchor(&mut material)?;
            }
        }

        let log_path = self.main_log_path();
        if let Some(ref anc) = existing_anchor {
            let current_len = fs::metadata(&log_path).map(|m| m.len()).ok();
            let cached_len = *self.last_known_file_len.lock().unwrap();
            let cached_count = *self.active_entries_cache.lock().unwrap();
            let cached_prefix = self.verified_prefix_cache.lock().unwrap().clone();

            let fast_path_ok = current_len.is_some()
                && current_len == cached_len
                && cached_count.is_some()
                && cached_prefix
                    .as_ref()
                    .is_some_and(|(e, h)| *e == anc.active_entries && h == &anc.last_entry_hash);

            if !fast_path_ok {
                let disk_count = if log_path.exists() {
                    Self::count_existing_non_empty_lines(&log_path)
                } else {
                    0
                };
                if disk_count < anc.active_entries {
                    return Err(AppError::Other(format!(
                        "Audit log truncation detected before write: active log has {} entries but anchor expects {} (fail-closed)",
                        disk_count, anc.active_entries
                    )));
                }

                let forward = disk_count - anc.active_entries;
                let prefix_ok = anc.active_entries == 0
                    || Self::hash_at_entry_index(&log_path, anc.active_entries).as_deref()
                        == Some(anc.last_entry_hash.as_str());

                if forward > 100 || !prefix_ok {
                    return Err(AppError::Other(format!(
                        "Audit log diverged from anchor before write ({} entries ahead, prefix_ok={}) (fail-closed)",
                        forward, prefix_ok
                    )));
                }

                *self.active_entries_cache.lock().unwrap() = Some(disk_count);
                *self.verified_prefix_cache.lock().unwrap() =
                    Some((anc.active_entries, anc.last_entry_hash.clone()));
                *self.last_known_file_len.lock().unwrap() = current_len;
            }
        }

        let mut input = input;
        if let Some(ref mut q) = input.query {
            *q = redact_sensitive_sql(q);
        }
        if let Some(ref mut d) = input.details {
            *d = redact_sensitive_sql(d);
        }

        let prev_hash = self.get_or_recover_last_hash(existing_anchor.as_ref())?;

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

        let mut entry = AuditLogEntry {
            id,
            timestamp: parse_ts(&timestamp)
                .map(normalize_utc_rfc3339)
                .unwrap_or(timestamp),
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
            prev_hash: Some(prev_hash.clone()),
            entry_hash: None,
            hash_algo: Some("hmac-sha256".to_string()),
        };

        let entry_hash = compute_entry_hmac(&material.key, &prev_hash, &entry);
        entry.entry_hash = Some(entry_hash.clone());

        let serialized = serde_json::to_string(&entry)?;

        // Check file rotation if existing file exceeds max_file_size
        if log_path.exists() {
            let current_len = fs::metadata(&log_path).map(|m| m.len()).unwrap_or(0);
            if current_len >= self.max_file_size {
                self.rotate_log_file_with_state(Some(&material), &mut existing_anchor)?;
            }
        }

        let enabled_since = existing_anchor
            .as_ref()
            .map(|a| a.hmac_enabled_since.clone())
            .unwrap_or_else(|| entry.timestamp.clone());
        let existing_archives = existing_anchor
            .as_ref()
            .map(|a| a.archives.clone())
            .unwrap_or_default();
        let archives_adopted = existing_anchor
            .as_ref()
            .map(|a| a.archives_adopted)
            .unwrap_or_else(|| {
                self.list_rotated_files()
                    .map(|r| r.is_empty())
                    .unwrap_or(true)
            });
        let prior_active_count = if !log_path.exists() {
            let mut cache = self.active_entries_cache.lock().unwrap();
            *cache = Some(0);
            0
        } else {
            let mut cache = self.active_entries_cache.lock().unwrap();
            match *cache {
                Some(count) => count,
                None => {
                    let count = Self::count_existing_non_empty_lines(&log_path);
                    *cache = Some(count);
                    count
                }
            }
        };

        // Open or create log file with mode 0600 on Unix
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)?;

        writeln!(file, "{}", serialized)?;
        file.flush()?;

        set_file_permissions_0600(&log_path)?;

        // 1) Update cached last hash & active count immediately so subsequent logs never break the chain or re-scan the file
        {
            let mut cache = self.last_hash_cache.lock().unwrap();
            *cache = Some(entry_hash.clone());
        }
        {
            let mut cache = self.active_entries_cache.lock().unwrap();
            *cache = Some(prior_active_count + 1);
        }
        *self.last_known_file_len.lock().unwrap() = fs::metadata(&log_path).map(|m| m.len()).ok();
        *self.verified_prefix_cache.lock().unwrap() =
            Some((prior_active_count + 1, entry_hash.clone()));

        // 2) Best-effort signed anchor update (self-heals on subsequent write or verify if transient error occurs)
        if let Err(err) = self.write_anchor(
            &material.key,
            material.epoch,
            enabled_since,
            prior_active_count + 1,
            entry_hash,
            existing_archives,
            archives_adopted,
        ) {
            eprintln!("[audit] anchor update failed (will self-heal): {err}");
        }

        Ok(entry)
    }

    fn rotate_log_file_with_state(
        &self,
        material: Option<&AuditKeyMaterial>,
        anchor: &mut Option<AuditAnchorState>,
    ) -> Result<PathBuf, AppError> {
        let main_path = self.main_log_path();
        if !main_path.exists() {
            return Ok(main_path);
        }

        let now_str = chrono::Utc::now().format("%Y%m%d_%H%M%S").to_string();
        let mut target = self.log_dir.join(format!("audit.{}.jsonl", now_str));
        let mut counter = 1;
        while target.exists() {
            target = self
                .log_dir
                .join(format!("audit.{}_{}.jsonl", now_str, counter));
            counter += 1;
        }

        let main_summary = Self::scan_file_summary(&main_path);

        fs::rename(&main_path, &target)?;
        set_file_permissions_0600(&target)?;

        if let (Some(mat), Some(anc)) = (material, anchor.as_mut()) {
            let prev_active_entries = anc.active_entries;
            let prev_archives_adopted = anc.archives_adopted;
            let pushed_archive = target
                .file_name()
                .and_then(|n| n.to_str())
                .map(|fname| {
                    anc.archives.push(ArchiveState {
                        file_name: fname.to_string(),
                        entries: main_summary.count,
                        last_entry_hash: main_summary
                            .last_hash
                            .unwrap_or_else(|| anc.last_entry_hash.clone()),
                    });
                    true
                })
                .unwrap_or(false);
            anc.active_entries = 0;
            anc.archives_adopted = true;
            if let Err(err) = self.write_anchor(
                &mat.key,
                mat.epoch,
                anc.hmac_enabled_since.clone(),
                0,
                anc.last_entry_hash.clone(),
                anc.archives.clone(),
                true,
            ) {
                // Transactional rollback: restore main log so disk state stays consistent
                if let Err(rb) = fs::rename(&target, &main_path) {
                    eprintln!("[audit] rotation rollback failed after anchor error: {rb}");
                }
                if pushed_archive {
                    anc.archives.pop();
                }
                anc.active_entries = prev_active_entries;
                anc.archives_adopted = prev_archives_adopted;
                return Err(err);
            }
        }

        *self.active_entries_cache.lock().unwrap() = Some(0);
        *self.verified_prefix_cache.lock().unwrap() = None;
        *self.last_known_file_len.lock().unwrap() = None;
        Ok(target)
    }

    /// Rotate active audit.jsonl to audit.<timestamp>.jsonl
    pub fn rotate_log_file(&self) -> Result<PathBuf, AppError> {
        let _guard = self.write_lock.lock().unwrap();
        self.bootstrap_anchor_if_needed()?;
        let mut material = self.read_key_material()?;
        let mut anchor = if let Some(ref mut mat) = material {
            self.read_verified_anchor(mat)?
        } else if self.hmac_anchor_path().exists() {
            return Err(AppError::Other(
                "HMAC key missing while audit anchor exists (fail-closed)".to_string(),
            ));
        } else {
            None
        };
        self.rotate_log_file_with_state(material.as_ref(), &mut anchor)
    }

    /// Retrieve audit logs in newest-first order with pagination
    pub fn get_logs(
        &self,
        limit: Option<usize>,
        offset: Option<usize>,
    ) -> Result<Vec<AuditLogEntry>, AppError> {
        let _guard = self.write_lock.lock().unwrap();
        let offset = offset.unwrap_or(0);
        let limit = limit.unwrap_or(1000);
        let needed = offset.saturating_add(limit);
        if needed == 0 {
            return Ok(Vec::new());
        }

        let mut collected = Vec::new();

        // Read active audit.jsonl first (newest entries are at the end)
        let main_path = self.main_log_path();
        if main_path.exists() {
            let mut active_entries = Vec::new();
            Self::read_entries_from_file(&main_path, &mut active_entries)?;
            active_entries.reverse();
            collected.extend(active_entries);
        }

        // Only read rotated archives (most recent first) if we still need more entries
        if collected.len() < needed {
            let rotated_files = self.list_rotated_files()?;
            for path in rotated_files.into_iter().rev() {
                let mut rotated_entries = Vec::new();
                Self::read_entries_from_file(&path, &mut rotated_entries)?;
                rotated_entries.reverse();
                collected.extend(rotated_entries);
                if collected.len() >= needed {
                    break;
                }
            }
        }

        let result = collected.into_iter().skip(offset).take(limit).collect();
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

    fn verify_file_chain(
        path: &Path,
        hmac_key: Option<&[u8; 32]>,
        initial_prev_hash: &str,
        hmac_enabled_since: Option<&str>,
        mut seen_hmac: bool,
    ) -> Result<ChainVerifyOutcome, AppError> {
        let file = File::open(path)?;
        let reader = BufReader::new(file);

        let mut expected_prev_hash = initial_prev_hash.to_string();
        let mut count = 0usize;
        let mut file_seen_hmac = false;

        for (idx, line) in reader.lines().enumerate() {
            let line = line?;
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let entry: AuditLogEntry = match serde_json::from_str(trimmed) {
                Ok(e) => e,
                Err(err) => {
                    return Ok(ChainVerifyOutcome::Invalid {
                        count: count + 1,
                        error: format!("Invalid JSON format at line {}: {}", idx + 1, err),
                        tampered_entry_id: None,
                    });
                }
            };

            let entry_prev = entry.prev_hash.as_deref().unwrap_or(GENESIS_HASH);
            if entry_prev != expected_prev_hash {
                return Ok(ChainVerifyOutcome::Invalid {
                    count: count + 1,
                    error: format!(
                        "Chain broken at entry {}: prev_hash '{}' does not match expected '{}'",
                        entry.id, entry_prev, expected_prev_hash
                    ),
                    tampered_entry_id: Some(entry.id),
                });
            }

            let details = entry.details.as_deref().unwrap_or("");
            let algo = entry.hash_algo.as_deref().unwrap_or("sha256");

            if algo == "hmac-sha256" {
                seen_hmac = true;
                file_seen_hmac = true;
                let Some(key) = hmac_key else {
                    return Ok(ChainVerifyOutcome::Invalid {
                        count: count + 1,
                        error: format!(
                            "HMAC key missing for entry {} (fail-closed integrity check)",
                            entry.id
                        ),
                        tampered_entry_id: Some(entry.id),
                    });
                };
                let expected_hash = compute_entry_hmac(key, entry_prev, &entry);
                if entry.entry_hash.as_deref() != Some(expected_hash.as_str()) {
                    return Ok(ChainVerifyOutcome::Invalid {
                        count: count + 1,
                        error: format!(
                            "Tamper detected at entry {}: entry_hash '{:?}' does not match computed '{:?}'",
                            entry.id, entry.entry_hash, expected_hash
                        ),
                        tampered_entry_id: Some(entry.id),
                    });
                }
            } else {
                if seen_hmac {
                    return Ok(ChainVerifyOutcome::Invalid {
                        count: count + 1,
                        error: format!(
                            "Hash algorithm downgrade detected at entry {}: legacy '{}' after hmac-sha256",
                            entry.id, algo
                        ),
                        tampered_entry_id: Some(entry.id),
                    });
                }
                if let Some(since_str) = hmac_enabled_since {
                    let is_downgrade = match (parse_ts(&entry.timestamp), parse_ts(since_str)) {
                        (Some(entry_ts), Some(since_ts)) => entry_ts >= since_ts,
                        _ => {
                            eprintln!(
                                "[audit] warning: non-RFC3339 timestamp fallback comparison for entry {}",
                                entry.id
                            );
                            entry.timestamp.as_str() >= since_str
                        }
                    };
                    if is_downgrade {
                        return Ok(ChainVerifyOutcome::Invalid {
                            count: count + 1,
                            error: format!(
                                "Hash algorithm downgrade detected at entry {}: legacy '{}' entry at '{}' is not older than HMAC activation '{}'",
                                entry.id, algo, entry.timestamp, since_str
                            ),
                            tampered_entry_id: Some(entry.id),
                        });
                    }
                }
                let expected_hash =
                    compute_entry_hash(entry_prev, &entry.timestamp, &entry.action, details);
                if entry.entry_hash.as_deref() != Some(expected_hash.as_str()) {
                    return Ok(ChainVerifyOutcome::Invalid {
                        count: count + 1,
                        error: format!(
                            "Tamper detected at entry {}: entry_hash '{:?}' does not match computed '{:?}'",
                            entry.id, entry.entry_hash, expected_hash
                        ),
                        tampered_entry_id: Some(entry.id),
                    });
                }
            }

            expected_prev_hash = entry.entry_hash.unwrap_or_default();
            count += 1;
        }

        Ok(ChainVerifyOutcome::Valid {
            count,
            last_hash: expected_prev_hash,
            seen_hmac,
            file_seen_hmac,
        })
    }

    /// Verify cryptographic hash chain integrity across archives and active audit log
    pub fn verify_integrity(&self) -> Result<AuditIntegrityResult, AppError> {
        let _guard = self.write_lock.lock().unwrap();
        let res = self.verify_integrity_locked()?;
        if res.is_valid {
            *self.last_write_error.lock().unwrap() = None;
        } else {
            *self.last_write_error.lock().unwrap() = Some(
                res.error
                    .clone()
                    .unwrap_or_else(|| "Audit integrity verification failed".to_string()),
            );
        }
        Ok(res)
    }

    fn verify_integrity_locked(&self) -> Result<AuditIntegrityResult, AppError> {
        let main_path = self.main_log_path();
        let verified_at = chrono::Utc::now().to_rfc3339();

        let invalid = |total_entries: usize, error: String, tampered_entry_id: Option<String>| {
            AuditIntegrityResult {
                is_valid: false,
                total_entries,
                verified_at: verified_at.clone(),
                error: Some(error),
                tampered_entry_id,
            }
        };

        if let Err(err) = self.bootstrap_anchor_if_needed() {
            return Ok(invalid(0, err.to_string(), None));
        }

        let mut key_material = match self.read_key_material() {
            Ok(m) => m,
            Err(err) => return Ok(invalid(0, err.to_string(), None)),
        };

        let mut anchor = if let Some(ref mut mat) = key_material {
            match self.read_verified_anchor(mat) {
                Ok(a) => a,
                Err(err) => return Ok(invalid(0, err.to_string(), None)),
            }
        } else {
            if self.hmac_anchor_path().exists() {
                return Ok(invalid(
                    0,
                    "HMAC key missing while audit anchor exists (fail-closed)".to_string(),
                    None,
                ));
            }
            None
        };
        let hmac_key = key_material.as_ref().map(|m| m.key);

        // Verify rotated archives tracked in anchor (or adopt-once for legacy anchors)
        let mut chain_prev = GENESIS_HASH.to_string();
        let mut seen_hmac_across_chain = false;
        let mut checked_entries = 0usize;
        let enabled_since_ref = anchor.as_ref().map(|a| a.hmac_enabled_since.clone());

        if let Some(ref mut anc) = anchor {
            if !anc.archives.is_empty() {
                for arc in &anc.archives {
                    let Some(safe_name) = Path::new(&arc.file_name).file_name() else {
                        return Ok(invalid(
                            checked_entries,
                            "Invalid archive filename in anchor".to_string(),
                            None,
                        ));
                    };
                    let arc_path = self.log_dir.join(safe_name);
                    if !arc_path.exists() {
                        return Ok(invalid(
                            checked_entries,
                            format!("Archived audit log missing: {}", arc.file_name),
                            None,
                        ));
                    }
                    match Self::verify_file_chain(
                        &arc_path,
                        hmac_key.as_ref(),
                        &chain_prev,
                        enabled_since_ref.as_deref(),
                        seen_hmac_across_chain,
                    )? {
                        ChainVerifyOutcome::Valid {
                            count: arc_count,
                            last_hash: arc_last_hash,
                            seen_hmac: arc_seen_hmac,
                            ..
                        } => {
                            checked_entries += arc_count;
                            if arc_count != arc.entries || arc_last_hash != arc.last_entry_hash {
                                return Ok(invalid(
                                    checked_entries,
                                    format!("Archived audit log tampered: {}", arc.file_name),
                                    None,
                                ));
                            }
                            chain_prev = arc_last_hash;
                            seen_hmac_across_chain = arc_seen_hmac;
                        }
                        ChainVerifyOutcome::Invalid {
                            count: err_count,
                            error,
                            tampered_entry_id,
                        } => {
                            return Ok(invalid(
                                checked_entries + err_count,
                                error,
                                tampered_entry_id,
                            ));
                        }
                    }
                }
            } else if !anc.archives_adopted {
                let rotated = self.list_rotated_files()?;
                let mut adopted = Vec::new();
                for arc_path in rotated {
                    let Some(fname) = arc_path.file_name().and_then(|n| n.to_str()) else {
                        continue;
                    };
                    match Self::verify_file_chain(
                        &arc_path,
                        hmac_key.as_ref(),
                        &chain_prev,
                        enabled_since_ref.as_deref(),
                        seen_hmac_across_chain,
                    )? {
                        ChainVerifyOutcome::Valid {
                            count: arc_count,
                            last_hash: arc_last_hash,
                            seen_hmac: arc_seen_hmac,
                            ..
                        } => {
                            checked_entries += arc_count;
                            adopted.push(ArchiveState {
                                file_name: fname.to_string(),
                                entries: arc_count,
                                last_entry_hash: arc_last_hash.clone(),
                            });
                            chain_prev = arc_last_hash;
                            seen_hmac_across_chain = arc_seen_hmac;
                        }
                        ChainVerifyOutcome::Invalid {
                            count: err_count,
                            error,
                            tampered_entry_id,
                        } => {
                            return Ok(invalid(
                                checked_entries + err_count,
                                error,
                                tampered_entry_id,
                            ));
                        }
                    }
                }
                if let Some(ref mat) = key_material {
                    anc.archives = adopted;
                    anc.archives_adopted = true;
                    let _ = self.write_anchor(
                        &mat.key,
                        mat.epoch,
                        anc.hmac_enabled_since.clone(),
                        anc.active_entries,
                        anc.last_entry_hash.clone(),
                        anc.archives.clone(),
                        true,
                    );
                }
            }
        }

        // Reconcile any valid HMAC-verified rotated archives missed by a crash during rotation (S1)
        let mut adopted_untracked_paths: Vec<PathBuf> = Vec::new();
        let prev_total_anchored = anchor
            .as_ref()
            .map(|a| a.archives.iter().map(|x| x.entries).sum::<usize>() + a.active_entries)
            .unwrap_or(0);
        let prev_anchor_hash = anchor.as_ref().map(|a| a.last_entry_hash.clone());
        let anchor_was_adopted = anchor.as_ref().is_some_and(|a| a.archives_adopted);

        if let Some(ref mut anc) = anchor {
            let tracked: std::collections::HashSet<String> =
                anc.archives.iter().map(|a| a.file_name.clone()).collect();
            let untracked: Vec<PathBuf> = self
                .list_rotated_files()?
                .into_iter()
                .filter(|p| {
                    p.file_name()
                        .and_then(|n| n.to_str())
                        .is_some_and(|name| !tracked.contains(name))
                })
                .collect();

            for arc_path in untracked {
                let Some(fname) = arc_path.file_name().and_then(|n| n.to_str()) else {
                    continue;
                };
                match Self::verify_file_chain(
                    &arc_path,
                    hmac_key.as_ref(),
                    &chain_prev,
                    enabled_since_ref.as_deref(),
                    seen_hmac_across_chain,
                )? {
                    ChainVerifyOutcome::Valid {
                        count: arc_count,
                        last_hash: arc_last_hash,
                        seen_hmac: arc_seen_hmac,
                        file_seen_hmac: arc_file_seen_hmac,
                    } => {
                        if arc_count == 0 {
                            eprintln!("[audit] skipping empty untracked rotated log: {}", fname);
                            continue;
                        }
                        checked_entries += arc_count;
                        if anchor_was_adopted && !arc_file_seen_hmac {
                            return Ok(invalid(
                                checked_entries,
                                format!("Untracked rotated audit log missing HMAC: {}", fname),
                                None,
                            ));
                        }
                        anc.archives.push(ArchiveState {
                            file_name: fname.to_string(),
                            entries: arc_count,
                            last_entry_hash: arc_last_hash.clone(),
                        });
                        adopted_untracked_paths.push(arc_path);
                        chain_prev = arc_last_hash;
                        seen_hmac_across_chain = arc_seen_hmac;
                    }
                    ChainVerifyOutcome::Invalid {
                        count: err_count,
                        error,
                        tampered_entry_id,
                    } => {
                        return Ok(invalid(
                            checked_entries + err_count,
                            format!("In untracked archive '{}': {}", fname, error),
                            tampered_entry_id,
                        ));
                    }
                }
            }
        }

        let archived_entries: usize = anchor
            .as_ref()
            .map(|a| a.archives.iter().map(|x| x.entries).sum())
            .unwrap_or(0);

        if !main_path.exists() {
            if let Some(ref mut anc) = anchor {
                if !adopted_untracked_paths.is_empty() {
                    let prev_hash_ref = prev_anchor_hash.as_deref().unwrap_or(GENESIS_HASH);
                    let anchor_hash_preserved = prev_hash_ref == GENESIS_HASH
                        || anc
                            .archives
                            .iter()
                            .any(|a| a.last_entry_hash == prev_hash_ref)
                        || adopted_untracked_paths
                            .iter()
                            .any(|p| Self::file_contains_entry_hash(p, prev_hash_ref));
                    let within_limit = archived_entries >= prev_total_anchored
                        && archived_entries.saturating_sub(prev_total_anchored) <= 100;
                    if anchor_hash_preserved && within_limit {
                        anc.active_entries = 0;
                        anc.last_entry_hash = chain_prev.clone();
                        anc.archives_adopted = true;
                        if let Some(ref mat) = key_material {
                            let _ = self.write_anchor(
                                &mat.key,
                                mat.epoch,
                                anc.hmac_enabled_since.clone(),
                                0,
                                anc.last_entry_hash.clone(),
                                anc.archives.clone(),
                                true,
                            );
                        }
                    } else {
                        return Ok(invalid(
                            archived_entries,
                            format!(
                                "Audit log truncation or external rewrite detected: found {} entries across archives, anchor expects at least {}",
                                archived_entries, prev_total_anchored
                            ),
                            None,
                        ));
                    }
                } else if anc.active_entries > 0 {
                    return Ok(invalid(
                        archived_entries,
                        format!(
                            "Audit log file missing while anchor expects {} active entries",
                            anc.active_entries
                        ),
                        None,
                    ));
                }
            }
            *self.active_entries_cache.lock().unwrap() = Some(0);
            return Ok(AuditIntegrityResult {
                is_valid: true,
                total_entries: archived_entries,
                verified_at,
                error: None,
                tampered_entry_id: None,
            });
        }

        let (count, last_hash, seen_hmac_main) = match Self::verify_file_chain(
            &main_path,
            hmac_key.as_ref(),
            &chain_prev,
            enabled_since_ref.as_deref(),
            seen_hmac_across_chain,
        )? {
            ChainVerifyOutcome::Valid {
                count,
                last_hash,
                seen_hmac,
                ..
            } => (count, last_hash, seen_hmac),
            ChainVerifyOutcome::Invalid {
                count,
                error,
                tampered_entry_id,
            } => return Ok(invalid(archived_entries + count, error, tampered_entry_id)),
        };

        if let Some(ref anc) = anchor {
            if !adopted_untracked_paths.is_empty() {
                let total_entries = archived_entries + count;
                let prev_hash_ref = prev_anchor_hash.as_deref().unwrap_or(GENESIS_HASH);
                let anchor_hash_preserved = prev_hash_ref == GENESIS_HASH
                    || anc
                        .archives
                        .iter()
                        .any(|a| a.last_entry_hash == prev_hash_ref)
                    || adopted_untracked_paths
                        .iter()
                        .any(|p| Self::file_contains_entry_hash(p, prev_hash_ref))
                    || Self::file_contains_entry_hash(&main_path, prev_hash_ref);
                let within_limit = total_entries >= prev_total_anchored
                    && total_entries.saturating_sub(prev_total_anchored) <= 100;
                let hmac_ok = seen_hmac_main || seen_hmac_across_chain;
                if anchor_hash_preserved && within_limit && hmac_ok {
                    if let Some(ref mat) = key_material {
                        let _ = self.write_anchor(
                            &mat.key,
                            mat.epoch,
                            anc.hmac_enabled_since.clone(),
                            count,
                            if count > 0 {
                                last_hash.clone()
                            } else {
                                chain_prev.clone()
                            },
                            anc.archives.clone(),
                            true,
                        );
                    }
                } else {
                    return Ok(invalid(
                        total_entries,
                        format!(
                            "Audit log truncation or external rewrite detected: found {} total entries, anchor expects at least {}",
                            total_entries, prev_total_anchored
                        ),
                        None,
                    ));
                }
            } else if count != anc.active_entries {
                let forward = count > anc.active_entries;
                let within_limit = count.saturating_sub(anc.active_entries) <= 100;
                let prefix_matches = anc.active_entries == 0
                    || Self::hash_at_entry_index(&main_path, anc.active_entries).as_deref()
                        == Some(anc.last_entry_hash.as_str());
                if forward && within_limit && seen_hmac_main && prefix_matches {
                    if let Some(ref mat) = key_material {
                        let _ = self.write_anchor(
                            &mat.key,
                            mat.epoch,
                            anc.hmac_enabled_since.clone(),
                            count,
                            last_hash.clone(),
                            anc.archives.clone(),
                            anc.archives_adopted,
                        );
                    }
                } else {
                    return Ok(invalid(
                        archived_entries + count,
                        format!(
                            "Audit log truncation or external rewrite detected: found {} entries, anchor expects {}",
                            count, anc.active_entries
                        ),
                        None,
                    ));
                }
            } else if count > 0 && last_hash != anc.last_entry_hash {
                return Ok(invalid(
                    archived_entries + count,
                    "Audit log head hash mismatch against anchor (external rewrite detected)"
                        .to_string(),
                    None,
                ));
            }
        }

        *self.active_entries_cache.lock().unwrap() = Some(count);
        Ok(AuditIntegrityResult {
            is_valid: true,
            total_entries: archived_entries + count,
            verified_at,
            error: None,
            tampered_entry_id: None,
        })
    }

    /// Clear all audit logs (removes audit.jsonl and rotated archives)
    pub fn clear_logs(&self) -> Result<(), AppError> {
        let _guard = self.write_lock.lock().unwrap();
        self.bootstrap_anchor_if_needed()?;
        let mut material = self.read_key_material()?;
        let verified_anchor = if let Some(ref mut mat) = material {
            self.read_verified_anchor(mat)?
        } else if self.hmac_anchor_path().exists() {
            return Err(AppError::Other(
                "HMAC key missing while audit anchor exists (fail-closed)".to_string(),
            ));
        } else {
            None
        };

        // Stage all files into a temporary clearing directory BEFORE touching anchor (U3)
        let mut files_to_clear = Vec::new();
        let main_path = self.main_log_path();
        if main_path.exists() {
            files_to_clear.push(main_path);
        }
        files_to_clear.extend(self.list_rotated_files()?);

        let clearing_dir = self.log_dir.join(format!(
            "audit.clearing.{}",
            chrono::Utc::now().timestamp_millis()
        ));
        let mut moved_pairs: Vec<(PathBuf, PathBuf)> = Vec::new();
        if !files_to_clear.is_empty() {
            fs::create_dir_all(&clearing_dir)?;
            for src in files_to_clear {
                let Some(fname) = src.file_name() else {
                    continue;
                };
                let dst = clearing_dir.join(fname);
                if let Err(err) = fs::rename(&src, &dst) {
                    for (orig, staged) in moved_pairs.into_iter().rev() {
                        let _ = fs::rename(&staged, &orig);
                    }
                    let _ = fs::remove_dir_all(&clearing_dir);
                    return Err(err.into());
                }
                moved_pairs.push((src, dst));
            }
        }

        // Write empty anchor after all files are safely staged outside active/rotated patterns
        if let (Some(mat), Some(anchor)) = (material.as_ref(), verified_anchor.as_ref()) {
            if let Err(err) = self.write_anchor(
                &mat.key,
                mat.epoch,
                anchor.hmac_enabled_since.clone(),
                0,
                GENESIS_HASH.to_string(),
                Vec::new(),
                true,
            ) {
                for (orig, staged) in moved_pairs.into_iter().rev() {
                    let _ = fs::rename(&staged, &orig);
                }
                let _ = fs::remove_dir_all(&clearing_dir);
                return Err(err);
            }
        }

        if clearing_dir.exists() {
            if let Err(err) = fs::remove_dir_all(&clearing_dir) {
                return Err(AppError::Other(format!(
                    "Audit logs staged in '{}' but could not be deleted ({}). Remove manually after review.",
                    clearing_dir.display(),
                    err
                )));
            }
        }

        let mut cache = self.last_hash_cache.lock().unwrap();
        *cache = None;
        *self.active_entries_cache.lock().unwrap() = None;
        *self.verified_prefix_cache.lock().unwrap() = None;
        *self.last_known_file_len.lock().unwrap() = None;
        *self.last_write_error.lock().unwrap() = None;

        Ok(())
    }

    /// Inspect or repair untracked / corrupted rotated audit files (U2 / R1 / R5)
    pub fn repair_audit_log(
        &self,
        action: &str,
        confirm: bool,
    ) -> Result<AuditRepairResult, AppError> {
        let _guard = self.write_lock.lock().unwrap();
        self.bootstrap_anchor_if_needed()?;
        let mut material = self.read_key_material()?;
        let anchor = if let Some(ref mut mat) = material {
            self.read_verified_anchor(mat)?
        } else {
            None
        };

        let tracked: std::collections::HashSet<String> = anchor
            .as_ref()
            .map(|a| a.archives.iter().map(|x| x.file_name.clone()).collect())
            .unwrap_or_default();

        let untracked_paths: Vec<PathBuf> = self
            .list_rotated_files()?
            .into_iter()
            .filter(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|name| !tracked.contains(name))
            })
            .collect();

        let untracked_files: Vec<String> = untracked_paths
            .iter()
            .filter_map(|p| p.file_name().and_then(|n| n.to_str()).map(str::to_string))
            .collect();

        let quarantine_paths =
            |paths: &[PathBuf]| -> Result<(Vec<String>, Option<String>), AppError> {
                let mut quarantined_files = Vec::new();
                let mut quarantine_dir_str = None;
                if !paths.is_empty() {
                    let q_dir = self.log_dir.join(format!(
                        "audit.quarantine.{}",
                        chrono::Utc::now().timestamp_millis()
                    ));
                    fs::create_dir_all(&q_dir)?;
                    quarantine_dir_str = Some(q_dir.to_string_lossy().to_string());
                    let mut moved: Vec<(PathBuf, PathBuf)> = Vec::new();
                    for src in paths {
                        let Some(fname) = src.file_name() else {
                            continue;
                        };
                        let dst = q_dir.join(fname);
                        if let Err(err) = fs::rename(src, &dst) {
                            for (orig, staged) in moved.into_iter().rev() {
                                let _ = fs::rename(&staged, &orig);
                            }
                            let _ = fs::remove_dir_all(&q_dir);
                            return Err(err.into());
                        }
                        moved.push((src.clone(), dst));
                        quarantined_files.push(fname.to_string_lossy().to_string());
                    }
                }
                Ok((quarantined_files, quarantine_dir_str))
            };

        match action {
            "report" => {
                let res = self.verify_integrity_locked()?;
                Ok(AuditRepairResult {
                    action: action.to_string(),
                    untracked_files,
                    quarantined_files: Vec::new(),
                    quarantine_dir: None,
                    integrity_valid: res.is_valid,
                })
            }
            "quarantine" => {
                let (quarantined_files, quarantine_dir_str) = quarantine_paths(&untracked_paths)?;
                let res = self.verify_integrity_locked()?;
                if res.is_valid {
                    *self.last_write_error.lock().unwrap() = None;
                }
                Ok(AuditRepairResult {
                    action: action.to_string(),
                    untracked_files,
                    quarantined_files,
                    quarantine_dir: quarantine_dir_str,
                    integrity_valid: res.is_valid,
                })
            }
            "rebuild_anchor" => {
                let Some(ref mat) = material else {
                    return Err(AppError::Other(
                        "Cannot rebuild audit anchor without HMAC key material".to_string(),
                    ));
                };
                let (quarantined_files, quarantine_dir_str) = quarantine_paths(&untracked_paths)?;

                let existing_archives = anchor
                    .as_ref()
                    .map(|a| a.archives.clone())
                    .unwrap_or_default();
                let mut chain_prev = GENESIS_HASH.to_string();
                for arc in &existing_archives {
                    chain_prev = arc.last_entry_hash.clone();
                }

                let main_path = self.main_log_path();
                let enabled_since = anchor
                    .as_ref()
                    .map(|a| a.hmac_enabled_since.clone())
                    .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
                let prior_active_expected = anchor.as_ref().map(|a| a.active_entries).unwrap_or(0);

                let (active_count, last_hash) = if main_path.exists() {
                    match Self::verify_file_chain(
                        &main_path,
                        Some(&mat.key),
                        &chain_prev,
                        Some(&enabled_since),
                        !existing_archives.is_empty(),
                    )? {
                        ChainVerifyOutcome::Valid {
                            count, last_hash, ..
                        } => (count, last_hash),
                        ChainVerifyOutcome::Invalid { error, .. } => {
                            return Err(AppError::Other(format!(
                                "Cannot rebuild anchor from invalid active log: {error}"
                            )));
                        }
                    }
                } else {
                    (0, chain_prev)
                };

                if active_count < prior_active_expected && !confirm {
                    return Err(AppError::Other(format!(
                        "Rebuild would accept truncation of active log from {} to {} entries; explicit confirmation required.",
                        prior_active_expected, active_count
                    )));
                }

                // Append a tamper-evident SECURITY audit entry recording the rebuild action
                let repair_timestamp = normalize_utc_rfc3339(chrono::Utc::now());
                let repair_details = format!(
                    "audit_repair;action=rebuild_anchor;prev_active={};new_active={};archives={};quarantined={}",
                    prior_active_expected,
                    active_count,
                    existing_archives.len(),
                    quarantined_files.len()
                );
                let mut repair_entry = AuditLogEntry {
                    id: format!("audit-{}", uuid::Uuid::new_v4()),
                    timestamp: repair_timestamp,
                    action: "SECURITY".to_string(),
                    user: None,
                    connection_id: None,
                    connection_name: None,
                    database: None,
                    query: None,
                    execution_time_ms: None,
                    rows_affected: None,
                    status: "SUCCESS".to_string(),
                    error_message: None,
                    details: Some(repair_details),
                    prev_hash: Some(last_hash.clone()),
                    entry_hash: None,
                    hash_algo: Some("hmac-sha256".to_string()),
                };
                let repair_hash = compute_entry_hmac(&mat.key, &last_hash, &repair_entry);
                repair_entry.entry_hash = Some(repair_hash.clone());
                let serialized = serde_json::to_string(&repair_entry)?;

                let mut file = OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&main_path)?;
                writeln!(file, "{}", serialized)?;
                file.flush()?;
                set_file_permissions_0600(&main_path)?;

                let final_count = active_count + 1;
                self.write_anchor(
                    &mat.key,
                    mat.epoch,
                    enabled_since,
                    final_count,
                    repair_hash.clone(),
                    existing_archives,
                    true,
                )?;
                *self.last_hash_cache.lock().unwrap() = Some(repair_hash.clone());
                *self.active_entries_cache.lock().unwrap() = Some(final_count);
                *self.verified_prefix_cache.lock().unwrap() = Some((final_count, repair_hash));
                *self.last_known_file_len.lock().unwrap() =
                    fs::metadata(&main_path).map(|m| m.len()).ok();
                *self.last_write_error.lock().unwrap() = None;

                Ok(AuditRepairResult {
                    action: action.to_string(),
                    untracked_files,
                    quarantined_files,
                    quarantine_dir: quarantine_dir_str,
                    integrity_valid: true,
                })
            }
            _ => Err(AppError::InvalidInput(format!(
                "Unsupported repair action '{}'. Expected 'report', 'quarantine', or 'rebuild_anchor'.",
                action
            ))),
        }
    }
}

impl Default for AuditLogger {
    fn default() -> Self {
        Self::global().clone()
    }
}
