import { create } from 'zustand';
import { cancelTransfer } from '../api/dataTransferApi';
import type { TransferProgress } from '../types/dataTransfer';

export type TransferDirection = 'export' | 'import' | 'copy' | 'maintenance';
export type TransferJobStatus = 'running' | 'completed' | 'cancelled' | 'error';

export interface SpeedSample {
  timestamp: number;
  rowsPerSec: number;
  mbPerSec: number;
}

export interface TransferJobState {
  jobId: string;
  label: string;
  direction: TransferDirection;
  status: TransferJobStatus;
  statusText: string;
  rowsProcessed: number;
  totalRows?: number;
  bytesWritten: number;
  startedAt: number;
  elapsedMs: number;
  rowsPerSec: number;
  mbPerSec: number;
  etaSeconds: number | null;
  speedHistory: SpeedSample[];
  errorMessage?: string;
}

export interface StartTransferJobParams {
  jobId: string;
  label: string;
  direction: TransferDirection;
  totalRows?: number;
}

export interface TransferMetricsInput {
  rowsProcessed: number;
  bytesWritten: number;
  totalRows?: number;
  elapsedMs: number;
}

export interface TransferMetrics {
  rowsPerSec: number;
  mbPerSec: number;
  etaSeconds: number | null;
}

const MAX_SPEED_SAMPLES = 60;
const BYTES_PER_MB = 1024 * 1024;

export function calculateTransferMetrics({
  rowsProcessed,
  bytesWritten,
  totalRows,
  elapsedMs,
}: TransferMetricsInput): TransferMetrics {
  const safeElapsedSec = Math.max(elapsedMs / 1000, 0.001);
  const rowsPerSec = rowsProcessed > 0 ? Math.round(rowsProcessed / safeElapsedSec) : 0;
  const mbPerSec = bytesWritten > 0 ? bytesWritten / BYTES_PER_MB / safeElapsedSec : 0;

  let etaSeconds: number | null = null;
  if (totalRows && totalRows > 0 && rowsProcessed > 0 && rowsPerSec > 0) {
    const remaining = Math.max(0, totalRows - rowsProcessed);
    etaSeconds = Math.ceil(remaining / rowsPerSec);
  }

  return { rowsPerSec, mbPerSec, etaSeconds };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '--';
  if (seconds === 0) return '< 1s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
}

export interface TransferMonitorState {
  jobs: Record<string, TransferJobState>;
  jobOrder: string[];
  selectedJobId: string | null;
  isDashboardOpen: boolean;

  startJob: (params: StartTransferJobParams) => void;
  handleProgress: (progress: TransferProgress) => void;
  completeJob: (
    jobId: string,
    summary?: { rowsProcessed?: number; bytesWritten?: number; elapsedMs?: number }
  ) => void;
  failJob: (jobId: string, errorMessage: string) => void;
  cancelJob: (jobId: string) => Promise<void>;
  selectJob: (jobId: string | null) => void;
  clearCompleted: () => void;
  openDashboard: () => void;
  closeDashboard: () => void;
  reset: () => void;
}

