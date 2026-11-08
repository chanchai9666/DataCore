import React, { useState, useEffect } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { dbApi } from '../../api/db';
import { pickSqlImportFile, onTransferProgress } from '../../api/dataTransferApi';
import type { SqlImportResult, TransferProgress } from '../../types/dataTransfer';

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
  const [filePath, setFilePath] = useState<string>('');
  const [errorPolicy, setErrorPolicy] = useState<'abort' | 'continue'>('abort');
  const [loading, setLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFilePath('');
      setErrorPolicy('abort');
      setLoading(false);
      setProgress(null);
      setError(null);
    }
  }, [isOpen]);

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

    setLoading(true);
    setError(null);

    try {
      const result = await dbApi.importSql({
        connectionId,
        schema: schemaName,
        filePath: filePath.trim(),
        errorPolicy,
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
      setError(msg);
      toast.error(`SQL Import failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-sql-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div className="bg-[#1e1e1e] border border-[#333333] rounded-lg shadow-2xl w-full max-w-md overflow-hidden text-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#2d2d2d] bg-[#252526]">
          <div className="flex items-center space-x-2">
            <Upload className="w-4 h-4 text-emerald-400" />
            <h2 id="import-sql-title" className="text-sm font-semibold text-white">
              Execute SQL Script (Import)
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
        <form onSubmit={handleImport} className="p-5 space-y-4">
          {error && (
            <div className="p-3 text-xs text-red-300 bg-red-950/40 border border-red-800 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Target Database / Schema
            </label>
            <div className="px-3 py-2 text-xs font-mono bg-[#141414] border border-[#333333] rounded text-gray-300">
              {schemaName ? schemaName : 'Default Database'}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              SQL File <span className="text-red-400">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="Select or enter path to .sql file"
                disabled={loading}
                className="flex-1 px-3 py-1.5 text-xs font-mono bg-[#141414] border border-[#333333] rounded text-white focus:outline-none focus:border-emerald-500 truncate"
              />
              <button
                type="button"
                onClick={handlePickFile}
                disabled={loading}
                className="px-3 py-1.5 text-xs font-medium bg-[#2d2d2d] hover:bg-[#383838] text-gray-200 rounded border border-[#444444] transition-colors shrink-0"
              >
                Browse...
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
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
                  className="text-emerald-500 focus:ring-emerald-500 bg-gray-700 border-gray-600"
                />
                <span className="text-gray-300">Abort on error (Rollback)</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="errorPolicy"
                  value="continue"
                  checked={errorPolicy === 'continue'}
                  onChange={() => setErrorPolicy('continue')}
                  disabled={loading}
                  className="text-emerald-500 focus:ring-emerald-500 bg-gray-700 border-gray-600"
                />
                <span className="text-gray-300">Continue on error</span>
              </label>
            </div>
          </div>

          {/* Progress display */}
          {loading && (
            <div className="p-3 bg-[#141414] border border-[#333333] rounded space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-300">
                <span>{progress?.status || 'Executing statements...'}</span>
                {progress?.total_rows && (
                  <span className="font-mono text-[11px] text-gray-400">
                    {progress.current_row} / {progress.total_rows}
                  </span>
                )}
              </div>
              <div className="w-full bg-[#2a2a2a] h-1.5 rounded-full overflow-hidden">
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
