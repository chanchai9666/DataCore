import React, { useState } from 'react';
import { Bookmark, X, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { dbApi } from '../../api/db';
import {
  buildSavepointSql,
  buildRollbackToSavepointSql,
  buildReleaseSavepointSql,
} from '../../api/transactionHelpers';
import { useAuditLogStore } from '../../stores/auditLogStore';

export interface SavepointModalProps {
  isOpen: boolean;
  tabId: string;
  driver?: string;
  connectionName?: string;
  onClose: () => void;
}

export const SavepointModal: React.FC<SavepointModalProps> = ({
  isOpen,
  tabId,
  driver = 'postgres',
  connectionName,
  onClose,
}) => {
  const [savepoints, setSavepoints] = useState<string[]>([]);
  const [newSavepointName, setNewSavepointName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newSavepointName.trim().replace(/[^a-zA-Z0-9_]/g, '');
    if (!clean) {
      toast.error('Savepoint name must be alphanumeric');
      return;
    }
    if (savepoints.includes(clean)) {
      toast.error('A savepoint with this name already exists');
      return;
    }

    setIsSubmitting(true);
    const sql = buildSavepointSql(clean);
    try {
      await dbApi.executeQuery(tabId, sql);
      setSavepoints((prev) => [...prev, clean]);
      setNewSavepointName('');
      toast.success(`Savepoint "${clean}" created`);

      useAuditLogStore.getState().addLog({
        action: 'TRANSACTION',
        connectionName,
        query: sql,
        status: 'SUCCESS',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to create savepoint: ${msg}`);
      useAuditLogStore.getState().addLog({
        action: 'TRANSACTION',
        connectionName,
        query: sql,
        status: 'FAILURE',
        errorMessage: msg,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRollback = async (name: string) => {
    if (!window.confirm(`Rollback transaction state to "${name}"? Changes made after this point will be reverted.`)) {
      return;
    }

    setIsSubmitting(true);
    const sql = buildRollbackToSavepointSql(name);
    try {
      await dbApi.executeQuery(tabId, sql);
      toast.success(`Rolled back to savepoint "${name}"`);

      useAuditLogStore.getState().addLog({
        action: 'TRANSACTION',
        connectionName,
        query: sql,
        status: 'SUCCESS',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Rollback failed: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRelease = async (name: string) => {
    setIsSubmitting(true);
    const sql = buildReleaseSavepointSql(name, driver);
    try {
      await dbApi.executeQuery(tabId, sql);
      setSavepoints((prev) => prev.filter((sp) => sp !== name));
      toast.info(`Savepoint "${name}" released`);

      useAuditLogStore.getState().addLog({
        action: 'TRANSACTION',
        connectionName,
        query: sql,
        status: 'SUCCESS',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Release failed: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Transaction Savepoints"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in"
    >
      <div className="relative w-full max-w-md rounded-xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <Bookmark className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Transaction Savepoints
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manage intermediate transaction checkpoints in this session
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Create new savepoint form */}
          <form onSubmit={handleCreate} className="flex gap-2">
            <input
              type="text"
              placeholder="Savepoint name (e.g. sp_before_update)"
              value={newSavepointName}
              onChange={(e) => setNewSavepointName(e.target.value)}
              disabled={isSubmitting}
              className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
            <button
              type="submit"
              disabled={isSubmitting || !newSavepointName.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-blue-700 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Savepoint
            </button>
          </form>

          {/* List of active savepoints */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Active Savepoints ({savepoints.length})
            </div>

            {savepoints.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400 dark:border-slate-800">
                No active savepoints created in this transaction session.
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1.5">
                {savepoints.map((sp) => (
                  <div
                    key={sp}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-800/50"
                  >
                    <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                      {sp}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleRollback(sp)}
                        disabled={isSubmitting}
                        title={`Rollback to ${sp}`}
                        className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Rollback
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRelease(sp)}
                        disabled={isSubmitting}
                        title={`Release ${sp}`}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      >
                        <Trash2 className="h-3 w-3 text-rose-500" />
                        Release
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-right dark:border-slate-800 dark:bg-slate-900/60">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
