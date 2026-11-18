import React, { useState, useEffect, useRef } from 'react';
import { Upload, X, Loader2, Database } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { dbApi } from '../../api/db';
import { pickSqlImportFile, onTransferProgress, cancelTransfer } from '../../api/dataTransferApi';
import { useConnectionStore } from '../../stores/connectionStore';
import {
  useTransferMonitorStore,
  calculateTransferPercent,
} from '../../stores/transferMonitorStore';
import { DbBadge } from '../sidebar/DbBadge';
import type { SqlImportResult, TransferProgress } from '../../types/dataTransfer';
import type { DatabaseDriver } from '../../types/db';

export interface ImportSqlModalProps {
  isOpen: boolean;
  connectionId: string;
  schemaName?: string;
  onClose: () => void;
  onSuccess?: (result: SqlImportResult) => void;
}

export const ImportSqlModal: React.FC<ImportSqlModalProps> = ({
  isOpen,
  connectionId,
  schemaName,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const connections = useConnectionStore((s) => s.connections);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>(connectionId);
  const [selectedSchemaName, setSelectedSchemaName] = useState<string>(schemaName || '');
  const [filePath, setFilePath] = useState<string>('');
  const [errorPolicy, setErrorPolicy] = useState<'abort' | 'continue'>('abort');
  const [loading, setLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeJobIdRef = useRef<string | null>(null);

  const fallbackDriver: DatabaseDriver = schemaName ? 'postgres' : 'sqlite';
  const connOptions = connections.some((c) => c.id === selectedConnectionId)
    ? connections
    : [{ id: selectedConnectionId, name: selectedConnectionId, driver: fallbackDriver, database: '' }, ...connections];

  const destConn = connections.find((c) => c.id === selectedConnectionId) || connOptions.find((c) => c.id === selectedConnectionId);
  const isSqlite = destConn?.driver === 'sqlite';
  const isMysql = destConn?.driver === 'mysql';

  useEffect(() => {
    if (isOpen) {
      setSelectedConnectionId(connectionId);
      const conn = connections.find((c) => c.id === connectionId) || { driver: fallbackDriver, database: '' };
      if (conn?.driver === 'sqlite') {
        setSelectedSchemaName('');
      } else if (conn?.driver === 'mysql') {
        setSelectedSchemaName(schemaName || conn?.database || '');
      } else {
        setSelectedSchemaName(schemaName || 'public');
      }
      setFilePath('');
      setErrorPolicy('abort');
      setLoading(false);
      setProgress(null);
      setError(null);
      activeJobIdRef.current = null;
    }
  }, [isOpen, connectionId, schemaName, connections, fallbackDriver]);

  const handleConnectionChange = (newConnId: string) => {
    setSelectedConnectionId(newConnId);
    const newConn = connections.find((c) => c.id === newConnId);
    if (newConn?.driver === 'sqlite') {
      setSelectedSchemaName('');
    } else if (newConn?.driver === 'mysql') {
      setSelectedSchemaName(newConn.database || '');
    } else if (newConn?.driver === 'postgres') {
      setSelectedSchemaName(selectedSchemaName || 'public');
    }
  };

  const effectiveSchema = isSqlite ? undefined : (selectedSchemaName.trim() || undefined);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    if (isOpen && loading && typeof onTransferProgress === 'function') {
      Promise.resolve(
        onTransferProgress((p) => {
          if (!activeJobIdRef.current || !p.job_id || p.job_id === activeJobIdRef.current) {
            setProgress(p);
          }
          useTransferMonitorStore.getState().handleProgress(p);
        })
      )
        .then((unsub) => {
          if (typeof unsub === 'function') unlisten = unsub;
        })
        .catch(() => {
          // Ignore listener registration errors in non-Tauri environments
        });
    }
    return () => {
      if (unlisten) unlisten();
    };
  }, [isOpen, loading]);

  if (!isOpen) return null;

  const handleCancelOrClose = async () => {
    if (loading && activeJobIdRef.current) {
      try {
        await useTransferMonitorStore.getState().cancelJob(activeJobIdRef.current);
        toast.info(t('transfer.importCancelled', 'SQL import cancelled by user'));
      } catch (err) {
        console.error('Failed to cancel SQL import:', err);
        try {
          await cancelTransfer(activeJobIdRef.current);
        } catch {
          // ignore fallback cancel error
        }
      }
      return;
    }
    onClose();
  };

  const handlePickFile = async () => {
    try {
      const selected = await pickSqlImportFile();
      if (selected) {
        setFilePath(selected);
        setError(null);
      }
    } catch (err: unknown) {
      console.error('File pick error:', err);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!filePath.trim()) {
      setError(t('transfer.chooseValidFile', 'Please choose a valid SQL script file to import.'));
      return;
    }

    const jobId = `import-sql-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    activeJobIdRef.current = jobId;
    setLoading(true);
    setError(null);
    setProgress({
      job_id: jobId,
      current_row: 0,
      percent: 0,
      status: t('transfer.executingStatements', 'Executing statements...'),
    });

    const fileName = filePath.trim().split(/[\\/]/).pop() || 'script.sql';
    useTransferMonitorStore.getState().startJob({
      jobId,
      label: `Import SQL ${fileName}`,
      direction: 'import',
    });

    try {
      const result = await dbApi.importSql({
        connectionId: selectedConnectionId,
        schema: effectiveSchema,
        filePath: filePath.trim(),
        errorPolicy,
        jobId,
      });

      useTransferMonitorStore.getState().completeJob(jobId, {
        rowsProcessed: result.successfulStatements,
      });
      setProgress({
        job_id: jobId,
        current_row: result.successfulStatements,
        total_rows: result.totalStatements || undefined,
        percent: 100,
        status: 'done',
      });

      toast.success(
        t('transfer.importSuccessMsg', {
          success: result.successfulStatements,
          total: result.totalStatements,
          defaultValue: `SQL Script executed: ${result.successfulStatements} of ${result.totalStatements} statements succeeded.`,
        })
      );

      if (onSuccess) {
        onSuccess(result);
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('cancelled')) {
        toast.info(t('transfer.importCancelled', 'SQL import cancelled by user'));
      } else {
        useTransferMonitorStore.getState().failJob(jobId, msg);
        setError(msg);
        toast.error(t('transfer.importFailedMsg', { error: msg, defaultValue: `SQL Import failed: ${msg}` }));
      }
    } finally {
      setLoading(false);
      activeJobIdRef.current = null;
    }
  };

  const progressPct = calculateTransferPercent(progress);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-sql-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div className="bg-panel border border-line rounded-lg shadow-2xl w-full max-w-md overflow-hidden text-text">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line bg-sidebar">
          <div className="flex items-center space-x-2">
            <Upload className="w-4 h-4 text-emerald-500" />
            <h2 id="import-sql-title" className="text-sm font-semibold text-text">
              {t('transfer.sqlImportTitle', 'Execute SQL Script (Import)')}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleCancelOrClose}
            className="text-muted hover:text-text p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleImport} className="p-5 space-y-4">
          {error && (
            <div className="p-3 text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded">
              {error}
            </div>
          )}

          {/* Destination Connection Context Card */}
          <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/50 rounded-lg space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              <div className="flex items-center space-x-1.5">
                <Database className="w-3.5 h-3.5" />
                <span>{t('transfer.destServerDb', 'Destination Server & Database')}</span>
              </div>
              {destConn && <DbBadge driver={destConn.driver} />}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <label
                  htmlFor="destination-connection-select"
                  className="block text-[11px] font-medium text-muted mb-1"
                >
                  {t('transfer.connection', 'Connection:')}
                </label>
                <select
                  id="destination-connection-select"
                  data-testid="destination-connection-select"
                  value={selectedConnectionId}
                  onChange={(e) => handleConnectionChange(e.target.value)}
                  disabled={loading}
                  className="w-full h-[34px] px-2.5 py-1.5 text-xs bg-grid border border-line rounded text-text focus:outline-none focus:border-emerald-500 truncate"
                >
                  {connOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.driver})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="destination-schema-input"
                  className="block text-[11px] font-medium text-muted mb-1"
                >
                  {isMysql ? t('transfer.dbSchema', 'Database / Schema:') : t('transfer.schema', 'Schema:')}
                </label>
                <input
                  id="destination-schema-input"
                  data-testid="destination-schema-input"
                  type="text"
                  value={isSqlite ? '' : selectedSchemaName}
                  onChange={(e) => setSelectedSchemaName(e.target.value)}
                  placeholder={
                    isSqlite
                      ? 'N/A (SQLite)'
                      : isMysql
                      ? (destConn?.database || 'e.g. database_name')
                      : 'e.g. public'
                  }
                  disabled={loading || isSqlite}
                  className={`w-full h-[34px] px-2.5 py-1.5 text-xs font-mono border rounded focus:outline-none transition-colors ${
                    isSqlite
                      ? 'bg-sidebar border-line text-muted opacity-70 cursor-not-allowed'
                      : 'bg-grid border-line text-text focus:border-emerald-500'
                  }`}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              {t('transfer.targetDbSchema', 'Target Database / Schema')}
            </label>
            <div className="px-3 py-2 text-xs font-mono bg-sidebar border border-line rounded text-text">
              {isSqlite
                ? t('transfer.sqliteDb', { name: destConn?.name || 'Local', defaultValue: `SQLite Database (${destConn?.name || 'Local'})` })
                : isMysql
                ? (selectedSchemaName || destConn?.database || t('transfer.defaultDb', 'Default Database'))
                : (selectedSchemaName || 'public')}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              {t('transfer.sqlFile', 'SQL File')} <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder={t('transfer.sqlFilePlaceholder', 'Select or enter path to .sql file')}
                disabled={loading}
                className="flex-1 px-3 py-1.5 text-xs font-mono bg-grid border border-line rounded text-text focus:outline-none focus:border-emerald-500 truncate"
              />
              <button
                type="button"
                onClick={handlePickFile}
                disabled={loading}
                className="px-3 py-1.5 text-xs font-medium bg-sidebar hover:bg-black/5 dark:hover:bg-white/10 text-text rounded border border-line transition-colors shrink-0"
              >
                {t('transfer.browse', 'Browse...')}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              {t('transfer.errorPolicy', 'Error Handling Policy')}
            </label>
            <div className="flex items-center gap-4 text-xs">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="errorPolicy"
                  value="abort"
                  checked={errorPolicy === 'abort'}
                  onChange={() => setErrorPolicy('abort')}
                  disabled={loading}
                  className="text-emerald-500 focus:ring-emerald-500 bg-grid border-line"
                />
                <span className="text-text">{t('transfer.abortOnError', 'Abort on error (Rollback)')}</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="errorPolicy"
                  value="continue"
                  checked={errorPolicy === 'continue'}
                  onChange={() => setErrorPolicy('continue')}
                  disabled={loading}
                  className="text-emerald-500 focus:ring-emerald-500 bg-grid border-line"
                />
                <span className="text-text">{t('transfer.continueOnError', 'Continue on error')}</span>
              </label>
            </div>
          </div>

          {/* Progress display */}
          {loading && (
            <div className="p-3 bg-sidebar border border-line rounded space-y-2">
              <div className="flex items-center justify-between text-xs text-text">
                <span className="truncate pr-2">
                  {progress?.status || t('transfer.executingStatements', 'Executing statements...')}
                </span>
                <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
                  {progress?.total_rows !== undefined && progress.total_rows > 0 && (
                    <span className="text-muted">
                      {progress.current_row} / {progress.total_rows}
                    </span>
                  )}
                  <span
                    data-testid="import-sql-percent"
                    className="font-semibold text-emerald-500"
                  >
                    {progressPct}%
                  </span>
                </div>
              </div>
              <div className="w-full bg-grid h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-150"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-line">
            <button
              type="button"
              onClick={handleCancelOrClose}
              className="px-3.5 py-1.5 text-xs font-medium rounded text-muted hover:text-text bg-sidebar hover:bg-black/5 dark:hover:bg-white/10 border border-line transition-colors"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={loading || !filePath.trim()}
              className="inline-flex items-center space-x-1.5 px-4 py-1.5 text-xs font-medium rounded text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors shadow-sm"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{t('transfer.executeSqlScript', 'Execute SQL Script')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
