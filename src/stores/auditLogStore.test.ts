import { describe, it, expect, beforeEach } from 'vitest';
import { useAuditLogStore } from './auditLogStore';

describe('auditLogStore', () => {
  beforeEach(() => {
    useAuditLogStore.getState().clearLogs();
  });

  it('initializes with empty logs', () => {
    expect(useAuditLogStore.getState().logs).toEqual([]);
  });

  it('adds an audit log entry', () => {
    useAuditLogStore.getState().addLog({
      action: 'QUERY',
      user: 'postgres',
      connectionId: 'conn-1',
      connectionName: 'Local Postgres',
      database: 'mydb',
      query: 'SELECT * FROM users',
      executionTimeMs: 12,
      rowsAffected: 10,
      status: 'SUCCESS',
    });

    const logs = useAuditLogStore.getState().logs;
    expect(logs.length).toBe(1);
    expect(logs[0].query).toBe('SELECT * FROM users');
    expect(logs[0].action).toBe('QUERY');
    expect(logs[0].status).toBe('SUCCESS');
    expect(logs[0].id).toBeDefined();
    expect(logs[0].timestamp).toBeDefined();
  });

  it('filters logs by search query and action', () => {
    useAuditLogStore.getState().addLog({
      action: 'QUERY',
      user: 'admin',
      connectionName: 'Prod DB',
      query: 'SELECT count(*) FROM orders',
      status: 'SUCCESS',
    });

    useAuditLogStore.getState().addLog({
      action: 'DDL',
      user: 'admin',
      connectionName: 'Prod DB',
      query: 'ALTER TABLE orders ADD COLUMN status VARCHAR(20)',
      status: 'SUCCESS',
    });

    useAuditLogStore.getState().addLog({
      action: 'MAINTENANCE',
      user: 'admin',
      connectionName: 'Prod DB',
      query: 'VACUUM ANALYZE orders',
      status: 'SUCCESS',
    });

    const all = useAuditLogStore.getState().logs;
    expect(all.length).toBe(3);

    const ddlLogs = useAuditLogStore.getState().filterLogs({ action: 'DDL' });
    expect(ddlLogs.length).toBe(1);
    expect(ddlLogs[0].query).toContain('ALTER TABLE');

    const searchLogs = useAuditLogStore.getState().filterLogs({ search: 'orders' });
    expect(searchLogs.length).toBe(3);
  });

  it('exports logs to CSV format', () => {
    useAuditLogStore.getState().addLog({
      action: 'CONNECT',
      user: 'root',
      connectionName: 'Local MySQL',
      status: 'SUCCESS',
    });

    const csv = useAuditLogStore.getState().exportToCsv();
    expect(csv).toContain('ID,Timestamp,Action,User,Connection,Database,Query');
    expect(csv).toContain('CONNECT');
    expect(csv).toContain('root');
  });

  it('limits log entries to max entries (1000)', () => {
    for (let i = 0; i < 1050; i++) {
      useAuditLogStore.getState().addLog({
        action: 'QUERY',
        query: `SELECT ${i}`,
        status: 'SUCCESS',
      });
    }

    expect(useAuditLogStore.getState().logs.length).toBe(1000);
  });

  it('redacts sensitive passwords from query before saving to audit log', () => {
    useAuditLogStore.getState().addLog({
      action: 'DDL',
      user: 'admin',
      query: "ALTER USER postgres WITH PASSWORD 'superSecretPostgresPwd';",
      status: 'SUCCESS',
    });

    const logs = useAuditLogStore.getState().logs;
    expect(logs.length).toBe(1);
    expect(logs[0].query).toBe("ALTER USER postgres WITH PASSWORD '***REDACTED***';");
    expect(logs[0].query).not.toContain('superSecretPostgresPwd');
  });
});
