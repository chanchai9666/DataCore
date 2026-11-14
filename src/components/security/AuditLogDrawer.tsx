import React, { useState, useMemo, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  X,
  Search,
  Download,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Database,
  User,
  ChevronDown,
  ChevronRight,
  Hash,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useAuditLogStore,
  type AuditActionType,
  type AuditStatus,
} from '../../stores/auditLogStore';
import { showConfirmDialog } from '../../utils/dialog';

export interface AuditLogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuditLogDrawer: React.FC<AuditLogDrawerProps> = ({ isOpen, onClose }) => {
  const {
    logs,
    clearLogs,
    filterLogs,
    exportToCsv,
    exportToJson,
    loadLogs,
    verifyIntegrity,
    integrity,
  } = useAuditLogStore();
  const [search, setSearch] = useState('');
  const [selectedAction, setSelectedAction] = useState<AuditActionType | 'ALL'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<AuditStatus | 'ALL'>('ALL');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadLogs();
    }
  }, [isOpen, loadLogs]);

  const filteredLogs = useMemo(() => {
    return filterLogs({
      search,
      action: selectedAction,
      status: selectedStatus,
    });
  }, [logs, search, selectedAction, selectedStatus, filterLogs]);

  if (!isOpen) return null;

  const handleVerifyIntegrity = async () => {
    setVerifying(true);
    try {
      const res = await verifyIntegrity();
      if (res.isValid) {
        toast.success(`Audit log chain verified (${res.totalEntries} entries checked)`);
      } else {
        toast.error(`Integrity check failed: ${res.error || 'Tampered log entries detected'}`);
      }
    } catch {
      toast.error('Failed to verify audit log integrity');
    } finally {
      setVerifying(false);
    }
  };

  const handleExportCsv = () => {
    try {
      const csv = exportToCsv(filteredLogs);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `datacore-audit-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Audit log exported as CSV');
    } catch {
      toast.error('Failed to export CSV');
    }
  };

  const handleExportJson = () => {
    try {
      const json = exportToJson(filteredLogs);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `datacore-audit-${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Audit log exported as JSON');
    } catch {
      toast.error('Failed to export JSON');
    }
  };

  const handleClearLogs = async () => {
    const confirmed = await showConfirmDialog('Are you sure you want to clear all audit logs?', {
      title: 'Clear Audit Logs',
      kind: 'warning',
    });
    if (confirmed) {
      clearLogs();
      toast.info('Audit logs cleared');
    }
  };

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + d.toLocaleDateString();
    } catch {
      return iso;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Security Audit Log"
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in"
    >
      <div
        className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800"
        style={{ color: 'var(--text-main, #0f172a)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Security & Audit Log
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  {filteredLogs.length} entries
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Track who executed queries, DDL modifications, and transactions
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Audit Log"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filters and Actions Bar */}
        <div className="flex flex-col gap-2.5 border-b border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search queries, users, databases..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800 shadow-2xs placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>

            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value as AuditActionType | 'ALL')}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 shadow-2xs focus:border-blue-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="ALL">All Actions</option>
              <option value="QUERY">Query</option>
              <option value="DDL">DDL (Schema)</option>
              <option value="DML">DML (Data)</option>
              <option value="TRANSACTION">Transaction</option>
              <option value="CONNECT">Connect</option>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="IMPORT">Import</option>
              <option value="EXPORT">Export</option>
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as AuditStatus | 'ALL')}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 shadow-2xs focus:border-blue-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="ALL">All Status</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILURE">Failure</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={filteredLogs.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={handleExportJson}
                disabled={filteredLogs.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                Export JSON
              </button>
              <button
                type="button"
                onClick={handleVerifyIntegrity}
                disabled={verifying}
                aria-label="Verify Chain Integrity"
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50/50 px-2.5 py-1 text-emerald-700 shadow-2xs hover:bg-emerald-100/60 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                {verifying ? 'Verifying...' : 'Verify Chain'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              {integrity && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                    integrity.isValid
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300'
                  }`}
                >
                  {integrity.isValid ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" />
                      Tamper-evident chain verified
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="h-3 w-3" />
                      Tamper detected
                    </>
                  )}
                </span>
              )}
              <button
                type="button"
                onClick={handleClearLogs}
                disabled={logs.length === 0}
                className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-700 disabled:opacity-40 dark:text-rose-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear All Logs
              </button>
            </div>
          </div>
        </div>

        {/* Logs List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-slate-500">
              <ShieldCheck className="h-10 w-10 mb-2 stroke-1 opacity-50" />
              <p className="text-sm font-medium">No audit log records found</p>
              <p className="text-xs">Database operations will be automatically recorded here.</p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              const isSuccess = log.status === 'SUCCESS';
              const isFailure = log.status === 'FAILURE';

              return (
                <div
                  key={log.id}
                  className={`rounded-lg border text-xs transition-all ${
                    isFailure
                      ? 'border-rose-200 bg-rose-50/30 dark:border-rose-900/40 dark:bg-rose-950/20'
                      : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-800/60'
                  }`}
                >
                  <div
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    className="flex cursor-pointer items-center justify-between p-3 select-none hover:bg-slate-50/80 dark:hover:bg-slate-800/80"
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      )}

                      {/* Status Icon */}
                      {isSuccess ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : isFailure ? (
                        <XCircle className="h-4 w-4 text-rose-500 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                      )}

                      {/* Action Pill */}
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300 shrink-0">
                        {log.action}
                      </span>

                      {/* User & Database Context */}
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {log.connectionName || 'Default Connection'}
                        {log.database ? ` / ${log.database}` : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-slate-400 dark:text-slate-500 shrink-0 ml-2">
                      {log.executionTimeMs !== undefined && (
                        <span className="font-mono text-[11px]">{log.executionTimeMs}ms</span>
                      )}
                      {log.rowsAffected !== undefined && (
                        <span>{log.rowsAffected} rows</span>
                      )}
                      <span className="text-[11px]">{formatTimestamp(log.timestamp)}</span>
                    </div>
                  </div>

                  {/* Expanded Query & Error details */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800/60 dark:bg-slate-900/60 space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3 w-3 text-slate-400" />
                          <span>User: <strong className="text-slate-700 dark:text-slate-200">{log.user || 'anonymous'}</strong></span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Database className="h-3 w-3 text-slate-400" />
                          <span>Status: <strong className={isSuccess ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{log.status}</strong></span>
                        </div>
                      </div>

                      {log.query && (
                        <div>
                          <div className="mb-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">Statement:</div>
                          <pre className="max-h-40 overflow-x-auto rounded bg-slate-900 p-2.5 font-mono text-[11px] text-emerald-400 dark:bg-black/80 whitespace-pre-wrap select-all">
                            {log.query}
                          </pre>
                        </div>
                      )}

                      {log.errorMessage && (
                        <div className="rounded bg-rose-100/70 p-2 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 text-[11px] font-mono">
                          Error: {log.errorMessage}
                        </div>
                      )}

                      {(log.prevHash || log.entryHash) && (
                        <div className="border-t border-slate-200/60 pt-2 dark:border-slate-800 text-[10px] font-mono space-y-1 text-slate-500 dark:text-slate-400">
                          {log.prevHash && (
                            <div className="flex items-center gap-1.5 truncate">
                              <Hash className="h-3 w-3 shrink-0 text-slate-400" />
                              <span className="text-slate-400">Prev:</span>
                              <span className="truncate">{log.prevHash}</span>
                            </div>
                          )}
                          {log.entryHash && (
                            <div className="flex items-center gap-1.5 truncate">
                              <Hash className="h-3 w-3 shrink-0 text-emerald-500" />
                              <span className="text-slate-400">Hash:</span>
                              <span className="truncate text-emerald-600 dark:text-emerald-400 font-semibold">
                                {log.entryHash}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
