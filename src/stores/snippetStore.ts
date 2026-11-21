import { create } from 'zustand';
import type { SavedQueryScope, SqlSnippet } from '../types/queryHistory';

export function findDuplicateSnippetTitle(
  snippets: SqlSnippet[],
  params: {
    title: string;
    scope: SavedQueryScope;
    connectionId?: string;
    database?: string;
    excludeId?: string;
  }
): SqlSnippet | undefined {
  const normalizedTitle = params.title.trim().toLowerCase();
  if (!normalizedTitle) return undefined;
  const targetScope = params.scope || 'global';
  const normalizedDb = params.database?.trim().toLowerCase();

  return snippets.find((s) => {
    if (params.excludeId && s.id === params.excludeId) return false;
    if (s.title.trim().toLowerCase() !== normalizedTitle) return false;
    const itemScope = s.scope || 'global';
    if (itemScope !== targetScope) return false;
    if (targetScope === 'database') {
      if (params.connectionId && s.connectionId && s.connectionId !== params.connectionId) {
        return false;
      }
      if (normalizedDb && s.database && s.database.trim().toLowerCase() !== normalizedDb) {
        return false;
      }
      return true;
    }
    if (targetScope === 'connection') {
      return Boolean(params.connectionId && s.connectionId === params.connectionId);
    }
    return true;
  });
}

export const DEFAULT_SNIPPETS: SqlSnippet[] = [
  {
    id: 'preset-table-sizing',
    title: 'Table Sizes & Estimated Rows (PostgreSQL)',
    description: 'Get disk size and approximate row counts for all tables',
    category: 'Diagnostics',
    tags: ['postgresql', 'sizing', 'storage'],
    sql: `SELECT
  schemaname || '.' || relname AS table_name,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  n_live_tup AS estimated_rows
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 25;`,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  },
  {
    id: 'preset-active-queries',
    title: 'Active Running Queries (PostgreSQL)',
    description: 'View running statements and duration to identify locks or slow operations',
    category: 'Monitoring',
    tags: ['postgresql', 'sessions', 'active'],
    sql: `SELECT
  pid,
  now() - pg_stat_activity.query_start AS duration,
  query,
  state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '2 seconds'
  AND state != 'idle'
ORDER BY duration DESC;`,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  },
  {
    id: 'preset-mysql-processlist',
    title: 'Process List & Running Threads (MySQL)',
    description: 'Show active connections and current running queries in MySQL',
    category: 'Monitoring',
    tags: ['mysql', 'processlist'],
    sql: `SELECT
  id, user, host, db, command, time, state, info
FROM information_schema.processlist
WHERE command != 'Sleep'
ORDER BY time DESC;`,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  },
  {
    id: 'preset-sqlite-master',
    title: 'List All Tables & Views (SQLite)',
    description: 'Query sqlite_master for all user tables, views, and indexes',
    category: 'Schema',
    tags: ['sqlite', 'schema'],
    sql: `SELECT
  type, name, tbl_name, sql
FROM sqlite_master
WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
ORDER BY type, name;`,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  },
  {
    id: 'preset-quick-count',
    title: 'Quick Record Count Template',
    description: 'Count rows with condition template',
    category: 'General',
    tags: ['template', 'count'],
    sql: `SELECT COUNT(*) AS total_count
FROM my_table
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days';`,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  },
];

const STORAGE_KEY = 'datacore_sql_snippets_v1';

function loadStoredSnippets(): SqlSnippet[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    }
  } catch {
    // Ignore storage parse errors
  }
  return DEFAULT_SNIPPETS;
}

function persistStoredSnippets(snippets: SqlSnippet[]) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets));
    }
  } catch {
    // Ignore storage write errors
  }
}

export interface SnippetContextFilter {
  connectionId?: string;
  database?: string;
  driver?: string;
}

export interface ImportQueriesResult {
  importedCount: number;
  skippedCount: number;
}

export interface SnippetStoreState {
  snippets: SqlSnippet[];
  addSnippet: (
    snippet: Omit<SqlSnippet, 'id' | 'createdAt' | 'updatedAt'> & {
      id?: string;
      createdAt?: number;
      updatedAt?: number;
    }
  ) => SqlSnippet;
  updateSnippet: (id: string, updates: Partial<Omit<SqlSnippet, 'id' | 'createdAt'>>) => void;
  deleteSnippet: (id: string) => void;
  togglePin: (id: string) => void;
  recordRun: (id: string) => void;
  getQueriesForContext: (filter: SnippetContextFilter) => SqlSnippet[];
  exportQueriesJson: (ids?: string[]) => string;
  importQueriesJson: (jsonText: string, mode?: 'merge' | 'replace') => ImportQueriesResult;
  resetToDefaults: () => void;
}

