import React, { useState, useEffect } from 'react';
import { Copy, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { dbApi } from '../../api/db';

export interface DuplicateTableModalProps {
  isOpen: boolean;
  connectionId: string;
  sourceTableName: string;
  schemaName?: string;
  onClose: () => void;
  onSuccess?: (newTableName: string) => void;
}

export const DuplicateTableModal: React.FC<DuplicateTableModalProps> = ({
  isOpen,
  connectionId,
  sourceTableName,
  schemaName,
  onClose,
  onSuccess,
}) => {
  const [newTableName, setNewTableName] = useState(`${sourceTableName}_copy`);
  const [copyData, setCopyData] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setNewTableName(`${sourceTableName}_copy`);
      setCopyData(true);
      setError(null);
      setLoading(false);
    }
  }, [isOpen, sourceTableName]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTableName.trim();
    if (!trimmed) {
      setError('Please provide a name for the new table.');
      return;
    }
    if (trimmed === sourceTableName) {
      setError('New table name must be different from source table name.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await dbApi.duplicateTable({
        connectionId,
        schema: schemaName,
        sourceTable: sourceTableName,
        newTableName: trimmed,
        copyData,
      });

      toast.success(
        `Table "${sourceTableName}" duplicated as "${trimmed}" successfully`
      );
      if (onSuccess) {
        onSuccess(trimmed);
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(`Failed to duplicate table: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div className="bg-[#1e1e1e] border border-[#333333] rounded-lg shadow-2xl w-full max-w-md overflow-hidden text-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#2d2d2d] bg-[#252526]">
          <div className="flex items-center space-x-2">
            <Copy className="w-4 h-4 text-purple-400" />
            <h2 id="duplicate-modal-title" className="text-sm font-semibold text-white">
              Duplicate Table
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-gray-400 hover:text-white p-1 rounded hover:bg-[#333333] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 text-xs text-red-300 bg-red-950/40 border border-red-800 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Source Table
            </label>
            <div className="px-3 py-2 text-xs font-mono bg-[#141414] border border-[#333333] rounded text-gray-300 select-all">
              {schemaName ? `${schemaName}.${sourceTableName}` : sourceTableName}
            </div>
          </div>

          <div>
            <label
              htmlFor="target-table-name"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              New Table Name <span className="text-red-400">*</span>
            </label>
            <input
              id="target-table-name"
              type="text"
              value={newTableName}
              onChange={(e) => setNewTableName(e.target.value)}
              disabled={loading}
              autoFocus
              className="w-full px-3 py-2 text-xs font-mono bg-[#141414] border border-[#333333] rounded focus:outline-none focus:border-purple-500 text-white placeholder-gray-500"
              placeholder="e.g. users_backup"
            />
          </div>

          <div className="pt-1">
            <label className="flex items-center space-x-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={copyData}
                onChange={(e) => setCopyData(e.target.checked)}
                disabled={loading}
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-purple-600 focus:ring-purple-500 focus:ring-offset-gray-900"
              />
              <span className="text-xs text-gray-300">
                Copy table data (records)
              </span>
            </label>
            <p className="text-[11px] text-gray-500 mt-1 pl-6">
              If unchecked, only the table structure and indexes will be cloned.
            </p>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[#2d2d2d]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3.5 py-1.5 text-xs font-medium rounded text-gray-300 hover:text-white bg-[#2d2d2d] hover:bg-[#383838] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center space-x-1.5 px-4 py-1.5 text-xs font-medium rounded text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 transition-colors shadow-sm"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Duplicate</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
