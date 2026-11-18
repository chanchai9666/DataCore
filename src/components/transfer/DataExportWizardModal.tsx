import React, { useState, useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Download,
  X,
  Loader2,
  FileSpreadsheet,
  FileCode,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Play,
  FileCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  exportData,
  pickExportFile,
  cancelTransfer,
  onTransferProgress,
  type ExportCompression,
} from '../../api/dataTransferApi';
import { useConnectionStore } from '../../stores/connectionStore';
import {
  useTransferMonitorStore,
  calculateTransferPercent,
} from '../../stores/transferMonitorStore';
import type {
  ExportOptions,
  TransferFormat,
  JsonStructure,
  ExportResult,
  TransferProgress,
} from '../../types/dataTransfer';

export interface DataExportWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
  tableName: string;
  initialQuery?: string;
  totalRows?: number;
}

export const DataExportWizardModal: React.FC<DataExportWizardModalProps> = ({
  isOpen,
  onClose,
  connectionId,
  tableName,
  initialQuery,
  totalRows,
}) => {
  const { t } = useTranslation();
  const connections = useConnectionStore((s) => s.connections);
  const sourceConn = connections.find((c) => c.id === connectionId);
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Step 1: Scope & Format
  const [scope, setScope] = useState<'entire' | 'filtered'>(initialQuery ? 'filtered' : 'entire');
  const [format, setFormat] = useState<TransferFormat>('csv');

  // Step 2: Options
  const [delimiter, setDelimiter] = useState<string>(',');
  const [includeHeaders, setIncludeHeaders] = useState<boolean>(true);
  const [jsonStructure, setJsonStructure] = useState<JsonStructure>('array');
  const [compression, setCompression] = useState<ExportCompression>('none');
  const [useNativeCopy, setUseNativeCopy] = useState<boolean>(false);

  // Step 3: Destination & Progress
  const [destinationPath, setDestinationPath] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const activeJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      setScope(initialQuery ? 'filtered' : 'entire');
      setFormat('csv');
      setDelimiter(',');
      setIncludeHeaders(true);
      setJsonStructure('array');
      setCompression('none');
      setUseNativeCopy(false);
      setDestinationPath(null);
      setIsExporting(false);
      setIsCancelling(false);
      setProgress(null);
      setResult(null);
      activeJobIdRef.current = null;
    }
  }, [isOpen, initialQuery]);

  const handleCancelOrClose = async () => {
    if (isExporting && activeJobIdRef.current && !isCancelling) {
      setIsCancelling(true);
      toast.info('Cancelling export...');
      try {
        await cancelTransfer(activeJobIdRef.current);
      } catch (err) {
        console.error('Failed to cancel export:', err);
      }
      return;
    }
    onClose();
  };

  const handleStartExport = async () => {
    let unlisten: (() => void) | undefined;
    try {
      const selectedPath =
        compression === 'none'
          ? await pickExportFile(tableName, format)
          : await pickExportFile(tableName, format, compression);
      if (!selectedPath) return;

      const jobId = `export_wizard_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      activeJobIdRef.current = jobId;
      setDestinationPath(selectedPath);
      setIsExporting(true);
      setIsCancelling(false);
      setResult(null);
      setProgress({
        job_id: jobId,
        current_row: 0,
        total_rows: totalRows,
        percent: 0,
        status: 'exporting',
      });
      useTransferMonitorStore.getState().startJob({
        jobId,
        label: `Export ${tableName}.${format}`,
        direction: 'export',
        totalRows,
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
        ...(totalRows !== undefined ? { total_rows: totalRows } : {}),
        ...(useNativeCopy ? { use_native_copy: true } : {}),
      };

      const res = await exportData(connectionId, sqlToRun, selectedPath, options);
      useTransferMonitorStore.getState().completeJob(jobId, {
        rowsProcessed: res.total_rows,
        bytesWritten: res.file_size_bytes,
        elapsedMs: res.elapsed_ms,
      });
      setProgress({
        job_id: jobId,
        current_row: res.total_rows,
        total_rows: res.total_rows || totalRows,
        percent: 100,
        status: 'done',
      });
      setResult(res);
      toast.success(`Export completed: ${res.total_rows} rows saved.`);
    } catch (err: any) {
      console.error('Export failed:', err);
      const msg = err?.message || String(err);
      if (activeJobIdRef.current) {
        if (msg.toLowerCase().includes('cancelled')) {
          useTransferMonitorStore.getState().cancelJob(activeJobIdRef.current).catch(() => {});
        } else {
          useTransferMonitorStore.getState().failJob(activeJobIdRef.current, msg);
        }
      }
      if (msg.toLowerCase().includes('cancelled')) {
        toast.info('Export cancelled by user.');
      } else {
        toast.error(`Export failed: ${msg}`);
      }
    } finally {
      if (unlisten) unlisten();
      setIsExporting(false);
      setIsCancelling(false);
      activeJobIdRef.current = null;
    }
  };

  const progressPct = calculateTransferPercent(progress, totalRows);

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleCancelOrClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-100" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-2xl h-[72vh] bg-panel border border-line rounded-xl shadow-2xl flex flex-col overflow-hidden z-50 text-text">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-line bg-black/10 dark:bg-white/5">
            <div className="flex items-center gap-2.5">
              <Download className="w-5 h-5 text-blue-400" />
              <div>
                <Dialog.Title className="text-sm font-semibold text-text">
                  {t('transfer.exportTitle', 'Data Export Wizard')}
                </Dialog.Title>
                <Dialog.Description className="text-xs text-muted">
                  {t('transfer.exportWizardDesc', 'Export table or query result data to CSV, TSV, or JSON format')}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                onClick={handleCancelOrClose}
                className="p-1 rounded text-muted hover:text-text hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Stepper Wizard Indicator */}
          <div className="px-5 py-2.5 border-b border-line bg-black/5 dark:bg-white/5 flex items-center justify-between text-xs">
            {[
              { num: 1, label: t('transfer.stepScopeFormat', 'Scope & Format') },
              { num: 2, label: t('transfer.stepFormatOptions', 'Format Options') },
              { num: 3, label: t('transfer.stepExportDest', 'Export & Destination') },
            ].map((step, idx) => {
              const isActive = currentStep === step.num;
              const isPast = currentStep > step.num;
              return (
                <React.Fragment key={step.num}>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center font-mono text-[11px] ${
                        isActive
                          ? 'bg-blue-600 text-white font-bold'
                          : isPast
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-white/10 text-muted'
                      }`}
                    >
                      {isPast ? '✓' : step.num}
                    </span>
                    <span
                      className={`hidden sm:inline ${
                        isActive ? 'text-text font-semibold' : 'text-muted'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {idx < 2 && <div className="h-0.5 w-12 sm:w-20 bg-line" />}
                </React.Fragment>
              );
            })}
          </div>

          {/* Step Content */}
          <div className="flex-1 overflow-y-auto p-6 bg-panel">
            {/* STEP 1: Scope & Format */}
            {currentStep === 1 && (
              <div className="space-y-5 max-w-lg mx-auto">
                <h3 className="text-sm font-semibold text-text">{t('transfer.step1ExportTitle', 'Step 1: Export Scope & Format')}</h3>

                {/* Source Context Header */}
                <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/10 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-md bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs uppercase">
                      {sourceConn?.driver?.slice(0, 2) || 'DB'}
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                        {t('transfer.sourceTarget', 'Source Target')}
                      </div>
                      <div className="text-xs font-semibold text-text flex items-center gap-1.5">
                        <span>{sourceConn?.name || connectionId}</span>
                        <span className="text-muted">›</span>
                        <span className="font-mono text-blue-600 dark:text-blue-400 font-semibold">{tableName}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted font-medium">
                    {sourceConn?.database || t('transfer.sourceDatabase', 'Source Database')}
                  </div>
                </div>

                {/* Scope Selection */}
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-text">{t('transfer.dataScope', 'Data Scope:')}</label>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <label
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        scope === 'entire'
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-line hover:border-line-hover bg-panel'
                      }`}
                    >
                      <input
                        type="radio"
                        name="exportScope"
                        value="entire"
                        checked={scope === 'entire'}
                        onChange={() => setScope('entire')}
                        className="sr-only"
                      />
                      <div className="font-semibold text-text">{t('transfer.entireTableTitle', 'Entire Table')}</div>
                      <div className="text-[11px] text-muted mt-0.5">
                        {t('transfer.entireTableDesc', 'Export all rows from')} <span className="font-mono text-text">{tableName}</span>
                        {totalRows !== undefined && ` (~${totalRows} ${t('transfer.rowsSuffix', 'rows')})`}
                      </div>
                    </label>

                    <label
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        scope === 'filtered'
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-line hover:border-line-hover bg-panel'
                      } ${!initialQuery ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      <input
                        type="radio"
                        name="exportScope"
                        value="filtered"
                        checked={scope === 'filtered'}
                        onChange={() => setScope('filtered')}
                        disabled={!initialQuery}
                        className="sr-only"
                      />
                      <div className="font-semibold text-text">{t('transfer.filteredResultsTitle', 'Filtered Results')}</div>
                      <div className="text-[11px] text-muted mt-0.5">
                        {t('transfer.filteredResultsDesc', 'Export only rows matching current grid filters')}
                      </div>
                    </label>
                  </div>
                </div>

                {/* Format Selection */}
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-text">{t('transfer.fileFormat', 'File Format:')}</label>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setFormat('csv');
                        setDelimiter(',');
                      }}
                      className={`p-3 rounded-lg border text-left flex items-start gap-3 transition-colors ${
                        format === 'csv'
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-line hover:border-line-hover bg-panel'
                      }`}
                    >
                      <FileSpreadsheet className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-text">{t('transfer.delimitedTitle', 'Delimited (CSV / TSV)')}</div>
                        <div className="text-[11px] text-muted mt-0.5">{t('transfer.delimitedDesc', 'Excel and spreadsheet friendly')}</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormat('json')}
                      className={`p-3 rounded-lg border text-left flex items-start gap-3 transition-colors ${
                        format === 'json'
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-line hover:border-line-hover bg-panel'
                      }`}
                    >
                      <FileCode className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-text">{t('transfer.jsonTitle', 'JSON')}</div>
                        <div className="text-[11px] text-muted mt-0.5">{t('transfer.jsonDesc', 'JSON Array or NDJSON')}</div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Format Options */}
            {currentStep === 2 && (
              <div className="space-y-5 max-w-lg mx-auto">
                <h3 className="text-sm font-semibold text-text">{t('transfer.step2ExportTitle', 'Step 2: Format Options')}</h3>

                {format === 'csv' ? (
                  <div className="p-4 rounded-lg border border-line bg-panel space-y-4 text-xs">
                    <div>
                      <label className="block text-muted font-medium mb-1">{t('transfer.delimiter', 'Delimiter:')}</label>
                      <select
                        value={delimiter}
                        onChange={(e) => setDelimiter(e.target.value)}
                        className="w-full h-[34px] bg-black/10 dark:bg-white/5 border border-line rounded px-2.5 py-1.5 text-text outline-none"
                      >
                        <option value=",">{t('transfer.commaOption', 'Comma (,)')}</option>
                        <option value="&#9;">{t('transfer.tabTsvOption', 'Tab (\\t) - TSV')}</option>
                        <option value=";">{t('transfer.semicolonOption', 'Semicolon (;)')}</option>
                        <option value="|">{t('transfer.pipeOption', 'Pipe (|)')}</option>
                      </select>
                    </div>

                    <div className="pt-2">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={includeHeaders}
                          onChange={(e) => setIncludeHeaders(e.target.checked)}
                          className="rounded border-line text-blue-600 focus:ring-0"
                        />
                        <span className="text-text font-medium">{t('transfer.includeHeadersFirstRow', 'Include column headers as first row')}</span>
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-lg border border-line bg-panel space-y-3 text-xs">
                    <label className="block text-text font-semibold mb-2">{t('transfer.jsonStructure', 'JSON Structure:')}</label>
                    <div className="space-y-2">
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="radio"
                          name="jsonStruct"
                          value="array"
                          checked={jsonStructure === 'array'}
                          onChange={() => setJsonStructure('array')}
                          className="mt-0.5 text-blue-600 focus:ring-0"
                        />
                        <div>
                          <span className="font-medium text-text block">{t('transfer.jsonArrayStdTitle', 'Standard JSON Array [{}]')}</span>
                          <span className="text-muted text-[11px]">{t('transfer.jsonArrayStdDesc', 'Best for REST APIs and frontends')}</span>
                        </div>
                      </label>

                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="radio"
                          name="jsonStruct"
                          value="ndjson"
                          checked={jsonStructure === 'ndjson'}
                          onChange={() => setJsonStructure('ndjson')}
                          className="mt-0.5 text-blue-600 focus:ring-0"
                        />
                        <div>
                          <span className="font-medium text-text block">{t('transfer.ndjsonStdTitle', 'Newline Delimited JSON (NDJSON)')}</span>
                          <span className="text-muted text-[11px]">{t('transfer.ndjsonStdDesc', 'Best for big data, streaming and log aggregation')}</span>
                        </div>
                      </label>
                    </div>
                  </div>
                )}

                <div className="p-4 rounded-lg border border-line bg-panel space-y-3 text-xs">
                  <div>
                    <label className="block text-muted font-medium mb-1">{t('transfer.compressionLabel', 'Compression:')}</label>
                    <select
                      data-testid="export-compression-select"
                      value={compression}
                      onChange={(e) => setCompression(e.target.value as ExportCompression)}
                      className="w-full h-[34px] bg-black/10 dark:bg-white/5 border border-line rounded px-2.5 py-1.5 text-text outline-none"
                    >
                      <option value="none">{t('transfer.compressionNone', 'None (Plaintext)')}</option>
                      <option value="gzip">{t('transfer.compressionGzip', 'Gzip (.gz)')}</option>
                      <option value="zstd">{t('transfer.compressionZstd', 'Zstandard (.zst)')}</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      data-testid="export-use-native-copy"
                      checked={useNativeCopy}
                      onChange={(e) => setUseNativeCopy(e.target.checked)}
                      className="rounded border-line text-blue-600 focus:ring-0"
                    />
                    <span className="text-text font-medium">
                      {t('transfer.useNativeCopyWizardExport', 'Use PostgreSQL Fast COPY (CSV streaming)')}
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* STEP 3: Destination & Export */}
            {currentStep === 3 && (
              <div className="space-y-6 max-w-lg mx-auto py-4 text-center">
                <h3 className="text-sm font-semibold text-text">{t('transfer.step3ExportTitle', 'Step 3: Destination & Export')}</h3>

                {isExporting ? (
                  <div className="space-y-4 py-6 max-w-sm mx-auto">
                    <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto" />
                    <div>
                      <h4 className="text-sm font-semibold text-text">
                        {isCancelling ? t('transfer.cancellingExport', 'Cancelling Export...') : t('transfer.exportingDataPct', { percent: progressPct, defaultValue: `Exporting Data (${progressPct}%)...` })}
                      </h4>
                      <p className="text-xs text-muted mt-1">
                        {isCancelling
                          ? t('transfer.stoppingExportStream', 'Stopping export stream...')
                          : `${(progress?.current_row ?? 0).toLocaleString()}${
                              progress?.total_rows ?? totalRows
                                ? ` / ${(progress?.total_rows ?? totalRows)!.toLocaleString()} ${t('transfer.rowsSuffix', 'rows')}`
                                : ` ${t('transfer.rowsSuffix', 'rows')}`
                            }`}
                      </p>
                    </div>
                    <div className="space-y-1.5 text-left">
                      <div className="flex justify-between text-[11px] font-mono text-muted">
                        <span>{progress?.status || t('transfer.streaming', 'Streaming...')}</span>
                        <span
                          data-testid="wizard-export-percent"
                          className="font-semibold text-blue-400"
                        >
                          {progressPct}%
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                        <div
                          className="bg-blue-500 h-full transition-all duration-150"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ) : result ? (
                  <div className="space-y-4 py-4">
                    <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto" />
                    <div>
                      <h4 className="text-sm font-semibold text-text">{t('transfer.exportCompletedSuccess', 'Export Completed Successfully')}</h4>
                      <p className="text-xs text-muted mt-1 font-mono">
                        {t('transfer.rowsExportedInMs', { rows: result.total_rows, ms: result.elapsed_ms, defaultValue: `${result.total_rows} rows exported in ${result.elapsed_ms}ms` })}
                      </p>
                    </div>

                    {destinationPath && (
                      <div className="p-3 rounded-lg border border-line bg-black/5 dark:bg-white/5 text-xs text-left font-mono truncate text-text">
                        <span className="text-muted block text-[11px] mb-1 font-sans">{t('transfer.savedTo', 'Saved to:')}</span>
                        {destinationPath}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-6 rounded-lg border border-line bg-black/5 dark:bg-white/5 space-y-4 text-left">
                    <div className="flex items-center gap-3">
                      <FileCheck className="w-8 h-8 text-blue-400 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-text">{t('transfer.readyToExport', 'Ready to Export')}</div>
                        <div className="text-[11px] text-muted">
                          {t('transfer.readyToExportDesc', 'Click "Start Export" below to select your destination file and export your data.')}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Controls */}
          <div className="px-5 py-3 border-t border-line bg-black/10 dark:bg-white/5 flex items-center justify-between text-xs">
            <div>
              {currentStep > 1 && !result && !isExporting && (
                <button
                  type="button"
                  onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
                  className="px-3 py-1.5 rounded border border-line hover:bg-white/10 text-text font-medium flex items-center gap-1.5 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{t('common.back', 'Back')}</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancelOrClose}
                disabled={isCancelling}
                className="px-3.5 py-1.5 rounded border border-line hover:bg-white/10 text-muted hover:text-text font-medium transition-colors disabled:opacity-50"
              >
                {isCancelling ? t('transfer.cancellingExport', 'Cancelling...') : isExporting ? t('transfer.cancelExport', 'Cancel Export') : result ? t('common.done', 'Done') : t('common.cancel', 'Cancel')}
              </button>

              {currentStep < 3 && (
                <button
                  type="button"
                  onClick={() => setCurrentStep((s) => s + 1)}
                  className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <span>{t('common.next', 'Next')}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}

              {currentStep === 3 && !result && (
                <button
                  type="button"
                  onClick={handleStartExport}
                  disabled={isExporting}
                  className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{t('transfer.exporting', 'Exporting...')}</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>{t('transfer.startExport', 'Start Export')}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default DataExportWizardModal;
