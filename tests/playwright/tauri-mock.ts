import type { Page } from '@playwright/test';

export interface TauriMockOptions {
  vaultLocked?: boolean;
  testConnectionError?: string;
  failNextQueryError?: string;
  xssAndSpecialRows?: boolean;
}

/**
 * Injects a Tauri 2 IPC mock (`window.__TAURI_INTERNALS__` & `window.__TAURI_EVENT_PLUGIN_INTERNALS__`)
 * into the browser page so DataCore's React UI can run end-to-end in Chromium against `pnpm dev`.
 */
export async function installTauriMock(page: Page, options: TauriMockOptions = {}): Promise<void> {
  await page.addInitScript((opts: TauriMockOptions) => {
    const callbacks = new Map<number, (data: unknown) => void>();
    let nextCallbackId = 1;

    const savedConnections: Array<Record<string, unknown>> = [];
    const mockTables = ['users', 'orders'];
    let isVaultUnlocked = !opts.vaultLocked;
    let remainingQueryError = opts.failNextQueryError ?? null;

    const sampleUsersResult = opts.xssAndSpecialRows
      ? {
          columns: [
            { name: 'id', data_type: 'INTEGER', nullable: false },
            { name: 'name', data_type: 'TEXT', nullable: true },
            { name: 'email', data_type: 'TEXT', nullable: true },
          ],
          rows: [
            [{ Integer: 1 }, { Text: '<script>window.__xssTriggered=true</script>' }, { Text: 'สวัสดี 🚀' }],
            [{ Integer: 2 }, { Text: '<img src=x onerror="window.__xssTriggered=true">' }, 'Null'],
            [{ Integer: 3 }, { Text: '' }, { Text: 'NULL' }],
          ],
          execution_time_ms: 8,
          rows_affected: null,
        }
      : {
          columns: [
            { name: 'id', data_type: 'INTEGER', nullable: false },
            { name: 'name', data_type: 'TEXT', nullable: true },
            { name: 'email', data_type: 'TEXT', nullable: true },
          ],
          rows: [
            [{ Integer: 1 }, { Text: 'Alice' }, { Text: 'alice@example.com' }],
            [{ Integer: 2 }, { Text: 'Bob' }, { Text: 'bob@example.com' }],
          ],
          execution_time_ms: 8,
          rows_affected: null,
        };

    const samplePragmaTableInfo = {
      columns: [
        { name: 'cid', data_type: 'INTEGER', nullable: false },
        { name: 'name', data_type: 'TEXT', nullable: false },
        { name: 'type', data_type: 'TEXT', nullable: false },
        { name: 'notnull', data_type: 'INTEGER', nullable: false },
        { name: 'dflt_value', data_type: 'TEXT', nullable: true },
        { name: 'pk', data_type: 'INTEGER', nullable: false },
      ],
      rows: [
        [{ Integer: 0 }, { Text: 'id' }, { Text: 'INTEGER' }, { Integer: 1 }, 'Null', { Integer: 1 }],
        [{ Integer: 1 }, { Text: 'name' }, { Text: 'TEXT' }, { Integer: 0 }, 'Null', { Integer: 0 }],
        [{ Integer: 2 }, { Text: 'email' }, { Text: 'TEXT' }, { Integer: 0 }, 'Null', { Integer: 0 }],
      ],
      execution_time_ms: 2,
      rows_affected: null,
    };

    const mockInvoke = async (cmd: string, args: Record<string, unknown> = {}) => {
      switch (cmd) {
        case 'vault_status':
          return {
            hasMasterPassword: Boolean(opts.vaultLocked),
            isUnlocked: isVaultUnlocked,
            keychainOptIn: false,
          };

        case 'vault_is_keychain_enabled':
        case 'has_stored_password':
          return false;

        case 'vault_has_master_password':
          return Boolean(opts.vaultLocked);

        case 'vault_unlock': {
          if (opts.vaultLocked && args.password !== 'correct-master-pw') {
            throw new Error('Invalid Master Password');
          }
          isVaultUnlocked = true;
          return true;
        }

        case 'get_workspace_state':
          return null;

        case 'save_workspace_state':
        case 'clear_workspace_state':
          return null;

        case 'get_connections':
          return [...savedConnections];

        case 'save_connection': {
          const config = args.config as Record<string, unknown> | undefined;
          if (config) {
            const idx = savedConnections.findIndex((c) => c.id === config.id);
            if (idx >= 0) {
              savedConnections[idx] = config;
            } else {
              savedConnections.push(config);
            }
          }
          return null;
        }

        case 'delete_connection': {
          const id = (args.connectionId ?? args.connection_id) as string | undefined;
          const idx = savedConnections.findIndex((c) => c.id === id);
          if (idx >= 0) savedConnections.splice(idx, 1);
          return null;
        }

        case 'test_connection':
          if (opts.testConnectionError) {
            throw new Error(opts.testConnectionError);
          }
          return 12;

        case 'open_session':
        case 'close_session':
        case 'disconnect_connection':
        case 'set_autocommit':
        case 'cancel_query':
        case 'commit_transaction':
        case 'rollback_transaction':
        case 'set_session_password':
        case 'set_session_ssh_passphrase':
        case 'clear_session_password':
        case 'delete_stored_password':
        case 'set_screen_protection':
          return null;

        case 'get_schema_tree':
          return [
            {
              name: 'main',
              node_type: 'database',
              children: mockTables.map((name) => ({
                name,
                node_type: 'table',
                schema: 'main',
              })),
            },
          ];

        case 'get_table_list_metadata':
          return mockTables.map((name, idx) => ({
            name,
            schema: 'main',
            table_type: 'table',
            row_count: idx === 0 ? sampleUsersResult.rows.length : 5,
            data_size_bytes: idx === 0 ? 4096 : 8192,
            index_size_bytes: 1024,
            engine: 'SQLite',
          }));

        case 'get_object_ddl':
          return 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT);';

        case 'execute_query': {
          const sql = String(args.sql ?? '').trim().toUpperCase();
          if (sql.includes('PRAGMA TABLE_INFO')) {
            return samplePragmaTableInfo;
          }
          if (sql.includes('PRAGMA INDEX_LIST') || sql.includes('PRAGMA FOREIGN_KEY_LIST')) {
            return { columns: [], rows: [], execution_time_ms: 1, rows_affected: null };
          }
          if (remainingQueryError && sql.includes('FROMM')) {
            const msg = remainingQueryError;
            remainingQueryError = null;
            throw new Error(msg);
          }
          if (sql.startsWith('CREATE') || sql.startsWith('INSERT') || sql.startsWith('UPDATE') || sql.startsWith('DELETE')) {
            return {
              columns: [],
              rows: [],
              execution_time_ms: 4,
              rows_affected: 1,
            };
          }
          return sampleUsersResult;
        }

        case 'fetch_table_data':
        case 'fetch_table_data_keyset':
          return sampleUsersResult;

        case 'count_table_rows':
          return sampleUsersResult.rows.length;

        case 'get_audit_logs':
          return [];

        case 'verify_audit_log_integrity':
          return { valid: true, checked_entries: 0, message: 'OK' };

        case 'get_audit_health':
          return { writeFailureDetected: false, lastWriteError: null, lastWriteFailedAt: null };

        case 'record_audit_log':
          return {
            id: 'audit-1',
            timestamp: new Date().toISOString(),
            action: 'QUERY_EXECUTED',
            details: 'mock',
            hash: 'mock-hash',
          };

        case 'plugin:event|listen':
          return nextCallbackId++;

        case 'plugin:event|unlisten':
        case 'plugin:window|toggle_maximize':
          return null;

        default:
          return null;
      }
    };

    (window as unknown as Record<string, unknown>).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: () => {},
    };

    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      invoke: mockInvoke,
      transformCallback: (cb: (data: unknown) => void) => {
        const id = nextCallbackId++;
        callbacks.set(id, cb);
        return id;
      },
      unregisterCallback: (id: number) => {
        callbacks.delete(id);
      },
      convertFileSrc: (filePath: string) => filePath,
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { label: 'main' },
      },
    };
  }, options);
}
