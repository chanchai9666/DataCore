import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useTransferMonitorStore,
  calculateTransferMetrics,
  calculateTransferPercent,
  estimateNativeProgressPercent,
  formatBytes,
  formatEta,
} from './transferMonitorStore';
import * as dataTransferApi from '../api/dataTransferApi';

vi.mock('../api/dataTransferApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/dataTransferApi')>();
  return {
    ...actual,
    cancelTransfer: vi.fn().mockResolvedValue(true),
  };
});

describe('transferMonitorStore helpers', () => {
  it('calculates rows/sec, MB/s, and ETA accurately', () => {
    const metrics = calculateTransferMetrics({
      rowsProcessed: 50000,
      bytesWritten: 10 * 1024 * 1024, // 10 MB
      totalRows: 100000,
      elapsedMs: 2000, // 2 seconds
    });

    expect(metrics.rowsPerSec).toBe(25000);
    expect(metrics.mbPerSec).toBeCloseTo(5.0, 2);
    expect(metrics.etaSeconds).toBe(2);
  });

  it('returns null ETA when totalRows is unknown or rowsProcessed is 0', () => {
    expect(
      calculateTransferMetrics({
        rowsProcessed: 0,
        bytesWritten: 0,
        totalRows: 1000,
        elapsedMs: 1000,
      }).etaSeconds
    ).toBeNull();

    expect(
      calculateTransferMetrics({
        rowsProcessed: 500,
        bytesWritten: 1024,
        totalRows: undefined,
        elapsedMs: 1000,
      }).etaSeconds
    ).toBeNull();
  });

  it('formats bytes into human-readable units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.00 MB');
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.50 GB');
  });

  it('formats ETA seconds into readable durations', () => {
    expect(formatEta(null)).toBe('--');
    expect(formatEta(0)).toBe('< 1s');
    expect(formatEta(45)).toBe('45s');
    expect(formatEta(135)).toBe('2m 15s');
    expect(formatEta(3665)).toBe('1h 1m');
  });
});

describe('useTransferMonitorStore', () => {
  beforeEach(() => {
    useTransferMonitorStore.getState().reset();
    vi.clearAllMocks();
  });

  it('starts a job and updates speed, bytes, ETA, and speedHistory on progress events', () => {
    const store = useTransferMonitorStore.getState();
    store.startJob({
      jobId: 'job-1',
      label: 'Export orders.csv',
      direction: 'export',
      totalRows: 10000,
    });

    store.handleProgress({
      job_id: 'job-1',
      current_row: 2500,
      rows_processed: 2500,
      total_rows: 10000,
      bytes_written: 2 * 1024 * 1024,
      elapsed_ms: 1000,
      status: 'Exporting...',
    });

    const job = useTransferMonitorStore.getState().jobs['job-1'];
    expect(job).toBeDefined();
    expect(job.status).toBe('running');
    expect(job.rowsProcessed).toBe(2500);
    expect(job.totalRows).toBe(10000);
    expect(job.bytesWritten).toBe(2 * 1024 * 1024);
    expect(job.rowsPerSec).toBe(2500);
    expect(job.mbPerSec).toBeCloseTo(2.0, 2);
    expect(job.etaSeconds).toBe(3);
    expect(job.speedHistory).toHaveLength(1);
  });

  it('auto-registers an unknown job_id when progress arrives', () => {
    useTransferMonitorStore.getState().handleProgress({
      job_id: 'auto-job-99',
      current_row: 100,
      rows_processed: 100,
      bytes_written: 10240,
      elapsed_ms: 500,
      status: 'Importing batch 1',
    });

    const job = useTransferMonitorStore.getState().jobs['auto-job-99'];
    expect(job).toBeDefined();
    expect(job.rowsProcessed).toBe(100);
    expect(job.statusText).toBe('Importing batch 1');
  });

  it('cancels a running job via cancelTransfer and marks it cancelled', async () => {
    const store = useTransferMonitorStore.getState();
    store.startJob({
      jobId: 'job-cancel',
      label: 'Export big_table',
      direction: 'export',
    });

    await store.cancelJob('job-cancel');

    expect(dataTransferApi.cancelTransfer).toHaveBeenCalledWith('job-cancel');
    const job = useTransferMonitorStore.getState().jobs['job-cancel'];
    expect(job.status).toBe('cancelled');
  });

  it('completes, fails, and clears completed jobs', () => {
    const store = useTransferMonitorStore.getState();
    store.startJob({ jobId: 'j1', label: 'Job 1', direction: 'export' });
    store.startJob({ jobId: 'j2', label: 'Job 2', direction: 'import' });

    store.completeJob('j1', { rowsProcessed: 500, bytesWritten: 4096, elapsedMs: 200 });
    store.failJob('j2', 'Disk full');

    expect(useTransferMonitorStore.getState().jobs['j1'].status).toBe('completed');
    expect(useTransferMonitorStore.getState().jobs['j1'].percent).toBe(100);
    expect(useTransferMonitorStore.getState().jobs['j1'].etaSeconds).toBe(0);
    expect(useTransferMonitorStore.getState().jobs['j2'].status).toBe('error');
    expect(useTransferMonitorStore.getState().jobs['j2'].errorMessage).toBe('Disk full');

    store.clearCompleted();
    expect(Object.keys(useTransferMonitorStore.getState().jobs)).toHaveLength(0);
  });

  it('calculates explicit and fallback percentage via calculateTransferPercent and store state', () => {
    expect(calculateTransferPercent(null)).toBe(0);
    expect(
      calculateTransferPercent({ current_row: 30, total_rows: 100, percent: 42.6 })
    ).toBe(43);
    expect(
      calculateTransferPercent({ current_row: 50, rows_processed: 50, total_rows: 200 })
    ).toBe(25);
    expect(calculateTransferPercent({ current_row: 20 }, 80)).toBe(25);
    expect(calculateTransferPercent({ current_row: 150, percent: 120 })).toBe(100);

    const store = useTransferMonitorStore.getState();
    store.startJob({ jobId: 'pct-job', label: 'Export users.sql', direction: 'export' });
    expect(useTransferMonitorStore.getState().jobs['pct-job'].percent).toBeNull();

    store.handleProgress({
      job_id: 'pct-job',
      current_row: 400,
      total_rows: 1000,
      percent: 40,
      status: 'Exporting...',
    });
    expect(useTransferMonitorStore.getState().jobs['pct-job'].percent).toBe(40);
  });

  it('estimates monotonic progress from native CLI output and honors explicit XX%', () => {
    expect(estimateNativeProgressPercent(5, 'pg_dump: dumping contents of table users', 1)).toBe(5);
    const stage10 = estimateNativeProgressPercent(5, 'pg_dump: saving table orders', 10);
    expect(stage10).toBeGreaterThan(20);
    expect(stage10).toBeLessThanOrEqual(95);
    expect(estimateNativeProgressPercent(stage10, 'pg_restore: finished (68% done)', 11)).toBe(68);
    // Monotonic guard should never go backwards
    expect(estimateNativeProgressPercent(68, 'pg_restore: step log', 12)).toBe(68);
  });
});
