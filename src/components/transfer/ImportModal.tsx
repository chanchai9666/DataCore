import React, { useState, useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Upload, X, Loader2, FileUp, CheckCircle, ArrowRight, Table } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  previewImportFile,
  importData,
  pickImportFile,
  onTransferProgress,
  cancelTransfer,
} from '../../api/dataTransferApi';
import {
  useTransferMonitorStore,
  calculateTransferPercent,
} from '../../stores/transferMonitorStore';
import type {
  ColumnMapping,
  ImportErrorPolicy,
  ImportMode,
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
  const { t } = useTranslation();
  const [filePath, setFilePath] = useState<string | null>(null);
  const [format, setFormat] = useState<TransferFormat>('csv');
  const [delimiter, setDelimiter] = useState<string>(',');
  const [hasHeaders, setHasHeaders] = useState<boolean>(true);
  const [errorPolicy, setErrorPolicy] = useState<ImportErrorPolicy>('abort');
  const [importMode, setImportMode] = useState<ImportMode>('atomic');
  const [resumeFromCheckpoint, setResumeFromCheckpoint] = useState<boolean>(false);
  const [useNativeCopy, setUseNativeCopy] = useState<boolean>(false);

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
      setImportMode('atomic');
      setResumeFromCheckpoint(false);
      setUseNativeCopy(false);
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
      .map(([source, target]) => {
        const matched = tableColumns.find((tc) => tc.name === target);
        return {
          source_column: source,
          target_column: target,
          target_type: matched?.dataType,
        };
      });

    if (columnMappings.length === 0) {
      toast.error('Please map at least one column to import');
      return;
    }

    let unlisten: (() => void) | undefined;
    try {
      const jobId = `import_modal_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      activeJobIdRef.current = jobId;
      setIsImporting(true);
      useTransferMonitorStore.getState().startJob({
        jobId,
        label: `Import into ${tableName}`,
        direction: 'import',
      });
      setProgress({
        job_id: jobId,
        current_row: 0,
        total_rows: undefined,
        percent: 0,
        status: 'importing',
      });

      if (typeof onTransferProgress === 'function') {
        try {
          unlisten = await onTransferProgress((p) => {
            if (!p.job_id || p.job_id === jobId) {
              setProgress(p);
            }
            useTransferMonitorStore.getState().handleProgress(p);
          });
        } catch {
          // Ignore listener registration errors in non-Tauri environments
        }
      }

      const options: ImportOptions = {
        file_path: filePath,
        format,
        delimiter: format === 'csv' ? delimiter : undefined,
        has_headers: hasHeaders,
        column_mappings: columnMappings,
        error_policy: errorPolicy,
        job_id: jobId,
        import_mode: importMode,
        ...(resumeFromCheckpoint ? { resume_from_checkpoint: true } : {}),
        ...(useNativeCopy ? { use_native_copy: true } : {}),
      };

      const result = await importData(connectionId, tableName, options);
      useTransferMonitorStore.getState().completeJob(jobId, {
        rowsProcessed: result.imported_rows,
        elapsedMs: result.elapsed_ms,
      });

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
      if (activeJobIdRef.current) {
        if (msg.toLowerCase().includes('cancelled')) {
          useTransferMonitorStore.getState().cancelJob(activeJobIdRef.current).catch(() => {});
        } else {
          useTransferMonitorStore.getState().failJob(activeJobIdRef.current, msg);
        }
      }
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

  const progressPct = calculateTransferPercent(progress);

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
          className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-panel border border-line rounded-lg shadow-2xl max-w-2xl w-full flex flex-col text-text max-h-[90vh] focus:outline-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-line bg-panel">
            <div className="flex items-center space-x-2 text-emerald-500">
              <Upload className="w-5 h-5" />
              <Dialog.Title asChild>
                <h2 id="import-modal-title" className="text-base font-semibold text-text">
                  {t('transfer.importIntoTable', 'Import Data into')} <span className="font-mono text-text">{tableName}</span>
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
          <Dialog.Description id="import-modal-desc" className="sr-only">
            Import CSV or JSON data with column mapping into the current table
          </Dialog.Description>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
            {/* File Picker Section */}
            <div className="p-4 bg-sidebar rounded border border-line space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-text block">{t('transfer.sourceFileLabel', 'Select Data Source')}</span>
                  <span className="text-muted text-[11px]">
                    Supported formats: CSV, JSON Array, and NDJSON
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleChooseFile}
                  disabled={isImporting}
                  data-testid="choose-import-file-btn"
                  className="px-3 py-1.5 rounded bg-panel hover:bg-black/5 dark:hover:bg-white/10 border border-line text-text font-medium flex items-center space-x-1.5 transition-colors disabled:opacity-50"
                >
                  <FileUp className="w-3.5 h-3.5 text-blue-500" />
                  <span>{filePath ? t('transfer.browse', 'Change File...') : t('transfer.browseFile', 'Choose File...')}</span>
                </button>
              </div>

              {filePath && (
                <div className="pt-2 border-t border-line flex items-center justify-between font-mono text-[11px] text-text">
                  <span className="truncate max-w-sm" title={filePath}>
                    {filePath}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-500 uppercase font-semibold">
                    {format}
                  </span>
                </div>
              )}
            </div>

            {/* Delimiter & Header Options (CSV) */}
            {filePath && format === 'csv' && (
              <div className="grid grid-cols-2 gap-4 p-3 bg-sidebar rounded border border-line">
                <div className="flex items-center justify-between">
                  <label className="text-text">{t('transfer.delimiter', 'Delimiter')}</label>
                  <select
                    value={delimiter}
                    onChange={(e) => handleDelimiterChange(e.target.value)}
                    data-testid="import-delimiter-select"
                    className="bg-grid border border-line rounded px-2 py-1 text-xs text-text focus:border-blue-500 focus:outline-none"
                  >
                    <option value=",">{t('transfer.commaOption', 'Comma ( , )')}</option>
                    <option value=";">{t('transfer.semicolonOption', 'Semicolon ( ; )')}</option>
                    <option value="&#9;">{t('transfer.tabOption', 'Tab ( \\t )')}</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-text">{t('transfer.firstRowHeaders', 'First row is Header')}</label>
                  <input
                    type="checkbox"
                    checked={hasHeaders}
                    onChange={(e) => setHasHeaders(e.target.checked)}
                    data-testid="import-has-headers-checkbox"
                    className="rounded border-line text-blue-600 focus:ring-0 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Preview Section */}
            {isLoadingPreview && (
              <div className="p-6 text-center text-muted flex flex-col items-center justify-center space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                <span>{t('transfer.loadingPreview', 'Reading file preview...')}</span>
              </div>
            )}

            {preview && preview.preview_rows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text flex items-center space-x-1.5">
                    <Table className="w-3.5 h-3.5 text-blue-500" />
                    <span>{t('transfer.previewRowsCount', { count: preview.preview_rows.length, defaultValue: `File Preview (First ${preview.preview_rows.length} rows)` })}</span>
                  </span>
                  <span className="text-[11px] text-muted">
                    {preview.headers.length} columns detected
                  </span>
                </div>
                <div className="border border-line rounded overflow-x-auto max-h-36">
                  <table className="w-full text-left text-[11px] border-collapse font-mono">
                    <thead className="bg-sidebar text-muted sticky top-0 border-b border-line">
                      <tr>
                        {preview.headers.map((h, i) => (
                          <th key={i} className="px-2.5 py-1.5 font-semibold whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line bg-grid">
                      {preview.preview_rows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-black/5 dark:hover:bg-white/5">
                          {row.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              className="px-2.5 py-1 truncate max-w-xs text-text"
                              title={cell}
                            >
                              {cell === '' ? <span className="text-muted italic">empty</span> : cell}
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
                  <span className="font-medium text-text">{t('transfer.columnMapping', 'Column Mapping')}</span>
                  <span className="text-[11px] text-muted">
                    {t('transfer.matchColumnsHelp', 'Map file columns to destination table columns')}
                  </span>
                </div>
                <div className="border border-line rounded overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-sidebar text-[11px] text-muted border-b border-line">
                      <tr>
                        <th className="px-3 py-2 w-1/2">{t('transfer.sourceFileColumn', 'Source File Column')}</th>
                        <th className="px-1 py-2 text-center w-8"></th>
                        <th className="px-3 py-2 w-1/2">{t('transfer.targetDbColumn', 'Target Table Column')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line bg-grid">
                      {preview.headers.map((srcCol, idx) => (
                        <tr key={srcCol} className="hover:bg-black/5 dark:hover:bg-white/5">
                          <td className="px-3 py-2 font-mono text-text truncate">
                            {srcCol}
                          </td>
                          <td className="px-1 py-2 text-center text-muted">
                            <ArrowRight className="w-3.5 h-3.5 inline" />
                          </td>
                          <td className="px-3 py-1.5">
                            <select
                              value={mappings[srcCol] || '__SKIP__'}
                              onChange={(e) => handleMappingChange(srcCol, e.target.value)}
                              data-testid={`mapping-select-${idx}`}
                              className={`w-full bg-grid border rounded px-2.5 py-1 text-xs focus:outline-none ${
                                mappings[srcCol] && mappings[srcCol] !== '__SKIP__'
                                  ? 'border-emerald-500/60 text-emerald-600 dark:text-emerald-400'
                                  : 'border-line text-muted italic'
                              }`}
                            >
                              <option value="__SKIP__">{t('transfer.skipColumn', '(Skip this column)')}</option>
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
              <div className="p-3.5 bg-sidebar rounded border border-line space-y-2">
                <label className="block text-text font-medium mb-1">
                  {t('transfer.errorPolicyLabel', 'Error Handling Policy')}
                </label>
                <div className="space-y-1.5">
                  <label className="flex items-center space-x-2 text-muted cursor-pointer">
                    <input
                      type="radio"
                      name="error-policy"
                      value="abort"
                      checked={errorPolicy === 'abort'}
                      onChange={() => setErrorPolicy('abort')}
                      data-testid="error-policy-abort"
                      className="rounded border-line text-emerald-600 focus:ring-0 focus:outline-none"
                    />
                    <span>
                      <strong className="text-text">{t('transfer.errorPolicyAbort', 'Atomic Transaction (Rollback on error)')}</strong>
                    </span>
                  </label>
                  <label className="flex items-center space-x-2 text-muted cursor-pointer">
                    <input
                      type="radio"
                      name="error-policy"
                      value="skip"
                      checked={errorPolicy === 'skip'}
                      onChange={() => setErrorPolicy('skip')}
                      data-testid="error-policy-skip"
                      className="rounded border-line text-emerald-600 focus:ring-0 focus:outline-none"
                    />
                    <span>
                      <strong className="text-text">{t('transfer.errorPolicySkip', 'Skip Invalid Rows')}</strong>
                    </span>
                  </label>
                </div>

                {/* Import Mode & Advanced Options */}
                <div className="pt-2.5 border-t border-line space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="import-mode-select" className="text-text font-medium">
                      {t('transfer.importModeLabel', 'Import Mode')}
                    </label>
                    <select
                      id="import-mode-select"
                      data-testid="import-mode-select"
                      value={importMode}
                      onChange={(e) => setImportMode(e.target.value as ImportMode)}
                      className="bg-grid border border-line rounded px-2.5 py-1 text-xs text-text focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="atomic">{t('transfer.importModeAtomic', 'Atomic (Single Transaction)')}</option>
                      <option value="chunked">{t('transfer.importModeChunked', 'Chunked (Periodic Commits + Checkpoint)')}</option>
                      <option value="staging">{t('transfer.importModeStaging', 'Staging (Temp Table Swap)')}</option>
                    </select>
                  </div>
                  <label className="flex items-center space-x-2 text-text cursor-pointer">
                    <input
                      type="checkbox"
                      data-testid="import-resume-checkpoint"
                      checked={resumeFromCheckpoint}
                      onChange={(e) => setResumeFromCheckpoint(e.target.checked)}
                      className="rounded border-line text-emerald-600 focus:ring-0 focus:outline-none"
                    />
                    <span>{t('transfer.resumeCheckpoint', 'Resume from previous checkpoint if available')}</span>
                  </label>
                  <label className="flex items-center space-x-2 text-text cursor-pointer">
                    <input
                      type="checkbox"
                      data-testid="import-use-native-copy"
                      checked={useNativeCopy}
                      onChange={(e) => setUseNativeCopy(e.target.checked)}
                      className="rounded border-line text-emerald-600 focus:ring-0 focus:outline-none"
                    />
                    <span>{t('transfer.useNativeCopyImport', 'Use PostgreSQL Fast COPY (CSV, Abort mode)')}</span>
                  </label>
                </div>
              </div>
            )}

            {/* Real-time Progress Bar */}
            {isImporting && (
              <div className="p-4 bg-sidebar rounded border border-emerald-500/30 space-y-2">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-emerald-500 flex items-center space-x-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('transfer.importingRows', 'Importing rows...')}</span>
                  </span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-muted">
                      {progress?.current_row?.toLocaleString() || 0}{' '}
                      {progress?.total_rows ? `/ ${progress.total_rows.toLocaleString()} rows` : 'rows processed'}
                    </span>
                    <span
                      data-testid="import-modal-percent"
                      className="font-semibold text-emerald-500"
                    >
                      {progressPct}%
                    </span>
                  </div>
                </div>
                <div className="w-full bg-grid h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-200"
                    style={{ width: `${progressPct}%` }}
                  />
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
              {t('common.cancel', 'Cancel')}
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
                  <span>{t('transfer.importingWithPercent', { percent: progressPct, defaultValue: `Importing (${progressPct}%)...` })}</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{t('transfer.startImport', 'Start Import')}</span>
                </>
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
