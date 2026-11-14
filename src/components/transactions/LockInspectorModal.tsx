import React, { useState, useEffect } from 'react';
import {
  Lock,
  X,
  RefreshCw,
  AlertOctagon,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { dbApi } from '../../api/db';
import {
  buildLocksQuery,
  buildKillSessionSql,
  type LockProcessInfo,
} from '../../api/transactionHelpers';
import { formatCellValue } from '../../utils/cellFormatter';
import { useAuditLogStore } from '../../stores/auditLogStore';
import { showConfirmDialog } from '../../utils/dialog';

export interface LockInspectorModalProps {
  isOpen: boolean;
  connectionId: string;
  driver?: string;
  connectionName?: string;
  onClose: () => void;
}

export const LockInspectorModal: React.FC<LockInspectorModalProps> = ({
  isOpen,
  connectionId,
  driver = 'postgres',
  connectionName,
  onClose,
}) => {
  const [locks, setLocks] = useState<LockProcessInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isKilling, setIsKilling] = useState<string | null>(null);

  const fetchLocks = async () => {
    setIsLoading(true);
    const sql = buildLocksQuery(driver);
    try {
      const res = await dbApi.executeDirectQuery(connectionId, sql);
      if (!res || !res.rows) {
        setLocks([]);
        return;
      }

      const rows = res.rows;
      const parsed: LockProcessInfo[] = [];

      if (driver.toLowerCase() === 'mysql') {
        // [thread_id, state, started, query, rows_locked, wait_started]
        for (const r of rows) {
          const id = String(formatCellValue(r[0]));
          const state = String(formatCellValue(r[1]));
          const query = String(formatCellValue(r[3]) || '');
          const waitStarted = formatCellValue(r[5]);
          const isWaiting = waitStarted !== null && waitStarted !== 'null' && waitStarted !== '';

          parsed.push({
            id,
            lockType: 'InnoDB Trx',
            mode: state,
            granted: !isWaiting,
            query,
            isDeadlockCandidate: isWaiting,
          });
        }
      } else if (driver.toLowerCase() === 'sqlite') {
        // PRAGMA lock_status
        for (const r of rows) {
          parsed.push({
            id: 'sqlite-main',
            lockType: String(formatCellValue(r[0])),
            mode: String(formatCellValue(r[1])),
            granted: true,
          });
        }
      } else {
        // Postgres: [pid, user, database, locktype, mode, granted, query, duration_seconds, wait_event_type, wait_event]
        for (const r of rows) {
          const id = String(formatCellValue(r[0]));
          const user = String(formatCellValue(r[1]) || '');
          const database = String(formatCellValue(r[2]) || '');
          const lockType = String(formatCellValue(r[3]) || '');
          const mode = String(formatCellValue(r[4]) || '');
          const grantedVal = formatCellValue(r[5]);
          const granted = grantedVal === 'true' || grantedVal === 't';
          const query = String(formatCellValue(r[6]) || '');
          const duration = Number(formatCellValue(r[7])) || 0;
          const waitEvent = String(formatCellValue(r[9]) || '');

          parsed.push({
            id,
            user,
            database,
            lockType,
            mode,
            granted,
            query,
            durationSeconds: duration,
            waitingFor: waitEvent || undefined,
            isDeadlockCandidate: !granted || duration > 30,
          });
        }
      }

      setLocks(parsed);
    } catch (err: unknown) {
      console.error('Failed to inspect locks:', err);
      // Gracefully set empty on permission error or feature not enabled
      setLocks([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLocks();
    }
  }, [isOpen, connectionId, driver]);

  if (!isOpen) return null;

  const handleKill = async (pid: string) => {
    const confirmed = await showConfirmDialog(
      `Terminate session / process ${pid}? This will abort its active transaction.`,
      { title: 'Terminate Session', kind: 'warning' }
    );
    if (!confirmed) {
      return;
    }

    setIsKilling(pid);
    const sql = buildKillSessionSql(pid, driver);
    try {
      await dbApi.executeDirectQuery(connectionId, sql);
      toast.success(`Session ${pid} terminated`);

      useAuditLogStore.getState().addLog({
        action: 'TRANSACTION',
        connectionName,
        query: sql,
        status: 'SUCCESS',
      });

      await fetchLocks();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to terminate session: ${msg}`);
    } finally {
      setIsKilling(null);
    }
  };

  const deadlocksCount = locks.filter((l) => l.isDeadlockCandidate).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Lock and Concurrency Inspector"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in"
    >
      <div className="relative w-full max-w-3xl rounded-xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Lock & Concurrency Inspector
                {deadlocksCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                    <AlertOctagon className="h-3 w-3" />
                    {deadlocksCount} Waiting / Blocked
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inspect active row/table locks, blocked transactions, and deadlock candidates
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchLocks}
              disabled={isLoading}
              aria-label="Refresh"
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-blue-500' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {locks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-slate-400">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-2 opacity-80" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No Blocking Locks Detected</p>
              <p className="text-xs text-slate-500">Database concurrency is healthy; no transactions are currently waiting on locks.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {locks.map((item, idx) => (
                <div
                  key={`${item.id}-${idx}`}
                  className={`rounded-lg border p-3 text-xs transition-colors ${
                    !item.granted
                      ? 'border-rose-300 bg-rose-50/50 dark:border-rose-900/60 dark:bg-rose-950/20'
                      : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        PID / Thread: {item.id}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          item.granted
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                        }`}
                      >
                        {item.granted ? 'GRANTED' : 'WAITING / BLOCKED'}
                      </span>
                      {item.lockType && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                          {item.lockType} ({item.mode})
                        </span>
                      )}
                    </div>

                    {driver.toLowerCase() !== 'sqlite' && (
                      <button
                        type="button"
                        onClick={() => handleKill(item.id)}
                        disabled={isKilling === item.id}
                        className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
                      >
                        <Trash2 className="h-3 w-3" />
                        Kill Session
                      </button>
                    )}
                  </div>

                  {item.query && (
                    <div className="mb-1.5">
                      <pre className="max-h-24 overflow-x-auto rounded bg-slate-900 p-2 font-mono text-[11px] text-emerald-400 dark:bg-black/90 whitespace-pre-wrap">
                        {item.query}
                      </pre>
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-slate-400 text-[11px]">
                    {item.user && <span>User: <strong className="text-slate-600 dark:text-slate-300">{item.user}</strong></span>}
                    {item.database && <span>DB: <strong className="text-slate-600 dark:text-slate-300">{item.database}</strong></span>}
                    {item.durationSeconds !== undefined && (
                      <span>Duration: <strong className="text-slate-600 dark:text-slate-300">{item.durationSeconds}s</strong></span>
                    )}
                    {item.waitingFor && (
                      <span className="text-rose-600 dark:text-rose-400">Wait Event: {item.waitingFor}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-right dark:border-slate-800 dark:bg-slate-900/60">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
