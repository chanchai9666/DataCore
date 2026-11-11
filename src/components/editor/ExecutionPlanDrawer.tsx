import React, { useState, useMemo } from 'react';
import {
  Activity,
  X,
  Copy,
  Check,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  FileText,
  Zap,
} from 'lucide-react';
import type { QueryResult, CellValue } from '../../types/db';

export interface ExecutionPlanDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sql: string;
  planResult: QueryResult | null;
  isAnalyzing?: boolean;
  driver?: string;
}

function extractCellString(val: CellValue): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    if ('Text' in val && typeof val.Text === 'string') return val.Text;
    if ('String' in val && typeof val.String === 'string') return val.String;
    if ('Integer' in val) return String(val.Integer);
    if ('Number' in val) return String(val.Number);
    if ('Json' in val) return typeof val.Json === 'string' ? val.Json : JSON.stringify(val.Json);
    return JSON.stringify(val);
  }
  return String(val);
}

export const ExecutionPlanDrawer: React.FC<ExecutionPlanDrawerProps> = ({
  isOpen,
  onClose,
  sql,
  planResult,
  isAnalyzing = false,
  driver,
}) => {
  const [viewMode, setViewMode] = useState<'visual' | 'raw'>('visual');
  const [copied, setCopied] = useState(false);

  // Extract raw text lines from planResult
  const planLines = useMemo(() => {
    if (!planResult || !planResult.rows) return [];
    return planResult.rows.map((row) => row.map(extractCellString).join(' | '));
  }, [planResult]);

  const fullPlanText = useMemo(() => {
    return planLines.join('\n');
  }, [planLines]);

  // Insights / Analysis detection
  const analysisInfo = useMemo(() => {
    const full = fullPlanText.toLowerCase();

    const hasSeqScan =
      full.includes('seq scan') ||
      full.includes('scan table') ||
      full.includes('type: all') ||
      (full.includes('scan') && !full.includes('index'));

    const hasIndexScan =
      full.includes('index scan') ||
      full.includes('index only scan') ||
      full.includes('using index') ||
      full.includes('bitmap index scan') ||
      full.includes('search') ||
      full.includes('key:');

    // Planning / Execution timing extraction
    let planningTime: string | null = null;
    let executionTime: string | null = null;

    for (const line of planLines) {
      if (line.toLowerCase().includes('planning time:')) {
        planningTime = line.split(':')[1]?.trim() || null;
      }
      if (line.toLowerCase().includes('execution time:')) {
        executionTime = line.split(':')[1]?.trim() || null;
      }
    }

    return {
      hasSeqScan,
      hasIndexScan,
      planningTime,
      executionTime,
    };
  }, [fullPlanText, planLines]);

  const handleCopy = () => {
    navigator.clipboard?.writeText(fullPlanText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-label="Query Execution Plan"
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-zinc-200 bg-white shadow-2xl transition-all dark:border-zinc-800 dark:bg-zinc-900"
      style={{
        boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.15)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-blue-500" />
          <div>
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              Query Execution Plan
            </h2>
            <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
              {driver && <span className="uppercase font-medium">{driver}</span>}
              <span>•</span>
              <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                {isAnalyzing ? (
                  <>
                    <Zap size={10} />
                    <span>Explain Analyze (Actual Execution)</span>
                  </>
                ) : (
                  <span>Explain (Cost Estimate)</span>
                )}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close Plan"
          className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <X size={18} />
        </button>
      </div>

      {/* Target SQL Preview Bar */}
      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950/60">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Target Query:
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            {copied ? (
              <>
                <Check size={11} className="text-emerald-500" />
                <span className="text-emerald-500">Plan Copied</span>
              </>
            ) : (
              <>
                <Copy size={11} />
                <span>Copy Full Plan</span>
              </>
            )}
          </button>
        </div>
        <pre className="mt-1 max-h-16 overflow-x-auto rounded bg-white p-1.5 font-mono text-[10px] text-zinc-700 shadow-sm dark:bg-zinc-900 dark:text-zinc-300">
          <code>{sql}</code>
        </pre>
      </div>

      {/* Summary KPI Badges */}
      <div className="grid grid-cols-3 gap-2 border-b border-zinc-200 p-3 text-xs dark:border-zinc-800">
        <div className="rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-800/40">
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Execution Time</div>
          <div className="flex items-center gap-1 font-semibold text-zinc-800 dark:text-zinc-200">
            <Clock size={12} className="text-blue-500" />
            <span>
              {analysisInfo.executionTime || (planResult ? `${planResult.execution_time_ms} ms` : '-')}
            </span>
          </div>
        </div>

        <div className="rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-800/40">
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Index Usage</div>
          <div className="flex items-center gap-1 font-semibold">
            {analysisInfo.hasIndexScan ? (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={12} />
                <span>Index Scan</span>
              </span>
            ) : analysisInfo.hasSeqScan ? (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <AlertTriangle size={12} />
                <span>Sequential Scan</span>
              </span>
            ) : (
              <span className="text-zinc-500">-</span>
            )}
          </div>
        </div>

        <div className="rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-800/40">
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Plan Steps</div>
          <div className="flex items-center gap-1 font-semibold text-zinc-800 dark:text-zinc-200">
            <Layers size={12} className="text-purple-500" />
            <span>{planLines.length} nodes</span>
          </div>
        </div>
      </div>

      {/* Advisory Alert */}
      {analysisInfo.hasSeqScan && (
        <div className="mx-3 mt-2 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <span className="font-semibold">Sequential Scan detected:</span> Database is scanning the entire table. Consider creating an index on filtered columns if this table grows large.
          </div>
        </div>
      )}

      {/* View Mode Toggle */}
      <div className="flex border-b border-zinc-200 bg-zinc-50 px-4 pt-2 dark:border-zinc-800 dark:bg-zinc-900/40">
        <button
          type="button"
          onClick={() => setViewMode('visual')}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
            viewMode === 'visual'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
          }`}
        >
          <Layers size={13} />
          <span>Visual Plan</span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode('raw')}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
            viewMode === 'raw'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
          }`}
        >
          <FileText size={13} />
          <span>Raw Output</span>
        </button>
      </div>

      {/* Plan Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {planLines.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-400">
            No execution plan available
          </div>
        ) : viewMode === 'visual' ? (
          <div className="space-y-2">
            {planLines.map((line, idx) => {
              const trimmed = line.trim();
              const isIndex =
                trimmed.toLowerCase().includes('index') ||
                trimmed.toLowerCase().includes('search');
              const isSeq =
                trimmed.toLowerCase().includes('seq scan') ||
                trimmed.toLowerCase().includes('scan');

              // Indentation detection
              const leadingSpaces = line.length - line.trimStart().length;
              const indentLevel = Math.min(Math.floor(leadingSpaces / 2), 6);

              return (
                <div
                  key={idx}
                  style={{ marginLeft: `${indentLevel * 14}px` }}
                  className={`rounded-md border p-2.5 text-xs font-mono shadow-sm transition-all ${
                    isIndex
                      ? 'border-emerald-200 bg-emerald-50/40 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200'
                      : isSeq
                      ? 'border-amber-200 bg-amber-50/40 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200'
                      : 'border-zinc-200 bg-white text-zinc-800 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium break-all">{trimmed}</span>
                    {isIndex && (
                      <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-sans font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">
                        Index
                      </span>
                    )}
                    {isSeq && (
                      <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-sans font-semibold text-amber-700 dark:bg-amber-900 dark:text-amber-200">
                        Scan
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <pre className="rounded-md border border-zinc-200 bg-zinc-50 p-3 font-mono text-[11px] leading-relaxed text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
            <code>{fullPlanText}</code>
          </pre>
        )}
      </div>
    </div>
  );
};
