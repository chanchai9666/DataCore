import React, { useState, useEffect, useRef } from 'react';
import { Download, X, Loader2, FileCode, Database } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { dbApi } from '../../api/db';
import {
  pickSqlExportFile,
  cancelTransfer,
  onTransferProgress,
} from '../../api/dataTransferApi';
import { useConnectionStore } from '../../stores/connectionStore';
import {
  useTransferMonitorStore,
  calculateTransferPercent,
} from '../../stores/transferMonitorStore';
import { DbBadge } from '../sidebar/DbBadge';
import type { SqlExportResult, TransferProgress } from '../../types/dataTransfer';
import type { DatabaseDriver } from '../../types/db';

export interface ExportSqlModalProps {
  isOpen: boolean;
  connectionId: string;
  schemaName?: string;
  tableName?: string;
  tableNames?: string[];
  onClose: () => void;
  onSuccess?: (result: SqlExportResult) => void;
}

export type SqlDumpMode = 'both' | 'structure' | 'data';

export const ExportSqlModal: React.FC<ExportSqlModalProps> = ({
  isOpen,
  connectionId,
  schemaName,
  tableName,
  tableNames,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const connections = useConnectionStore((s) => s.connections);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>(connectionId);
  const [selectedSchemaName, setSelectedSchemaName] = useState<string>(schemaName || '');
  const [mode, setMode] = useState<SqlDumpMode>('both');
  const [includeDropTable, setIncludeDropTable] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeJobIdRef = useRef<string | null>(null);

  const fallbackDriver: DatabaseDriver = schemaName ? 'postgres' : 'sqlite';
  const connOptions = connections.some((c) => c.id === selectedConnectionId)
    ? connections
    : [{ id: selectedConnectionId, name: selectedConnectionId, driver: fallbackDriver, database: '' }, ...connections];

  const activeConn = connections.find((c) => c.id === selectedConnectionId) || connOptions.find((c) => c.id === selectedConnectionId);
  const isSqlite = activeConn?.driver === 'sqlite';
  const isMysql = activeConn?.driver === 'mysql';

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
      setMode('both');
      setIncludeDropTable(true);
      setLoading(false);
      setProgress(null);
      setError(null);
      activeJobIdRef.current = null;
    }
  }, [isOpen, connectionId, schemaName, connections, fallbackDriver]);

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
  const hasMultipleTables = Boolean(tableNames && tableNames.length > 0);
  const targetName =
    tableName ||
    (hasMultipleTables
      ? `${tableNames!.length}_tables_dump`
      : effectiveSchema
      ? `${effectiveSchema}_dump`
      : activeConn?.name
      ? `${activeConn.name}_dump`
      : 'database_dump');

  const handleCancelExport = async () => {
    if (loading && activeJobIdRef.current) {
      try {
        await useTransferMonitorStore.getState().cancelJob(activeJobIdRef.current);
        toast.info(t('transfer.exportCancelled', 'Export cancelled'));
      } catch (err) {
        console.error('Failed to cancel export:', err);
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

  const handleExport = async () => {
    setError(null);
    let currentJobId: string | null = null;
    try {
      const filePath = await pickSqlExportFile(`${targetName}.sql`);
      if (!filePath) {
        return; // User cancelled
      }

      const jobId = `export-sql-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      currentJobId = jobId;
      activeJobIdRef.current = jobId;
      setLoading(true);
      setProgress({
        job_id: jobId,
        current_row: 0,
        percent: 0,
        status: t('transfer.preparingExport', 'Preparing SQL dump...'),
      });

      let tables = hasMultipleTables ? [...tableNames!] : tableName ? [tableName] : [];
      let estimatedTotalRows: number | undefined;
      if (tables.length === 0) {
        try {
          const allMeta = await dbApi.getTableListMetadata(
            selectedConnectionId,
            effectiveSchema
          );
          tables = allMeta.map((t) => t.name);
          const sum = allMeta.reduce((acc, item) => acc + (item.approxRowCount ?? 0), 0);
          if (sum > 0) estimatedTotalRows = sum;
        } catch {
          // Fallback handled automatically by backend if tables array is empty
        }
      }

      useTransferMonitorStore.getState().startJob({
        jobId,
        label: `Export SQL ${targetName}.sql`,
        direction: 'export',
        totalRows: estimatedTotalRows,
      });

      const result = await dbApi.exportSql({
        connectionId: selectedConnectionId,
        schema: effectiveSchema,
        tables,
        filePath,
        includeDropTable,
        includeStructure: mode === 'both' || mode === 'structure',
        includeData: mode === 'both' || mode === 'data',
        batchSize: 500,
        jobId,
      });

      useTransferMonitorStore.getState().completeJob(jobId, {
        rowsProcessed: result.totalRows,
        bytesWritten: result.fileSizeBytes,
      });
      setProgress({
        job_id: jobId,
        current_row: result.totalRows,
        total_rows: result.totalRows || undefined,
        percent: 100,
        status: 'done',
      });

      const sizeKb = (result.fileSizeBytes / 1024).toFixed(1);
      toast.success(
        t('transfer.exportSuccessMsg', {
          tables: result.totalTables,
          rows: result.totalRows.toLocaleString(),
          size: sizeKb,
          defaultValue: `Exported ${result.totalTables} table(s), ${result.totalRows.toLocaleString()} rows (${sizeKb} KB) to SQL file.`,
        })
      );

      if (onSuccess) {
        onSuccess(result);
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('cancel')) {
        toast.info(t('transfer.exportCancelled', 'Export cancelled'));
      } else {
        if (currentJobId) {
          useTransferMonitorStore.getState().failJob(currentJobId, msg);
        }
        setError(msg);
        toast.error(t('transfer.exportFailedMsg', { error: msg, defaultValue: `Export failed: ${msg}` }));
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
      aria-labelledby="export-sql-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div className="bg-panel border border-line rounded-lg shadow-2xl w-full max-w-md overflow-hidden text-text">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line bg-sidebar">
          <div className="flex items-center space-x-2">
            <Download className="w-4 h-4 text-blue-500" />
            <h2 id="export-sql-title" className="text-sm font-semibold text-text">
              {t('transfer.sqlExportTitle', 'Export as SQL Dump')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-muted hover:text-text p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4">
          {error && (
            <div className="p-3 text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded">
              {error}
            </div>
          )}

          {/* Source Connection Context Card */}
          <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-900/50 rounded-lg space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-blue-700 dark:text-blue-300">
              <div className="flex items-center space-x-1.5">
                <Database className="w-3.5 h-3.5" />
                <span>{t('transfer.sourceServerDb', 'Source Server & Database')}</span>
              </div>
              {activeConn && <DbBadge driver={activeConn.driver} />}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <label
                  htmlFor="source-connection-select"
                  className="block text-[11px] font-medium text-muted mb-1"
                >
                  {t('transfer.connection', 'Connection:')}
                </label>
                <select
                  id="source-connection-select"
                  data-testid="source-connection-select"
                  value={selectedConnectionId}
                  onChange={(e) => handleConnectionChange(e.target.value)}
                  disabled={loading}
                  className="w-full h-[34px] px-2.5 py-1.5 text-xs bg-grid border border-line rounded text-text focus:outline-none focus:border-blue-500 truncate"
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
                  htmlFor="source-schema-input"
                  className="block text-[11px] font-medium text-muted mb-1"
                >
                  {isMysql ? t('transfer.dbSchema', 'Database / Schema:') : t('transfer.schema', 'Schema:')}
                </label>
                <input
                  id="source-schema-input"
                  data-testid="source-schema-input"
                  type="text"
                  value={isSqlite ? '' : selectedSchemaName}
                  onChange={(e) => setSelectedSchemaName(e.target.value)}
                  placeholder={
                    isSqlite
                      ? 'N/A (SQLite)'
                      : isMysql
                      ? (activeConn?.database || 'e.g. database_name')
                      : 'e.g. public'
                  }
                  disabled={loading || isSqlite}
                  className={`w-full h-[34px] px-2.5 py-1.5 text-xs font-mono border rounded focus:outline-none transition-colors ${
                    isSqlite
                      ? 'bg-sidebar border-line text-muted opacity-70 cursor-not-allowed'
                      : 'bg-grid border-line text-text focus:border-blue-500'
                  }`}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              {t('transfer.targetScope', 'Target Scope')}
            </label>
            <div className="px-3 py-2 text-xs font-mono bg-sidebar border border-line rounded text-text">
              {hasMultipleTables
                ? `${tableNames!.length} tables: ${tableNames!.join(', ')}`
                : isSqlite
                ? tableName || t('transfer.allDatabaseTables', 'All database tables')
                : isMysql
                ? tableName
                  ? selectedSchemaName
                    ? `${selectedSchemaName}.${tableName}`
                    : tableName
                  : selectedSchemaName
                  ? t('transfer.allTablesInDb', { name: selectedSchemaName, defaultValue: `All tables in database '${selectedSchemaName}'` })
                  : t('transfer.allDatabaseTables', 'All database tables')
                : tableName
                ? `${selectedSchemaName ? selectedSchemaName + '.' : ''}${tableName}`
                : selectedSchemaName
                ? t('transfer.allTablesInSchema', { name: selectedSchemaName, defaultValue: `All tables in schema '${selectedSchemaName}'` })
                : t('transfer.allDatabaseTables', 'All database tables')}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-2">
              {t('transfer.dumpContent', 'Dump Content')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMode('both')}
                disabled={loading}
                className={`flex flex-col items-center justify-center p-2.5 rounded border text-xs transition-colors ${
                  mode === 'both'
                    ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-300'
                    : 'border-line bg-sidebar text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <FileCode className="w-4 h-4 mb-1" />
                <span className="font-medium text-[11px]">{t('transfer.structureAndData', 'Structure & Data')}</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('structure')}
                disabled={loading}
                className={`flex flex-col items-center justify-center p-2.5 rounded border text-xs transition-colors ${
                  mode === 'structure'
                    ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-300'
                    : 'border-line bg-sidebar text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <FileCode className="w-4 h-4 mb-1" />
                <span className="font-medium text-[11px]">{t('transfer.structureOnly', 'Structure Only')}</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('data')}
                disabled={loading}
                className={`flex flex-col items-center justify-center p-2.5 rounded border text-xs transition-colors ${
                  mode === 'data'
                    ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-300'
                    : 'border-line bg-sidebar text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <FileCode className="w-4 h-4 mb-1" />
                <span className="font-medium text-[11px]">{t('transfer.dataOnly', 'Data Only')}</span>
              </button>
            </div>
          </div>

          <div className="pt-1">
            <label className="flex items-center space-x-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeDropTable}
                onChange={(e) => setIncludeDropTable(e.target.checked)}
                disabled={loading || mode === 'data'}
                className="w-4 h-4 rounded border-line bg-grid text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-text">
                {t('transfer.includeDropTable', 'Include DROP TABLE IF EXISTS statement')}
              </span>
            </label>
          </div>

          {loading && (
            <div
              data-testid="export-sql-progress"
              className="p-3 bg-sidebar border border-line rounded space-y-2"
            >
              <div className="flex items-center justify-between text-xs text-text">
                <span className="truncate pr-2">
                  {progress?.status || t('transfer.exporting', 'Exporting SQL dump...')}
                </span>
                <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
                  {progress?.total_rows !== undefined && progress.total_rows > 0 && (
                    <span className="text-muted">
                      {progress.current_row.toLocaleString()} / {progress.total_rows.toLocaleString()}
                    </span>
                  )}
                  <span
                    data-testid="export-sql-percent"
                    className="font-semibold text-blue-500"
                  >
                    {progressPct}%
                  </span>
                </div>
              </div>
              <div className="w-full bg-grid h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-blue-500 h-full transition-all duration-150"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-line">
            <button
              type="button"
              onClick={handleCancelExport}
              className="px-3.5 py-1.5 text-xs font-medium rounded text-muted hover:text-text bg-sidebar hover:bg-black/5 dark:hover:bg-white/10 border border-line transition-colors"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={loading}
              className="inline-flex items-center space-x-1.5 px-4 py-1.5 text-xs font-medium rounded text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-sm"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>
                {loading
                  ? t('transfer.exportingWithPercent', {
                      percent: progressPct,
                      defaultValue: `Exporting (${progressPct}%)...`,
                    })
                  : t('transfer.chooseFileAndExport', 'Choose File & Export...')}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
