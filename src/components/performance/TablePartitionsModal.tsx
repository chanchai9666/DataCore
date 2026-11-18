import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Layers,
  X,
  RefreshCw,
  Split,
  Plus,
  Unlink,
  Trash2,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { dbApi } from '../../api/db';
import {
  buildGetTablePartitionsSql,
  buildCreateRangePartitionSql,
  buildDetachPartitionSql,
  buildDropPartitionSql,
  buildBackgroundMaintenanceSql,
  buildMaintenanceProgressSql,
  type TablePartitionInfo,
  type PartitionRangeType,
} from '../../api/performanceHelpers';
import { formatCellValue } from '../../utils/cellFormatter';

export interface TablePartitionsModalProps {
  isOpen: boolean;
  tableName: string;
  schemaName?: string;
  connectionId: string;
  driver?: string;
  onClose: () => void;
}

export const TablePartitionsModal: React.FC<TablePartitionsModalProps> = ({
  isOpen,
  tableName,
  schemaName,
  connectionId,
  driver = 'postgres',
  onClose,
}) => {
  const { t } = useTranslation();
  const [partitions, setPartitions] = useState<TablePartitionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create Range Partition state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [rangeType, setRangeType] = useState<PartitionRangeType>('monthly');
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [year, setYear] = useState<number>(currentYear);
  const [month, setMonth] = useState<number>(currentMonth);
  const [fromValue, setFromValue] = useState<string>('');
  const [toValue, setToValue] = useState<string>('');
  const [partitionName, setPartitionName] = useState<string>(
    `${tableName}_${currentYear}_${String(currentMonth).padStart(2, '0')}`
  );
  const [isCreating, setIsCreating] = useState(false);

  // Detach / Drop confirmation state
  const [pendingAction, setPendingAction] = useState<{
    type: 'detach' | 'drop';
    partitionName: string;
  } | null>(null);
  const [isExecutingAction, setIsExecutingAction] = useState(false);

  // Background Maintenance (VACUUM ANALYZE / OPTIMIZE TABLE) state
  const [maintState, setMaintState] = useState<{
    status: 'idle' | 'running' | 'completed' | 'error';
    message: string;
    progressPct: number | null;
    elapsedMs: number;
  }>({ status: 'idle', message: '', progressPct: null, elapsedMs: 0 });
  const maintIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const normalizedDriver = driver?.toLowerCase() || 'postgres';
  const isPostgres = normalizedDriver.includes('postgres');
  const isMysql = normalizedDriver.includes('mysql');
  const isSqlite = normalizedDriver.includes('sqlite');

  const fetchPartitions = async () => {
    setIsLoading(true);
    setError(null);
    const sql = buildGetTablePartitionsSql(tableName, schemaName || '', driver);
    try {
      const res = await dbApi.executeDirectQuery(connectionId, sql);
      if (!res || !res.rows) {
        setPartitions([]);
        return;
      }

      const parsed: TablePartitionInfo[] = [];
      for (const r of res.rows) {
        const name = String(formatCellValue(r[0]));
        const expr = String(formatCellValue(r[1]) || '');
        const method = String(formatCellValue(r[2]) || '');
        const rowCount = Number(formatCellValue(r[3])) || 0;
        const size = String(formatCellValue(r[4]) || '');

        parsed.push({
          name,
          partitionExpression: expr,
          partitionMethod: method,
          rowCount,
          dataSize: size,
        });
      }

      setPartitions(parsed);
    } catch (err: unknown) {
      console.error('Failed to load table partitions:', err);
      setPartitions([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setShowCreateForm(false);
      setPendingAction(null);
      setError(null);
      setPartitionName(`${tableName}_${currentYear}_${String(currentMonth).padStart(2, '0')}`);
      setMaintState({ status: 'idle', message: '', progressPct: null, elapsedMs: 0 });
      fetchPartitions();
    }
    return () => {
      if (maintIntervalRef.current) {
        clearInterval(maintIntervalRef.current);
        maintIntervalRef.current = null;
      }
    };
  }, [isOpen, tableName, schemaName, connectionId, driver]);

  if (!isOpen) return null;

  const createSqlPreview = buildCreateRangePartitionSql({
    tableName,
    schemaName,
    partitionName,
    rangeType,
    year,
    month,
    fromValue,
    toValue,
    driver,
  });

  const handleRangeTypeChange = (nextType: PartitionRangeType) => {
    setRangeType(nextType);
    if (nextType === 'monthly') {
      setPartitionName(`${tableName}_${year}_${String(month).padStart(2, '0')}`);
    } else if (nextType === 'yearly') {
      setPartitionName(`${tableName}_${year}`);
    }
  };

  const handleCreatePartition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createSqlPreview || createSqlPreview.startsWith('--')) return;
    setIsCreating(true);
    setError(null);
    try {
      await dbApi.executeDirectQuery(connectionId, createSqlPreview);
      toast.success(
        t('tools.partitionCreated', 'Created partition {{name}}', { name: partitionName })
      );
      setShowCreateForm(false);
      await fetchPartitions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setIsCreating(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    setIsExecutingAction(true);
    setError(null);
    const sql =
      pendingAction.type === 'detach'
        ? buildDetachPartitionSql({
            tableName,
            schemaName,
            partitionName: pendingAction.partitionName,
            driver,
          })
        : buildDropPartitionSql({
            tableName,
            schemaName,
            partitionName: pendingAction.partitionName,
            driver,
          });

    try {
      await dbApi.executeDirectQuery(connectionId, sql);
      toast.success(
        pendingAction.type === 'detach'
          ? t('tools.partitionDetached', 'Detached partition {{name}}', {
              name: pendingAction.partitionName,
            })
          : t('tools.partitionDropped', 'Dropped partition {{name}}', {
              name: pendingAction.partitionName,
            })
      );
      setPendingAction(null);
      await fetchPartitions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setIsExecutingAction(false);
    }
  };

  const handleRunBackgroundMaintenance = async () => {
    const operation = isMysql ? 'optimize' : 'vacuum_analyze';
    const sql = buildBackgroundMaintenanceSql({
      tableName,
      schemaName,
      operation,
      driver,
    });
    if (!sql) return;

    const startedAt = Date.now();
    const opLabel = isMysql ? 'OPTIMIZE TABLE' : 'VACUUM ANALYZE';
    setMaintState({
      status: 'running',
      message: `${opLabel} running in background...`,
      progressPct: null,
      elapsedMs: 0,
    });

    if (maintIntervalRef.current) clearInterval(maintIntervalRef.current);
    maintIntervalRef.current = setInterval(async () => {
      const elapsedMs = Date.now() - startedAt;
      try {
        const progRes = await dbApi.executeDirectQuery(
          connectionId,
          buildMaintenanceProgressSql(driver)
        );
        const firstRow = progRes?.rows?.[0];
        if (isPostgres && firstRow && firstRow.length >= 5) {
          const phase = String(formatCellValue(firstRow[1]) || 'scanning');
          const total = Number(formatCellValue(firstRow[2])) || 0;
          const scanned = Number(formatCellValue(firstRow[3])) || 0;
          const pct = total > 0 ? Math.min(99, Math.round((scanned / total) * 100)) : null;
          setMaintState({
            status: 'running',
            message: `${opLabel}: ${phase}`,
            progressPct: pct,
            elapsedMs,
          });
          return;
        }
      } catch {
        // Progress query is best-effort
      }
      setMaintState((prev) => ({ ...prev, elapsedMs }));
    }, 1000);

    try {
      const res = await dbApi.executeDirectQuery(connectionId, sql);
      if (maintIntervalRef.current) {
        clearInterval(maintIntervalRef.current);
        maintIntervalRef.current = null;
      }
      const elapsedMs = res?.execution_time_ms ?? Date.now() - startedAt;
      setMaintState({
        status: 'completed',
        message: `${opLabel} completed in ${elapsedMs} ms`,
        progressPct: 100,
        elapsedMs,
      });
      toast.success(`${opLabel} completed on ${tableName}`);
    } catch (err: unknown) {
      if (maintIntervalRef.current) {
        clearInterval(maintIntervalRef.current);
        maintIntervalRef.current = null;
      }
      const msg = err instanceof Error ? err.message : String(err);
      setMaintState({
        status: 'error',
        message: msg,
        progressPct: null,
        elapsedMs: Date.now() - startedAt,
      });
      toast.error(`${opLabel} failed: ${msg}`);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Table Partitions"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in"
    >
      <div className="relative w-full max-w-3xl rounded-xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400">
              <Split className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                {t('tools.partitionsTitle', 'Table Partitions')}
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600 dark:bg-slate-800 dark:text-slate-400 font-mono">
                  {tableName}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t(
                  'tools.partitionsSubtitle',
                  'Manage range partitions, archive old partitions, and run background maintenance'
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isSqlite && (
              <>
                <button
                  type="button"
                  data-testid="partition-bg-maintenance-btn"
                  onClick={handleRunBackgroundMaintenance}
                  disabled={maintState.status === 'running'}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                >
                  {maintState.status === 'running' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {isMysql ? 'OPTIMIZE TABLE' : 'VACUUM ANALYZE'}
                </button>
                <button
                  type="button"
                  data-testid="partition-create-toggle-btn"
                  onClick={() => setShowCreateForm((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white shadow-2xs hover:bg-blue-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('tools.createPartition', 'Create Range Partition')}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={fetchPartitions}
              disabled={isLoading}
              aria-label={t('common.refresh', 'Refresh')}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-blue-500' : ''}`} />
              {t('common.refresh', 'Refresh')}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close', 'Close')}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 max-h-[65vh] overflow-y-auto space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Background Maintenance Progress Banner */}
          {maintState.status !== 'idle' && (
            <div
              data-testid="partition-maintenance-status"
              className={`rounded-lg border p-3 text-xs ${
                maintState.status === 'error'
                  ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
                  : maintState.status === 'completed'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 font-medium">
                  {maintState.status === 'running' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : maintState.status === 'completed' ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  )}
                  <span>{maintState.message}</span>
                </div>
                <span className="font-mono text-[11px]">
                  {maintState.progressPct !== null ? `${maintState.progressPct}%` : `${Math.round(maintState.elapsedMs / 1000)}s`}
                </span>
              </div>
              {maintState.status === 'running' && (
                <div className="h-1.5 w-full rounded-full bg-blue-200/70 dark:bg-blue-900/50 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${maintState.progressPct ?? 45}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Confirmation Banner for Detach / Drop */}
          {pendingAction && (
            <div className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <span>
                {pendingAction.type === 'detach'
                  ? t('tools.confirmDetachPartition', 'Detach partition "{{name}}" from {{table}} for archiving?', {
                      name: pendingAction.partitionName,
                      table: tableName,
                    })
                  : t('tools.confirmDropPartition', 'Permanently drop partition "{{name}}" and its data?', {
                      name: pendingAction.partitionName,
                    })}
              </span>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <button
                  type="button"
                  onClick={() => setPendingAction(null)}
                  disabled={isExecutingAction}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="button"
                  data-testid="partition-confirm-action-btn"
                  onClick={handleConfirmAction}
                  disabled={isExecutingAction}
                  className="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {isExecutingAction
                    ? t('common.executing', 'Executing...')
                    : pendingAction.type === 'detach'
                    ? t('tools.detach', 'Detach')
                    : t('tools.drop', 'Drop')}
                </button>
              </div>
            </div>
          )}

          {/* Create Range Partition Form */}
          {showCreateForm && (
            <form
              onSubmit={handleCreatePartition}
              className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-3 dark:border-slate-800 dark:bg-slate-800/40"
            >
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {t('tools.createRangePartitionTitle', 'New Range Partition')}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    {t('tools.partitionRangeType', 'Interval')}
                  </label>
                  <select
                    data-testid="partition-range-type-select"
                    value={rangeType}
                    onChange={(e) => handleRangeTypeChange(e.target.value as PartitionRangeType)}
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="monthly">{t('tools.monthly', 'Monthly')}</option>
                    <option value="yearly">{t('tools.yearly', 'Yearly')}</option>
                    <option value="custom">{t('tools.custom', 'Custom')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    {t('tools.partitionName', 'Partition Name')}
                  </label>
                  <input
                    type="text"
                    data-testid="partition-name-input"
                    value={partitionName}
                    onChange={(e) => setPartitionName(e.target.value)}
                    required
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>

                {rangeType !== 'custom' ? (
                  <>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">
                        {t('tools.year', 'Year')}
                      </label>
                      <input
                        type="number"
                        data-testid="partition-year-input"
                        value={year}
                        onChange={(e) => setYear(Number(e.target.value) || currentYear)}
                        className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono dark:border-slate-700 dark:bg-slate-900"
                      />
                    </div>
                    {rangeType === 'monthly' && (
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          {t('tools.month', 'Month')}
                        </label>
                        <select
                          data-testid="partition-month-select"
                          value={month}
                          onChange={(e) => setMonth(Number(e.target.value))}
                          className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                            <option key={m} value={m}>
                              {String(m).padStart(2, '0')}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">FROM</label>
                      <input
                        type="text"
                        value={fromValue}
                        onChange={(e) => setFromValue(e.target.value)}
                        placeholder="2026-01-01"
                        className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono dark:border-slate-700 dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">TO</label>
                      <input
                        type="text"
                        value={toValue}
                        onChange={(e) => setToValue(e.target.value)}
                        placeholder="2026-02-01"
                        className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono dark:border-slate-700 dark:bg-slate-900"
                      />
                    </div>
                  </>
                )}
              </div>

              {createSqlPreview && (
                <pre className="rounded bg-slate-900 p-2 text-[11px] font-mono text-slate-200 overflow-x-auto">
                  {createSqlPreview}
                </pre>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  data-testid="partition-create-submit-btn"
                  disabled={isCreating || !createSqlPreview}
                  className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isCreating ? t('common.creating', 'Creating...') : t('tools.create', 'Create')}
                </button>
              </div>
            </form>
          )}

          {/* Partitions Table */}
          {partitions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-slate-400">
              <Layers className="h-9 w-9 text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('tools.singleRelationTable', 'Standard Single Relation Table')}
              </p>
              <p className="text-xs text-slate-500">
                {t('tools.notPartitionedDesc', 'This table is not partitioned into sub-tables.')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                  <tr>
                    <th className="px-3.5 py-2.5">{t('tools.partitionName', 'Partition Name')}</th>
                    <th className="px-3.5 py-2.5">{t('tools.partitionMethod', 'Method')}</th>
                    <th className="px-3.5 py-2.5">{t('tools.partitionBound', 'Bound / Expression')}</th>
                    <th className="px-3.5 py-2.5">{t('tableList.approxRowsHeader', 'Estimated Rows')}</th>
                    <th className="px-3.5 py-2.5">{t('tableList.dataSizeHeader', 'Data Size')}</th>
                    {!isSqlite && (
                      <th className="px-3.5 py-2.5 text-right">{t('common.actions', 'Actions')}</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                  {partitions.map((pt, idx) => (
                    <tr key={`${pt.name}-${idx}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="px-3.5 py-2 font-semibold text-slate-800 dark:text-slate-200">{pt.name}</td>
                      <td className="px-3.5 py-2 text-slate-600 dark:text-slate-400">{pt.partitionMethod || 'RANGE'}</td>
                      <td className="px-3.5 py-2 text-blue-600 dark:text-blue-400">{pt.partitionExpression || '-'}</td>
                      <td className="px-3.5 py-2 text-slate-600 dark:text-slate-400">{pt.rowCount?.toLocaleString()}</td>
                      <td className="px-3.5 py-2 text-slate-600 dark:text-slate-400">{pt.dataSize || '-'}</td>
                      {!isSqlite && (
                        <td className="px-3.5 py-2 text-right font-sans">
                          <div className="inline-flex items-center gap-1.5">
                            {isPostgres && (
                              <button
                                type="button"
                                data-testid={`partition-detach-${pt.name}`}
                                onClick={() =>
                                  setPendingAction({ type: 'detach', partitionName: pt.name })
                                }
                                title={t('tools.detachPartition', 'Detach Partition')}
                                className="inline-flex items-center gap-1 rounded border border-amber-300 px-2 py-0.5 text-[11px] text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/40"
                              >
                                <Unlink className="h-3 w-3" />
                                {t('tools.detach', 'Detach')}
                              </button>
                            )}
                            <button
                              type="button"
                              data-testid={`partition-drop-${pt.name}`}
                              onClick={() =>
                                setPendingAction({ type: 'drop', partitionName: pt.name })
                              }
                              title={t('tools.dropPartition', 'Drop Partition')}
                              className="inline-flex items-center gap-1 rounded border border-red-300 px-2 py-0.5 text-[11px] text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                            >
                              <Trash2 className="h-3 w-3" />
                              {t('tools.drop', 'Drop')}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-right dark:border-slate-800 dark:bg-slate-900/60">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {t('common.close', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
};
