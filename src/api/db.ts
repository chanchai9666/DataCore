import { invoke } from '@tauri-apps/api/core';
import type { ConnectionConfig, QueryResult, SchemaNode } from '../types/db';

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

export const fetchTableData = async (
  tabId: string,
  table: string,
  schema?: string,
  limit: number = 100,
  offset: number = 0
): Promise<QueryResult> => {
  return invoke<QueryResult>('fetch_table_data', {
    tabId,
    tab_id: tabId,
    schema: schema ?? null,
    table,
    limit,
    offset,
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

export const dbApi = {
  testConnection,
  getConnections,
  saveConnection,
  deleteConnection,
  openSession,
  closeSession,
  executeQuery,
  fetchTableData,
  cancelQuery,
  setAutocommit,
  commitTransaction,
  rollbackTransaction,
  getSchemaTree,
};
