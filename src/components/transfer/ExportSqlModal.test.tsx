import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExportSqlModal } from './ExportSqlModal';
import { dbApi } from '../../api/db';
import * as dataTransferApi from '../../api/dataTransferApi';
import { useConnectionStore } from '../../stores/connectionStore';

vi.mock('../../api/db', () => ({
  dbApi: {
    exportSql: vi.fn(),
  },
}));

vi.mock('../../api/dataTransferApi', () => ({
  pickSqlExportFile: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ExportSqlModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal with target table information and mode choices', () => {
    render(
      <ExportSqlModal
        isOpen={true}
        connectionId="conn-1"
        tableName="users"
        schemaName="public"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Export as SQL Dump')).toBeInTheDocument();
    expect(screen.getByText('public.users')).toBeInTheDocument();
    expect(screen.getByText('Structure & Data')).toBeInTheDocument();
    expect(screen.getByText('Structure Only')).toBeInTheDocument();
    expect(screen.getByText('Data Only')).toBeInTheDocument();
  });

  it('calls exportSql with selected options on submit', async () => {
    vi.mocked(dataTransferApi.pickSqlExportFile).mockResolvedValueOnce('/path/to/users.sql');
    vi.mocked(dbApi.exportSql).mockResolvedValueOnce({
      totalTables: 1,
      totalRows: 42,
      fileSizeBytes: 2048,
    });

    const handleClose = vi.fn();
    const handleSuccess = vi.fn();

    render(
      <ExportSqlModal
        isOpen={true}
        connectionId="conn-1"
        tableName="users"
        schemaName="public"
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    );

    // Click Structure Only
    fireEvent.click(screen.getByText('Structure Only'));

    // Click Export
    fireEvent.click(screen.getByRole('button', { name: /Choose File & Export/i }));

    await waitFor(() => {
      expect(dataTransferApi.pickSqlExportFile).toHaveBeenCalledWith('users.sql');
      expect(dbApi.exportSql).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionId: 'conn-1',
          schema: 'public',
          tables: ['users'],
          filePath: '/path/to/users.sql',
          includeDropTable: true,
          includeStructure: true,
          includeData: false,
          batchSize: 500,
          jobId: expect.any(String),
        })
      );
      expect(handleSuccess).toHaveBeenCalled();
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('allows switching connection and modifying schema', async () => {
    useConnectionStore.setState({
      connections: [
        { id: 'conn-1', name: 'Primary DB', driver: 'postgres', database: 'postgres' },
        { id: 'conn-2', name: 'Replica DB', driver: 'postgres', database: 'replica' },
      ],
    });

    vi.mocked(dataTransferApi.pickSqlExportFile).mockResolvedValueOnce('/path/to/analytics.sql');
    vi.mocked(dbApi.exportSql).mockResolvedValueOnce({
      totalTables: 2,
      totalRows: 100,
      fileSizeBytes: 4096,
    });

    render(
      <ExportSqlModal
        isOpen={true}
        connectionId="conn-1"
        schemaName="public"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Source Server & Database')).toBeInTheDocument();

    // Change connection to conn-2
    const connSelect = screen.getByTestId('source-connection-select');
    fireEvent.change(connSelect, { target: { value: 'conn-2' } });

    // Change schema to 'analytics'
    const schemaInput = screen.getByTestId('source-schema-input');
    fireEvent.change(schemaInput, { target: { value: 'analytics' } });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /Choose File & Export/i }));

    await waitFor(() => {
      expect(dbApi.exportSql).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionId: 'conn-2',
          schema: 'analytics',
        })
      );
    });
  });
});
