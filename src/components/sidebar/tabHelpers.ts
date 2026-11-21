import { useTabStore } from '../../stores/tabStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { dbApi } from '../../api/db';

export interface OpenTableTabParams {
  connectionId: string;
  tableName: string;
  schemaName?: string;
  viewMode?: 'data' | 'structure';
}

export interface OpenTableListTabParams {
  connectionId: string;
  schemaName?: string;
}

export interface OpenERDiagramTabParams {
  connectionId: string;
  schemaName?: string;
}

export function openERDiagramTab({
  connectionId,
  schemaName,
}: OpenERDiagramTabParams): void {
  const fullId = `er:${connectionId}:${schemaName || 'default'}`;
  const existingTab = useTabStore.getState().tabs.find((t) => t.id === fullId);

  if (existingTab) {
    useTabStore.getState().setActiveTab(fullId);
    return;
  }

  const title = schemaName ? `ER (${schemaName})` : 'ER Diagram';

  useTabStore.getState().openTab({
    id: fullId,
    connectionId,
    type: 'er-diagram',
    title,
    schemaName,
    autoCommit: true,
    queryContent: '',
  });
}

export function openTableListTab({
  connectionId,
  schemaName,
}: OpenTableListTabParams): void {
  const fullId = `tables:${connectionId}:${schemaName || 'default'}`;
  const existingTab = useTabStore.getState().tabs.find((t) => t.id === fullId);

  if (existingTab) {
    useTabStore.getState().setActiveTab(fullId);
    return;
  }

  const title = schemaName ? `Tables (${schemaName})` : 'Tables';

  useTabStore.getState().openTab({
    id: fullId,
    connectionId,
    type: 'table-list',
    title,
    schemaName,
    autoCommit: true,
    queryContent: '',
  });
}

export interface OpenQueryTabParams {
  connectionId: string;
  connectionName?: string;
  schemaName?: string;
  tableName?: string;
  driver?: string;
  initialQuery?: string;
  savedQueryId?: string;
  tabTitle?: string;
  autoRun?: boolean;
}

export interface OpenSavedQueriesTabParams {
  connectionId?: string;
  schemaName?: string;
}

export function openSavedQueriesTab({
  connectionId = '',
  schemaName,
}: OpenSavedQueriesTabParams = {}): void {
  const fullId = 'saved-queries-hub';
  const existingTab = useTabStore.getState().tabs.find((t) => t.id === fullId);

  if (existingTab) {
    useTabStore.getState().updateTab(fullId, {
      ...(connectionId ? { connectionId } : {}),
      ...(schemaName ? { schemaName } : {}),
    });
    useTabStore.getState().setActiveTab(fullId);
    return;
  }

  useTabStore.getState().openTab({
    id: fullId,
    connectionId,
    type: 'saved-queries',
    title: 'Saved Queries',
    schemaName,
    autoCommit: true,
    queryContent: '',
  });
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
  initialQuery: customQuery,
  savedQueryId,
  tabTitle,
  autoRun,
}: OpenQueryTabParams): void {
  const isTableOrView = Boolean(tableName);
  const title = connectionName || tableName || 'Query';
  const queryTabId = savedQueryId ? `query-saved-${savedQueryId}` : `query-${Date.now()}`;

  if (savedQueryId) {
    const existing = useTabStore.getState().tabs.find((t) => t.id === queryTabId);
    if (existing) {
      if (autoRun) {
        useTabStore.getState().updateTab(queryTabId, { autoRun: true });
      }
      useTabStore.getState().setActiveTab(queryTabId);
      return;
    }
  }

  const resolvedDriver =
    driver ||
    useConnectionStore
      .getState()
      .connections.find((c) => c.id === connectionId)?.driver;

  const quote = (identifier: string) =>
    resolvedDriver === 'mysql' ? `\`${identifier}\`` : `"${identifier}"`;

  const initialQuery = customQuery !== undefined
    ? customQuery
    : (isTableOrView
      ? `SELECT * FROM ${schemaName ? `${quote(schemaName)}.` : ''}${quote(tableName!)} LIMIT 100;\n`
      : '');

  useTabStore.getState().openTab({
    id: queryTabId,
    connectionId,
    type: 'query',
    title: tabTitle || `Query (${title})`,
    savedQueryId,
    autoRun,
    schemaName,
    autoCommit: true,
    queryContent: initialQuery,
  });

  // Eagerly pre-warm session in background
  dbApi.openSession?.(connectionId, queryTabId)?.catch?.((err) => {
    console.debug('Eager session pre-warm failed:', err);
  });
}

export interface OpenQueryBuilderTabParams {
  connectionId: string;
  tableName?: string;
  schemaName?: string;
}

export function openQueryBuilderTab({
  connectionId,
  tableName,
  schemaName,
}: OpenQueryBuilderTabParams): void {
  const fullId = `qb:${connectionId}:${schemaName || 'default'}:${tableName || 'new'}-${Date.now()}`;
  const title = tableName ? `Builder (${tableName})` : 'Query Builder';

  useTabStore.getState().openTab({
    id: fullId,
    connectionId,
    type: 'query-builder',
    title,
    schemaName,
    tableName,
    autoCommit: true,
    queryContent: '',
  });
}