export const useTransferMonitorStore = create<TransferMonitorState>((set, get) => ({
  jobs: {},
  jobOrder: [],
  selectedJobId: null,
  isDashboardOpen: false,

  startJob: ({ jobId, label, direction, totalRows }) => {
    const now = Date.now();
    const newJob: TransferJobState = {
      jobId,
      label,
      direction,
      status: 'running',
      statusText: 'Starting...',
      rowsProcessed: 0,
      totalRows,
      bytesWritten: 0,
      startedAt: now,
      elapsedMs: 0,
      rowsPerSec: 0,
      mbPerSec: 0,
      etaSeconds: null,
      speedHistory: [],
    };
    set((state) => ({
      jobs: { ...state.jobs, [jobId]: newJob },
      jobOrder: [jobId, ...state.jobOrder.filter((id) => id !== jobId)],
      selectedJobId: jobId,
    }));
  },

  handleProgress: (progress) => {
    const jobId = progress.job_id || get().selectedJobId || 'active-transfer';
    const now = Date.now();

    set((state) => {
      const existing = state.jobs[jobId];
      if (existing && (existing.status === 'cancelled' || existing.status === 'completed')) {
        return state;
      }

      const startedAt = existing?.startedAt ?? now;
      const elapsedMs = progress.elapsed_ms ?? Math.max(now - startedAt, 1);
      const rowsProcessed = progress.rows_processed ?? progress.current_row ?? existing?.rowsProcessed ?? 0;
      const totalRows = progress.total_rows ?? existing?.totalRows;
      const bytesWritten = progress.bytes_written ?? existing?.bytesWritten ?? 0;

      const metrics = calculateTransferMetrics({
        rowsProcessed,
        bytesWritten,
        totalRows,
        elapsedMs,
      });

      const prevHistory = existing?.speedHistory ?? [];
      const nextHistory = [
        ...prevHistory,
        { timestamp: now, rowsPerSec: metrics.rowsPerSec, mbPerSec: metrics.mbPerSec },
      ].slice(-MAX_SPEED_SAMPLES);

      const updated: TransferJobState = {
        jobId,
        label: existing?.label ?? `Transfer ${jobId}`,
        direction: existing?.direction ?? 'export',
        status: 'running',
        statusText: progress.status || existing?.statusText || 'Running...',
        rowsProcessed,
        totalRows,
        bytesWritten,
        startedAt,
        elapsedMs,
        rowsPerSec: metrics.rowsPerSec,
        mbPerSec: metrics.mbPerSec,
        etaSeconds: metrics.etaSeconds,
        speedHistory: nextHistory,
      };

      const isNew = !existing;
      return {
        jobs: { ...state.jobs, [jobId]: updated },
        jobOrder: isNew ? [jobId, ...state.jobOrder] : state.jobOrder,
        selectedJobId: state.selectedJobId ?? jobId,
      };
    });
  },

  completeJob: (jobId, summary) => {
    set((state) => {
      const existing = state.jobs[jobId];
      if (!existing) return state;
      if (existing.status === 'cancelled') return state;

      const elapsedMs = summary?.elapsedMs ?? Math.max(Date.now() - existing.startedAt, 1);
      const rowsProcessed = summary?.rowsProcessed ?? existing.rowsProcessed;
      const bytesWritten = summary?.bytesWritten ?? existing.bytesWritten;
      const metrics = calculateTransferMetrics({
        rowsProcessed,
        bytesWritten,
        totalRows: rowsProcessed,
        elapsedMs,
      });

      return {
        jobs: {
          ...state.jobs,
          [jobId]: {
            ...existing,
            status: 'completed',
            statusText: 'Completed',
            rowsProcessed,
            totalRows: existing.totalRows ?? rowsProcessed,
            bytesWritten,
            elapsedMs,
            rowsPerSec: metrics.rowsPerSec,
            mbPerSec: metrics.mbPerSec,
            etaSeconds: 0,
          },
        },
      };
    });
  },

  failJob: (jobId, errorMessage) => {
    set((state) => {
      const existing = state.jobs[jobId];
      if (!existing) return state;
      if (existing.status === 'cancelled') return state;

      return {
        jobs: {
          ...state.jobs,
          [jobId]: {
            ...existing,
            status: 'error',
            statusText: 'Failed',
            errorMessage,
            etaSeconds: null,
          },
        },
      };
    });
  },

  cancelJob: async (jobId) => {
    try {
      await cancelTransfer(jobId);
    } finally {
      set((state) => {
        const existing = state.jobs[jobId];
        if (!existing) return state;
        return {
          jobs: {
            ...state.jobs,
            [jobId]: {
              ...existing,
              status: 'cancelled',
              statusText: 'Cancelled',
              etaSeconds: null,
            },
          },
        };
      });
    }
  },

  selectJob: (jobId) => set({ selectedJobId: jobId }),

  clearCompleted: () => {
    set((state) => {
      const runningJobs: Record<string, TransferJobState> = {};
      const nextOrder: string[] = [];
      for (const id of state.jobOrder) {
        const job = state.jobs[id];
        if (job && job.status === 'running') {
          runningJobs[id] = job;
          nextOrder.push(id);
        }
      }
      return {
        jobs: runningJobs,
        jobOrder: nextOrder,
        selectedJobId:
          state.selectedJobId && runningJobs[state.selectedJobId]
            ? state.selectedJobId
            : nextOrder[0] ?? null,
      };
    });
  },

  openDashboard: () => set({ isDashboardOpen: true }),
  closeDashboard: () => set({ isDashboardOpen: false }),
  reset: () => set({ jobs: {}, jobOrder: [], selectedJobId: null, isDashboardOpen: false }),
}));
