import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CrossDbCopyModal } from './CrossDbCopyModal';
import { dbApi } from '../../api/db';
import { useConnectionStore } from '../../stores/connectionStore';
import type { ConnectionConfig } from '../../types/db';

vi.mock('../../api/db', () => ({
  dbApi: {
    copyTableCrossDb: vi.fn(),
  },
}));

vi.mock('../../api/dataTransferApi', () => ({
  onTransferProgress: vi.fn().mockResolvedValue(vi.fn()),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockConnections: ConnectionConfig[] = [
  {
    id: 'conn-sqlite',
    name: 'Local SQLite',
    driver: 'sqlite',
    database: '/path/to/db.sqlite',
  },
  {
    id: 'conn-pg',
    name: 'Production Postgres',
    driver: 'postgres',
    host: 'localhost',
    port: 5432,
    database: 'proddb',
    user: 'postgres',
  },
];

describe('CrossDbCopyModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConnectionStore.setState({
      connections: mockConnections,
      activeConnectionId: 'conn-sqlite',
    });
  });

  it('renders correctly with source details and default target fields', () => {
    render(
      <CrossDbCopyModal
        isOpen={true}
        sourceConnectionId="conn-sqlite"
        sourceTableName="customers"
        sourceSchemaName="main"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Copy Table to Database (Cross-DB Transfer)')).toBeInTheDocument();
    expect(screen.getAllByText(/Local SQLite/)).toHaveLength(2);
    expect(screen.getByText('customers')).toBeInTheDocument();

    const targetSelect = screen.getByTestId('target-connection-select') as HTMLSelectElement;
    expect(targetSelect.value).toBe('conn-sqlite');

    const targetInput = screen.getByTestId('target-table-input') as HTMLInputElement;
    expect(targetInput.value).toBe('customers_copy');

    const copyStructureCheck = screen.getByTestId('copy-structure-checkbox') as HTMLInputElement;
    expect(copyStructureCheck.checked).toBe(true);

    const copyDataCheck = screen.getByTestId('copy-data-checkbox') as HTMLInputElement;
    expect(copyDataCheck.checked).toBe(true);
  });

  it('switches target table name when selecting another connection', () => {
    render(
      <CrossDbCopyModal
        isOpen={true}
        sourceConnectionId="conn-sqlite"
        sourceTableName="customers"
        onClose={vi.fn()}
      />
    );

    const targetSelect = screen.getByTestId('target-connection-select');
    fireEvent.change(targetSelect, { target: { value: 'conn-pg' } });

    const targetInput = screen.getByTestId('target-table-input') as HTMLInputElement;
    expect(targetInput.value).toBe('customers');
  });

  it('prevents copying to the same connection, schema and table name', async () => {
    render(
      <CrossDbCopyModal
        isOpen={true}
        sourceConnectionId="conn-sqlite"
        sourceTableName="customers"
        onClose={vi.fn()}
      />
    );

    const targetInput = screen.getByTestId('target-table-input');
    fireEvent.change(targetInput, { target: { value: 'customers' } });

    fireEvent.click(screen.getByTestId('start-transfer-btn'));

    expect(
      await screen.findByText('Target table name must be different when copying to the same database and schema.')
    ).toBeInTheDocument();
    expect(dbApi.copyTableCrossDb).not.toHaveBeenCalled();
  });

  it('prevents submission when neither copy structure nor copy data is checked', async () => {
    render(
      <CrossDbCopyModal
        isOpen={true}
        sourceConnectionId="conn-sqlite"
        sourceTableName="customers"
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('copy-structure-checkbox'));
    fireEvent.click(screen.getByTestId('copy-data-checkbox'));

    fireEvent.click(screen.getByTestId('start-transfer-btn'));

    expect(
      await screen.findByText('Please select at least one option: Copy Structure or Copy Data.')
    ).toBeInTheDocument();
    expect(dbApi.copyTableCrossDb).not.toHaveBeenCalled();
  });

  it('calls copyTableCrossDb with correct payload and triggers onSuccess', async () => {
    vi.mocked(dbApi.copyTableCrossDb).mockResolvedValueOnce({
      rowsTransferred: 1500,
      elapsedMs: 320,
    });

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <CrossDbCopyModal
        isOpen={true}
        sourceConnectionId="conn-sqlite"
        sourceTableName="customers"
        sourceSchemaName="main"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    // Change target to postgres
    fireEvent.change(screen.getByTestId('target-connection-select'), { target: { value: 'conn-pg' } });
    fireEvent.change(screen.getByTestId('target-schema-input'), { target: { value: 'public' } });
    fireEvent.change(screen.getByTestId('target-table-input'), { target: { value: 'customers_migrated' } });
    fireEvent.click(screen.getByTestId('drop-target-checkbox'));

    fireEvent.click(screen.getByTestId('start-transfer-btn'));

    await waitFor(() => {
      expect(dbApi.copyTableCrossDb).toHaveBeenCalledWith({
        sourceConnectionId: 'conn-sqlite',
        sourceSchema: 'main',
        sourceTable: 'customers',
        targetConnectionId: 'conn-pg',
        targetSchema: 'public',
        targetTable: 'customers_migrated',
        copyStructure: true,
        dropTargetIfExists: true,
        copyData: true,
      });
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith('customers_migrated');
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('displays error if copyTableCrossDb fails', async () => {
    vi.mocked(dbApi.copyTableCrossDb).mockRejectedValueOnce(new Error('Connection timed out'));

    render(
      <CrossDbCopyModal
        isOpen={true}
        sourceConnectionId="conn-sqlite"
        sourceTableName="customers"
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('start-transfer-btn'));

    expect(await screen.findByText('Connection timed out')).toBeInTheDocument();
  });
});
