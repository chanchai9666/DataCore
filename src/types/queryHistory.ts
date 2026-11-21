export interface QueryHistoryItem {
  id: string;
  connectionId?: string;
  connectionName?: string;
  database?: string;
  sql: string;
  executedAt: number; // Unix timestamp in ms
  executionTimeMs: number;
  rowCount?: number;
  rowsAffected?: number | null;
  status: 'success' | 'error';
  errorMessage?: string;
}

export type SavedQueryScope = 'global' | 'connection' | 'database';

export interface SqlSnippet {
  id: string;
  title: string;
  description?: string;
  sql: string;
  category?: string;
  tags?: string[];
  scope?: SavedQueryScope;
  connectionId?: string;
  connectionName?: string;
  database?: string;
  driver?: string;
  isPinned?: boolean;
  runCount?: number;
  lastRunAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface SavedQueriesExportBundle {
  version: 1;
  exportedAt: string;
  queries: SqlSnippet[];
}
