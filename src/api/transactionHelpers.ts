export type IsolationLevel =
  | 'READ UNCOMMITTED'
  | 'READ COMMITTED'
  | 'REPEATABLE READ'
  | 'SERIALIZABLE';

export interface LockProcessInfo {
  id: string; // PID or thread ID
  user?: string;
  database?: string;
  lockType?: string; // ROW, TABLE, ADVISORY, etc.
  mode?: string; // Exclusive, Shared, etc.
  granted: boolean;
  waitingFor?: string;
  query?: string;
  durationSeconds?: number;
  isDeadlockCandidate?: boolean;
}

/**
 * Builds the SQL command to set transaction isolation level according to engine dialect.
 */
export function buildSetIsolationLevelSql(level: IsolationLevel, driver: string): string {
  const d = driver?.toLowerCase() || 'postgres';

  if (d === 'sqlite') {
    // SQLite operates in SERIALIZABLE by default; PRAGMA read_uncommitted controls READ UNCOMMITTED mode
    if (level === 'READ UNCOMMITTED') {
      return 'PRAGMA read_uncommitted = ON;';
    }
    return 'PRAGMA read_uncommitted = OFF;';
  }

  if (d === 'mysql') {
    return `SET SESSION TRANSACTION ISOLATION LEVEL ${level};`;
  }

  // PostgreSQL standard
  return `SET TRANSACTION ISOLATION LEVEL ${level};`;
}

/**
 * Builds a SAVEPOINT statement.
 */
export function buildSavepointSql(name: string): string {
  const clean = name.trim().replace(/[^a-zA-Z0-9_]/g, '');
  return `SAVEPOINT ${clean};`;
}

/**
 * Builds a ROLLBACK TO SAVEPOINT statement.
 */
export function buildRollbackToSavepointSql(name: string): string {
  const clean = name.trim().replace(/[^a-zA-Z0-9_]/g, '');
  return `ROLLBACK TO SAVEPOINT ${clean};`;
}

/**
 * Builds a RELEASE SAVEPOINT statement.
 */
export function buildReleaseSavepointSql(name: string, driver: string): string {
  const clean = name.trim().replace(/[^a-zA-Z0-9_]/g, '');
  if (driver?.toLowerCase() === 'sqlite') {
    return `RELEASE ${clean};`;
  }
  return `RELEASE SAVEPOINT ${clean};`;
}

/**
 * Builds query to inspect active locks, blocked queries, and deadlock candidates.
 */
export function buildLocksQuery(driver: string): string {
  const d = driver?.toLowerCase() || 'postgres';

  if (d === 'mysql') {
    return `
SELECT
  trx.trx_mysql_thread_id AS id,
  trx.trx_state AS state,
  trx.trx_started AS started,
  trx.trx_query AS query,
  trx.trx_rows_locked AS rows_locked,
  trx.trx_wait_started AS wait_started
FROM information_schema.innodb_trx trx
ORDER BY trx.trx_started ASC;
    `.trim();
  }

  if (d === 'sqlite') {
    return `PRAGMA lock_status;`;
  }

  // PostgreSQL pg_locks and pg_stat_activity
  return `
SELECT
  a.pid AS id,
  a.usename AS "user",
  a.datname AS "database",
  l.locktype AS lock_type,
  l.mode AS mode,
  l.granted AS granted,
  a.query AS query,
  ROUND(EXTRACT(EPOCH FROM (now() - a.query_start))::numeric, 2) AS duration_seconds,
  a.wait_event_type,
  a.wait_event
FROM pg_stat_activity a
JOIN pg_locks l ON l.pid = a.pid
WHERE a.pid <> pg_backend_pid()
ORDER BY l.granted ASC, a.query_start ASC;
  `.trim();
}

/**
 * Builds command to terminate / kill a blocking process or thread.
 */
export function buildKillSessionSql(pidOrId: string | number, driver: string): string {
  const d = driver?.toLowerCase() || 'postgres';
  const cleanId = String(pidOrId).replace(/[^0-9]/g, '');

  if (d === 'mysql') {
    return `KILL ${cleanId};`;
  }

  if (d === 'sqlite') {
    return `-- SQLite does not support remote session kill; close tab to teardown session`;
  }

  return `SELECT pg_terminate_backend(${cleanId});`;
}
