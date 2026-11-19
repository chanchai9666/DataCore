import { invoke } from '@tauri-apps/api/core';
import type { CellValue, ConnectionConfig, DatabaseDriver, ImpactSimulationResult, QueryResult, SchemaNode } from '../types/db';
import type {
  TableMetadata,
  DuplicateTableOptions,
  SqlExportOptions,
  SqlExportResult,
  SqlImportOptions,
  SqlImportResult,
  CrossDbCopyTableOptions,
  CrossDbCopyResult,
  NativeCliStatus,
  NativeBackupOptions,
  NativeRestoreOptions,
} from '../types/dataTransfer';
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
  });
};

const inFlightSessions = new Map<string, Promise<void>>();
const establishedSessions = new Set<string>();

export const clearSessionCache = (tabId?: string, connectionId?: string): void => {
  if (tabId) {
    for (const key of Array.from(establishedSessions)) {
      if (key.endsWith(`:${tabId}`)) establishedSessions.delete(key);
    }
    for (const key of Array.from(inFlightSessions.keys())) {
      if (key.endsWith(`:${tabId}`)) inFlightSessions.delete(key);
    }
    return;
  }
  if (connectionId) {
    for (const key of Array.from(establishedSessions)) {
      if (key.startsWith(`${connectionId}:`)) establishedSessions.delete(key);
    }
    for (const key of Array.from(inFlightSessions.keys())) {
      if (key.startsWith(`${connectionId}:`)) inFlightSessions.delete(key);
    }
    return;
  }
  inFlightSessions.clear();
  establishedSessions.clear();
};

export const openSession = async (
  connectionId: string,
  tabId: string
): Promise<void> => {
  const key = `${connectionId}:${tabId}`;
  if (establishedSessions.has(key)) {
    return;
  }
  const existing = inFlightSessions.get(key);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    try {
      await invoke<void>('open_session', {
        connectionId,
        tabId,
      });
      establishedSessions.add(key);
    } finally {
      inFlightSessions.delete(key);
    }
  })();

  inFlightSessions.set(key, promise);
  return promise;
};

export const closeSession = async (tabId: string): Promise<void> => {
  clearSessionCache(tabId);
  return invoke<void>('close_session', {
    tabId,
  });
};

export const disconnectConnection = async (connectionId: string): Promise<number> => {
  clearSessionCache(undefined, connectionId);
  return invoke<number>('disconnect_connection', {
    connectionId,
  });
};

export const executeQuery = async (
  tabId: string,
  sql: string
): Promise<QueryResult> => {
  return invoke<QueryResult>('execute_query', {
    tabId,
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
    schema: schema ?? null,
    table,
    limit,
    offset,
    filter: filter ?? null,
    sortCol: sortCol ?? null,
    sortDir: sortDir ?? null,
  });
};

export const countTableRows = async (
  tabId: string,
  table: string,
  schema?: string,
  filter?: string,
  driver?: DatabaseDriver
): Promise<number> => {
  return invoke<number>('count_table_rows', {
    tabId,
    schema: schema ?? null,
    table,
    filter: filter ?? null,
    driver: driver ?? null,
  });
};

export const fetchTableDataKeyset = async (
  tabId: string,
  table: string,
  schema?: string,
  limit: number = 100,
  filter?: string,
  keyColumns: string[] = [],
  cursorValues?: CellValue[] | null,
  direction: 'next' | 'prev' = 'next',
  sortDir: 'ASC' | 'DESC' = 'ASC',
  driver?: DatabaseDriver
): Promise<QueryResult> => {
  return invoke<QueryResult>('fetch_table_data_keyset', {
    tabId,
    schema: schema ?? null,
    table,
    limit,
    filter: filter ?? null,
    keyColumns,
    cursorValues: cursorValues ?? null,
    direction,
    sortDir,
    driver: driver ?? null,
  });
};

export const cancelQuery = async (tabId: string): Promise<void> => {
  return invoke<void>('cancel_query', {
    tabId,
  });
};

export const setAutocommit = async (
  tabId: string,
  enabled: boolean
): Promise<void> => {
  return invoke<void>('set_autocommit', {
    tabId,
    enabled,
  });
};

export const commitTransaction = async (tabId: string): Promise<void> => {
  return invoke<void>('commit_transaction', {
    tabId,
  });
};

export const rollbackTransaction = async (tabId: string): Promise<void> => {
  return invoke<void>('rollback_transaction', {
    tabId,
  });
};

export const getSchemaTree = async (
  connectionId: string
): Promise<SchemaNode[]> => {
  return invoke<SchemaNode[]>('get_schema_tree', {
    connectionId,
  });
};

export const getObjectDdl = async (
  connectionId: string,
  schema: string | null | undefined,
  objectName: string,
  objectType: string
): Promise<string> => {
  return invoke<string>('get_object_ddl', {
    connectionId,
    schema: schema ?? null,
    objectName,
    objectType,
  });
};

