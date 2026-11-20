import { invoke } from '@tauri-apps/api/core';
import type { AuditLogEntry, AuditIntegrityResult } from '../stores/auditLogStore';
import { redactSensitiveSql } from '../utils/sqlSanitizer';

export interface AuditHealth {
  ok: boolean;
  lastError?: string | null;
}

export const getAuditLogs = async (
  limit?: number,
  offset?: number
): Promise<AuditLogEntry[]> => {
  return invoke<AuditLogEntry[]>('get_audit_logs', { limit, offset });
};

export const verifyAuditLogIntegrity = async (): Promise<AuditIntegrityResult> => {
  return invoke<AuditIntegrityResult>('verify_audit_log_integrity');
};

export const clearAuditLogs = async (): Promise<void> => {
  return invoke<void>('clear_audit_logs');
};

export const getAuditHealth = async (): Promise<AuditHealth> => {
  return invoke<AuditHealth>('get_audit_health');
};

export const recordAuditLog = async (
  entry: Partial<AuditLogEntry> & { action: string; status: string }
): Promise<AuditLogEntry> => {
  const sanitizedEntry = {
    ...entry,
    query: entry.query ? redactSensitiveSql(entry.query) : entry.query,
  };
  return invoke<AuditLogEntry>('record_audit_log', { entry: sanitizedEntry });
};
