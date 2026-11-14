import React, { useState, useEffect, useRef } from 'react';
import { Download, X, Loader2, FileCode, Database } from 'lucide-react';
import { toast } from 'sonner';
import { dbApi } from '../../api/db';
import { pickSqlExportFile, cancelTransfer } from '../../api/dataTransferApi';
import { useConnectionStore } from '../../stores/connectionStore';
import { DbBadge } from '../sidebar/DbBadge';
import type { SqlExportResult } from '../../types/dataTransfer';
import type { DatabaseDriver } from '../../types/db';

export interface ExportSqlModalProps {
  isOpen: boolean;
  connectionId: string;
  schemaName?: string;
  tableName?: string;
  onClose: () => void;
  onSuccess?: (result: SqlExportResult) => void;
}

export type SqlDumpMode = 'both' | 'structure' | 'data';

export const ExportSqlModal: React.FC<ExportSqlModalProps> = ({
  isOpen,
  connectionId,
  schemaName,
  tableName,
  onClose,
  onSuccess,
}) => {
  const connections = useConnectionStore((s) => s.connections);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>(connectionId);
  const [selectedSchemaName, setSelectedSchemaName] = useState<string>(schemaName || '');
  const [mode, setMode] = useState<SqlDumpMode>('both');
  const [includeDropTable, setIncludeDropTable] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
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
      setError(null);
    }
  }, [isOpen, connectionId, schemaName, connections, fallbackDriver]);

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
  const targetName = tableName || (effectiveSchema ? `${effectiveSchema}_dump` : (activeConn?.name ? `${activeConn.name}_dump` : 'database_dump'));

  const handleCancelExport = async () => {
    if (loading && activeJobIdRef.current) {
      try {
        await cancelTransfer(activeJobIdRef.current);
        toast.info('Export cancelled');
      } catch (err) {
        console.error('Failed to cancel export:', err);
      }
    }
    onClose();
  };

  const handleExport = async () => {
    setError(null);
    try {
      const filePath = await pickSqlExportFile(`${targetName}.sql`);
      if (!filePath) {
        return; // User cancelled
      }

      const jobId = `export-sql-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      activeJobIdRef.current = jobId;
      setLoading(true);

      let tables = tableName ? [tableName] : [];
      if (tables.length === 0) {
        try {
          const allMeta = await dbApi.getTableListMetadata(
            selectedConnectionId,
            effectiveSchema
          );
          tables = allMeta.map((t) => t.name);
        } catch {
          // Fallback handled automatically by backend if tables array is empty
        }
      }

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

      const sizeKb = (result.fileSizeBytes / 1024).toFixed(1);
      toast.success(
        `Exported ${result.totalTables} table(s), ${result.totalRows.toLocaleString()} rows (${sizeKb} KB) to SQL file.`
      );

      if (onSuccess) {
        onSuccess(result);
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(`Export failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-sql-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div className="bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#333333] rounded-lg shadow-2xl w-full max-w-md overflow-hidden text-gray-800 dark:text-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 dark:border-[#2d2d2d] bg-gray-50 dark:bg-[#252526]">
          <div className="flex items-center space-x-2">
            <Download className="w-4 h-4 text-blue-500 dark:text-blue-400" />
            <h2 id="export-sql-title" className="text-sm font-semibold text-gray-900 dark:text-white">
              Export as SQL Dump
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-white p-1 rounded hover:bg-gray-200 dark:hover:bg-[#333333] transition-colors"
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
                <span>Source Server & Database</span>
              </div>
              {activeConn && <DbBadge driver={activeConn.driver} />}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <label
                  htmlFor="source-connection-select"
                  className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1"
                >
                  Connection:
                </label>
                <select
                  id="source-connection-select"
                  data-testid="source-connection-select"
                  value={selectedConnectionId}
                  onChange={(e) => handleConnectionChange(e.target.value)}
                  disabled={loading}
                  className="w-full h-[34px] px-2.5 py-1.5 text-xs bg-white dark:bg-[#141414] border border-gray-300 dark:border-[#333333] rounded text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 truncate"
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
                  className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1"
                >
                  {isMysql ? 'Database / Schema:' : 'Schema:'}
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
                      ? 'bg-gray-100 dark:bg-[#181818] border-gray-200 dark:border-[#2a2a2a] text-gray-400 dark:text-gray-500 cursor-not-allowed'
                      : 'bg-white dark:bg-[#141414] border-gray-300 dark:border-[#333333] text-gray-900 dark:text-gray-100 focus:border-blue-500'
                  }`}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Target Scope
            </label>
            <div className="px-3 py-2 text-xs font-mono bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#333333] rounded text-gray-700 dark:text-gray-300">
              {isSqlite
                ? tableName || 'All database tables'
                : isMysql
                ? tableName
                  ? selectedSchemaName
                    ? `${selectedSchemaName}.${tableName}`
                    : tableName
                  : selectedSchemaName
                  ? `All tables in database '${selectedSchemaName}'`
                  : 'All database tables'
                : tableName
                ? `${selectedSchemaName ? selectedSchemaName + '.' : ''}${tableName}`
                : selectedSchemaName
                ? `All tables in schema '${selectedSchemaName}'`
                : 'All database tables'}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
              Dump Content
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMode('both')}
                disabled={loading}
                className={`flex flex-col items-center justify-center p-2.5 rounded border text-xs transition-colors ${
                  mode === 'both'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-200'
                    : 'border-gray-200 dark:border-[#333333] bg-gray-50 dark:bg-[#141414] text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#252526]'
                }`}
              >
                <FileCode className="w-4 h-4 mb-1" />
                <span className="font-medium text-[11px]">Structure & Data</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('structure')}
                disabled={loading}
                className={`flex flex-col items-center justify-center p-2.5 rounded border text-xs transition-colors ${
                  mode === 'structure'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-200'
                    : 'border-gray-200 dark:border-[#333333] bg-gray-50 dark:bg-[#141414] text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#252526]'
                }`}
              >
                <FileCode className="w-4 h-4 mb-1" />
                <span className="font-medium text-[11px]">Structure Only</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('data')}
                disabled={loading}
                className={`flex flex-col items-center justify-center p-2.5 rounded border text-xs transition-colors ${
                  mode === 'data'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-200'
                    : 'border-gray-200 dark:border-[#333333] bg-gray-50 dark:bg-[#141414] text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#252526]'
                }`}
              >
                <FileCode className="w-4 h-4 mb-1" />
                <span className="font-medium text-[11px]">Data Only</span>
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
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-700 dark:text-gray-300">
                Include DROP TABLE IF EXISTS statement
              </span>
            </label>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-gray-200 dark:border-[#2d2d2d]">
            <button
              type="button"
              onClick={handleCancelExport}
              className="px-3.5 py-1.5 text-xs font-medium rounded text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white bg-gray-100 hover:bg-gray-200 dark:bg-[#2d2d2d] dark:hover:bg-[#383838] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={loading}
              className="inline-flex items-center space-x-1.5 px-4 py-1.5 text-xs font-medium rounded text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-sm"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Choose File & Export...</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
