import { useTabStore } from '../../stores/tabStore';
import { useConnectionStore } from '../../stores/connectionStore';

export interface OpenTableTabParams {
  connectionId: string;
  tableName: string;
  schemaName?: string;
  viewMode?: 'data' | 'structure';
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
  viewMode,
}: OpenTableTabParams): void {
  const tableId = `${connectionId}-${tableName}`;
  const fullId = 'table-' + tableId;
  const existingTab = useTabStore.getState().tabs.find((t) => t.id === fullId);

  if (existingTab) {
    if (viewMode) {
      useTabStore.getState().updateTab(fullId, { viewMode });
    }
    useTabStore.getState().setActiveTab(fullId);
    return;
  }

  useTabStore.getState().openTab({
    id: fullId,
    connectionId,
    type: 'table',
    title: tableName,
    schemaName,
    tableName,
    autoCommit: true,
    queryContent: '',
    viewMode: viewMode || 'data',
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
