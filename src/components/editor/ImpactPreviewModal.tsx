import React, { useEffect, useState, useId } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Info,
  Clock,
  Database,
  Loader2,
  X,
  Play,
} from 'lucide-react';
import type { ImpactSimulationResult } from '../../types/db';
import {
  calculateRiskLevel,
  extractTableName,
  formatAffectedRows,
  hasWhereClause,
  isMutationQuery,
  simulateImpact,
} from '../../utils/impactSimulator';

export interface ImpactPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  sql?: string;
  connectionId?: string;
  simulationResult?: ImpactSimulationResult | null;
  isLoading?: boolean;
  error?: string | null;
}

export const ImpactPreviewModal: React.FC<ImpactPreviewModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  sql = '',
  connectionId = '',
  simulationResult: propResult,
  isLoading: propLoading = false,
  error: propError = null,
}) => {
  const [internalResult, setInternalResult] = useState<ImpactSimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleId = useId();

  // If simulationResult is passed as a prop, use it. Otherwise, fetch when opened.
  useEffect(() => {
    if (!isOpen) {
      setInternalResult(null);
      setError(null);
      setLoading(false);
      return;
    }

    if (propResult !== undefined) {
      setInternalResult(propResult);
      return;
    }

    if (propError || propLoading) {
      return;
    }

    if (connectionId && sql) {
      let isMounted = true;
      setLoading(true);
      setError(null);

      simulateImpact(connectionId, sql)
        .then((res) => {
          if (isMounted) {
            setInternalResult(res);
            setLoading(false);
          }
        })
        .catch((err) => {
          if (isMounted) {
            setError(err instanceof Error ? err.message : String(err));
            setLoading(false);
          }
        });

      return () => {
        isMounted = false;
      };
    }
  }, [isOpen, propResult, propError, propLoading, connectionId, sql]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentResult = propResult !== undefined ? propResult : internalResult;
  const currentLoading = propLoading || loading;
  const currentError = propError || error;

  const affectedRows = currentResult?.affected_rows ?? currentResult?.affectedRows ?? 0;
  const executionTimeMs = currentResult?.execution_time_ms ?? currentResult?.executionTimeMs ?? 0;
  const isMutation = currentResult
    ? currentResult.is_mutation ?? currentResult.isMutation ?? false
    : isMutationQuery(sql);
  const tableName =
    currentResult?.table_name ?? currentResult?.tableName ?? extractTableName(sql);
  const hasWhere = hasWhereClause(sql);
  const riskLevel = calculateRiskLevel(affectedRows, hasWhere, isMutation);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="impact-preview-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl transition-all"
        style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-2.5">
            {riskLevel === 'critical' || riskLevel === 'high' ? (
              <ShieldAlert className="h-5 w-5 text-red-500" />
            ) : (
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
            )}
            <h2 id={titleId} className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Query Impact Preview
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* SQL Statement Display */}
          {sql && (
            <div className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Query Target
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {tableName && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    <Database size={13} className="text-zinc-400" />
                    Table: <span className="font-bold">{tableName}</span>
                  </span>
                )}
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold ${
                    sql.trim().toUpperCase().startsWith('DELETE')
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                      : sql.trim().toUpperCase().startsWith('UPDATE')
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                        : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}
                >
                  {sql.trim().split(/\s+/)[0]?.toUpperCase() || 'QUERY'}
                </span>
              </div>
              <pre
                data-testid="sql-preview-text"
                className="max-h-24 overflow-x-auto rounded-lg bg-zinc-100 dark:bg-zinc-950 p-2.5 font-mono text-xs text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800"
              >
                {sql}
              </pre>
            </div>
          )}

          {/* Loading State */}
          {currentLoading && (
            <div
              data-testid="impact-loading"
              className="flex flex-col items-center justify-center py-10 space-y-3 text-center"
            >
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                Simulating execution in temporary rollback transaction...
              </p>
              <p className="text-xs text-zinc-400">
                Safe test: data is never committed to database.
              </p>
            </div>
          )}

          {/* Error State */}
          {!currentLoading && currentError && (
            <div
              role="alert"
              data-testid="impact-error"
              className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/40 p-4 text-sm text-red-800 dark:text-red-300 space-y-1.5"
            >
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle size={16} className="text-red-600 dark:text-red-400" />
                <span>Simulation Failed</span>
              </div>
              <div className="font-mono text-xs break-all bg-red-100/50 dark:bg-red-900/30 p-2 rounded">
                {currentError}
              </div>
            </div>
          )}

          {/* Results State */}
          {!currentLoading && !currentError && (
            <>

              {/* Non-mutation Query Note */}
              {!isMutation && (
                <div
                  data-testid="impact-non-mutation"
                  className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/30 p-4 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2.5"
                >
                  <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Non-Destructive Statement</p>
                    <p className="text-blue-700 dark:text-blue-400 mt-0.5">
                      {currentResult?.preview_warning ||
                        currentResult?.previewWarning ||
                        'This query is not a DELETE or UPDATE statement. No row deletions or modifications will occur.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Mutation Query Impact Badges */}
              {isMutation && (
                <div className="space-y-3">
                  {/* Affected Rows Main Badge */}
                  <div
                    data-testid="affected-rows-badge"
                    className={`flex items-center justify-between rounded-xl p-4 border ${
                      riskLevel === 'critical'
                        ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200'
                        : riskLevel === 'high'
                          ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200'
                          : 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`rounded-lg p-2.5 ${
                          riskLevel === 'critical'
                            ? 'bg-red-200 dark:bg-red-900 text-red-700 dark:text-red-200'
                            : riskLevel === 'high'
                              ? 'bg-amber-200 dark:bg-amber-900 text-amber-700 dark:text-amber-200'
                              : 'bg-emerald-200 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-200'
                        }`}
                      >
                        {riskLevel === 'critical' ? (
                          <AlertTriangle size={24} />
                        ) : riskLevel === 'high' ? (
                          <AlertTriangle size={24} />
                        ) : (
                          <ShieldCheck size={24} />
                        )}
                      </div>
                      <div>
                        <div className="text-xs uppercase font-bold tracking-wider opacity-75">
                          Estimated Impact
                        </div>
                        <div className="text-xl font-extrabold tracking-tight">
                          ⚠️ {formatAffectedRows(affectedRows)} rows will be affected
                        </div>
                      </div>
                    </div>

                    <div className="text-right text-xs opacity-80 flex items-center gap-1 font-mono">
                      <Clock size={12} />
                      <span>{executionTimeMs} ms</span>
                    </div>
                  </div>

                  {/* Warning Callouts */}
                  {riskLevel === 'critical' && (
                    <div
                      data-testid="risk-critical-warning"
                      className="rounded-lg border border-red-300 bg-red-100/70 dark:border-red-800 dark:bg-red-900/40 p-3 text-xs text-red-900 dark:text-red-200 flex items-start gap-2.5 font-medium"
                    >
                      <AlertTriangle size={16} className="text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">CRITICAL WARNING: No WHERE Clause!</span>
                        <p className="mt-0.5 opacity-90">
                          This operation will wipe or modify every row across the entire table{' '}
                          {tableName ? <code>{tableName}</code> : ''}.
                        </p>
                      </div>
                    </div>
                  )}

                  {riskLevel === 'high' && (
                    <div
                      data-testid="risk-high-warning"
                      className="rounded-lg border border-amber-300 bg-amber-100/70 dark:border-amber-800 dark:bg-amber-900/40 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5 font-medium"
                    >
                      <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">HIGH RISK: Large Data Mutation</span>
                        <p className="mt-0.5 opacity-90">
                          More than 100 rows ({formatAffectedRows(affectedRows)} rows) will be
                          affected by this query. Please double check the condition.
                        </p>
                      </div>
                    </div>
                  )}

                  {riskLevel === 'low' && (
                    <div
                      data-testid="risk-low-note"
                      className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30 p-2.5 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2"
                    >
                      <ShieldCheck size={14} className="text-emerald-600" />
                      <span>Controlled impact: Query contains a WHERE clause ({affectedRows} rows).</span>
                    </div>
                  )}
                </div>
              )}

              {/* Safety notice */}
              <div className="flex items-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-500 pt-1">
                <ShieldCheck size={13} className="text-emerald-500 shrink-0" />
                <span>
                  Simulation ran safely inside a rolled-back transaction. No changes were committed.
                </span>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80 px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel"
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          {onConfirm && (
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onClose();
              }}
              disabled={currentLoading}
              aria-label="Confirm Run"
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                riskLevel === 'critical'
                  ? 'bg-red-600 hover:bg-red-700'
                  : riskLevel === 'high'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <Play size={13} fill="currentColor" />
              <span>{riskLevel === 'critical' ? 'Execute Anyway' : 'Proceed with Run'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
