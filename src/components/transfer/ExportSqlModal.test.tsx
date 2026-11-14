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

  it('adapts schema for SQLite connection (disabled N/A and unscoped table)', async () => {
    useConnectionStore.setState({
      connections: [
        { id: 'sqlite-1', name: 'mydata.db', driver: 'sqlite', database: 'mydata.db' },
      ],
    });

    vi.mocked(dataTransferApi.pickSqlExportFile).mockResolvedValueOnce('/path/to/categories.sql');
    vi.mocked(dbApi.exportSql).mockResolvedValueOnce({
      totalTables: 1,
      totalRows: 10,
      fileSizeBytes: 1024,
    });

    render(
      <ExportSqlModal
        isOpen={true}
        connectionId="sqlite-1"
        tableName="categories"
        schemaName="public" // Even if passed, SQLite must ignore it
        onClose={vi.fn()}
      />
    );

    // Schema input must be disabled with N/A (SQLite) placeholder and empty value
    const schemaInput = screen.getByTestId('source-schema-input') as HTMLInputElement;
    expect(schemaInput).toBeDisabled();
    expect(schemaInput.placeholder).toBe('N/A (SQLite)');
    expect(schemaInput.value).toBe('');

    // Target Scope must display "categories" without "public."
    expect(screen.getByText('categories')).toBeInTheDocument();
    expect(screen.queryByText('public.categories')).not.toBeInTheDocument();

    // Submit export
    fireEvent.click(screen.getByRole('button', { name: /Choose File & Export/i }));

    await waitFor(() => {
      expect(dbApi.exportSql).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionId: 'sqlite-1',
          schema: undefined,
          tables: ['categories'],
        })
      );
    });
  });

  it('adapts schema for MySQL connection defaulting to connection database', async () => {
    useConnectionStore.setState({
      connections: [
        { id: 'mysql-1', name: 'Production MySQL', driver: 'mysql', database: 'ecommerce' },
      ],
    });

    render(
      <ExportSqlModal
        isOpen={true}
        connectionId="mysql-1"
        tableName="orders"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Database / Schema:')).toBeInTheDocument();
    expect(screen.getByText('ecommerce.orders')).toBeInTheDocument();
  });
});