export const hasStoredPassword = async (
  connectionId: string
): Promise<boolean> => {
  return invoke<boolean>('has_stored_password', {
    connectionId,
  });
};

export const deleteStoredPassword = async (
  connectionId: string
): Promise<void> => {
  return invoke<void>('delete_stored_password', {
    connectionId,
  });
};

export const setSessionPassword = async (
  connectionId: string,
  password: string
): Promise<void> => {
  return invoke<void>('set_session_password', {
    connectionId,
    password,
  });
};

export const setSessionSshPassphrase = async (
  connectionId: string,
  passphrase: string
): Promise<void> => {
  return invoke<void>('set_session_ssh_passphrase', {
    connectionId,
    passphrase,
  });
};

export const clearSessionPassword = async (
  connectionId: string
): Promise<void> => {
  return invoke<void>('clear_session_password', {
    connectionId,
  });
};

export const getTableListMetadata = async (
  connectionId: string,
  schema?: string
): Promise<TableMetadata[]> => {
  return invoke<TableMetadata[]>('get_table_list_metadata', {
    connectionId,
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

export const exportSql = async (
  options: SqlExportOptions
): Promise<SqlExportResult> => {
  return invoke<SqlExportResult>('export_sql', {
    options,
  });
};

export const importSql = async (
  options: SqlImportOptions
): Promise<SqlImportResult> => {
  return invoke<SqlImportResult>('import_sql', {
    options,
  });
};

export const copyTableCrossDb = async (
  options: CrossDbCopyTableOptions
): Promise<CrossDbCopyResult> => {
  return invoke<CrossDbCopyResult>('copy_table_cross_db', {
    options,
  });
};

export const simulateQueryImpact = async (
  connectionId: string,
  sql: string
): Promise<ImpactSimulationResult> => {
  return invoke<ImpactSimulationResult>('simulate_query_impact', {
    connectionId,
    sql,
  });
};

export const checkNativeCliAvailability = async (
  connectionId: string
): Promise<NativeCliStatus> => {
  return invoke<NativeCliStatus>('check_native_cli_availability', {
    connectionId,
  });
};

export const startNativeBackup = async (
  taskId: string,
  options: NativeBackupOptions
): Promise<number> => {
  return invoke<number>('start_native_backup', {
    taskId,
    options,
  });
};

export const startNativeRestore = async (
  taskId: string,
  options: NativeRestoreOptions
): Promise<number> => {
  return invoke<number>('start_native_restore', {
    taskId,
    options,
  });
};

export const cancelNativeTask = async (taskId: string): Promise<void> => {
  return invoke<void>('cancel_native_task', {
    taskId,
  });
};

export const isVaultKeychainEnabled = async (): Promise<boolean> => {
  return invoke<boolean>('vault_is_keychain_enabled');
};

export const setVaultKeychainEnabled = async (enabled: boolean): Promise<void> => {
  return invoke<void>('vault_set_keychain_enabled', { enabled });
};

export const hasVaultMasterPassword = async (): Promise<boolean> => {
  return invoke<boolean>('vault_has_master_password');
};

export const unlockVault = async (password?: string): Promise<boolean> => {
  return invoke<boolean>('vault_unlock', { password: password ?? null });
};

export const setVaultMasterPassword = async (password: string): Promise<void> => {
  return invoke<void>('vault_set_master_password', { password });
};

export const changeVaultMasterPassword = async (
  oldPassword: string,
  newPassword: string
): Promise<void> => {
  return invoke<void>('vault_change_master_password', {
    oldPassword,
    newPassword,
  });
};

export const removeVaultMasterPassword = async (
  currentPassword: string
): Promise<void> => {
  return invoke<void>('vault_remove_master_password', { currentPassword });
};

export const lockVault = async (): Promise<void> => {
  return invoke<void>('vault_lock');
};

export const setScreenProtection = async (enabled: boolean): Promise<void> => {
  return invoke<void>('set_screen_protection', { enabled });
};

export const dbApi = {
  testConnection,
  getConnections,
  saveConnection,
  deleteConnection,
  hasStoredPassword,
  deleteStoredPassword,
  setSessionPassword,
  setSessionSshPassphrase,
  clearSessionPassword,
  clearSessionCache,
  openSession,
  closeSession,
  disconnectConnection,
  executeQuery,
  executeDirectQuery,
  fetchTableData,
  countTableRows,
  fetchTableDataKeyset,
  cancelQuery,
  setAutocommit,
  commitTransaction,
  rollbackTransaction,
  getSchemaTree,
  getObjectDdl,
  getTableListMetadata,
  duplicateTable,
  exportSql,
  importSql,
  copyTableCrossDb,
  simulateQueryImpact,
  checkNativeCliAvailability,
  startNativeBackup,
  startNativeRestore,
  cancelNativeTask,
  isVaultKeychainEnabled,
  setVaultKeychainEnabled,
  hasVaultMasterPassword,
  setVaultMasterPassword,
  changeVaultMasterPassword,
  removeVaultMasterPassword,
  unlockVault,
  lockVault,
  setScreenProtection,
};
