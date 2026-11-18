import React, { useState, useEffect, useRef } from 'react';
import { Upload, X, Loader2, AlertCircle, CheckCircle2, Terminal, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { dbApi } from '../../api/db';
import { useConnectionStore } from '../../stores/connectionStore';
import { estimateNativeProgressPercent } from '../../stores/transferMonitorStore';
import { DbBadge } from '../sidebar/DbBadge';
import type { NativeCliStatus, NativeProgressEvent } from '../../types/dataTransfer';

export interface NativeRestoreModalProps {
  isOpen: boolean;
  connectionId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export const NativeRestoreModal: React.FC<NativeRestoreModalProps> = ({
  isOpen,
  connectionId,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const connections = useConnectionStore((s) => s.connections);
  const activeConn = connections.find((c) => c.id === connectionId);

  const [cliStatus, setCliStatus] = useState<NativeCliStatus | null>(null);
  const [checkingCli, setCheckingCli] = useState<boolean>(true);
  const [inputPath, setInputPath] = useState<string>('');
  const [clean, setClean] = useState<boolean>(true);
  const [singleTransaction, setSingleTransaction] = useState<boolean>(true);
  const [schemaOnly, setSchemaOnly] = useState<boolean>(false);
  const [dataOnly, setDataOnly] = useState<boolean>(false);
  const [parallelJobs, setParallelJobs] = useState<number>(1);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [progressPct, setProgressPct] = useState<number>(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const activeTaskIdRef = useRef<string | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && connectionId) {
      setCheckingCli(true);
      setError(null);
      setLogs([]);
      setIsRunning(false);
      setIsSuccess(false);
      setProgressPct(0);
      setInputPath('');

      dbApi
        .checkNativeCliAvailability(connectionId)
        .then((status) => {
          setCliStatus(status);
        })
        .catch((err) => {
          setError(String(err));
        })
        .finally(() => {
          setCheckingCli(false);
        });
    }
  }, [isOpen, connectionId]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  if (!isOpen) return null;

  const handlePickFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'Backup Files',
            extensions: ['dump', 'sql', 'db', 'tar', 'bak', 'backup'],
          },
        ],
      });
      if (selected && typeof selected === 'string') {
        setInputPath(selected);
      }
    } catch (err) {
      toast.error(`File selection failed: ${err}`);
    }
  };

  const handleStartRestore = async () => {
    if (!inputPath.trim()) {
      toast.error('Please select an input backup file to restore');
      return;
    }

    const taskId = `restore-${Date.now()}`;
    activeTaskIdRef.current = taskId;
    setIsRunning(true);
    setError(null);
    setIsSuccess(false);
    setProgressPct(5);
    setLogs([`[INFO] Starting native restore task: ${taskId}`, `[INFO] Target: ${activeConn?.name} (${activeConn?.database})`]);

    let unlisten: (() => void) | null = null;
    let emittedLines = 0;
    const heartbeat = setInterval(() => {
      setProgressPct((prev) => (prev < 85 ? Math.min(85, prev + 2) : prev));
    }, 600);
    try {
      unlisten = await listen<NativeProgressEvent>('native://progress', (event) => {
        if (event.payload.task_id === taskId) {
          emittedLines += 1;
          setLogs((prev) => [...prev, event.payload.line]);
          setProgressPct((prev) =>
            estimateNativeProgressPercent(prev, event.payload.line, emittedLines)
          );
        }
      });

      const exitCode = await dbApi.startNativeRestore(taskId, {
        connection_id: connectionId,
        input_file: inputPath,
        clean,
        single_transaction: parallelJobs > 1 ? false : singleTransaction,
        schema_only: schemaOnly,
        data_only: dataOnly,
        parallel_jobs: parallelJobs > 1 ? parallelJobs : undefined,
      });

      if (exitCode === 0) {
        setProgressPct(100);
        setIsSuccess(true);
        setLogs((prev) => [...prev, '[SUCCESS] Native restore completed successfully!']);
        toast.success('Native restore completed successfully');
        onSuccess?.();
      } else {
        setError(`Native restore failed with exit code: ${exitCode}`);
        setLogs((prev) => [...prev, `[ERROR] Process exited with code ${exitCode}`]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setLogs((prev) => [...prev, `[ERROR] ${msg}`]);
      toast.error(`Restore failed: ${msg}`);
    } finally {
      clearInterval(heartbeat);
      setIsRunning(false);
      activeTaskIdRef.current = null;
      if (unlisten) unlisten();
    }
  };

  const handleCancel = async () => {
    if (activeTaskIdRef.current) {
      try {
        await dbApi.cancelNativeTask(activeTaskIdRef.current);
        setLogs((prev) => [...prev, '[WARN] Cancel signal sent to restore process']);
        toast.info('Cancelling restore process...');
      } catch (err) {
        toast.error(`Failed to cancel: ${err}`);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-panel rounded-lg shadow-2xl border border-line text-text w-full max-w-xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line bg-sidebar">
          <div className="flex items-center space-x-2">
            <Upload className="w-5 h-5 text-emerald-500" />
            <h2 className="text-base font-semibold text-text">
              {t('transfer.nativeRestoreTitle', 'Native Database Restore')}
            </h2>
            {activeConn?.driver && <DbBadge driver={activeConn.driver} />}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isRunning}
            className="p-1 text-muted hover:text-text rounded disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* CLI Status Banner */}
          {checkingCli ? (
            <div className="flex items-center space-x-2 text-xs text-muted animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
              <span>Checking database CLI restore tools...</span>
            </div>
          ) : cliStatus?.available ? (
            <div className="flex items-start space-x-2 p-2.5 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 text-xs text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div className="flex-1 truncate">
                <span className="font-semibold">{cliStatus.cli_name}</span> detected:{' '}
                <span className="font-mono text-[11px] opacity-90 truncate">{cliStatus.path}</span>
                {cliStatus.version && <div className="text-[10px] opacity-75">{cliStatus.version}</div>}
              </div>
            </div>
          ) : (
            <div className="flex items-start space-x-2 p-2.5 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-xs text-amber-800 dark:text-amber-300">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">{cliStatus?.cli_name || 'CLI tool'} not found</span>
                <p className="mt-0.5 text-[11px] opacity-90">
                  {activeConn?.driver === 'postgres'
                    ? 'Please install PostgreSQL tools (e.g. `brew install libpq` or Postgres.app) to use pg_restore.'
                    : activeConn?.driver === 'mysql'
                    ? 'Please install MySQL client (e.g. `brew install mysql-client`).'
                    : 'sqlite3 CLI tool is missing from your PATH.'}
                </p>
              </div>
            </div>
          )}

          {/* Form Options */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-text mb-1">
                Backup File to Restore
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={inputPath}
                  onChange={(e) => setInputPath(e.target.value)}
                  disabled={isRunning}
                  placeholder="Select .dump, .sql or .db file..."
                  className="flex-1 px-3 py-1.5 text-xs bg-grid border border-line text-text rounded focus:outline-none focus:border-emerald-500 font-mono"
                />
                <button
                  type="button"
                  onClick={handlePickFile}
                  disabled={isRunning}
                  className="px-2.5 py-1.5 text-xs font-medium bg-sidebar hover:bg-black/5 dark:hover:bg-white/10 text-text border border-line rounded flex items-center space-x-1"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Browse</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <label className="flex items-center space-x-2 text-xs text-text cursor-pointer">
                <input
                  type="checkbox"
                  checked={clean}
                  disabled={isRunning}
                  onChange={(e) => setClean(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-0"
                />
                <span>Clean before restore (--clean)</span>
              </label>

              <label className="flex items-center space-x-2 text-xs text-text cursor-pointer">
                <input
                  type="checkbox"
                  checked={parallelJobs > 1 ? false : singleTransaction}
                  disabled={isRunning || parallelJobs > 1}
                  onChange={(e) => setSingleTransaction(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-0"
                />
                <span>Single transaction (--single-transaction)</span>
              </label>

              <label className="flex items-center space-x-2 text-xs text-text cursor-pointer">
                <input
                  type="checkbox"
                  checked={schemaOnly}
                  disabled={isRunning || dataOnly}
                  onChange={(e) => setSchemaOnly(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-0"
                />
                <span>Schema only</span>
              </label>

              <label className="flex items-center space-x-2 text-xs text-text cursor-pointer">
                <input
                  type="checkbox"
                  checked={dataOnly}
                  disabled={isRunning || schemaOnly}
                  onChange={(e) => setDataOnly(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-0"
                />
                <span>Data only</span>
              </label>
            </div>

            {activeConn?.driver === 'postgres' && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center space-x-2 text-xs text-text">
                  <span>Parallel Jobs (-j):</span>
                  <input
                    type="number"
                    min="1"
                    max="16"
                    value={parallelJobs}
                    disabled={isRunning}
                    onChange={(e) => setParallelJobs(Math.max(1, Number(e.target.value) || 1))}
                    className="w-16 px-2 py-1 bg-grid border border-line text-text rounded focus:outline-none focus:border-emerald-500"
                  />
                </div>
                {parallelJobs > 1 && (
                  <p className="text-[11px] text-amber-500">
                    {t(
                      'transfer.parallelRestoreNonAtomicWarning',
                      'Parallel restore (-j) is not atomic; --single-transaction is automatically disabled.'
                    )}
                  </p>
                )}
              </div>
            )}
          </div>

          {(isRunning || isSuccess) && (
            <div
              data-testid="native-restore-progress"
              className="p-3 bg-sidebar border border-line rounded space-y-1.5"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-text">
                  {isSuccess
                    ? t('transfer.restoreComplete', 'Restore Completed')
                    : t('transfer.restoring', 'Running native restore...')}
                </span>
                <span
                  data-testid="native-restore-percent"
                  className="font-mono font-semibold text-emerald-500"
                >
                  {progressPct}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-grid rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-200"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Terminal Logs Output */}
          {logs.length > 0 && (
            <div>
              <div className="flex items-center space-x-1.5 text-xs font-semibold text-text mb-1">
                <Terminal className="w-3.5 h-3.5 text-emerald-500" />
                <span>Process Output & Progress</span>
              </div>
              <div
                ref={logContainerRef}
                className="bg-black/90 text-green-400 font-mono text-[11px] p-3 rounded h-36 overflow-y-auto space-y-0.5 selection:bg-green-700 selection:text-white"
              >
                {logs.map((log, idx) => (
                  <div key={idx} className="whitespace-pre-wrap break-all leading-tight">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="p-2.5 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-500 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-line bg-sidebar">
          <div>
            {isRunning && (
              <button
                type="button"
                onClick={handleCancel}
                className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
              >
                Cancel Process
              </button>
            )}
          </div>
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isRunning}
              className="px-3.5 py-1.5 text-xs font-medium text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10 rounded transition-colors disabled:opacity-40"
            >
              {isSuccess ? 'Done' : 'Close'}
            </button>
            {!isSuccess && (
              <button
                type="button"
                onClick={handleStartRestore}
                disabled={isRunning || !cliStatus?.available}
                className="px-4 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors flex items-center space-x-1.5 disabled:opacity-40"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Restoring ({progressPct}%)...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>Start Restore</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
