import React, { useState, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Download, X, Loader2, FileSpreadsheet, FileCode, Check } from 'lucide-react';
import { toast } from 'sonner';
import { exportData, pickExportFile, cancelTransfer } from '../../api/dataTransferApi';
import type { ExportOptions, TransferFormat, JsonStructure } from '../../types/dataTransfer';

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
  tableName: string;
  initialQuery?: string;
  totalRows?: number;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  connectionId,
  tableName,
  initialQuery,
  totalRows,
}) => {
  const [format, setFormat] = useState<TransferFormat>('csv');
  const [delimiter, setDelimiter] = useState<string>(',');
  const [includeHeaders, setIncludeHeaders] = useState<boolean>(true);
  const [jsonStructure, setJsonStructure] = useState<JsonStructure>('array');
  const [scope, setScope] = useState<'entire' | 'filtered'>(initialQuery ? 'filtered' : 'entire');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const activeJobIdRef = useRef<string | null>(null);

  const handleCancelOrClose = async () => {
    if (isExporting && activeJobIdRef.current) {
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
    try {
      const filePath = await pickExportFile(tableName, format);
      if (!filePath) {
        return; // User cancelled the save dialog
      }

      const jobId = `export_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      activeJobIdRef.current = jobId;
      setIsExporting(true);

      const sqlToRun =
        scope === 'filtered' && initialQuery
          ? initialQuery
          : `SELECT * FROM ${tableName}`;

      const options: ExportOptions = {
        format,
        delimiter: format === 'csv' ? delimiter : undefined,
        include_headers: includeHeaders,
        json_structure: format === 'json' ? jsonStructure : undefined,
        job_id: jobId,
      };

      const result = await exportData(connectionId, sqlToRun, filePath, options);

      toast.success(
        `Successfully exported ${result.total_rows.toLocaleString()} rows (${(
          result.file_size_bytes / 1024
        ).toFixed(1)} KB) in ${result.elapsed_ms}ms`
      );
      onClose();
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.toLowerCase().includes('cancelled')) {
        toast.info('Export cancelled by user');
      } else {
        toast.error(`Export failed: ${msg}`);
      }
    } finally {
      setIsExporting(false);
      activeJobIdRef.current = null;
    }
  };

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleCancelOrClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150" />
        <Dialog.Content
          aria-describedby="export-modal-desc"
          className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-panel border border-line rounded-lg shadow-2xl max-w-lg w-full flex flex-col text-text focus:outline-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-line bg-panel">
            <div className="flex items-center space-x-2 text-blue-500">
              <Download className="w-5 h-5" />
              <Dialog.Title asChild>
                <h2 id="export-modal-title" className="text-base font-semibold text-text">
                  Export Data - <span className="font-mono">{tableName}</span>
                </h2>
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                onClick={handleCancelOrClose}
                aria-label="Close dialog"
                className="text-muted hover:text-text transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description id="export-modal-desc" className="sr-only">
            Export table data to CSV or JSON format
          </Dialog.Description>

          {/* Form Content */}
          <div className="p-5 space-y-5 text-xs">
            {/* Format Selector */}
            <div>
              <label className="block text-text font-medium mb-2">Export Format</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  data-testid="export-format-csv"
                  onClick={() => setFormat('csv')}
                  className={`flex items-center justify-center space-x-2 p-3 rounded-md border text-sm font-medium transition-all ${
                    format === 'csv'
                      ? 'border-blue-500 bg-blue-500/10 text-blue-500 font-semibold'
                      : 'border-line bg-sidebar hover:border-gray-500 text-muted hover:text-text'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>CSV (Delimited)</span>
                </button>
                <button
                  type="button"
                  data-testid="export-format-json"
                  onClick={() => setFormat('json')}
                  className={`flex items-center justify-center space-x-2 p-3 rounded-md border text-sm font-medium transition-all ${
                    format === 'json'
                      ? 'border-blue-500 bg-blue-500/10 text-blue-500 font-semibold'
                      : 'border-line bg-sidebar hover:border-gray-500 text-muted hover:text-text'
                  }`}
                >
                  <FileCode className="w-4 h-4" />
                  <span>JSON Document</span>
                </button>
              </div>
            </div>

            {/* Scope selection if initial query exists */}
            {initialQuery && (
              <div>
                <label className="block text-gray-300 font-medium mb-2">Data Scope</label>
                <div className="space-y-2">
                  <label className="flex items-center space-x-2 text-gray-300 cursor-pointer">
                    <input
                      type="radio"
                      name="export-scope"
                      value="filtered"
                      checked={scope === 'filtered'}
                      onChange={() => setScope('filtered')}
                      className="rounded border-gray-700 text-blue-600 focus:ring-0 focus:outline-none"
                    />
                    <span>Current Filtered / Sorted View</span>
                  </label>
                  <label className="flex items-center space-x-2 text-gray-300 cursor-pointer">
                    <input
                      type="radio"
                      name="export-scope"
                      value="entire"
                      checked={scope === 'entire'}
                      onChange={() => setScope('entire')}
                      className="rounded border-gray-700 text-blue-600 focus:ring-0 focus:outline-none"
                    />
                    <span>
                      Entire Table{' '}
                      {totalRows !== undefined && (
                        <span className="text-gray-500">({totalRows.toLocaleString()} rows)</span>
                      )}
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* CSV Options */}
            {format === 'csv' && (
              <div className="p-3.5 bg-sidebar rounded border border-line space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-text">Delimiter</label>
                  <select
                    value={delimiter}
                    onChange={(e) => setDelimiter(e.target.value)}
                    data-testid="export-delimiter-select"
                    className="bg-grid border border-line rounded px-2.5 py-1 text-xs text-text focus:border-blue-500 focus:outline-none"
                  >
                    <option value=",">Comma ( , )</option>
                    <option value=";">Semicolon ( ; )</option>
                    <option value="&#9;">Tab ( \t )</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-text">Include Header Row</label>
                  <input
                    type="checkbox"
                    checked={includeHeaders}
                    onChange={(e) => setIncludeHeaders(e.target.checked)}
                    data-testid="export-include-headers-checkbox"
                    className="rounded border-line text-blue-600 focus:ring-0 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* JSON Options */}
            {format === 'json' && (
              <div className="p-3.5 bg-sidebar rounded border border-line space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-text">Structure</label>
                  <select
                    value={jsonStructure}
                    onChange={(e) => setJsonStructure(e.target.value as JsonStructure)}
                    data-testid="export-json-structure-select"
                    className="bg-grid border border-line rounded px-2.5 py-1 text-xs text-text focus:border-blue-500 focus:outline-none"
                  >
                    <option value="array">JSON Array ( [ &#123;...&#125;, &#123;...&#125; ] )</option>
                    <option value="ndjson">NDJSON / Lines ( &#123;...&#125;\n&#123;...&#125; )</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-2 px-5 py-3 border-t border-line bg-panel">
            <button
              type="button"
              onClick={handleCancelOrClose}
              className="px-3 py-1.5 rounded text-xs text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting}
              data-testid="confirm-export-btn"
              className="px-4 py-1.5 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white flex items-center space-x-1.5 transition-colors disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Save & Export...</span>
                </>
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
