import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  X,
  Gauge,
  Clock,
  HardDrive,
  Rows3,
  Square,
  CheckCircle2,
  XCircle,
  Ban,
  Trash2,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRightLeft,
} from 'lucide-react';
import {
  useTransferMonitorStore,
  formatBytes,
  formatEta,
  type TransferJobState,
} from '../../stores/transferMonitorStore';

export interface TransferMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function getStatusBadge(job: TransferJobState) {
  switch (job.status) {
    case 'running':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
          Running
        </span>
      );
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3 w-3" />
          Completed
        </span>
      );
    case 'cancelled':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
          <Ban className="h-3 w-3" />
          Cancelled
        </span>
      );
    case 'error':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">
          <XCircle className="h-3 w-3" />
          Failed
        </span>
      );
  }
}

function getDirectionIcon(direction: TransferJobState['direction']) {
  switch (direction) {
    case 'export':
      return <ArrowUpRight className="h-3.5 w-3.5 text-blue-500" />;
    case 'import':
      return <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-500" />;
    case 'copy':
      return <ArrowRightLeft className="h-3.5 w-3.5 text-purple-500" />;
    default:
      return <Activity className="h-3.5 w-3.5 text-amber-500" />;
  }
}

const SpeedSparkline: React.FC<{ job: TransferJobState }> = ({ job }) => {
  const width = 520;
  const height = 110;
  const padX = 8;
  const padY = 10;

  const samples = job.speedHistory;
  const values = samples.map((s) => (s.mbPerSec > 0 ? s.mbPerSec : s.rowsPerSec / 1000));
  const maxVal = Math.max(...values, 1);

  const points =
    samples.length <= 1
      ? [
          { x: padX, y: height - padY },
          {
            x: width - padX,
            y:
              samples.length === 1
                ? height - padY - ((values[0] / maxVal) * (height - padY * 2))
                : height - padY,
          },
        ]
      : samples.map((_, idx) => {
          const x = padX + (idx / (samples.length - 1)) * (width - padX * 2);
          const y = height - padY - (values[idx] / maxVal) * (height - padY * 2);
          return { x, y };
        });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${height - padY} L ${points[0].x.toFixed(1)} ${height - padY} Z`;

  return (
    <div
      data-testid="transfer-speed-chart"
      className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3"
    >
      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">
        <span>Throughput History</span>
        <span className="font-mono">
          Peak: {Math.max(...samples.map((s) => s.mbPerSec), 0).toFixed(2)} MB/s
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-24 overflow-visible"
        role="img"
        aria-label="Transfer throughput chart"
      >
        <defs>
          <linearGradient id="transferSpeedGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <line
          x1={padX}
          y1={height - padY}
          x2={width - padX}
          y2={height - padY}
          stroke="currentColor"
          className="text-slate-200 dark:text-slate-800"
          strokeWidth="1"
        />
        <path d={areaPath} fill="url(#transferSpeedGrad)" />
        <path
          d={linePath}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

export const TransferMonitorModal: React.FC<TransferMonitorModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const {
    jobs,
    jobOrder,
    selectedJobId,
    selectJob,
    cancelJob,
    clearCompleted,
  } = useTransferMonitorStore();

  if (!isOpen) return null;

  const jobList = jobOrder.map((id) => jobs[id]).filter(Boolean);
  const activeJob =
    (selectedJobId && jobs[selectedJobId]) || jobList[0] || null;
  const hasCompleted = jobList.some((j) => j.status !== 'running');

  const progressPct =
    activeJob && activeJob.totalRows && activeJob.totalRows > 0
      ? Math.min(100, Math.round((activeJob.rowsProcessed / activeJob.totalRows) * 100))
      : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('monitor.transferDashboardTitle', 'Transfer Monitor Dashboard')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in"
    >
      <div className="relative w-full max-w-3xl rounded-xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <Gauge className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {t('monitor.transferDashboardTitle', 'Transfer Monitor Dashboard')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t(
                  'monitor.transferDashboardDesc',
                  'Real-time throughput, ETA, and server-side cancellation for active data transfers'
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasCompleted && (
              <button
                type="button"
                onClick={clearCompleted}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('monitor.clearCompleted', 'Clear Completed')}
              </button>
            )}
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

        {/* Body */}
        <div className="p-5 max-h-[70vh] overflow-y-auto">
          {!activeJob ? (
            <div
              data-testid="transfer-monitor-empty"
              className="flex flex-col items-center justify-center h-48 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-slate-400"
            >
              <Activity className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('monitor.noActiveTransfers', 'No Active Transfers')}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {t(
                  'monitor.noActiveTransfersDesc',
                  'Start an Export, Import, or Cross-DB Copy to monitor live throughput here.'
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Job selector pills if multiple jobs */}
              {jobList.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {jobList.map((job) => (
                    <button
                      key={job.jobId}
                      type="button"
                      onClick={() => selectJob(job.jobId)}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs border transition-colors ${
                        job.jobId === activeJob.jobId
                          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      {getDirectionIcon(job.direction)}
                      <span className="truncate max-w-[160px]">{job.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Active Job Header & Cancel */}
              <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {getDirectionIcon(activeJob.direction)}
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {activeJob.label}
                    </span>
                    {getStatusBadge(activeJob)}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono truncate">
                    {activeJob.errorMessage || activeJob.statusText}
                  </p>
                </div>

                {activeJob.status === 'running' && (
                  <button
                    type="button"
                    data-testid="transfer-cancel-btn"
                    onClick={() => cancelJob(activeJob.jobId)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white shadow-2xs hover:bg-red-700 transition-colors shrink-0"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                    {t('common.cancel', 'Cancel')}
                  </button>
                )}
              </div>

              {/* Progress Bar */}
              <div>
                <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                  <span>
                    {activeJob.rowsProcessed.toLocaleString()}
                    {activeJob.totalRows
                      ? ` / ${activeJob.totalRows.toLocaleString()} rows`
                      : ' rows'}
                  </span>
                  <span className="font-mono">
                    {progressPct !== null ? `${progressPct}%` : activeJob.status === 'completed' ? '100%' : 'Streaming...'}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-200 ${
                      activeJob.status === 'cancelled'
                        ? 'bg-amber-500'
                        : activeJob.status === 'error'
                        ? 'bg-red-500'
                        : activeJob.status === 'completed'
                        ? 'bg-emerald-500'
                        : 'bg-blue-500'
                    }`}
                    style={{
                      width:
                        progressPct !== null
                          ? `${progressPct}%`
                          : activeJob.status === 'completed'
                          ? '100%'
                          : '60%',
                    }}
                  />
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <Gauge className="h-3.5 w-3.5 text-blue-500" />
                    <span>{t('monitor.speedMb', 'Throughput (MB/s)')}</span>
                  </div>
                  <div
                    data-testid="transfer-speed-mbs"
                    className="mt-1 text-base font-semibold font-mono text-slate-900 dark:text-slate-100"
                  >
                    {activeJob.mbPerSec.toFixed(2)} MB/s
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <Rows3 className="h-3.5 w-3.5 text-emerald-500" />
                    <span>{t('monitor.speedRows', 'Rows / sec')}</span>
                  </div>
                  <div
                    data-testid="transfer-speed-rows"
                    className="mt-1 text-base font-semibold font-mono text-slate-900 dark:text-slate-100"
                  >
                    {activeJob.rowsPerSec.toLocaleString()} /s
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <HardDrive className="h-3.5 w-3.5 text-purple-500" />
                    <span>{t('monitor.bytesProcessed', 'Data Processed')}</span>
                  </div>
                  <div
                    data-testid="transfer-bytes-written"
                    className="mt-1 text-base font-semibold font-mono text-slate-900 dark:text-slate-100"
                  >
                    {formatBytes(activeJob.bytesWritten)}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <Clock className="h-3.5 w-3.5 text-amber-500" />
                    <span>{t('monitor.eta', 'ETA / Elapsed')}</span>
                  </div>
                  <div
                    data-testid="transfer-eta"
                    className="mt-1 text-base font-semibold font-mono text-slate-900 dark:text-slate-100"
                  >
                    {formatEta(activeJob.etaSeconds)}{' '}
                    <span className="text-xs font-normal text-slate-400">
                      ({formatEta(Math.round(activeJob.elapsedMs / 1000))})
                    </span>
                  </div>
                </div>
              </div>

              {/* Speed Graph */}
              <SpeedSparkline job={activeJob} />
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

export default TransferMonitorModal;
