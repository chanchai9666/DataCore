import { invoke } from '@tauri-apps/api/core';
import type { ConnectionConfig, QueryResult, SchemaNode } from '../types/db';
import type { TableMetadata, DuplicateTableOptions } from '../types/dataTransfer';
import { splitSqlStatements } from './sqlSplitter';

export const testConnection = async (
  config: ConnectionConfig,
  password?: string
): Promise<number> => {
  return invoke<number>('test_connection', {
    config,
    password: password ?? null,
  });
};

export const getConnections = async (): Promise<ConnectionConfig[]> => {
  return invoke<ConnectionConfig[]>('get_connections');
};

export const saveConnection = async (
  config: ConnectionConfig,
  password?: string
): Promise<void> => {
  return invoke<void>('save_connection', {
    config,
    password: password ?? null,
  });
};

export const deleteConnection = async (connectionId: string): Promise<void> => {
  return invoke<void>('delete_connection', {
    connectionId,
    connection_id: connectionId,
  });
};

export const openSession = async (
  connectionId: string,
  tabId: string
): Promise<void> => {
  return invoke<void>('open_session', {
    connectionId,
    connection_id: connectionId,
    tabId,
    tab_id: tabId,
  });
};

export const closeSession = async (tabId: string): Promise<void> => {
  return invoke<void>('close_session', {
    tabId,
    tab_id: tabId,
  });
};

export const disconnectConnection = async (connectionId: string): Promise<number> => {
  return invoke<number>('disconnect_connection', {
    connectionId,
    connection_id: connectionId,
  });
};

export const executeQuery = async (
  tabId: string,
  sql: string
): Promise<QueryResult> => {
  return invoke<QueryResult>('execute_query', {
    tabId,
    tab_id: tabId,
    sql,
  });
};

export const executeDirectQuery = async (
  connectionId: string,
  sql: string
): Promise<QueryResult> => {
  const tempTabId = `temp-ddl-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  await openSession(connectionId, tempTabId);
  try {
    const statements = splitSqlStatements(sql);

    if (statements.length <= 1) {
      return await executeQuery(tempTabId, sql);
    }

    let lastResult: QueryResult = { columns: [], rows: [], execution_time_ms: 0 };
    for (const stmt of statements) {
      lastResult = await executeQuery(tempTabId, `${stmt};`);
    }
    return lastResult;
  } finally {
    await closeSession(tempTabId).catch(() => {});
  }
};

export const fetchTableData = async (
  tabId: string,
  table: string,
  schema?: string,
  limit: number = 100,
  offset: number = 0,
  filter?: string,
  sortCol?: string,
  sortDir?: 'ASC' | 'DESC'
): Promise<QueryResult> => {
  return invoke<QueryResult>('fetch_table_data', {
    tabId,
    tab_id: tabId,
    schema: schema ?? null,
    table,
    limit,
    offset,
    filter: filter ?? null,
    sortCol: sortCol ?? null,
    sort_col: sortCol ?? null,
    sortDir: sortDir ?? null,
    sort_dir: sortDir ?? null,
  });
};

export const cancelQuery = async (tabId: string): Promise<void> => {
  return invoke<void>('cancel_query', {
    tabId,
    tab_id: tabId,
  });
};

export const setAutocommit = async (
  tabId: string,
  enabled: boolean
): Promise<void> => {
  return invoke<void>('set_autocommit', {
    tabId,
    tab_id: tabId,
    enabled,
  });
};

export const commitTransaction = async (tabId: string): Promise<void> => {
  return invoke<void>('commit_transaction', {
    tabId,
    tab_id: tabId,
  });
};

export const rollbackTransaction = async (tabId: string): Promise<void> => {
  return invoke<void>('rollback_transaction', {
    tabId,
    tab_id: tabId,
  });
};

export const getSchemaTree = async (
  connectionId: string
): Promise<SchemaNode[]> => {
  return invoke<SchemaNode[]>('get_schema_tree', {
    connectionId,
    connection_id: connectionId,
  });
};

export const getStoredPassword = async (
  connectionId: string
): Promise<string | null> => {
  return invoke<string | null>('get_stored_password', {
    connectionId,
    connection_id: connectionId,
  });
};

export const deleteStoredPassword = async (
  connectionId: string
): Promise<void> => {
  return invoke<void>('delete_stored_password', {
    connectionId,
    connection_id: connectionId,
  });
};

export const getTableListMetadata = async (
  connectionId: string,
  schema?: string
): Promise<TableMetadata[]> => {
  return invoke<TableMetadata[]>('get_table_list_metadata', {
    connectionId,
    connection_id: connectionId,
    schema: schema ?? null,
  });
};

export const duplicateTable = async (
  options: DuplicateTableOptions
): Promise<void> => {
  return invoke<void>('duplicate_table', {
    options,
  });
};

export const dbApi = {
  testConnection,
  getConnections,
  saveConnection,
  deleteConnection,
  getStoredPassword,
  deleteStoredPassword,
  openSession,
  closeSession,
  disconnectConnection,
  executeQuery,
  executeDirectQuery,
  fetchTableData,
  cancelQuery,
  setAutocommit,
  commitTransaction,
  rollbackTransaction,
  getSchemaTree,
  getTableListMetadata,
  duplicateTable,
};
