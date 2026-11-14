import React, { useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { AlertTriangle, Trash2, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
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
      await dbApi.executeDirectQuery(connectionId, sql);

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

      toast.success(`Table "${fullDisplay}" dropped successfully`);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(`Failed to drop table: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150" />
        <AlertDialog.Content
          aria-describedby="drop-table-description"
          className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-zinc-900 border border-red-500/30 rounded-lg shadow-2xl max-w-md w-full overflow-hidden text-zinc-900 dark:text-zinc-100 focus:outline-none"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-red-50 dark:bg-red-950/20">
            <div className="flex items-center space-x-2 text-red-500 dark:text-red-400">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <AlertDialog.Title asChild>
                <h2 id="drop-table-title" className="text-sm font-semibold tracking-wide">
                  Drop Table
                </h2>
              </AlertDialog.Title>
            </div>
            <AlertDialog.Cancel asChild>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </AlertDialog.Cancel>
          </div>

          <form onSubmit={handleDrop} className="p-4 space-y-4">
            <AlertDialog.Description asChild>
              <div id="drop-table-description" className="text-xs text-zinc-600 dark:text-zinc-300 space-y-2">
                <p>
                  Are you sure you want to drop table{' '}
                  <span className="font-mono font-bold text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-950/40 px-1 py-0.5 rounded">
                    {fullDisplay}
                  </span>
                  ?
                </p>
                <p className="text-red-600 dark:text-red-400">
                  This action is permanent and cannot be undone. All data, indexes, and triggers associated with this table will be deleted.
                </p>
              </div>
            </AlertDialog.Description>

            {isPostgres && (
              <label className="flex items-center space-x-2 text-xs text-zinc-600 dark:text-zinc-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={cascade}
                  onChange={(e) => setCascade(e.target.checked)}
                  className="rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-red-600 focus:ring-0 focus:ring-offset-0"
                />
                <span>Cascade drop dependent objects (foreign keys, views)</span>
              </label>
            )}

            <div>
              <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                Type <span className="font-mono text-zinc-900 dark:text-zinc-200 font-semibold">{tableName}</span> to confirm:
              </label>
              <input
                type="text"
                autoFocus
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={tableName}
                className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none focus:border-red-500"
                data-testid="drop-table-confirm-input"
              />
            </div>

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                SQL Statement:
              </div>
              <pre className="text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-2 rounded font-mono text-red-700 dark:text-red-300 whitespace-pre-wrap select-all">
                {sql}
              </pre>
            </div>

            {error && (
              <div
                role="alert"
                className="p-2.5 bg-red-100 dark:bg-red-950/50 border border-red-300 dark:border-red-500/40 rounded text-xs text-red-700 dark:text-red-300 font-mono"
              >
                {error}
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <AlertDialog.Cancel asChild>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
                >
                  Cancel
                </button>
              </AlertDialog.Cancel>
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
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
};