export const useSnippetStore = create<SnippetStoreState>((set, get) => ({
  snippets: loadStoredSnippets(),

  addSnippet: (snippet) => {
    const now = Date.now();
    const newSnippet: SqlSnippet = {
      id: snippet.id || `snip-${now}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: snippet.createdAt || now,
      updatedAt: snippet.updatedAt || now,
      scope: snippet.scope || (snippet.database ? 'database' : snippet.connectionId ? 'connection' : 'global'),
      isPinned: snippet.isPinned ?? false,
      runCount: snippet.runCount ?? 0,
      ...snippet,
    };

    const nextSnippets = [newSnippet, ...get().snippets.filter((s) => s.id !== newSnippet.id)];
    set({ snippets: nextSnippets });
    persistStoredSnippets(nextSnippets);
    return newSnippet;
  },

  updateSnippet: (id, updates) => {
    const nextSnippets = get().snippets.map((s) => {
      if (s.id !== id) return s;
      return {
        ...s,
        ...updates,
        updatedAt: Date.now(),
      };
    });
    set({ snippets: nextSnippets });
    persistStoredSnippets(nextSnippets);
  },

  deleteSnippet: (id) => {
    const nextSnippets = get().snippets.filter((s) => s.id !== id);
    set({ snippets: nextSnippets });
    persistStoredSnippets(nextSnippets);
  },

  togglePin: (id) => {
    const nextSnippets = get().snippets.map((s) => {
      if (s.id !== id) return s;
      return {
        ...s,
        isPinned: !s.isPinned,
        updatedAt: Date.now(),
      };
    });
    set({ snippets: nextSnippets });
    persistStoredSnippets(nextSnippets);
  },

  recordRun: (id) => {
    const now = Date.now();
    const nextSnippets = get().snippets.map((s) => {
      if (s.id !== id) return s;
      return {
        ...s,
        runCount: (s.runCount ?? 0) + 1,
        lastRunAt: now,
      };
    });
    set({ snippets: nextSnippets });
    persistStoredSnippets(nextSnippets);
  },

  getQueriesForContext: ({ connectionId, database, driver }) => {
    const normalizedDb = database?.trim().toLowerCase();
    const normalizedDriver = driver?.trim().toLowerCase();

    return get()
      .snippets.filter((s) => {
        const scope = s.scope || 'global';
        if (scope === 'database') {
          if (connectionId && s.connectionId && s.connectionId !== connectionId) {
            return false;
          }
          if (normalizedDb && s.database && s.database.trim().toLowerCase() !== normalizedDb) {
            return false;
          }
          if (!connectionId && !normalizedDb) {
            return false;
          }
          return true;
        }
        if (scope === 'connection') {
          return Boolean(connectionId && s.connectionId === connectionId);
        }
        if (normalizedDriver && s.driver && s.driver.trim().toLowerCase() !== normalizedDriver) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const pinDiff = Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned));
        if (pinDiff !== 0) return pinDiff;
        const runDiff = (b.runCount ?? 0) - (a.runCount ?? 0);
        if (runDiff !== 0) return runDiff;
        return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
      });
  },

  exportQueriesJson: (ids) => {
    const all = get().snippets;
    const queries = ids && ids.length > 0 ? all.filter((s) => ids.includes(s.id)) : all;
    return JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        queries,
      },
      null,
      2
    );
  },

  importQueriesJson: (jsonText, mode = 'merge') => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error('Invalid JSON format for saved queries');
    }

    const rawList: unknown[] = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { queries?: unknown[] }).queries)
      ? (parsed as { queries: unknown[] }).queries
      : (() => {
          throw new Error('Invalid saved queries file structure');
        })();

    const now = Date.now();
    const validItems: SqlSnippet[] = [];
    let skippedCount = 0;

    for (const raw of rawList) {
      if (!raw || typeof raw !== 'object') {
        skippedCount++;
        continue;
      }
      const item = raw as Partial<SqlSnippet>;
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      const sql = typeof item.sql === 'string' ? item.sql.trim() : '';
      if (!title || !sql) {
        skippedCount++;
        continue;
      }

      validItems.push({
        id:
          typeof item.id === 'string' && item.id.trim()
            ? item.id.trim()
            : `snip-${now}-${Math.random().toString(36).slice(2, 7)}`,
        title,
        description: typeof item.description === 'string' ? item.description : undefined,
        sql,
        category: typeof item.category === 'string' ? item.category : 'General',
        tags: Array.isArray(item.tags) ? item.tags.filter((t): t is string => typeof t === 'string') : [],
        scope:
          item.scope === 'database' || item.scope === 'connection' || item.scope === 'global'
            ? item.scope
            : item.database
            ? 'database'
            : item.connectionId
            ? 'connection'
            : 'global',
        connectionId: typeof item.connectionId === 'string' ? item.connectionId : undefined,
        connectionName: typeof item.connectionName === 'string' ? item.connectionName : undefined,
        database: typeof item.database === 'string' ? item.database : undefined,
        driver: typeof item.driver === 'string' ? item.driver : undefined,
        isPinned: Boolean(item.isPinned),
        runCount: typeof item.runCount === 'number' ? item.runCount : 0,
        lastRunAt: typeof item.lastRunAt === 'number' ? item.lastRunAt : undefined,
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : now,
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : now,
      });
    }

    if (mode === 'replace') {
      set({ snippets: validItems });
      persistStoredSnippets(validItems);
    } else {
      const existing = get().snippets;
      const incomingIds = new Set(validItems.map((i) => i.id));
      const merged = [...validItems, ...existing.filter((e) => !incomingIds.has(e.id))];
      set({ snippets: merged });
      persistStoredSnippets(merged);
    }

    return {
      importedCount: validItems.length,
      skippedCount,
    };
  },

  resetToDefaults: () => {
    set({ snippets: [...DEFAULT_SNIPPETS] });
    persistStoredSnippets(DEFAULT_SNIPPETS);
  },
}));
