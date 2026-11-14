import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as core from '@tauri-apps/api/core';
import {
  getAuditLogs,
  verifyAuditLogIntegrity,
  clearAuditLogs,
  recordAuditLog,
} from './auditApi';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('auditApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls get_audit_logs via invoke', async () => {
    const mockLogs = [
      {
        id: 'audit-1',
        timestamp: '2026-11-14T09:00:00Z',
        action: 'QUERY' as const,
        status: 'SUCCESS' as const,
        prevHash: '0000000000000000000000000000000000000000000000000000000000000000',
        entryHash: 'abc123hash',
      },
    ];
    vi.mocked(core.invoke).mockResolvedValueOnce(mockLogs);

    const result = await getAuditLogs(50, 0);
    expect(core.invoke).toHaveBeenCalledWith('get_audit_logs', {
      limit: 50,
      offset: 0,
    });
    expect(result).toEqual(mockLogs);
  });

  it('calls verify_audit_log_integrity via invoke', async () => {
    const mockIntegrity = {
      isValid: true,
      totalEntries: 42,
      verifiedAt: '2026-11-14T09:05:00Z',
    };
    vi.mocked(core.invoke).mockResolvedValueOnce(mockIntegrity);

    const result = await verifyAuditLogIntegrity();
    expect(core.invoke).toHaveBeenCalledWith('verify_audit_log_integrity');
    expect(result.isValid).toBe(true);
    expect(result.totalEntries).toBe(42);
  });

  it('calls clear_audit_logs via invoke', async () => {
    vi.mocked(core.invoke).mockResolvedValueOnce(undefined);

    await clearAuditLogs();
    expect(core.invoke).toHaveBeenCalledWith('clear_audit_logs');
  });

  it('calls record_audit_log via invoke', async () => {
    const input = {
      action: 'EXPORT' as const,
      status: 'SUCCESS' as const,
      query: 'SELECT * FROM users',
    };
    const mockCreated = {
      ...input,
      id: 'audit-new',
      timestamp: '2026-11-14T09:10:00Z',
      prevHash: '0000',
      entryHash: 'def456',
    };
    vi.mocked(core.invoke).mockResolvedValueOnce(mockCreated);

    const result = await recordAuditLog(input);
    expect(core.invoke).toHaveBeenCalledWith('record_audit_log', {
      entry: input,
    });
    expect(result).toEqual(mockCreated);
  });

  it('redacts sensitive password in query before recording audit log', async () => {
    const input = {
      action: 'SECURITY' as const,
      status: 'SUCCESS' as const,
      query: "CREATE USER 'app'@'%' IDENTIFIED BY 'SecretPass123';",
    };
    vi.mocked(core.invoke).mockResolvedValueOnce({} as any);

    await recordAuditLog(input);
    expect(core.invoke).toHaveBeenCalledWith('record_audit_log', {
      entry: {
        action: 'SECURITY',
        status: 'SUCCESS',
        query: "CREATE USER 'app'@'%' IDENTIFIED BY '***REDACTED***';",
      },
    });
  });
});
