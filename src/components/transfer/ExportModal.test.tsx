import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportModal } from './ExportModal';
import * as transferApi from '../../api/dataTransferApi';

vi.mock('../../api/dataTransferApi', () => ({
  pickExportFile: vi.fn(),
  exportData: vi.fn(),
  onTransferProgress: vi.fn().mockResolvedValue(vi.fn()),
  cancelTransfer: vi.fn().mockResolvedValue(true),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('ExportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal with table name and format choices', () => {
    render(
      <ExportModal
        isOpen={true}
        onClose={vi.fn()}
        connectionId="conn-1"
        tableName="users"
      />
    );

    expect(screen.getByText(/Export Data -/)).toBeInTheDocument();
    expect(screen.getByTestId('export-format-csv')).toBeInTheDocument();
    expect(screen.getByTestId('export-format-json')).toBeInTheDocument();
  });

  it('switches between CSV and JSON formats', () => {
    render(
      <ExportModal
        isOpen={true}
        onClose={vi.fn()}
        connectionId="conn-1"
        tableName="users"
      />
    );

    expect(screen.getByTestId('export-delimiter-select')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('export-format-json'));
    expect(screen.queryByTestId('export-delimiter-select')).not.toBeInTheDocument();
    expect(screen.getByTestId('export-json-structure-select')).toBeInTheDocument();
  });

  it('triggers exportData when confirm button is clicked', async () => {
    const onClose = vi.fn();
    vi.mocked(transferApi.pickExportFile).mockResolvedValueOnce('/path/to/users.csv');
    vi.mocked(transferApi.exportData).mockResolvedValueOnce({
      total_rows: 150,
      file_size_bytes: 4096,
      elapsed_ms: 25,
    });

    render(
      <ExportModal
        isOpen={true}
        onClose={onClose}
        connectionId="conn-1"
        tableName="users"
      />
    );

    fireEvent.click(screen.getByTestId('confirm-export-btn'));

    await waitFor(() => {
      expect(transferApi.pickExportFile).toHaveBeenCalledWith('users', 'csv');
      expect(transferApi.exportData).toHaveBeenCalledWith(
        'conn-1',
        'SELECT * FROM users',
        '/path/to/users.csv',
        expect.objectContaining({
          format: 'csv',
          delimiter: ',',
          include_headers: true,
        })
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('passes compression and use_native_copy options when selected', async () => {
    const onClose = vi.fn();
    vi.mocked(transferApi.pickExportFile).mockResolvedValueOnce('/path/to/users.csv.gz');
    vi.mocked(transferApi.exportData).mockResolvedValueOnce({
      total_rows: 100,
      file_size_bytes: 1024,
      elapsed_ms: 15,
    });

    render(
      <ExportModal
        isOpen={true}
        onClose={onClose}
        connectionId="conn-1"
        tableName="users"
      />
    );

    fireEvent.change(screen.getByTestId('export-compression-select'), { target: { value: 'gzip' } });
    fireEvent.click(screen.getByTestId('export-use-native-copy'));
    fireEvent.click(screen.getByTestId('confirm-export-btn'));

    await waitFor(() => {
      expect(transferApi.pickExportFile).toHaveBeenCalledWith('users', 'csv', 'gzip');
      expect(transferApi.exportData).toHaveBeenCalledWith(
        'conn-1',
        'SELECT * FROM users',
        '/path/to/users.csv.gz',
        expect.objectContaining({
          format: 'csv',
          use_native_copy: true,
        })
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('forwards total_rows and renders real-time percentage progress while exporting', async () => {
    let progressCb: ((p: any) => void) | null = null;
    vi.mocked(transferApi.onTransferProgress).mockImplementationOnce(async (cb) => {
      progressCb = cb;
      return () => {};
    });
    vi.mocked(transferApi.pickExportFile).mockResolvedValueOnce('/path/to/users.csv');

    let resolveExport!: (val: any) => void;
    vi.mocked(transferApi.exportData).mockReturnValueOnce(
      new Promise((res) => {
        resolveExport = res;
      })
    );

    render(
      <ExportModal
        isOpen={true}
        onClose={vi.fn()}
        connectionId="conn-1"
        tableName="users"
        totalRows={1000}
      />
    );

    fireEvent.click(screen.getByTestId('confirm-export-btn'));

    await waitFor(() => {
      expect(transferApi.exportData).toHaveBeenCalledWith(
        'conn-1',
        'SELECT * FROM users',
        '/path/to/users.csv',
        expect.objectContaining({
          total_rows: 1000,
        })
      );
      expect(screen.getByTestId('export-modal-percent')).toBeInTheDocument();
    });

    const jobId = vi.mocked(transferApi.exportData).mock.calls[0][3].job_id;
    act(() => {
      progressCb?.({
        job_id: jobId,
        current_row: 600,
        total_rows: 1000,
        percent: 60,
        status: 'exporting',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-modal-percent')).toHaveTextContent('60%');
    });

    await act(async () => {
      resolveExport({ total_rows: 1000, file_size_bytes: 8192, elapsed_ms: 40 });
    });
  });
});
