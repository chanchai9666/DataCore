import React, { useState, useEffect, useRef } from 'react';
import { Download, X, Loader2, AlertCircle, CheckCircle2, Terminal, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { save } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { dbApi } from '../../api/db';
import { useConnectionStore } from '../../stores/connectionStore';
import { estimateNativeProgressPercent } from '../../stores/transferMonitorStore';
import { DbBadge } from '../sidebar/DbBadge';
import type { NativeCliStatus, NativeProgressEvent } from '../../types/dataTransfer';

export interface NativeBackupModalProps {
  isOpen: boolean;
  connectionId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export const NativeBackupModal: React.FC<NativeBackupModalProps> = ({
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
  const [format, setFormat] = useState<string>('custom');
  const [schemaOnly, setSchemaOnly] = useState<boolean>(false);
  const [dataOnly, setDataOnly] = useState<boolean>(false);
  const [clean, setClean] = useState<boolean>(true);
  const [compression, setCompression] = useState<number>(6);
  const [parallelJobs, setParallelJobs] = useState<number>(1);
  const [outputPath, setOutputPath] = useState<string>('');
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

      const defaultExt = activeConn?.driver === 'postgres' ? 'dump' : activeConn?.driver === 'sqlite' ? 'db' : 'sql';
      const defaultFilename = `${activeConn?.database || 'backup'}_${new Date().toISOString().slice(0, 10)}.${defaultExt}`;
      setOutputPath(defaultFilename);

      if (activeConn?.driver === 'postgres') {
        setFormat('custom');
      } else {
        setFormat('plain');
      }

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
  }, [isOpen, connectionId, activeConn]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  if (!isOpen) return null;

  const handlePickFile = async () => {
    try {
      const selected = await save({
        defaultPath: outputPath,
        filters: [
          {
            name: 'Backup File',
            extensions: ['dump', 'sql', 'db', 'tar', 'bak'],
          },
        ],
      });
      if (selected) {
        setOutputPath(selected);
      }
    } catch (err) {
      toast.error(`File selection failed: ${err}`);
    }
  };

  const handleStartBackup = async () => {
    if (!outputPath.trim()) {
      toast.error('Please specify an output file path');
      return;
    }

    const taskId = `backup-${Date.now()}`;
    activeTaskIdRef.current = taskId;
    setIsRunning(true);
    setError(null);
    setIsSuccess(false);
    setProgressPct(5);
    setLogs([`[INFO] Starting native backup task: ${taskId}`, `[INFO] CLI Tool: ${cliStatus?.path || cliStatus?.cli_name}`]);

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

      const exitCode = await dbApi.startNativeBackup(taskId, {
        connection_id: connectionId,
        output_file: outputPath,
        format,
        schema_only: schemaOnly,
        data_only: dataOnly,
        clean,
        compression_level: compression > 0 ? compression : undefined,
        parallel_jobs: format === 'directory' && parallelJobs > 1 ? parallelJobs : undefined,
      });

      if (exitCode === 0) {
        setProgressPct(100);
        setIsSuccess(true);
        setLogs((prev) => [...prev, '[SUCCESS] Native backup finished successfully!']);
        toast.success('Native backup completed successfully');
        onSuccess?.();
      } else {
        setError(`Native backup failed with exit code: ${exitCode}`);
        setLogs((prev) => [...prev, `[ERROR] Process exited with code ${exitCode}`]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setLogs((prev) => [...prev, `[ERROR] ${msg}`]);
      toast.error(`Backup failed: ${msg}`);
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
        setLogs((prev) => [...prev, '[WARN] Cancel signal sent to child process']);
        toast.info('Cancelling backup process...');
      } catch (err) {
        toast.error(`Failed to cancel: ${err}`);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            <Download className="w-5 h-5 text-blue-500" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {t('transfer.nativeBackupTitle', 'Native Database Backup')}
            </h2>
            {activeConn?.driver && <DbBadge driver={activeConn.driver} />}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isRunning}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* CLI Status Banner */}
          {checkingCli ? (
            <div className="flex items-center space-x-2 text-xs text-gray-500 animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              <span>Checking database CLI client tools...</span>
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
                    ? 'Please install PostgreSQL tools (e.g. `brew install libpq` or Postgres.app) to use native backup.'
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
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Output File Destination
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={outputPath}
                  onChange={(e) => setOutputPath(e.target.value)}
                  disabled={isRunning}
                  placeholder="/path/to/backup.dump"
                  className="flex-1 px-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:border-blue-500 font-mono"
                />
                <button
                  type="button"
                  onClick={handlePickFile}
                  disabled={isRunning}
                  className="px-2.5 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded flex items-center space-x-1"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Browse</span>
                </button>
              </div>
            </div>

            {activeConn?.driver === 'postgres' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Format
                </label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  disabled={isRunning}
                  className="w-full px-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:border-blue-500"
                >
                  <option value="custom">Custom Archive (-Fc - recommended for pg_restore)</option>
                  <option value="plain">Plain SQL Script (-Fp)</option>
                  <option value="tar">Tar Archive (-Ft)</option>
                  <option value="directory">Directory Format (-Fd)</option>
                </select>
              </div>
            )}

            {activeConn?.driver === 'postgres' && format === 'directory' && (
              <div className="flex items-center space-x-2 text-xs text-gray-700 dark:text-gray-300">
                <span>Parallel Jobs (-j):</span>
                <input
                  type="number"
                  min="1"
                  max="16"
                  value={parallelJobs}
                  disabled={isRunning}
                  onChange={(e) => setParallelJobs(Math.max(1, Number(e.target.value) || 1))}
                  className="w-16 px-2 py-1 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-1">
              <label className="flex items-center space-x-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={schemaOnly}
                  disabled={isRunning || dataOnly}
                  onChange={(e) => setSchemaOnly(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-0"
                />
                <span>Schema only (No data)</span>
              </label>

              <label className="flex items-center space-x-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dataOnly}
                  disabled={isRunning || schemaOnly}
                  onChange={(e) => setDataOnly(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-0"
                />
                <span>Data only (No DDL)</span>
              </label>

              <label className="flex items-center space-x-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clean}
                  disabled={isRunning}
                  onChange={(e) => setClean(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-0"
                />
                <span>Include DROP commands (--clean)</span>
              </label>

              {activeConn?.driver === 'postgres' && (
                <div className="flex items-center space-x-2 text-xs text-gray-700 dark:text-gray-300">
                  <span>Compression (0-9):</span>
                  <input
                    type="number"
                    min="0"
                    max="9"
                    value={compression}
                    onChange={(e) => setCompression(Number(e.target.value))}
                    disabled={isRunning}
                    className="w-14 px-2 py-0.5 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded"
                  />
                </div>
              )}
            </div>
          </div>

          {(isRunning || isSuccess) && (
            <div
              data-testid="native-backup-progress"
              className="p-3 bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 rounded space-y-1.5"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {isSuccess
                    ? t('transfer.backupComplete', 'Backup Completed')
                    : t('transfer.backingUp', 'Running native backup...')}
                </span>
                <span
                  data-testid="native-backup-percent"
                  className={`font-mono font-semibold ${
                    isSuccess ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400'
                  }`}
                >
                  {progressPct}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-200 ${
                    isSuccess ? 'bg-emerald-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Terminal Logs Output */}
          {logs.length > 0 && (
            <div>
              <div className="flex items-center space-x-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                <Terminal className="w-3.5 h-3.5 text-blue-400" />
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
            <div className="p-2.5 rounded bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 text-xs text-red-600 dark:text-red-400 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
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
              className="px-3.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-40"
            >
              {isSuccess ? 'Done' : 'Close'}
            </button>
            {!isSuccess && (
              <button
                type="button"
                onClick={handleStartBackup}
                disabled={isRunning || !cliStatus?.available}
                className="px-4 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center space-x-1.5 disabled:opacity-40"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Backing up ({progressPct}%)...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Start Backup</span>
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
