import React, { useState, useEffect, useRef } from 'react';
import { ArrowRightLeft, X, Loader2, ArrowRight, Database, Table, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { dbApi } from '../../api/db';
import { onTransferProgress, cancelTransfer } from '../../api/dataTransferApi';
import { useConnectionStore } from '../../stores/connectionStore';
import type { TransferProgress } from '../../types/dataTransfer';

export interface CrossDbCopyModalProps {
  isOpen: boolean;
  sourceConnectionId: string;
  sourceTableName: string;
  sourceSchemaName?: string;
  onClose: () => void;
  onSuccess?: (targetTable: string) => void;
}

export const CrossDbCopyModal: React.FC<CrossDbCopyModalProps> = ({
  isOpen,
  sourceConnectionId,
  sourceTableName,
  sourceSchemaName,
  onClose,
  onSuccess,
}) => {
  const connections = useConnectionStore((s) => s.connections);

  const [targetConnectionId, setTargetConnectionId] = useState<string>(sourceConnectionId);
  const [targetSchemaName, setTargetSchemaName] = useState<string>(sourceSchemaName || '');
  const [targetTableName, setTargetTableName] = useState<string>(`${sourceTableName}_copy`);

  const [copyStructure, setCopyStructure] = useState<boolean>(true);
  const [dropTargetIfExists, setDropTargetIfExists] = useState<boolean>(false);
  const [copyData, setCopyData] = useState<boolean>(true);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const activeJobIdRef = useRef<string | null>(null);

  // Initialize or reset when modal opens or source changes
  useEffect(() => {
    if (isOpen) {
      setTargetConnectionId(sourceConnectionId);
      const tgt = connections.find((c) => c.id === sourceConnectionId);
      if (tgt?.driver === 'sqlite') {
        setTargetSchemaName('');
      } else if (tgt?.driver === 'mysql') {
        setTargetSchemaName(sourceSchemaName || tgt.database || '');
      } else {
        setTargetSchemaName(sourceSchemaName || (tgt?.driver === 'postgres' ? 'public' : ''));
      }
      setTargetTableName(`${sourceTableName}_copy`);
      setCopyStructure(true);
      setDropTargetIfExists(false);
      setCopyData(true);
      setLoading(false);
      setError(null);
      setProgress(null);
      activeJobIdRef.current = null;
    }
  }, [isOpen, sourceConnectionId, sourceTableName, sourceSchemaName, connections]);

  const handleCancelOrClose = async () => {
    if (loading && activeJobIdRef.current) {
      try {
        await cancelTransfer(activeJobIdRef.current);
        toast.info('Transfer cancelled');
      } catch (err) {
        console.error('Failed to cancel transfer:', err);
      }
      return;
    }
    onClose();
  };

  // Adjust default target table name and schema when target connection changes
  const handleTargetConnectionChange = (newTargetConnId: string) => {
    setTargetConnectionId(newTargetConnId);
    const newTgt = connections.find((c) => c.id === newTargetConnId);
    if (newTgt?.driver === 'sqlite') {
      setTargetSchemaName('');
    } else if (newTgt?.driver === 'mysql') {
      setTargetSchemaName(newTgt.database || '');
    } else if (newTgt?.driver === 'postgres' && !targetSchemaName) {
      setTargetSchemaName('public');
    }

    if (newTargetConnId !== sourceConnectionId) {
      if (targetTableName === `${sourceTableName}_copy`) {
        setTargetTableName(sourceTableName);
      }
    } else {
      if (targetTableName === sourceTableName) {
        setTargetTableName(`${sourceTableName}_copy`);
      }
    }
  };

  // Subscribe to progress events while loading
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

  const sourceConn = connections.find((c) => c.id === sourceConnectionId);
  const targetConn = connections.find((c) => c.id === targetConnectionId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTargetTable = targetTableName.trim();

    if (!trimmedTargetTable) {
      setError('Please provide a target table name.');
      return;
    }

    if (
      targetConnectionId === sourceConnectionId &&
      (targetSchemaName || '') === (sourceSchemaName || '') &&
      trimmedTargetTable === sourceTableName
    ) {
      setError('Target table name must be different when copying to the same database and schema.');
      return;
    }

    if (!copyStructure && !copyData) {
      setError('Please select at least one option: Copy Structure or Copy Data.');
      return;
    }

    const jobId = `cross-db-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    activeJobIdRef.current = jobId;
    setLoading(true);
    setError(null);

    try {
      const result = await dbApi.copyTableCrossDb({
        sourceConnectionId,
        sourceSchema: sourceSchemaName || undefined,
        sourceTable: sourceTableName,
        targetConnectionId,
        targetSchema: targetSchemaName.trim() || undefined,
        targetTable: trimmedTargetTable,
        copyStructure,
        dropTargetIfExists,
        copyData,
        job_id: jobId,
        jobId,
      });

      toast.success(
        `Table transferred successfully! Copied ${result.rowsTransferred.toLocaleString()} rows in ${result.elapsedMs}ms.`
      );

      if (onSuccess) {
        onSuccess(trimmedTargetTable);
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('cancelled')) {
        toast.info('Transfer cancelled by user');
      } else {
        setError(msg);
        toast.error(`Transfer failed: ${msg}`);
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
      aria-labelledby="cross-db-copy-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-2xl w-full max-w-lg overflow-hidden text-zinc-900 dark:text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60">
          <div className="flex items-center space-x-2">
            <ArrowRightLeft className="w-4 h-4 text-blue-500" />
            <h2 id="cross-db-copy-title" className="text-sm font-semibold text-zinc-900 dark:text-white">
              Copy Table to Database (Cross-DB Transfer)
            </h2>
          </div>
          <button
            type="button"
            onClick={handleCancelOrClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-white p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded">
              {error}
            </div>
          )}

          {/* Source & Target Comparison Grid */}
          <div className="grid grid-cols-2 gap-3 items-stretch relative">
            {/* Source Box */}
            <div className="p-3 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-md space-y-2">
              <div className="flex items-center space-x-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 pb-1 border-b border-zinc-200 dark:border-zinc-800">
                <Database className="w-3.5 h-3.5" />
                <span>Source</span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="text-zinc-500 dark:text-zinc-400">Connection:</div>
                <div className="font-medium text-zinc-900 dark:text-white truncate" title={sourceConn?.name || sourceConnectionId}>
                  {sourceConn?.name || sourceConnectionId} ({sourceConn?.driver || 'db'})
                </div>
              </div>
              {sourceSchemaName && (
                <div className="space-y-1 text-xs">
                  <div className="text-zinc-500 dark:text-zinc-400">Schema:</div>
                  <div className="font-mono text-zinc-700 dark:text-zinc-300 truncate">{sourceSchemaName}</div>
                </div>
              )}
              <div className="space-y-1 text-xs">
                <div className="text-zinc-500 dark:text-zinc-400">Table:</div>
                <div className="flex items-center space-x-1 font-mono text-zinc-900 dark:text-white truncate font-medium">
                  <Table className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span className="truncate">{sourceTableName}</span>
                </div>
              </div>
            </div>

            {/* Target Box */}
            <div className="p-3 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-md space-y-2">
              <div className="flex items-center space-x-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 pb-1 border-b border-zinc-200 dark:border-zinc-800">
                <Layers className="w-3.5 h-3.5" />
                <span>Target</span>
              </div>
              <div className="space-y-1 text-xs">
                <label htmlFor="target-connection-select" className="text-zinc-500 dark:text-zinc-400 block">
                  Connection:
                </label>
                <select
                  id="target-connection-select"
                  data-testid="target-connection-select"
                  value={targetConnectionId}
                  onChange={(e) => handleTargetConnectionChange(e.target.value)}
                  disabled={loading}
                  className="w-full h-[34px] px-2.5 py-1 text-xs bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded text-zinc-900 dark:text-white focus:outline-none focus:border-blue-500 truncate"
                >
                  {connections.map((conn) => (
                    <option key={conn.id} value={conn.id}>
                      {conn.name} ({conn.driver})
                    </option>
                  ))}
                </select>
              </div>

              {/* Target Schema */}
              <div className="space-y-1 text-xs">
                <label htmlFor="target-schema-input" className="text-zinc-500 dark:text-zinc-400 block">
                  {targetConn?.driver === 'mysql' ? 'Database / Schema:' : 'Schema:'}
                </label>
                <input
                  id="target-schema-input"
                  data-testid="target-schema-input"
                  type="text"
                  value={targetConn?.driver === 'sqlite' ? '' : targetSchemaName}
                  onChange={(e) => setTargetSchemaName(e.target.value)}
                  disabled={loading || targetConn?.driver === 'sqlite'}
                  placeholder={
                    targetConn?.driver === 'sqlite'
                      ? 'N/A (SQLite)'
                      : targetConn?.driver === 'mysql'
                      ? (targetConn.database || 'default')
                      : 'public'
                  }
                  className={`w-full h-[34px] px-2.5 py-1 text-xs border rounded focus:outline-none font-mono transition-colors ${
                    targetConn?.driver === 'sqlite'
                      ? 'bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
                      : 'bg-white dark:bg-zinc-950 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:border-blue-500'
                  }`}
                />
              </div>

              {/* Target Table Name */}
              <div className="space-y-1 text-xs">
                <label htmlFor="target-table-input" className="text-zinc-500 dark:text-zinc-400 block">
                  Table Name:
                </label>
                <input
                  id="target-table-input"
                  data-testid="target-table-input"
                  type="text"
                  value={targetTableName}
                  onChange={(e) => setTargetTableName(e.target.value)}
                  disabled={loading}
                  required
                  className="w-full h-[34px] px-2.5 py-1 text-xs bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded text-zinc-900 dark:text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Transfer Options */}
          <div className="p-3 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-md space-y-2.5">
            <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Transfer Options</div>

            <label className="flex items-center space-x-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                data-testid="copy-structure-checkbox"
                checked={copyStructure}
                onChange={(e) => setCopyStructure(e.target.checked)}
                disabled={loading}
                className="rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-blue-500 focus:ring-0"
              />
              <span>Copy Table Structure (DDL creation)</span>
            </label>

            <label className="flex items-center space-x-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                data-testid="drop-target-checkbox"
                checked={dropTargetIfExists}
                onChange={(e) => setDropTargetIfExists(e.target.checked)}
                disabled={loading}
                className="rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-blue-500 focus:ring-0"
              />
              <span>Drop target table if already exists</span>
            </label>

            <label className="flex items-center space-x-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                data-testid="copy-data-checkbox"
                checked={copyData}
                onChange={(e) => setCopyData(e.target.checked)}
                disabled={loading}
                className="rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-blue-500 focus:ring-0"
              />
              <span>Copy Table Data (Records / Rows)</span>
            </label>
          </div>

          {/* Progress Indicator */}
          {loading && (
            <div className="p-3 bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-800 dark:text-zinc-300">
                <span className="flex items-center space-x-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                  <span>{progress?.status || 'Transferring table...'}</span>
                </span>
                {progress?.total_rows && progress.total_rows > 0 && (
                  <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                    {progress.current_row.toLocaleString()} / {progress.total_rows.toLocaleString()}
                  </span>
                )}
              </div>
              <div className="w-full bg-zinc-200 dark:bg-[#2a2a2a] h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-blue-500 h-full transition-all duration-150"
                  style={{
                    width:
                      progress?.total_rows && progress.total_rows > 0
                        ? `${Math.min(100, Math.round((progress.current_row / progress.total_rows) * 100))}%`
                        : '100%',
                  }}
                />
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={handleCancelOrClose}
              className="px-3.5 py-1.5 text-xs font-medium rounded text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="start-transfer-btn"
              disabled={loading || !targetTableName.trim()}
              className="inline-flex items-center space-x-1.5 px-4 py-1.5 text-xs font-medium rounded text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-sm"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ArrowRight className="w-3.5 h-3.5" />
              )}
              <span>Start Transfer</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
