import React, { useMemo } from 'react';
import {
  GitCompare,
  X,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useExplainHistoryStore, type ExplainSnapshot } from '../../stores/explainHistoryStore';
import type { PlanNode } from '../../api/planParser';

export interface ExplainPlanDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSnapshotAId?: string;
  initialSnapshotBId?: string;
}

function calculateDelta(
  before?: number,
  after?: number
): { diff: number; percent: number; isBetter: boolean } | null {
  if (before === undefined || after === undefined || before === 0) return null;
  const diff = after - before;
  const percent = (diff / before) * 100;
  // For cost and execution time, lower is better
  return {
    diff,
    percent,
    isBetter: diff <= 0,
  };
}

const PlanTreeColumn: React.FC<{
  title: string;
  snapshot: ExplainSnapshot | null;
  snapshots: ExplainSnapshot[];
  onSelect: (id: string) => void;
  badgeLabel?: string;
}> = ({ title, snapshot, snapshots, onSelect, badgeLabel }) => {
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-sidebar rounded-lg border border-line p-3">
      {/* Selector Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-line gap-2">
        <div className="flex items-center space-x-1.5 min-w-0">
          <span className="text-xs font-semibold text-text truncate">
            {title}
          </span>
          {badgeLabel && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-500/15 text-blue-500">
              {badgeLabel}
            </span>
          )}
        </div>
        <select
          value={snapshot?.id || ''}
          onChange={(e) => onSelect(e.target.value)}
          className="text-xs px-2 py-1 bg-grid border border-line text-text rounded focus:outline-none focus:border-blue-500 max-w-[200px] truncate"
        >
          <option value="">-- Select Snapshot --</option>
          {snapshots.map((s) => (
            <option key={s.id} value={s.id}>
              {new Date(s.timestamp).toLocaleTimeString()} - {s.sql.slice(0, 30)}...
            </option>
          ))}
        </select>
      </div>

      {snapshot ? (
        <div className="space-y-3 flex-1 overflow-y-auto">
          {/* Query SQL Preview */}
          <div className="p-2 bg-grid rounded border border-line font-mono text-[11px] text-text max-h-16 overflow-y-auto">
            {snapshot.sql}
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded bg-grid border border-line">
              <span className="text-muted text-[10px] block">Total Cost</span>
              <span className="font-semibold text-text">
                {snapshot.totalCost !== undefined ? snapshot.totalCost.toFixed(2) : snapshot.parsedPlan?.totalCost || 'N/A'}
              </span>
            </div>
            <div className="p-2 rounded bg-grid border border-line">
              <span className="text-muted text-[10px] block">Execution Time</span>
              <span className="font-semibold text-text">
                {snapshot.executionTimeMs !== undefined ? `${snapshot.executionTimeMs} ms` : snapshot.parsedPlan?.executionTime || 'N/A'}
              </span>
            </div>
          </div>

          {/* Node Tree */}
          <div className="space-y-1.5 flex-1 overflow-y-auto">
            <span className="text-[11px] font-semibold text-muted block mb-1">
              Execution Nodes ({snapshot.parsedPlan?.nodes?.length || 0})
            </span>
            {snapshot.parsedPlan?.nodes?.map((node: PlanNode, idx: number) => {
              const isSeq = node.isSeqScan;
              const isIdx = node.isIndex;

              return (
                <div
                  key={idx}
                  style={{ marginLeft: `${(node.level || 0) * 12}px` }}
                  className={`p-2 rounded border text-xs transition-colors ${
                    isIdx
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-300'
                      : isSeq
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-300'
                      : 'bg-grid border-line text-text'
                  }`}
                >
                  <div className="flex items-center justify-between font-medium">
                    <span className="truncate">{node.nodeType}</span>
                    {node.relation && (
                      <span className="font-mono text-[10px] px-1 bg-black/5 dark:bg-white/10 rounded">
                        {node.relation}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] opacity-80 mt-0.5 truncate">{node.detail}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400 italic">
          Select a snapshot to compare
        </div>
      )}
    </div>
  );
};

export const ExplainPlanDiffModal: React.FC<ExplainPlanDiffModalProps> = ({
  isOpen,
  onClose,
  initialSnapshotAId,
  initialSnapshotBId,
}) => {
  const { t } = useTranslation();
  const snapshots = useExplainHistoryStore((s) => s.snapshots);
  const selectedSnapshotAId = useExplainHistoryStore((s) => s.selectedSnapshotAId);
  const selectedSnapshotBId = useExplainHistoryStore((s) => s.selectedSnapshotBId);
  const setSelectedSnapshots = useExplainHistoryStore((s) => s.setSelectedSnapshots);

  const [copied, setCopied] = React.useState(false);

  // Fallbacks: if store has no selection, pick first two snapshots
  const snapAId = selectedSnapshotAId || initialSnapshotAId || snapshots[1]?.id || snapshots[0]?.id || null;
  const snapBId = selectedSnapshotBId || initialSnapshotBId || snapshots[0]?.id || null;

  const snapA = useMemo(() => snapshots.find((s) => s.id === snapAId) || null, [snapshots, snapAId]);
  const snapB = useMemo(() => snapshots.find((s) => s.id === snapBId) || null, [snapshots, snapBId]);

  // Deltas
  const timeDelta = useMemo(
    () => calculateDelta(snapA?.executionTimeMs, snapB?.executionTimeMs),
    [snapA, snapB]
  );
  const costDelta = useMemo(
    () => calculateDelta(snapA?.totalCost, snapB?.totalCost),
    [snapA, snapB]
  );

  const scanTypeChange = useMemo(() => {
    if (!snapA || !snapB) return null;
    const aHasSeq = snapA.parsedPlan?.hasSeqScan;
    const bHasSeq = snapB.parsedPlan?.hasSeqScan;
    const bHasIdx = snapB.parsedPlan?.hasIndexScan;

    if (aHasSeq && !bHasSeq && bHasIdx) {
      return {
        type: 'improvement',
        text: 'Converted Table Seq Scan to Index Scan! 🚀',
      };
    }
    if (!aHasSeq && bHasSeq) {
      return {
        type: 'regression',
        text: 'Introduced Sequential Scan (possible missing index)',
      };
    }
    return null;
  }, [snapA, snapB]);

  if (!isOpen) return null;

  const handleCopySummary = () => {
    if (!snapA || !snapB) return;
    const lines = [
      `=== EXPLAIN PLAN DIFF SUMMARY ===`,
      `Snapshot A (Before): ${snapA.sql.slice(0, 50)}...`,
      `  Cost: ${snapA.totalCost ?? 'N/A'}, Exec Time: ${snapA.executionTimeMs ?? 'N/A'} ms`,
      `Snapshot B (After): ${snapB.sql.slice(0, 50)}...`,
      `  Cost: ${snapB.totalCost ?? 'N/A'}, Exec Time: ${snapB.executionTimeMs ?? 'N/A'} ms`,
      `---------------------------------`,
      costDelta ? `Cost Delta: ${costDelta.percent > 0 ? '+' : ''}${costDelta.percent.toFixed(1)}%` : null,
      timeDelta ? `Time Delta: ${timeDelta.percent > 0 ? '+' : ''}${timeDelta.percent.toFixed(1)}%` : null,
      scanTypeChange ? `Scan Type: ${scanTypeChange.text}` : null,
    ].filter(Boolean);

    navigator.clipboard?.writeText(lines.join('\n'));
    setCopied(true);
    toast.success('Plan Diff summary copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-panel rounded-lg shadow-2xl border border-line text-text w-full max-w-5xl flex flex-col overflow-hidden max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line bg-sidebar">
          <div className="flex items-center space-x-2">
            <GitCompare className="w-5 h-5 text-indigo-500" />
            <h2 className="text-base font-semibold text-text">
              {t('editor.explainPlanDiff.title', 'Query Execution Plan Diff (Before vs After)')}
            </h2>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleCopySummary}
              disabled={!snapA || !snapB}
              className="p-1.5 text-xs text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10 rounded flex items-center space-x-1 disabled:opacity-40"
              title="Copy Diff Summary"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>Copy Diff</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-muted hover:text-text rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Delta Summary Banner */}
        {snapA && snapB && (
          <div className="px-5 py-2.5 bg-indigo-50/70 dark:bg-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900/40 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-4">
              {/* Cost Delta */}
              {costDelta && (
                <div className="flex items-center space-x-1.5">
                  <span className="text-gray-500 dark:text-gray-400">Cost:</span>
                  <span
                    className={`inline-flex items-center font-semibold ${
                      costDelta.isBetter ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {costDelta.isBetter ? <TrendingDown className="w-3.5 h-3.5 mr-0.5" /> : <TrendingUp className="w-3.5 h-3.5 mr-0.5" />}
                    {costDelta.percent > 0 ? '+' : ''}
                    {costDelta.percent.toFixed(1)}%
                  </span>
                </div>
              )}

              {/* Time Delta */}
              {timeDelta && (
                <div className="flex items-center space-x-1.5">
                  <span className="text-gray-500 dark:text-gray-400">Execution Time:</span>
                  <span
                    className={`inline-flex items-center font-semibold ${
                      timeDelta.isBetter ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {timeDelta.isBetter ? <TrendingDown className="w-3.5 h-3.5 mr-0.5" /> : <TrendingUp className="w-3.5 h-3.5 mr-0.5" />}
                    {timeDelta.percent > 0 ? '+' : ''}
                    {timeDelta.percent.toFixed(1)}%
                  </span>
                </div>
              )}

              {/* Scan Type change highlight */}
              {scanTypeChange && (
                <div className="flex items-center space-x-1">
                  {scanTypeChange.type === 'improvement' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  )}
                  <span
                    className={`font-medium ${
                      scanTypeChange.type === 'improvement' ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    {scanTypeChange.text}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Content: 2 Side-by-Side Columns */}
        <div className="p-4 flex-1 overflow-hidden flex gap-4 min-h-[380px]">
          <PlanTreeColumn
            title="Snapshot A (Baseline / Before)"
            badgeLabel="Before"
            snapshot={snapA}
            snapshots={snapshots}
            onSelect={(id) => setSelectedSnapshots(id, snapBId)}
          />

          <PlanTreeColumn
            title="Snapshot B (Candidate / After)"
            badgeLabel="After"
            snapshot={snapB}
            snapshots={snapshots}
            onSelect={(id) => setSelectedSnapshots(snapAId, id)}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-line bg-sidebar">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium bg-panel hover:bg-black/5 dark:hover:bg-white/10 text-text border border-line rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
