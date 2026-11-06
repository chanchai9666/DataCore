import { useTabStore } from '../../stores/tabStore';
import { useConnectionStore } from '../../stores/connectionStore';

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
  driver?: string;
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
  driver,
}: OpenQueryTabParams): void {
  const isTableOrView = Boolean(tableName);
  const title = connectionName || tableName || 'Query';
  const queryTabId = `query-${Date.now()}`;

  const resolvedDriver =
    driver ||
    useConnectionStore
      .getState()
      .connections.find((c) => c.id === connectionId)?.driver;

  const quote = (identifier: string) =>
    resolvedDriver === 'mysql' ? `\`${identifier}\`` : `"${identifier}"`;

  const initialQuery = isTableOrView
    ? `SELECT * FROM ${schemaName ? `${quote(schemaName)}.` : ''}${quote(tableName!)} LIMIT 100;\n`
    : '';

  useTabStore.getState().openTab({
    id: queryTabId,
    connectionId,
    type: 'query',
    title: `Query (${title})`,
    autoCommit: true,
    queryContent: initialQuery,
  });
}
