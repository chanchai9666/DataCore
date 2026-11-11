import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

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
}

export interface AuditFilterOptions {
  search?: string;
  action?: AuditActionType | 'ALL';
  status?: AuditStatus | 'ALL';
  connectionId?: string;
}

interface AuditLogState {
  logs: AuditLogEntry[];
  addLog: (entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
  filterLogs: (options: AuditFilterOptions) => AuditLogEntry[];
  exportToCsv: (entries?: AuditLogEntry[]) => string;
  exportToJson: (entries?: AuditLogEntry[]) => string;
}

const MAX_LOGS = 1000;

export const useAuditLogStore = create<AuditLogState>()(
  persist(
    (set, get) => ({
      logs: [],

      addLog: (entry) => {
        const newEntry: AuditLogEntry = {
          id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          timestamp: new Date().toISOString(),
          ...entry,
        };

        set((state) => {
          const updated = [newEntry, ...state.logs];
          if (updated.length > MAX_LOGS) {
            return { logs: updated.slice(0, MAX_LOGS) };
          }
          return { logs: updated };
        });
      },

      clearLogs: () => {
        set({ logs: [] });
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
