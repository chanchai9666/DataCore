import React, { useState, useEffect, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  FileSpreadsheet,
  Upload,
  X,
  Loader2,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Play,
  FileCode,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  previewImportFile,
  importData,
  pickImportFile,
  onTransferProgress,
  cancelTransfer,
} from '../../api/dataTransferApi';
import { dbApi } from '../../api/db';
import { formatCellValue } from '../../utils/cellFormatter';
import { formatSqlLiteral } from '../../api/queryBuilder';
import { useConnectionStore } from '../../stores/connectionStore';
import type {
  ColumnMapping,
  ImportErrorPolicy,
  ImportOptions,
  ImportPreview,
  TransferFormat,
  TransferProgress,
  ImportResult,
} from '../../types/dataTransfer';

export interface DataImportWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
  driver?: string;
  initialTableName?: string;
  initialSchemaName?: string;
  onImportSuccess?: () => void;
}

export const DataImportWizardModal: React.FC<DataImportWizardModalProps> = ({
  isOpen,
  onClose,
  connectionId,
  driver = 'sqlite',
  initialTableName,
  initialSchemaName,
  onImportSuccess,
}) => {
  const connections = useConnectionStore((s) => s.connections);
  const targetConn = connections.find((c) => c.id === connectionId);
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Step 1: File & Format
  const [filePath, setFilePath] = useState<string | null>(null);
  const [format, setFormat] = useState<TransferFormat>('csv');
  const [delimiter, setDelimiter] = useState<string>(',');
  const [hasHeaders, setHasHeaders] = useState<boolean>(true);

  // Step 2: Destination Table
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [targetTable, setTargetTable] = useState<string>(initialTableName || '');
  const [targetColumns, setTargetColumns] = useState<{ name: string; dataType: string }[]>([]);
  const [isLoadingTables, setIsLoadingTables] = useState<boolean>(false);

  // Step 3: Column Mapping
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mappings, setMappings] = useState<Record<string, string>>({}); // sourceColumn -> targetColumn
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);

  // Step 4: Preview & Policy
  const [errorPolicy, setErrorPolicy] = useState<ImportErrorPolicy>('abort');
  const [batchSize, setBatchSize] = useState<number>(1000);

  // Step 5: Execution & Progress
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  // Reset state when opened/closed
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      setFilePath(null);
      setFormat('csv');
      setDelimiter(',');
      setHasHeaders(true);
      setTargetTable(initialTableName || '');
      setPreview(null);
      setMappings({});
      setErrorPolicy('abort');
      setProgress(null);
      setResult(null);
    }
  }, [isOpen, initialTableName]);

  // Load available tables for connection
  const loadTables = useCallback(async () => {
    if (!connectionId) return;
    setIsLoadingTables(true);
    try {
      const d = (driver || '').toLowerCase();
      let sql = '';
      if (d.includes('sqlite')) {
        sql = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;";
      } else if (d.includes('mysql')) {
        const schema = initialSchemaName ? formatSqlLiteral(initialSchemaName, 'mysql') : 'DATABASE()';
        sql = `SELECT table_name FROM information_schema.tables WHERE table_schema = ${schema} AND table_type = 'BASE TABLE' ORDER BY table_name;`;
      } else {
        const schema = initialSchemaName || 'public';
        sql = `SELECT table_name FROM information_schema.tables WHERE table_schema = ${formatSqlLiteral(schema, 'postgres')} AND table_type = 'BASE TABLE' ORDER BY table_name;`;
      }

      const res = await dbApi.executeDirectQuery(connectionId, sql);
      const names = res.rows.map((r) => formatCellValue(r[0]));
      setAvailableTables(names);

      if (!targetTable && names.length > 0) {
        setTargetTable(names[0]);
      }
    } catch (err) {
      console.error('Failed to load table list for import wizard:', err);
    } finally {
      setIsLoadingTables(false);
    }
  }, [connectionId, driver, initialSchemaName, targetTable]);

  useEffect(() => {
    if (isOpen) {
      loadTables();
    }
  }, [isOpen, loadTables]);

  // Load target columns when targetTable changes
  const loadTargetColumns = useCallback(async () => {
    if (!connectionId || !targetTable) return;
    try {
      const res = await dbApi.executeDirectQuery(
        connectionId,
        `SELECT * FROM "${targetTable}" LIMIT 0;`
      );
      setTargetColumns(
        (res.columns || []).map((c) => ({
          name: c.name,
          dataType: c.data_type,
        }))
      );
    } catch {
      // Fallback without quotes for MySQL or general
      try {
        const res = await dbApi.executeDirectQuery(
          connectionId,
          `SELECT * FROM ${targetTable} LIMIT 0;`
        );
        setTargetColumns(
          (res.columns || []).map((c) => ({
            name: c.name,
            dataType: c.data_type,
          }))
        );
      } catch (err) {
        console.error(`Failed to inspect columns for table ${targetTable}:`, err);
      }
    }
  }, [connectionId, targetTable]);

  useEffect(() => {
    if (targetTable) {
      loadTargetColumns();
    }
  }, [targetTable, loadTargetColumns]);

  // Handle pick file
  const handlePickFile = async () => {
    try {
      const selected = await pickImportFile();
      if (selected) {
        setFilePath(selected);
        // Auto-detect format from extension
        if (selected.endsWith('.tsv')) {
          setFormat('csv');
          setDelimiter('\t');
        } else if (selected.endsWith('.json')) {
          setFormat('json');
        } else if (selected.endsWith('.csv')) {
          setFormat('csv');
          setDelimiter(',');
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to select file');
    }
  };

  // Fetch preview when advancing to mapping step
  const loadPreview = async () => {
    if (!filePath) return;
    setIsLoadingPreview(true);
    try {
      const prev = await previewImportFile(
        filePath,
        format === 'csv' ? delimiter : undefined
      );
      setPreview(prev);

      // Auto-map matching column names
      const initialMap: Record<string, string> = {};
      prev.headers.forEach((srcHeader) => {
        const match = targetColumns.find(
          (tc) => tc.name.toLowerCase() === srcHeader.toLowerCase()
        );
        if (match) {
          initialMap[srcHeader] = match.name;
        }
      });
      setMappings(initialMap);
    } catch (err: any) {
      console.error('Failed to load preview:', err);
      toast.error(err?.message || 'Failed to parse file preview');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleNext = async () => {
    if (currentStep === 1) {
      if (!filePath) {
        toast.error('Please choose a file to import.');
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (!targetTable) {
        toast.error('Please select a destination table.');
        return;
      }
      await loadPreview();
      setCurrentStep(3);
    } else if (currentStep === 3) {
      const mappedCount = Object.values(mappings).filter(Boolean).length;
      if (mappedCount === 0) {
        toast.error('Please map at least one column before proceeding.');
        return;
      }
      setCurrentStep(4);
    } else if (currentStep === 4) {
      handleStartImport();
    }
  };

  const handleCancelOrClose = async () => {
    if (isImporting && currentJobId && !isCancelling) {
      setIsCancelling(true);
      toast.info('Cancelling import...');
      try {
        await cancelTransfer(currentJobId);
      } catch (e) {
        console.error('Failed to cancel import:', e);
      }
      return;
    }
    onClose();
  };

  const handleStartImport = async () => {
    if (!filePath || !targetTable) return;

    const jobId = `import_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    setCurrentJobId(jobId);
    setIsCancelling(false);
    setCurrentStep(5);
    setIsImporting(true);
    setProgress(null);
    setResult(null);

    const column_mappings: ColumnMapping[] = Object.entries(mappings)
      .filter(([_, targetCol]) => Boolean(targetCol))
      .map(([sourceCol, targetCol]) => ({
        source_column: sourceCol,
        target_column: targetCol,
      }));

    const options: ImportOptions = {
      file_path: filePath,
      format,
      delimiter: format === 'csv' ? delimiter : undefined,
      has_headers: hasHeaders,
      column_mappings,
      error_policy: errorPolicy,
      batch_size: batchSize,
      job_id: jobId,
    };

    let unlisten: (() => void) | undefined;
    try {
      unlisten = await onTransferProgress((p) => {
        setProgress(p);
      });

      const res = await importData(connectionId, targetTable, options);
      setResult(res);
      toast.success(`Import completed: ${res.imported_rows} rows imported.`);
      onImportSuccess?.();
    } catch (err: any) {
      console.error('Import failed:', err);
      const msg = err?.message || String(err);
      if (msg.includes('cancelled')) {
        toast.info('Import cancelled by user.');
      } else {
        toast.error(`Import failed: ${msg}`);
      }
    } finally {
      setIsImporting(false);
      setIsCancelling(false);
      setCurrentJobId(null);
      if (unlisten) unlisten();
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleCancelOrClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-100" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-3xl h-[78vh] bg-panel border border-line rounded-xl shadow-2xl flex flex-col overflow-hidden z-50 text-text">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-line bg-black/10 dark:bg-white/5">
            <div className="flex items-center gap-2.5">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
              <div>
                <Dialog.Title className="text-sm font-semibold text-text">
                  Data Import Wizard
                </Dialog.Title>
                <Dialog.Description className="text-xs text-muted">
                  Step-by-step assistant for importing CSV, TSV, and JSON data into your database
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
              { num: 1, label: 'Source File' },
              { num: 2, label: 'Destination Table' },
              { num: 3, label: 'Column Mapping' },
              { num: 4, label: 'Options & Policy' },
              { num: 5, label: 'Execution' },
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
                  {idx < 4 && <div className="h-0.5 w-6 sm:w-10 bg-line" />}
                </React.Fragment>
              );
            })}
          </div>

          {/* Step Content */}
          <div className="flex-1 overflow-y-auto p-6 bg-panel">
            {/* STEP 1: Source File & Format */}
            {currentStep === 1 && (
              <div className="space-y-5 max-w-xl mx-auto">
                <h3 className="text-sm font-semibold text-text">Step 1: Source File & Format</h3>

                {/* Destination Context Header */}
                <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-md bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs uppercase">
                      {targetConn?.driver?.slice(0, 2) || driver.slice(0, 2) || 'DB'}
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                        Destination Target
                      </div>
                      <div className="text-xs font-semibold text-text flex items-center gap-1.5">
                        <span>{targetConn?.name || connectionId}</span>
                        {initialSchemaName && (
                          <>
                            <span className="text-muted">›</span>
                            <span className="font-mono text-muted">{initialSchemaName}</span>
                          </>
                        )}
                        {initialTableName && (
                          <>
                            <span className="text-muted">›</span>
                            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{initialTableName}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted font-medium">
                    {targetConn?.database || 'Target Database'}
                  </div>
                </div>

                {/* File picker */}
                <div className="p-4 rounded-lg border border-line bg-black/5 dark:bg-white/5 space-y-3">
                  <label className="block text-xs font-medium text-text">Choose file to import:</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      placeholder="No file chosen..."
                      value={filePath || ''}
                      className="flex-1 text-xs bg-panel border border-line rounded px-3 py-2 text-text outline-none"
                    />
                    <button
                      type="button"
                      onClick={handlePickFile}
                      className="px-3.5 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Browse File</span>
                    </button>
                  </div>
                </div>

                {/* Format selection */}
                <div className="grid grid-cols-2 gap-3">
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
                      <div className="text-xs font-semibold text-text">Delimited Text (CSV / TSV)</div>
                      <div className="text-[11px] text-muted mt-0.5">Comma, tab, or custom separated table rows</div>
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
                      <div className="text-xs font-semibold text-text">JSON Array / NDJSON</div>
                      <div className="text-[11px] text-muted mt-0.5">Array of objects or newline-delimited JSON</div>
                    </div>
                  </button>
                </div>

                {format === 'csv' && (
                  <div className="grid grid-cols-2 gap-4 p-4 rounded-lg border border-line bg-panel text-xs">
                    <div>
                      <label className="block text-muted mb-1 font-medium">Delimiter:</label>
                      <select
                        value={delimiter}
                        onChange={(e) => setDelimiter(e.target.value)}
                        className="w-full h-[34px] bg-black/10 dark:bg-white/5 border border-line rounded px-2.5 py-1.5 text-text outline-none"
                      >
                        <option value=",">Comma (,)</option>
                        <option value="&#9;">Tab (\t)</option>
                        <option value=";">Semicolon (;)</option>
                        <option value="|">Pipe (|)</option>
                      </select>
                    </div>

                    <div className="flex items-center pt-5">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={hasHeaders}
                          onChange={(e) => setHasHeaders(e.target.checked)}
                          className="rounded border-line text-blue-600 focus:ring-0"
                        />
                        <span className="text-text font-medium">First row contains column headers</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: Destination Table Selection */}
            {currentStep === 2 && (
              <div className="space-y-5 max-w-xl mx-auto">
                <h3 className="text-sm font-semibold text-text">Step 2: Destination Table</h3>

                <div className="p-4 rounded-lg border border-line bg-black/5 dark:bg-white/5 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-text mb-1.5">
                      Select target table in database:
                    </label>
                    {isLoadingTables ? (
                      <div className="flex items-center gap-2 text-xs text-muted py-2">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        <span>Loading tables...</span>
                      </div>
                    ) : (
                      <select
                        value={targetTable}
                        onChange={(e) => setTargetTable(e.target.value)}
                        className="w-full h-[34px] text-xs bg-panel border border-line rounded px-3 py-1.5 text-text outline-none focus:border-accent"
                      >
                        {availableTables.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {targetColumns.length > 0 && (
                    <div className="pt-2">
                      <span className="text-xs text-muted block mb-2 font-medium">
                        Target Table Columns ({targetColumns.length}):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {targetColumns.map((col) => (
                          <span
                            key={col.name}
                            className="text-[11px] font-mono px-2 py-0.5 rounded bg-panel border border-line text-text"
                          >
                            {col.name} <span className="text-muted">({col.dataType})</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 3: Column Mapping */}
            {currentStep === 3 && (
              <div className="space-y-4 max-w-2xl mx-auto">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-text">Step 3: Column Mapping</h3>
                  <span className="text-xs text-muted">
                    Match file columns with target database columns
                  </span>
                </div>

                {isLoadingPreview ? (
                  <div className="flex flex-col items-center justify-center p-12 text-muted text-xs">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500 mb-2" />
                    <span>Parsing source file preview...</span>
                  </div>
                ) : !preview ? (
                  <div className="text-xs text-rose-400 p-4 border border-rose-500/20 rounded">
                    Unable to load preview for column mapping.
                  </div>
                ) : (
                  <div className="border border-line rounded-lg overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-black/10 dark:bg-white/5 border-b border-line text-muted font-medium">
                        <tr>
                          <th className="py-2 px-3 w-1/3">Source File Column</th>
                          <th className="py-2 px-3 w-10 text-center"></th>
                          <th className="py-2 px-3 w-1/3">Target DB Column</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/30 font-mono text-[11px]">
                        {preview.headers.map((srcCol) => (
                          <tr key={srcCol} className="hover:bg-white/5">
                            <td className="py-2.5 px-3 text-text font-medium truncate">
                              {srcCol}
                            </td>
                            <td className="py-2.5 px-3 text-center text-muted">
                              <ArrowRight className="w-3.5 h-3.5 mx-auto text-blue-400" />
                            </td>
                            <td className="py-2.5 px-3">
                              <select
                                value={mappings[srcCol] || ''}
                                onChange={(e) =>
                                  setMappings({
                                    ...mappings,
                                    [srcCol]: e.target.value,
                                  })
                                }
                                className="w-full bg-black/10 dark:bg-white/5 border border-line rounded px-2 py-1 text-text outline-none focus:border-accent"
                              >
                                <option value="">-- Ignore Column --</option>
                                {targetColumns.map((tc) => (
                                  <option key={tc.name} value={tc.name}>
                                    {tc.name} ({tc.dataType})
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* STEP 4: Options & Error Policy */}
            {currentStep === 4 && (
              <div className="space-y-5 max-w-xl mx-auto">
                <h3 className="text-sm font-semibold text-text">Step 4: Preview & Error Policy</h3>

                <div className="p-4 rounded-lg border border-line bg-panel space-y-4 text-xs">
                  <div>
                    <label className="block text-text font-semibold mb-2">Error Handling Policy:</label>
                    <div className="space-y-2">
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="radio"
                          name="errorPolicy"
                          value="abort"
                          checked={errorPolicy === 'abort'}
                          onChange={() => setErrorPolicy('abort')}
                          className="mt-0.5 text-blue-600 focus:ring-0"
                        />
                        <div>
                          <span className="font-medium text-text block">Abort on Error (Recommended)</span>
                          <span className="text-muted text-[11px]">
                            Stop import and rollback transaction if any row encounters a constraint violation or type error.
                          </span>
                        </div>
                      </label>

                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="radio"
                          name="errorPolicy"
                          value="skip"
                          checked={errorPolicy === 'skip'}
                          onChange={() => setErrorPolicy('skip')}
                          className="mt-0.5 text-blue-600 focus:ring-0"
                        />
                        <div>
                          <span className="font-medium text-text block">Skip Invalid Rows</span>
                          <span className="text-muted text-[11px]">
                            Continue importing valid rows and skip individual rows that fail constraint checks.
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-line/40">
                    <label className="block text-text font-semibold mb-1">Batch Size:</label>
                    <select
                      value={batchSize}
                      onChange={(e) => setBatchSize(Number(e.target.value))}
                      className="w-48 h-[34px] bg-black/10 dark:bg-white/5 border border-line rounded px-2.5 py-1.5 text-text outline-none"
                    >
                      <option value={200}>200 rows per batch</option>
                      <option value={500}>500 rows per batch</option>
                      <option value={1000}>1,000 rows per batch</option>
                      <option value={2500}>2,500 rows per batch</option>
                    </select>
                  </div>
                </div>

                {preview && preview.preview_rows.length > 0 && (
                  <div className="border border-line rounded-lg overflow-hidden text-xs">
                    <div className="bg-black/10 dark:bg-white/5 px-3 py-2 font-medium text-muted border-b border-line">
                      Sample Data Preview (First {preview.preview_rows.length} rows):
                    </div>
                    <div className="overflow-x-auto max-h-36">
                      <table className="w-full text-left font-mono text-[11px]">
                        <thead className="border-b border-line text-muted">
                          <tr>
                            {preview.headers.map((h) => (
                              <th key={h} className="py-1.5 px-2.5">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line/30">
                          {preview.preview_rows.map((row, rIdx) => (
                            <tr key={rIdx}>
                              {row.map((cell, cIdx) => (
                                <td key={cIdx} className="py-1 px-2.5 truncate max-w-[150px]">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 5: Execution & Progress */}
            {currentStep === 5 && (
              <div className="space-y-6 max-w-md mx-auto text-center py-6">
                {isImporting ? (
                  <>
                    <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto" />
                    <div>
                      <h4 className="text-sm font-semibold text-text">
                        {isCancelling ? 'Cancelling Import...' : 'Importing Data...'}
                      </h4>
                      <p className="text-xs text-muted mt-1">
                        {isCancelling
                          ? 'Aborting batches and rolling back transaction...'
                          : progress
                          ? `${progress.status} (Row ${progress.current_row})`
                          : 'Streaming rows into database...'}
                      </p>
                    </div>
                  </>
                ) : result ? (
                  <>
                    <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto" />
                    <div>
                      <h4 className="text-sm font-semibold text-text">Import Completed Successfully</h4>
                      <p className="text-xs text-muted mt-1">
                        Processed {result.total_rows} rows in {result.elapsed_ms}ms
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 p-4 rounded-lg border border-line bg-black/5 dark:bg-white/5 text-xs text-left">
                      <div>
                        <span className="text-muted block">Imported:</span>
                        <span className="font-semibold text-emerald-400 font-mono">
                          {result.imported_rows} / {result.total_rows} rows
                        </span>
                      </div>
                      <div>
                        <span className="text-muted block">Skipped:</span>
                        <span className="font-semibold text-muted font-mono">
                          {result.skipped_rows} rows
                        </span>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </div>

          {/* Footer Controls */}
          <div className="px-5 py-3 border-t border-line bg-black/10 dark:bg-white/5 flex items-center justify-between text-xs">
            <div>
              {currentStep > 1 && currentStep < 5 && (
                <button
                  type="button"
                  onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
                  className="px-3 py-1.5 rounded border border-line hover:bg-white/10 text-text font-medium flex items-center gap-1.5 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
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
                {isCancelling ? 'Cancelling...' : isImporting ? 'Cancel Import' : currentStep === 5 ? 'Close' : 'Cancel'}
              </button>

              {currentStep < 4 && (
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <span>Next</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}

              {currentStep === 4 && (
                <button
                  type="button"
                  onClick={handleStartImport}
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Start Import</span>
                </button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default DataImportWizardModal;
