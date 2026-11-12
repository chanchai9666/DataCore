import type { ServerProcess, ActivitySummary } from '../types/activityMonitor';
import type { QueryResult, CellValue } from '../types/db';
import { formatCellValue } from '../types/db';
import { dbApi } from './db';

/**
 * Returns SQL to fetch active processes and server sessions.
 */
export function buildActivityQuery(driver: string): string {
  const d = (driver || '').toLowerCase();

  if (d.includes('mysql')) {
    return `
SELECT
  ID as id,
  USER as user,
  HOST as host,
  DB as db,
  COMMAND as command,
  TIME as time,
  STATE as state,
  INFO as info
FROM information_schema.PROCESSLIST
ORDER BY TIME DESC;
    `.trim();
  }

  if (d.includes('sqlite')) {
    return `PRAGMA database_list;`;
  }

  // PostgreSQL
  return `
SELECT
  a.pid,
  a.usename AS "user",
  a.datname AS "database",
  a.client_addr,
  a.state,
  ROUND(COALESCE(EXTRACT(EPOCH FROM (now() - a.query_start)), 0)::numeric, 2) AS duration_seconds,
  COALESCE(a.wait_event_type || ': ' || a.wait_event, NULL) AS wait_event,
  a.query
FROM pg_stat_activity a
WHERE a.pid <> pg_backend_pid()
ORDER BY duration_seconds DESC;
  `.trim();
}

/**
 * Parses query results into typed ServerProcess models.
 */
export function parseActivityResults(
  result: QueryResult,
  driver: string
): ServerProcess[] {
  if (!result || !result.rows) return [];
  const d = (driver || '').toLowerCase();

  const getStr = (val: CellValue): string | null => {
    const s = formatCellValue(val);
    return s === 'NULL' ? null : s;
  };

  if (d.includes('mysql')) {
    return result.rows.map((row) => {
      const id = getStr(row[0]) || '0';
      const user = getStr(row[1]) || 'unknown';
      const host = getStr(row[2]) || undefined;
      const database = getStr(row[3]) || undefined;
      const command = getStr(row[4]) || undefined;
      const timeVal = parseFloat(getStr(row[5]) || '0');
      const state = getStr(row[6]) || (command ? command : 'idle');
      const query = getStr(row[7]) || undefined;

      const isBlocked =
        state.toLowerCase().includes('lock') ||
        state.toLowerCase().includes('waiting');

      return {
        id,
        user,
        host,
        database,
        command,
        state,
        durationSeconds: isNaN(timeVal) ? 0 : timeVal,
        query,
        waitEvent: undefined,
        isBlocked,
      };
    });
  }

  if (d.includes('sqlite')) {
    return result.rows.map((row) => {
      const seq = getStr(row[0]) || '0';
      const name = getStr(row[1]) || 'main';
      const file = getStr(row[2]) || ':memory:';

      return {
        id: seq,
        user: 'local',
        host: 'localhost',
        database: name,
        command: 'Connected',
        state: 'ready',
        durationSeconds: 0,
        query: `Attached database: ${file}`,
        waitEvent: undefined,
        isBlocked: false,
      };
    });
  }

  // PostgreSQL
  return result.rows.map((row) => {
    const id = getStr(row[0]) || '0';
    const user = getStr(row[1]) || 'unknown';
    const database = getStr(row[2]) || undefined;
    const host = getStr(row[3]) || undefined;
    const state = getStr(row[4]) || 'idle';
    const duration = parseFloat(getStr(row[5]) || '0');
    const waitEvent = getStr(row[6]) || undefined;
    const query = getStr(row[7]) || undefined;

    const isBlocked = Boolean(
      waitEvent &&
        (waitEvent.toLowerCase().includes('lock') ||
          waitEvent.toLowerCase().includes('wait'))
    );

    return {
      id,
      user,
      database,
      host,
      state,
      durationSeconds: isNaN(duration) ? 0 : duration,
      waitEvent,
      query,
      isBlocked,
    };
  });
}

/**
 * Computes summary statistics from a process list.
 */
export function computeActivitySummary(processes: ServerProcess[]): ActivitySummary {
  let activeCount = 0;
  let idleCount = 0;
  let waitingCount = 0;
  let longRunningCount = 0;

  processes.forEach((p) => {
    const s = p.state.toLowerCase();
    if (s.includes('active') || s === 'query' || s.includes('running') || s.includes('sending')) {
      activeCount++;
    } else if (s.includes('idle')) {
      idleCount++;
    }

    if (p.isBlocked || (p.waitEvent && p.waitEvent.toLowerCase().includes('lock'))) {
      waitingCount++;
    }

    if (p.durationSeconds > 10 && (s.includes('active') || s === 'query')) {
      longRunningCount++;
    }
  });

  return {
    totalConnections: processes.length,
    activeCount,
    idleCount,
    waitingCount,
    longRunningCount,
  };
}

/**
 * Generates SQL statement to cancel a query without terminating connection.
 */
export function buildCancelQuerySql(id: string, driver: string): string {
  const cleanId = String(id).replace(/[^0-9]/g, '');
  const d = (driver || '').toLowerCase();
  if (d.includes('mysql')) {
    return `KILL QUERY ${cleanId};`;
  }
  return `SELECT pg_cancel_backend(${cleanId});`;
}

/**
 * Generates SQL statement to terminate / kill a database connection entirely.
 */
export function buildTerminateSessionSql(id: string, driver: string): string {
  const cleanId = String(id).replace(/[^0-9]/g, '');
  const d = (driver || '').toLowerCase();
  if (d.includes('mysql')) {
    return `KILL ${cleanId};`;
  }
  return `SELECT pg_terminate_backend(${cleanId});`;
}

/**
 * Fetches current processes for a database connection.
 */
export async function fetchServerProcesses(
  connectionId: string,
  driver: string
): Promise<ServerProcess[]> {
  const sql = buildActivityQuery(driver);
  const result = await dbApi.executeDirectQuery(connectionId, sql);
  return parseActivityResults(result, driver);
}
