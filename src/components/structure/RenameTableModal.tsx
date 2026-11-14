import React, { useState, useEffect } from 'react';
import { Pencil, X, Loader2, Code2 } from 'lucide-react';
import { toast } from 'sonner';
import { dbApi } from '../../api/db';
import { useTabStore } from '../../stores/tabStore';
import { buildRenameTableSql } from './tableManagementHelpers';

export interface RenameTableModalProps {
  isOpen: boolean;
  tableName: string;
  schemaName?: string;
  connectionId: string;
  driver?: string;
  onClose: () => void;
  onSuccess?: (newTableName: string) => void;
}

export const RenameTableModal: React.FC<RenameTableModalProps> = ({
  isOpen,
  tableName,
  schemaName,
  connectionId,
  driver,
  onClose,
  onSuccess,
}) => {
  const [newTableName, setNewTableName] = useState(tableName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setNewTableName(tableName);
      setError(null);
      setLoading(false);
    }
  }, [isOpen, tableName]);

  if (!isOpen) return null;

  const fullDisplay = schemaName ? `${schemaName}.${tableName}` : tableName;
  const trimmed = newTableName.trim();
  const previewSql = trimmed
    ? buildRenameTableSql(tableName, trimmed, schemaName, driver)
    : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed) {
      setError('Please provide a new table name.');
      return;
    }
    if (trimmed === tableName) {
      setError('The new table name must be different from the current name.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const sql = buildRenameTableSql(tableName, trimmed, schemaName, driver);
      await dbApi.executeDirectQuery(connectionId, sql);

      // Synchronize any open tabs associated with this table
      const { tabs, updateTab } = useTabStore.getState();
      const openTabs = tabs.filter(
        (t) =>
          t.connectionId === connectionId &&
          t.tableName === tableName &&
          (!schemaName || t.schemaName === schemaName)
      );
      for (const t of openTabs) {
        updateTab(t.id, {
          tableName: trimmed,
          title: t.title === tableName ? trimmed : t.title.replace(tableName, trimmed),
        });
      }

      toast.success(`Table "${tableName}" renamed to "${trimmed}" successfully`);
      if (onSuccess) {
        onSuccess(trimmed);
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(`Failed to rename table: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-table-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-2xl w-full max-w-md overflow-hidden text-zinc-900 dark:text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60">
          <div className="flex items-center space-x-2">
            <Pencil className="w-4 h-4 text-blue-500" />
            <h2 id="rename-table-modal-title" className="text-sm font-semibold text-zinc-900 dark:text-white">
              Rename Table
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Close dialog"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-white p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Current Table
            </label>
            <div className="px-3 py-2 text-xs font-mono bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded text-zinc-800 dark:text-zinc-300 select-all">
              {fullDisplay}
            </div>
          </div>

          <div>
            <label
              htmlFor="new-table-name"
              className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1"
            >
              New Table Name <span className="text-red-500">*</span>
            </label>
            <input
              id="new-table-name"
              type="text"
              value={newTableName}
              onChange={(e) => setNewTableName(e.target.value)}
              disabled={loading}
              autoFocus
              className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded focus:outline-none focus:border-blue-500 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500"
              placeholder="e.g. new_table_name"
            />
          </div>

          {previewSql && (
            <div>
              <div className="flex items-center space-x-1.5 text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                <Code2 className="w-3.5 h-3.5 text-blue-500" />
                <span>SQL Preview</span>
              </div>
              <pre className="p-2.5 text-[11px] font-mono bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded text-blue-600 dark:text-blue-300 overflow-x-auto whitespace-pre-wrap break-all">
                {previewSql}
              </pre>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3.5 py-1.5 text-xs font-medium rounded text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center space-x-1.5 px-4 py-1.5 text-xs font-medium rounded text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-sm"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Rename</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
