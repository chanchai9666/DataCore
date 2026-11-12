import React, { useState, useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Upload, X, Loader2, FileUp, CheckCircle, ArrowRight, Table } from 'lucide-react';
import { toast } from 'sonner';
import {
  previewImportFile,
  importData,
  pickImportFile,
  onTransferProgress,
  cancelTransfer,
} from '../../api/dataTransferApi';
import type {
  ColumnMapping,
  ImportErrorPolicy,
  ImportOptions,
  ImportPreview,
  TransferFormat,
  TransferProgress,
} from '../../types/dataTransfer';

export interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
  tableName: string;
  tableColumns: { name: string; dataType: string }[];
  onImportSuccess?: () => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  connectionId,
  tableName,
  tableColumns,
  onImportSuccess,
}) => {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [format, setFormat] = useState<TransferFormat>('csv');
  const [delimiter, setDelimiter] = useState<string>(',');
  const [hasHeaders, setHasHeaders] = useState<boolean>(true);
  const [errorPolicy, setErrorPolicy] = useState<ImportErrorPolicy>('abort');

  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mappings, setMappings] = useState<Record<string, string>>({}); // sourceColumn -> targetColumn
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const activeJobIdRef = useRef<string | null>(null);

  // Reset state when opened or closed
  useEffect(() => {
    if (!isOpen) {
      setFilePath(null);
      setPreview(null);
      setMappings({});
      setIsImporting(false);
      setProgress(null);
      activeJobIdRef.current = null;
    }
  }, [isOpen]);

  const handleCancelOrClose = async () => {
    if (isImporting && activeJobIdRef.current) {
      try {
        await cancelTransfer(activeJobIdRef.current);
        toast.info('Import cancelled');
      } catch (err) {
        console.error('Failed to cancel import:', err);
      }
      return;
    }
    onClose();
  };

  // Load preview whenever filePath or delimiter changes
  const loadPreview = async (path: string, delim?: string) => {
    try {
      setIsLoadingPreview(true);
      const isJson = path.toLowerCase().endsWith('.json') || path.toLowerCase().endsWith('.ndjson') || path.toLowerCase().endsWith('.jsonl');
      setFormat(isJson ? 'json' : 'csv');

      const previewData = await previewImportFile(path, delim);
      setPreview(previewData);
      if (previewData.detected_delimiter) {
        setDelimiter(previewData.detected_delimiter);
      }

      // Auto-map source columns to table columns
      const autoMappings: Record<string, string> = {};
      const targetColNames = tableColumns.map((c) => c.name);

      previewData.headers.forEach((src) => {
        const matched = targetColNames.find(
          (t) => t.toLowerCase() === src.toLowerCase() || t.toLowerCase().replace(/_/g, '') === src.toLowerCase().replace(/_/g, '')
        );
        if (matched) {
          autoMappings[src] = matched;
        } else {
          autoMappings[src] = '__SKIP__';
        }
      });

      setMappings(autoMappings);
    } catch (err: any) {
      toast.error(`Failed to preview file: ${err.message || String(err)}`);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleChooseFile = async () => {
    const selected = await pickImportFile();
    if (selected) {
      setFilePath(selected);
      await loadPreview(selected);
    }
  };

  const handleDelimiterChange = async (newDelim: string) => {
    setDelimiter(newDelim);
    if (filePath) {
      await loadPreview(filePath, newDelim);
    }
  };

  const handleMappingChange = (sourceCol: string, targetCol: string) => {
    setMappings((prev) => ({
      ...prev,
      [sourceCol]: targetCol,
    }));
  };

  const handleStartImport = async () => {
    if (!filePath) {
      toast.error('Please choose a file to import');
      return;
    }

    const columnMappings: ColumnMapping[] = Object.entries(mappings)
      .filter(([_, target]) => target && target !== '__SKIP__')
      .map(([source, target]) => ({
        source_column: source,
        target_column: target,
      }));

    if (columnMappings.length === 0) {
      toast.error('Please map at least one column to import');
      return;
    }

    let unlisten: (() => void) | undefined;
    try {
      const jobId = `import_modal_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      activeJobIdRef.current = jobId;
      setIsImporting(true);
      setProgress({
        current_row: 0,
        total_rows: undefined,
        status: 'importing',
      });

      unlisten = await onTransferProgress((p) => {
        setProgress(p);
      });

      const options: ImportOptions = {
        file_path: filePath,
        format,
        delimiter: format === 'csv' ? delimiter : undefined,
        has_headers: hasHeaders,
        column_mappings: columnMappings,
        error_policy: errorPolicy,
        job_id: jobId,
      };

      const result = await importData(connectionId, tableName, options);

      if (result.skipped_rows > 0) {
        toast.warning(
          `Imported ${result.imported_rows.toLocaleString()} rows (${result.skipped_rows.toLocaleString()} skipped due to errors) in ${result.elapsed_ms}ms`
        );
      } else {
        toast.success(
          `Successfully imported ${result.imported_rows.toLocaleString()} rows in ${result.elapsed_ms}ms`
        );
      }

      onImportSuccess?.();
      onClose();
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.toLowerCase().includes('cancelled')) {
        toast.info('Import cancelled by user');
      } else {
        toast.error(`Import failed: ${msg}`);
      }
    } finally {
      setIsImporting(false);
      activeJobIdRef.current = null;
      if (unlisten) unlisten();
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
          aria-describedby="import-modal-desc"
          className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-w-2xl w-full flex flex-col text-gray-200 max-h-[90vh] focus:outline-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800 bg-gray-950/40">
            <div className="flex items-center space-x-2 text-emerald-400">
              <Upload className="w-5 h-5" />
              <Dialog.Title asChild>
                <h2 id="import-modal-title" className="text-base font-semibold">
                  Import Data into <span className="font-mono text-white">{tableName}</span>
                </h2>
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                onClick={handleCancelOrClose}
                aria-label="Close dialog"
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description id="import-modal-desc" className="sr-only">
            Import CSV or JSON data with column mapping into the current table
          </Dialog.Description>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
            {/* File Picker Section */}
            <div className="p-4 bg-gray-950/60 rounded border border-gray-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-gray-200 block">Select Data Source</span>
                  <span className="text-gray-400 text-[11px]">
                    Supported formats: CSV, JSON Array, and NDJSON
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleChooseFile}
                  disabled={isImporting}
                  data-testid="choose-import-file-btn"
                  className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-200 font-medium flex items-center space-x-1.5 transition-colors disabled:opacity-50"
                >
                  <FileUp className="w-3.5 h-3.5 text-blue-400" />
                  <span>{filePath ? 'Change File...' : 'Choose File...'}</span>
                </button>
              </div>

              {filePath && (
                <div className="pt-2 border-t border-gray-800/80 flex items-center justify-between font-mono text-[11px] text-gray-300">
                  <span className="truncate max-w-sm" title={filePath}>
                    {filePath}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 uppercase font-semibold">
                    {format}
                  </span>
                </div>
              )}
            </div>

            {/* Delimiter & Header Options (CSV) */}
            {filePath && format === 'csv' && (
              <div className="grid grid-cols-2 gap-4 p-3 bg-gray-950/40 rounded border border-gray-800">
                <div className="flex items-center justify-between">
                  <label className="text-gray-300">Delimiter</label>
                  <select
                    value={delimiter}
                    onChange={(e) => handleDelimiterChange(e.target.value)}
                    data-testid="import-delimiter-select"
                    className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:border-blue-500 focus:outline-none"
                  >
                    <option value=",">Comma ( , )</option>
                    <option value=";">Semicolon ( ; )</option>
                    <option value="&#9;">Tab ( \t )</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-gray-300">First row is Header</label>
                  <input
                    type="checkbox"
                    checked={hasHeaders}
                    onChange={(e) => setHasHeaders(e.target.checked)}
                    data-testid="import-has-headers-checkbox"
                    className="rounded border-gray-700 text-blue-600 focus:ring-0 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Preview Section */}
            {isLoadingPreview && (
              <div className="p-6 text-center text-gray-400 flex flex-col items-center justify-center space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                <span>Reading file preview...</span>
              </div>
            )}

            {preview && preview.preview_rows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-300 flex items-center space-x-1.5">
                    <Table className="w-3.5 h-3.5 text-blue-400" />
                    <span>File Preview (First {preview.preview_rows.length} rows)</span>
                  </span>
                  <span className="text-[11px] text-gray-500">
                    {preview.headers.length} columns detected
                  </span>
                </div>
                <div className="border border-gray-800 rounded overflow-x-auto max-h-36">
                  <table className="w-full text-left text-[11px] border-collapse font-mono">
                    <thead className="bg-gray-950 text-gray-400 sticky top-0 border-b border-gray-800">
                      <tr>
                        {preview.headers.map((h, i) => (
                          <th key={i} className="px-2.5 py-1.5 font-semibold whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50 bg-gray-900/30">
                      {preview.preview_rows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-gray-800/30">
                          {row.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              className="px-2.5 py-1 truncate max-w-xs text-gray-300"
                              title={cell}
                            >
                              {cell === '' ? <span className="text-gray-600 italic">empty</span> : cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Column Mapping Section */}
            {preview && preview.headers.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-300">Column Mapping</span>
                  <span className="text-[11px] text-gray-400">
                    Map file columns to destination table columns
                  </span>
                </div>
                <div className="border border-gray-800 rounded overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-gray-950/80 text-[11px] text-gray-400 border-b border-gray-800">
                      <tr>
                        <th className="px-3 py-2 w-1/2">Source File Column</th>
                        <th className="px-1 py-2 text-center w-8"></th>
                        <th className="px-3 py-2 w-1/2">Target Table Column</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/60 bg-gray-900/40">
                      {preview.headers.map((srcCol, idx) => (
                        <tr key={srcCol} className="hover:bg-gray-800/20">
                          <td className="px-3 py-2 font-mono text-gray-200 truncate">
                            {srcCol}
                          </td>
                          <td className="px-1 py-2 text-center text-gray-500">
                            <ArrowRight className="w-3.5 h-3.5 inline" />
                          </td>
                          <td className="px-3 py-1.5">
                            <select
                              value={mappings[srcCol] || '__SKIP__'}
                              onChange={(e) => handleMappingChange(srcCol, e.target.value)}
                              data-testid={`mapping-select-${idx}`}
                              className={`w-full bg-gray-950 border rounded px-2.5 py-1 text-xs focus:outline-none ${
                                mappings[srcCol] && mappings[srcCol] !== '__SKIP__'
                                  ? 'border-emerald-500/50 text-emerald-300'
                                  : 'border-gray-700 text-gray-500 italic'
                              }`}
                            >
                              <option value="__SKIP__">(Skip this column)</option>
                              {tableColumns.map((col) => (
                                <option key={col.name} value={col.name}>
                                  {col.name} ({col.dataType})
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Error Handling Policy */}
            {preview && (
              <div className="p-3.5 bg-gray-950/60 rounded border border-gray-800 space-y-2">
                <label className="block text-gray-300 font-medium mb-1">
                  Error Handling Policy
                </label>
                <div className="space-y-1.5">
                  <label className="flex items-center space-x-2 text-gray-300 cursor-pointer">
                    <input
                      type="radio"
                      name="error-policy"
                      value="abort"
                      checked={errorPolicy === 'abort'}
                      onChange={() => setErrorPolicy('abort')}
                      data-testid="error-policy-abort"
                      className="rounded border-gray-700 text-emerald-600 focus:ring-0 focus:outline-none"
                    />
                    <span>
                      <strong className="text-white">Atomic Transaction (Rollback on error)</strong>{' '}
                      — Discard all changes if any row fails
                    </span>
                  </label>
                  <label className="flex items-center space-x-2 text-gray-300 cursor-pointer">
                    <input
                      type="radio"
                      name="error-policy"
                      value="skip"
                      checked={errorPolicy === 'skip'}
                      onChange={() => setErrorPolicy('skip')}
                      data-testid="error-policy-skip"
                      className="rounded border-gray-700 text-emerald-600 focus:ring-0 focus:outline-none"
                    />
                    <span>
                      <strong className="text-white">Skip Invalid Rows</strong> — Insert valid rows
                      and continue past errors
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* Real-time Progress Bar */}
            {isImporting && (
              <div className="p-4 bg-gray-950 rounded border border-emerald-500/30 space-y-2">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-emerald-300 flex items-center space-x-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Importing rows...</span>
                  </span>
                  <span className="text-gray-400 font-mono">
                    {progress?.current_row?.toLocaleString() || 0}{' '}
                    {progress?.total_rows ? `/ ${progress.total_rows.toLocaleString()} rows` : 'rows processed'}
                  </span>
                </div>
                <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-200"
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
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-2 px-5 py-3 border-t border-gray-800 bg-gray-950/40">
            <button
              type="button"
              onClick={handleCancelOrClose}
              className="px-3 py-1.5 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleStartImport}
              disabled={isImporting || !filePath || !preview}
              data-testid="confirm-import-btn"
              className="px-4 py-1.5 rounded text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white flex items-center space-x-1.5 transition-colors disabled:opacity-50"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Start Import</span>
                </>
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
