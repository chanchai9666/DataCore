import React, { useState, useEffect, useRef } from 'react';
import { Upload, X, Loader2, Database } from 'lucide-react';
import { toast } from 'sonner';
import { dbApi } from '../../api/db';
import { pickSqlImportFile, onTransferProgress, cancelTransfer } from '../../api/dataTransferApi';
import { useConnectionStore } from '../../stores/connectionStore';
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
    if (isOpen && loading) {
      onTransferProgress((p) => {
        setProgress(p);
      }).then((unsub) => {
        unlisten = unsub;
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
        await cancelTransfer(activeJobIdRef.current);
        toast.info('SQL import cancelled');
      } catch (err) {
        console.error('Failed to cancel SQL import:', err);
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
      setError('Please choose a valid SQL script file to import.');
      return;
    }

    const jobId = `import-sql-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    activeJobIdRef.current = jobId;
    setLoading(true);
    setError(null);

    try {
      const result = await dbApi.importSql({
        connectionId: selectedConnectionId,
        schema: effectiveSchema,
        filePath: filePath.trim(),
        errorPolicy,
        jobId,
      });

      toast.success(
        `SQL Script executed: ${result.successfulStatements} of ${result.totalStatements} statements succeeded.`
      );

      if (onSuccess) {
        onSuccess(result);
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('cancelled')) {
        toast.info('SQL import cancelled by user');
      } else {
        setError(msg);
        toast.error(`SQL Import failed: ${msg}`);
      }
    } finally {
      setLoading(false);
      activeJobIdRef.current = null;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-sql-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div className="bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#333333] rounded-lg shadow-2xl w-full max-w-md overflow-hidden text-gray-800 dark:text-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 dark:border-[#2d2d2d] bg-gray-50 dark:bg-[#252526]">
          <div className="flex items-center space-x-2">
            <Upload className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h2 id="import-sql-title" className="text-sm font-semibold text-gray-900 dark:text-white">
              Execute SQL Script (Import)
            </h2>
          </div>
          <button
            type="button"
            onClick={handleCancelOrClose}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-white p-1 rounded hover:bg-gray-200 dark:hover:bg-[#333333] transition-colors"
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
                <span>Destination Server & Database</span>
              </div>
              {destConn && <DbBadge driver={destConn.driver} />}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <label
                  htmlFor="destination-connection-select"
                  className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1"
                >
                  Connection:
                </label>
                <select
                  id="destination-connection-select"
                  data-testid="destination-connection-select"
                  value={selectedConnectionId}
                  onChange={(e) => handleConnectionChange(e.target.value)}
                  disabled={loading}
                  className="w-full h-[34px] px-2.5 py-1.5 text-xs bg-white dark:bg-[#141414] border border-gray-300 dark:border-[#333333] rounded text-gray-900 dark:text-gray-100 focus:outline-none focus:border-emerald-500 truncate"
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
                  className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1"
                >
                  {isMysql ? 'Database / Schema:' : 'Schema:'}
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
                      ? 'bg-gray-100 dark:bg-[#181818] border-gray-200 dark:border-[#2a2a2a] text-gray-400 dark:text-gray-500 cursor-not-allowed'
                      : 'bg-white dark:bg-[#141414] border-gray-300 dark:border-[#333333] text-gray-900 dark:text-gray-100 focus:border-emerald-500'
                  }`}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Target Database / Schema
            </label>
            <div className="px-3 py-2 text-xs font-mono bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#333333] rounded text-gray-700 dark:text-gray-300">
              {isSqlite
                ? `SQLite Database (${destConn?.name || 'Local'})`
                : isMysql
                ? (selectedSchemaName || destConn?.database || 'Default Database')
                : (selectedSchemaName || 'public')}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              SQL File <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="Select or enter path to .sql file"
                disabled={loading}
                className="flex-1 px-3 py-1.5 text-xs font-mono bg-white dark:bg-[#141414] border border-gray-300 dark:border-[#333333] rounded text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500 truncate"
              />
              <button
                type="button"
                onClick={handlePickFile}
                disabled={loading}
                className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 dark:bg-[#2d2d2d] dark:hover:bg-[#383838] text-gray-700 dark:text-gray-200 rounded border border-gray-300 dark:border-[#444444] transition-colors shrink-0"
              >
                Browse...
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Error Handling Policy
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
                  className="text-emerald-500 focus:ring-emerald-500 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                />
                <span className="text-gray-700 dark:text-gray-300">Abort on error (Rollback)</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="errorPolicy"
                  value="continue"
                  checked={errorPolicy === 'continue'}
                  onChange={() => setErrorPolicy('continue')}
                  disabled={loading}
                  className="text-emerald-500 focus:ring-emerald-500 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                />
                <span className="text-gray-700 dark:text-gray-300">Continue on error</span>
              </label>
            </div>
          </div>

          {/* Progress display */}
          {loading && (
            <div className="p-3 bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#333333] rounded space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-700 dark:text-gray-300">
                <span>{progress?.status || 'Executing statements...'}</span>
                {progress?.total_rows && (
                  <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400">
                    {progress.current_row} / {progress.total_rows}
                  </span>
                )}
              </div>
              <div className="w-full bg-gray-200 dark:bg-[#2a2a2a] h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-150"
                  style={{
                    width: progress?.total_rows
                      ? `${Math.min(100, Math.round((progress.current_row / progress.total_rows) * 100))}%`
                      : '50%',
                  }}
                />
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-gray-200 dark:border-[#2d2d2d]">
            <button
              type="button"
              onClick={handleCancelOrClose}
              className="px-3.5 py-1.5 text-xs font-medium rounded text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white bg-gray-100 hover:bg-gray-200 dark:bg-[#2d2d2d] dark:hover:bg-[#383838] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !filePath.trim()}
              className="inline-flex items-center space-x-1.5 px-4 py-1.5 text-xs font-medium rounded text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors shadow-sm"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Execute SQL Script</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
