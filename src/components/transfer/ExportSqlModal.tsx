import React, { useState } from 'react';
import { Download, X, Loader2, FileCode } from 'lucide-react';
import { toast } from 'sonner';
import { dbApi } from '../../api/db';
import { pickSqlExportFile } from '../../api/dataTransferApi';
import type { SqlExportResult } from '../../types/dataTransfer';

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
  const [mode, setMode] = useState<SqlDumpMode>('both');
  const [includeDropTable, setIncludeDropTable] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const targetName = tableName || (schemaName ? `${schemaName}_dump` : 'database_dump');

  const handleExport = async () => {
    setError(null);
    try {
      const filePath = await pickSqlExportFile(`${targetName}.sql`);
      if (!filePath) {
        return; // User cancelled
      }

      setLoading(true);

      const tables = tableName ? [tableName] : [];

      const result = await dbApi.exportSql({
        connectionId,
        schema: schemaName,
        tables,
        filePath,
        includeDropTable,
        includeStructure: mode === 'both' || mode === 'structure',
        includeData: mode === 'both' || mode === 'data',
        batchSize: 500,
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
      <div className="bg-[#1e1e1e] border border-[#333333] rounded-lg shadow-2xl w-full max-w-md overflow-hidden text-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#2d2d2d] bg-[#252526]">
          <div className="flex items-center space-x-2">
            <Download className="w-4 h-4 text-blue-400" />
            <h2 id="export-sql-title" className="text-sm font-semibold text-white">
              Export as SQL Dump
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
        <div className="p-5 space-y-4">
          {error && (
            <div className="p-3 text-xs text-red-300 bg-red-950/40 border border-red-800 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Target Scope
            </label>
            <div className="px-3 py-2 text-xs font-mono bg-[#141414] border border-[#333333] rounded text-gray-300">
              {tableName
                ? `${schemaName ? schemaName + '.' : ''}${tableName}`
                : schemaName
                ? `All tables in schema '${schemaName}'`
                : 'All database tables'}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">
              Dump Content
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMode('both')}
                disabled={loading}
                className={`flex flex-col items-center justify-center p-2.5 rounded border text-xs transition-colors ${
                  mode === 'both'
                    ? 'border-blue-500 bg-blue-950/40 text-blue-200'
                    : 'border-[#333333] bg-[#141414] text-gray-400 hover:text-gray-200'
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
                    ? 'border-blue-500 bg-blue-950/40 text-blue-200'
                    : 'border-[#333333] bg-[#141414] text-gray-400 hover:text-gray-200'
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
                    ? 'border-blue-500 bg-blue-950/40 text-blue-200'
                    : 'border-[#333333] bg-[#141414] text-gray-400 hover:text-gray-200'
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
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-900"
              />
              <span className="text-xs text-gray-300">
                Include DROP TABLE IF EXISTS statement
              </span>
            </label>
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
