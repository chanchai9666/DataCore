import { useTabStore } from '../../stores/tabStore';

export interface OpenTableTabParams {
  connectionId: string;
  tableName: string;
  schemaName?: string;
}

export interface OpenQueryTabParams {
  connectionId: string;
  connectionName?: string;
  schemaName?: string;
  tableName?: string;
}

export function openTableTab({
  connectionId,
  tableName,
  schemaName,
}: OpenTableTabParams): void {
  const tableId = `${connectionId}-${tableName}`;
  useTabStore.getState().openTab({
    id: 'table-' + tableId,
    connectionId,
    type: 'table',
    title: tableName,
    schemaName,
    tableName,
    autoCommit: true,
    queryContent: '',
  });
}

export function openQueryTab({
  connectionId,
  connectionName,
  schemaName,
  tableName,
}: OpenQueryTabParams): void {
  const isTableOrView = Boolean(tableName);
  const title = connectionName || tableName || 'Query';
  const queryTabId = `query-${Date.now()}`;
  const initialQuery = isTableOrView
    ? `SELECT * FROM ${schemaName ? `"${schemaName}".` : ''}"${tableName}" LIMIT 100;\n`
    : 'SELECT * FROM users;\n';

  useTabStore.getState().openTab({
    id: queryTabId,
    connectionId,
    type: 'query',
    title: `Query (${title})`,
    autoCommit: true,
    queryContent: initialQuery,
  });
}
