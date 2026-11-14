import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { redactSensitiveSql } from '../utils/sqlSanitizer';
import {
  getAuditLogs,
  verifyAuditLogIntegrity,
  clearAuditLogs as clearBackendAuditLogs,
  recordAuditLog,
} from '../api/auditApi';

export type AuditActionType =
  | 'QUERY'
  | 'DDL'
  | 'DML'
  | 'TRANSACTION'
  | 'CONNECT'
  | 'DISCONNECT'
  | 'MAINTENANCE'
  | 'IMPORT'
  | 'EXPORT'
  | 'SECURITY';

export type AuditStatus = 'SUCCESS' | 'FAILURE' | 'CANCELLED';

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO string
  action: AuditActionType;
  user?: string;
  connectionId?: string;
  connectionName?: string;
  database?: string;
  query?: string;
  executionTimeMs?: number;
  rowsAffected?: number;
  status: AuditStatus;
  errorMessage?: string;
  details?: string;
  prevHash?: string;
  entryHash?: string;
}

export interface AuditIntegrityResult {
  isValid: boolean;
  totalEntries: number;
  verifiedAt: string;
  error?: string | null;
  tamperedEntryId?: string | null;
}

export interface AuditFilterOptions {
  search?: string;
  action?: AuditActionType | 'ALL';
  status?: AuditStatus | 'ALL';
  connectionId?: string;
}

interface AuditLogState {
  logs: AuditLogEntry[];
  isLoading: boolean;
  integrity: AuditIntegrityResult | null;
  loadLogs: (limit?: number, offset?: number) => Promise<AuditLogEntry[]>;
  verifyIntegrity: () => Promise<AuditIntegrityResult>;
  addLog: (entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
  filterLogs: (options: AuditFilterOptions) => AuditLogEntry[];
  exportToCsv: (entries?: AuditLogEntry[]) => string;
  exportToJson: (entries?: AuditLogEntry[]) => string;
}

const MAX_LOGS = 1000;

const isTauri = (): boolean =>
  typeof window !== 'undefined' &&
  Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown }).__TAURI_INTERNALS__ ||
    (window as unknown as { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown }).__TAURI__);

export const useAuditLogStore = create<AuditLogState>()(
  persist(
    (set, get) => ({
      logs: [],
      isLoading: false,
      integrity: null,

      loadLogs: async (limit = 1000, offset = 0) => {
        if (!isTauri()) {
          return get().logs;
        }
        set({ isLoading: true });
        try {
          const backendLogs = await getAuditLogs(limit, offset);
          if (Array.isArray(backendLogs)) {
            set({ logs: backendLogs, isLoading: false });
            return backendLogs;
          }
        } catch (err) {
          console.debug('Failed to load audit logs from backend IPC:', err);
        }
        set({ isLoading: false });
        return get().logs;
      },

      verifyIntegrity: async () => {
        if (!isTauri()) {
          const fallback: AuditIntegrityResult = {
            isValid: true,
            totalEntries: get().logs.length,
            verifiedAt: new Date().toISOString(),
          };
          set({ integrity: fallback });
          return fallback;
        }
        try {
          const res = await verifyAuditLogIntegrity();
          set({ integrity: res });
          return res;
        } catch (err) {
          const fallback: AuditIntegrityResult = {
            isValid: false,
            totalEntries: get().logs.length,
            verifiedAt: new Date().toISOString(),
            error: String(err),
          };
          set({ integrity: fallback });
          return fallback;
        }
      },

      addLog: (entry) => {
        const id = `audit-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const timestamp = new Date().toISOString();
        const query = entry.query ? redactSensitiveSql(entry.query) : entry.query;

        const newEntry: AuditLogEntry = {
          ...entry,
          id,
          timestamp,
          query,
        };

        set((state) => {
          const updated = [newEntry, ...state.logs];
          if (updated.length > MAX_LOGS) {
            return { logs: updated.slice(0, MAX_LOGS) };
          }
          return { logs: updated };
        });

        // Asynchronously persist to backend Rust audit logger if in Tauri
        if (isTauri()) {
          recordAuditLog(newEntry)
            .then((backendEntry) => {
              if (backendEntry && (backendEntry.entryHash || backendEntry.prevHash)) {
                set((state) => ({
                  logs: state.logs.map((item) =>
                    item.id === id
                      ? {
                          ...item,
                          prevHash: backendEntry.prevHash,
                          entryHash: backendEntry.entryHash,
                        }
                      : item
                  ),
                }));
              }
            })
            .catch((err) => {
              console.debug('Failed to sync audit log to backend IPC:', err);
            });
        }
      },

      clearLogs: () => {
        set({ logs: [], integrity: null });
        if (isTauri()) {
          clearBackendAuditLogs().catch((err) => {
            console.debug('Failed to clear audit logs on backend IPC:', err);
          });
        }
      },

      filterLogs: (options) => {
        const { search, action, status, connectionId } = options;
        return get().logs.filter((log) => {
          if (action && action !== 'ALL' && log.action !== action) {
            return false;
          }
          if (status && status !== 'ALL' && log.status !== status) {
            return false;
          }
          if (connectionId && log.connectionId !== connectionId) {
            return false;
          }
          if (search && search.trim() !== '') {
            const q = search.toLowerCase();
            const matchQuery = log.query?.toLowerCase().includes(q);
            const matchUser = log.user?.toLowerCase().includes(q);
            const matchConn = log.connectionName?.toLowerCase().includes(q);
            const matchDb = log.database?.toLowerCase().includes(q);
            const matchErr = log.errorMessage?.toLowerCase().includes(q);
            if (!matchQuery && !matchUser && !matchConn && !matchDb && !matchErr) {
              return false;
            }
          }
          return true;
        });
      },

      exportToCsv: (entries) => {
        const data = entries || get().logs;
        const headers = [
          'ID',
          'Timestamp',
          'Action',
          'User',
          'Connection',
          'Database',
          'Query',
          'Execution Time (ms)',
          'Rows Affected',
          'Status',
          'Error',
          'Prev Hash',
          'Entry Hash',
        ];

        const escapeCsv = (str?: string | number | null) => {
          if (str === undefined || str === null) return '""';
          const val = String(str).replace(/"/g, '""');
          return `"${val}"`;
        };

        const rows = data.map((log) =>
          [
            escapeCsv(log.id),
            escapeCsv(log.timestamp),
            escapeCsv(log.action),
            escapeCsv(log.user || 'anonymous'),
            escapeCsv(log.connectionName || ''),
            escapeCsv(log.database || ''),
            escapeCsv(log.query || ''),
            escapeCsv(log.executionTimeMs ?? ''),
            escapeCsv(log.rowsAffected ?? ''),
            escapeCsv(log.status),
            escapeCsv(log.errorMessage || ''),
            escapeCsv(log.prevHash || ''),
            escapeCsv(log.entryHash || ''),
          ].join(',')
        );

        return [headers.join(','), ...rows].join('\n');
      },

      exportToJson: (entries) => {
        const data = entries || get().logs;
        return JSON.stringify(data, null, 2);
      },
    }),
    {
      name: 'datacore_audit_logs',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
