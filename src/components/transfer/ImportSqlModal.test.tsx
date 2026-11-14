import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImportSqlModal } from './ImportSqlModal';
import { dbApi } from '../../api/db';
import * as dataTransferApi from '../../api/dataTransferApi';
import { useConnectionStore } from '../../stores/connectionStore';

vi.mock('../../api/db', () => ({
  dbApi: {
    importSql: vi.fn(),
  },
}));

vi.mock('../../api/dataTransferApi', () => ({
  pickSqlImportFile: vi.fn(),
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

describe('ImportSqlModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal with schema target and file picker', () => {
    render(
      <ImportSqlModal
        isOpen={true}
        connectionId="conn-1"
        schemaName="public"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Execute SQL Script (Import)')).toBeInTheDocument();
    expect(screen.getByText('public')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Select or enter path to .sql file')).toBeInTheDocument();
  });

  it('selects file via browse and submits SQL import', async () => {
    vi.mocked(dataTransferApi.pickSqlImportFile).mockResolvedValueOnce('/dump/data.sql');
    vi.mocked(dbApi.importSql).mockResolvedValueOnce({
      totalStatements: 10,
      successfulStatements: 10,
      failedStatements: 0,
    });

    const handleClose = vi.fn();
    const handleSuccess = vi.fn();

    render(
      <ImportSqlModal
        isOpen={true}
        connectionId="conn-1"
        schemaName="public"
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    );

    // Click Browse
    fireEvent.click(screen.getByRole('button', { name: /Browse.../i }));

    await waitFor(() => {
      const input = screen.getByPlaceholderText('Select or enter path to .sql file') as HTMLInputElement;
      expect(input.value).toBe('/dump/data.sql');
    });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /Execute SQL Script/i }));

    await waitFor(() => {
      expect(dbApi.importSql).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionId: 'conn-1',
          schema: 'public',
          filePath: '/dump/data.sql',
          errorPolicy: 'abort',
          jobId: expect.any(String),
        })
      );
      expect(handleSuccess).toHaveBeenCalled();
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('triggers cancelTransfer when Cancel is clicked during import', async () => {
    vi.mocked(dataTransferApi.pickSqlImportFile).mockResolvedValueOnce('/dump/slow.sql');
    let resolveImport!: (val: any) => void;
    vi.mocked(dbApi.importSql).mockReturnValueOnce(
      new Promise((res) => {
        resolveImport = res;
      })
    );

    render(
      <ImportSqlModal
        isOpen={true}
        connectionId="conn-1"
        schemaName="public"
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Browse.../i }));
    await waitFor(() => {
      expect(
        (screen.getByPlaceholderText('Select or enter path to .sql file') as HTMLInputElement).value
      ).toBe('/dump/slow.sql');
    });

    fireEvent.click(screen.getByRole('button', { name: /Execute SQL Script/i }));

    await waitFor(() => {
      expect(dbApi.importSql).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));

    await waitFor(() => {
      expect(dataTransferApi.cancelTransfer).toHaveBeenCalledWith(expect.any(String));
    });

    resolveImport({ totalStatements: 0, successfulStatements: 0, failedStatements: 0 });
  });

  it('allows switching destination connection and schema', async () => {
    useConnectionStore.setState({
      connections: [
        { id: 'conn-1', name: 'Primary DB', driver: 'postgres', database: 'postgres' },
        { id: 'conn-dest', name: 'Staging DB', driver: 'postgres', database: 'staging' },
      ],
    });

    vi.mocked(dataTransferApi.pickSqlImportFile).mockResolvedValueOnce('/dump/staging.sql');
    vi.mocked(dbApi.importSql).mockResolvedValueOnce({
      totalStatements: 5,
      successfulStatements: 5,
      failedStatements: 0,
    });

    render(
      <ImportSqlModal
        isOpen={true}
        connectionId="conn-1"
        schemaName="public"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Destination Server & Database')).toBeInTheDocument();

    // Select conn-dest
    const connSelect = screen.getByTestId('destination-connection-select');
    fireEvent.change(connSelect, { target: { value: 'conn-dest' } });

    // Change schema to staging_schema
    const schemaInput = screen.getByTestId('destination-schema-input');
    fireEvent.change(schemaInput, { target: { value: 'staging_schema' } });

    // Pick file
    fireEvent.click(screen.getByRole('button', { name: /Browse.../i }));
    await waitFor(() => {
      expect(
        (screen.getByPlaceholderText('Select or enter path to .sql file') as HTMLInputElement).value
      ).toBe('/dump/staging.sql');
    });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /Execute SQL Script/i }));

    await waitFor(() => {
      expect(dbApi.importSql).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionId: 'conn-dest',
          schema: 'staging_schema',
          filePath: '/dump/staging.sql',
        })
      );
    });
  });

  it('adapts schema for SQLite connection (disabled N/A and target database name)', async () => {
    useConnectionStore.setState({
      connections: [
        { id: 'sqlite-1', name: 'local.db', driver: 'sqlite', database: 'local.db' },
      ],
    });

    vi.mocked(dataTransferApi.pickSqlImportFile).mockResolvedValueOnce('/dump/script.sql');
    vi.mocked(dbApi.importSql).mockResolvedValueOnce({
      totalStatements: 3,
      successfulStatements: 3,
      failedStatements: 0,
    });

    render(
      <ImportSqlModal
        isOpen={true}
        connectionId="sqlite-1"
        schemaName="public" // Should be ignored for SQLite
        onClose={vi.fn()}
      />
    );

    const schemaInput = screen.getByTestId('destination-schema-input') as HTMLInputElement;
    expect(schemaInput).toBeDisabled();
    expect(schemaInput.placeholder).toBe('N/A (SQLite)');
    expect(schemaInput.value).toBe('');

    expect(screen.getByText('SQLite Database (local.db)')).toBeInTheDocument();

    // Pick file
    fireEvent.click(screen.getByRole('button', { name: /Browse.../i }));
    await waitFor(() => {
      expect(
        (screen.getByPlaceholderText('Select or enter path to .sql file') as HTMLInputElement).value
      ).toBe('/dump/script.sql');
    });

    // Execute
    fireEvent.click(screen.getByRole('button', { name: /Execute SQL Script/i }));

    await waitFor(() => {
      expect(dbApi.importSql).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionId: 'sqlite-1',
          schema: undefined,
          filePath: '/dump/script.sql',
        })
      );
    });
  });
});
