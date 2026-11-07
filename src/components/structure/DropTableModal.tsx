import React, { useState } from 'react';
import { AlertTriangle, Trash2, X, Loader2 } from 'lucide-react';
import { dbApi } from '../../api/db';
import { useTabStore } from '../../stores/tabStore';
import { buildDropTableSql } from './tableManagementHelpers';

export interface DropTableModalProps {
  isOpen: boolean;
  tableName: string;
  schemaName?: string;
  connectionId: string;
  driver?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const DropTableModal: React.FC<DropTableModalProps> = ({
  isOpen,
  tableName,
  schemaName,
  connectionId,
  driver,
  onClose,
  onSuccess,
}) => {
  const [cascade, setCascade] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const fullDisplay = schemaName ? `${schemaName}.${tableName}` : tableName;
  const isPostgres = !driver || driver.toLowerCase().includes('postgres');
  const sql = buildDropTableSql(tableName, schemaName, driver, cascade);

  const handleDrop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmName !== tableName) {
      setError(`Please type "${tableName}" exactly to confirm.`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await dbApi.executeQuery(connectionId, sql);

      // Close open tabs for this table
      const { tabs, closeTab } = useTabStore.getState();
      const openTabs = tabs.filter(
        (t) =>
          t.connectionId === connectionId &&
          t.tableName === tableName &&
          (!schemaName || t.schemaName === schemaName)
      );
      for (const t of openTabs) {
        await closeTab(t.id);
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="drop-table-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div className="bg-gray-900 border border-red-500/30 rounded-lg shadow-2xl max-w-md w-full overflow-hidden text-gray-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-red-950/20">
          <div className="flex items-center space-x-2 text-red-400">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <h2 id="drop-table-title" className="text-sm font-semibold tracking-wide">
              Drop Table
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleDrop} className="p-4 space-y-4">
          <div className="text-xs text-gray-300 space-y-2">
            <p>
              Are you sure you want to drop table{' '}
              <span className="font-mono font-bold text-red-300 bg-red-950/40 px-1 py-0.5 rounded">
                {fullDisplay}
              </span>
              ?
            </p>
            <p className="text-red-400">
              This action is permanent and cannot be undone. All data, indexes, and triggers associated with this table will be deleted.
            </p>
          </div>

          {isPostgres && (
            <label className="flex items-center space-x-2 text-xs text-gray-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={cascade}
                onChange={(e) => setCascade(e.target.checked)}
                className="rounded border-gray-700 bg-gray-800 text-red-600 focus:ring-0 focus:ring-offset-0"
              />
              <span>Cascade drop dependent objects (foreign keys, views)</span>
            </label>
          )}

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Type <span className="font-mono text-gray-200 font-semibold">{tableName}</span> to confirm:
            </label>
            <input
              type="text"
              autoFocus
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={tableName}
              className="w-full bg-gray-950 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-red-500"
              data-testid="drop-table-confirm-input"
            />
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
              SQL Statement:
            </div>
            <pre className="text-xs bg-gray-950 border border-gray-800 p-2 rounded font-mono text-red-300 whitespace-pre-wrap select-all">
              {sql}
            </pre>
          </div>

          {error && (
            <div
              role="alert"
              className="p-2.5 bg-red-950/50 border border-red-500/40 rounded text-xs text-red-300 font-mono"
            >
              {error}
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-2 border-t border-gray-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || confirmName !== tableName}
              data-testid="confirm-drop-table-btn"
              className="px-3 py-1.5 text-xs font-medium rounded bg-red-600 hover:bg-red-500 text-white flex items-center space-x-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Dropping...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Drop Table</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
