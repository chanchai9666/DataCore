use tauri::State;
use crate::error::AppError;
use crate::services::audit_logger::{
    AuditIntegrityResult, AuditLogEntry, AuditLogEntryInput, AuditLogger,
};

pub fn get_audit_logs_impl(
    logger: &AuditLogger,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<Vec<AuditLogEntry>, AppError> {
    logger.get_logs(limit, offset)
}

pub fn verify_audit_log_integrity_impl(
    logger: &AuditLogger,
) -> Result<AuditIntegrityResult, AppError> {
    logger.verify_integrity()
}

pub fn clear_audit_logs_impl(logger: &AuditLogger) -> Result<(), AppError> {
    logger.clear_logs()
}

pub fn record_audit_log_impl(
    logger: &AuditLogger,
    entry: AuditLogEntryInput,
) -> Result<AuditLogEntry, AppError> {
    logger.log(entry)
}

#[tauri::command]
pub async fn get_audit_logs(
    logger: State<'_, AuditLogger>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<Vec<AuditLogEntry>, String> {
    get_audit_logs_impl(&logger, limit, offset).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn verify_audit_log_integrity(
    logger: State<'_, AuditLogger>,
) -> Result<AuditIntegrityResult, String> {
    verify_audit_log_integrity_impl(&logger).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_audit_logs(logger: State<'_, AuditLogger>) -> Result<(), String> {
    clear_audit_logs_impl(&logger).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn record_audit_log(
    logger: State<'_, AuditLogger>,
    entry: AuditLogEntryInput,
) -> Result<AuditLogEntry, String> {
    record_audit_log_impl(&logger, entry).map_err(|e| e.to_string())
}
