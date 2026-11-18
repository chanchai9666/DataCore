import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImportModal } from './ImportModal';
import * as transferApi from '../../api/dataTransferApi';

vi.mock('../../api/dataTransferApi', () => ({
  pickImportFile: vi.fn(),
  previewImportFile: vi.fn(),
  importData: vi.fn(),
  onTransferProgress: vi.fn().mockResolvedValue(vi.fn()),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ImportModal', () => {
  const tableColumns = [
    { name: 'id', dataType: 'INTEGER' },
    { name: 'name', dataType: 'TEXT' },
    { name: 'email', dataType: 'TEXT' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal header and file chooser button', () => {
    render(
      <ImportModal
        isOpen={true}
        onClose={vi.fn()}
        connectionId="conn-1"
        tableName="customers"
        tableColumns={tableColumns}
      />
    );

    expect(screen.getByText(/Import Data into/)).toBeInTheDocument();
    expect(screen.getByTestId('choose-import-file-btn')).toBeInTheDocument();
  });

  it('loads preview and populates column mapping on file select', async () => {
    vi.mocked(transferApi.pickImportFile).mockResolvedValueOnce('/path/to/customers.csv');
    vi.mocked(transferApi.previewImportFile).mockResolvedValueOnce({
      detected_delimiter: ',',
      headers: ['id', 'name', 'email'],
      preview_rows: [
        ['1', 'John Doe', 'john@example.com'],
        ['2', 'Jane Doe', 'jane@example.com'],
      ],
      total_preview_rows: 2,
    });

    render(
      <ImportModal
        isOpen={true}
        onClose={vi.fn()}
        connectionId="conn-1"
        tableName="customers"
        tableColumns={tableColumns}
      />
    );

    fireEvent.click(screen.getByTestId('choose-import-file-btn'));

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByTestId('mapping-select-0')).toHaveValue('id');
      expect(screen.getByTestId('mapping-select-1')).toHaveValue('name');
      expect(screen.getByTestId('mapping-select-2')).toHaveValue('email');
    });
  });

  it('submits importData with column mappings and selected error policy', async () => {
    const onClose = vi.fn();
    const onImportSuccess = vi.fn();

    vi.mocked(transferApi.pickImportFile).mockResolvedValueOnce('/path/to/customers.csv');
    vi.mocked(transferApi.previewImportFile).mockResolvedValueOnce({
      detected_delimiter: ',',
      headers: ['name', 'email'],
      preview_rows: [['John Doe', 'john@example.com']],
      total_preview_rows: 1,
    });
    vi.mocked(transferApi.importData).mockResolvedValueOnce({
      total_rows: 10,
      imported_rows: 10,
      skipped_rows: 0,
      elapsed_ms: 50,
    });

    render(
      <ImportModal
        isOpen={true}
        onClose={onClose}
        connectionId="conn-1"
        tableName="customers"
        tableColumns={tableColumns}
        onImportSuccess={onImportSuccess}
      />
    );

    fireEvent.click(screen.getByTestId('choose-import-file-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('confirm-import-btn')).not.toBeDisabled();
    });

    // Toggle to skip error policy
    fireEvent.click(screen.getByTestId('error-policy-skip'));

    fireEvent.click(screen.getByTestId('confirm-import-btn'));

    await waitFor(() => {
      expect(transferApi.importData).toHaveBeenCalledWith(
        'conn-1',
        'customers',
        expect.objectContaining({
          file_path: '/path/to/customers.csv',
          format: 'csv',
          delimiter: ',',
          has_headers: true,
          error_policy: 'skip',
          import_mode: 'atomic',
          column_mappings: [
            { source_column: 'name', target_column: 'name', target_type: 'TEXT' },
            { source_column: 'email', target_column: 'email', target_type: 'TEXT' },
          ],
        })
      );
      expect(onImportSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('submits importMode, resumeFromCheckpoint, and useNativeCopy when selected', async () => {
    vi.mocked(transferApi.pickImportFile).mockResolvedValueOnce('/path/to/customers.csv');
    vi.mocked(transferApi.previewImportFile).mockResolvedValueOnce({
      detected_delimiter: ',',
      headers: ['id', 'name'],
      preview_rows: [['1', 'Alice']],
      total_preview_rows: 1,
    });
    vi.mocked(transferApi.importData).mockResolvedValueOnce({
      total_rows: 1,
      imported_rows: 1,
      skipped_rows: 0,
      elapsed_ms: 12,
    });

    render(
      <ImportModal
        isOpen={true}
        onClose={vi.fn()}
        connectionId="conn-1"
        tableName="customers"
        tableColumns={tableColumns}
      />
    );

    fireEvent.click(screen.getByTestId('choose-import-file-btn'));
    await waitFor(() => expect(screen.getByTestId('import-mode-select')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('import-mode-select'), { target: { value: 'staging' } });
    fireEvent.click(screen.getByTestId('import-resume-checkpoint'));
    fireEvent.click(screen.getByTestId('import-use-native-copy'));
    fireEvent.click(screen.getByTestId('confirm-import-btn'));

    await waitFor(() => {
      expect(transferApi.importData).toHaveBeenCalledWith(
        'conn-1',
        'customers',
        expect.objectContaining({
          import_mode: 'staging',
          resume_from_checkpoint: true,
          use_native_copy: true,
          column_mappings: [
            { source_column: 'id', target_column: 'id', target_type: 'INTEGER' },
            { source_column: 'name', target_column: 'name', target_type: 'TEXT' },
          ],
        })
      );
    });
  });

  it('displays live percentage badge while importing rows', async () => {
    let progressCb: ((p: any) => void) | null = null;
    vi.mocked(transferApi.onTransferProgress).mockImplementationOnce(async (cb) => {
      progressCb = cb;
      return () => {};
    });
    vi.mocked(transferApi.pickImportFile).mockResolvedValueOnce('/path/to/customers.csv');
    vi.mocked(transferApi.previewImportFile).mockResolvedValueOnce({
      detected_delimiter: ',',
      headers: ['id', 'name'],
      preview_rows: [['1', 'Alice']],
      total_preview_rows: 1,
    });

    let resolveImport!: (val: any) => void;
    vi.mocked(transferApi.importData).mockReturnValueOnce(
      new Promise((res) => {
        resolveImport = res;
      })
    );

    render(
      <ImportModal
        isOpen={true}
        onClose={vi.fn()}
        connectionId="conn-1"
        tableName="customers"
        tableColumns={tableColumns}
      />
    );

    fireEvent.click(screen.getByTestId('choose-import-file-btn'));
    await waitFor(() => expect(screen.getByTestId('confirm-import-btn')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('confirm-import-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('import-modal-percent')).toBeInTheDocument();
    });

    const jobId = vi.mocked(transferApi.importData).mock.calls[0][2].job_id;
    act(() => {
      progressCb?.({
        job_id: jobId,
        current_row: 65,
        total_rows: 100,
        percent: 65,
        status: 'importing',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('import-modal-percent')).toHaveTextContent('65%');
      expect(screen.getByText('Importing (65%)...')).toBeInTheDocument();
    });

    await act(async () => {
      resolveImport({ total_rows: 100, imported_rows: 100, skipped_rows: 0, elapsed_ms: 20 });
    });
  });
});
