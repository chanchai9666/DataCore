import { create } from 'zustand';
import type { SqlSnippet } from '../types/queryHistory';

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

  resetToDefaults: () => {
    set({ snippets: [...DEFAULT_SNIPPETS] });
    persistStoredSnippets(DEFAULT_SNIPPETS);
  },
}));
