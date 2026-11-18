use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use crate::drivers::DatabaseConnection;

/// Represents an active transfer job in the registry, holding both the
/// cooperative cancellation flag and an optional database connection handle
/// so cancellation can also interrupt in-flight server queries.
#[derive(Clone)]
pub struct TransferJob {
    pub cancelled: Arc<AtomicBool>,
    pub conn: Option<Arc<dyn DatabaseConnection>>,
}

static TRANSFER_JOB_REGISTRY: OnceLock<Mutex<HashMap<String, TransferJob>>> = OnceLock::new();

fn get_registry() -> &'static Mutex<HashMap<String, TransferJob>> {
    TRANSFER_JOB_REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Registers a cancellation token without a connection handle (legacy / unit-test helper).
pub fn register_cancellation_token(job_id: &str) -> Arc<AtomicBool> {
    let mut map = get_registry().lock().unwrap();
    let token = Arc::new(AtomicBool::new(false));
    map.insert(
        job_id.to_string(),
        TransferJob {
            cancelled: token.clone(),
            conn: None,
        },
    );
    token
}

/// Registers a transfer job with its database connection handle so server-side
/// cancellation (`conn.cancel().await`) can be triggered immediately.
pub fn register_transfer_job(job_id: &str, conn: Arc<dyn DatabaseConnection>) -> Arc<AtomicBool> {
    let mut map = get_registry().lock().unwrap();
    let token = Arc::new(AtomicBool::new(false));
    map.insert(
        job_id.to_string(),
        TransferJob {
            cancelled: token.clone(),
            conn: Some(conn),
        },
    );
    token
}

/// Sets the cooperative cancellation flag synchronously.
/// Returns `true` if the job was found in the registry.
pub fn trigger_cancellation(job_id: &str) -> bool {
    let map = get_registry().lock().unwrap();
    if let Some(job) = map.get(job_id) {
        job.cancelled.store(true, Ordering::SeqCst);
        true
    } else {
        false
    }
}

/// Sets the cancellation flag and, if a connection handle is registered for
/// `job_id`, calls `conn.cancel().await` on the database engine without holding
/// the registry lock across the await point.
pub async fn cancel_transfer_job(job_id: &str) -> bool {
    let conn_to_cancel = {
        let map = get_registry().lock().unwrap();
        if let Some(job) = map.get(job_id) {
            job.cancelled.store(true, Ordering::SeqCst);
            job.conn.clone()
        } else {
            return false;
        }
    };

    if let Some(conn) = conn_to_cancel {
        let _ = conn.cancel().await;
    }
    true
}

/// Returns whether `job_id` has been marked cancelled.
pub fn is_transfer_cancelled(job_id: &str) -> bool {
    let map = get_registry().lock().unwrap();
    if let Some(job) = map.get(job_id) {
        job.cancelled.load(Ordering::SeqCst)
    } else {
        false
    }
}

/// Removes `job_id` from the registry once the transfer completes or aborts.
pub fn remove_cancellation_token(job_id: &str) {
    let mut map = get_registry().lock().unwrap();
    map.remove(job_id);
}
