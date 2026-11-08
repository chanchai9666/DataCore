import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
          column_mappings: [
            { source_column: 'name', target_column: 'name' },
            { source_column: 'email', target_column: 'email' },
          ],
        })
      );
      expect(onImportSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
