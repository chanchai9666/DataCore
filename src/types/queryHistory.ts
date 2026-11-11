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

export interface SqlSnippet {
  id: string;
  title: string;
  description?: string;
  sql: string;
  category?: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}
