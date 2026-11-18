import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransferMonitorModal } from './TransferMonitorModal';
import { useTransferMonitorStore } from '../../stores/transferMonitorStore';
import * as dataTransferApi from '../../api/dataTransferApi';

vi.mock('../../api/dataTransferApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/dataTransferApi')>();
  return {
    ...actual,
    cancelTransfer: vi.fn().mockResolvedValue(true),
  };
});

describe('TransferMonitorModal', () => {
  beforeEach(() => {
    useTransferMonitorStore.getState().reset();
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    render(<TransferMonitorModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders empty state when no transfer jobs exist', () => {
    render(<TransferMonitorModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByTestId('transfer-monitor-empty')).toBeDefined();
  });

  it('renders live transfer metrics, speed chart, ETA, and cancels job on click', async () => {
    const store = useTransferMonitorStore.getState();
    store.startJob({
      jobId: 'job-live-1',
      label: 'Export orders.csv',
      direction: 'export',
      totalRows: 100000,
    });
    store.handleProgress({
      job_id: 'job-live-1',
      current_row: 25000,
      rows_processed: 25000,
      total_rows: 100000,
      bytes_written: 5 * 1024 * 1024,
      elapsed_ms: 2000,
      status: 'Streaming rows...',
    });
    store.handleProgress({
      job_id: 'job-live-1',
      current_row: 50000,
      rows_processed: 50000,
      total_rows: 100000,
      bytes_written: 10 * 1024 * 1024,
      elapsed_ms: 4000,
      status: 'Streaming rows...',
    });

    render(<TransferMonitorModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('Export orders.csv')).toBeDefined();
    expect(screen.getByTestId('transfer-speed-mbs').textContent).toContain('2.50 MB/s');
    expect(screen.getByTestId('transfer-speed-rows').textContent).toContain('12,500');
    expect(screen.getByTestId('transfer-bytes-written').textContent).toContain('10.00 MB');
    expect(screen.getByTestId('transfer-eta').textContent).toContain('4s');
    expect(screen.getByTestId('transfer-speed-chart')).toBeDefined();

    const cancelBtn = screen.getByTestId('transfer-cancel-btn');
    fireEvent.click(cancelBtn);

    expect(dataTransferApi.cancelTransfer).toHaveBeenCalledWith('job-live-1');
  });
});
