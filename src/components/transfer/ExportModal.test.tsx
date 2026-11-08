import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportModal } from './ExportModal';
import * as transferApi from '../../api/dataTransferApi';

vi.mock('../../api/dataTransferApi', () => ({
  pickExportFile: vi.fn(),
  exportData: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
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
});
