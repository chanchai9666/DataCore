import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchemaDiffModal } from './SchemaDiffModal';
import * as schemaDiffApi from '../../api/schemaDiffApi';
import { dbApi } from '../../api/db';
import * as dialogModule from '../../utils/dialog';
import { toast } from 'sonner';
import { useConnectionStore } from '../../stores/connectionStore';
import type { ConnectionConfig } from '../../types/db';

vi.mock('../../api/db', () => ({
  dbApi: {
    executeDirectQuery: vi.fn(),
  },
}));

vi.mock('../../utils/dialog', () => ({
  showConfirmDialog: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../../api/schemaDiffApi', async () => {
  const actual = await vi.importActual<typeof schemaDiffApi>('../../api/schemaDiffApi');
  return {
    ...actual,
    fetchSchemaForDiff: vi.fn(),
  };
});

describe('SchemaDiffModal', () => {
  const mockConnections: ConnectionConfig[] = [
    {
      id: 'conn_source',
      name: 'Dev DB',
      driver: 'postgres',
      database: 'dev_db',
    } as ConnectionConfig,
    {
      id: 'conn_target',
      name: 'Prod DB',
      driver: 'postgres',
      database: 'prod_db',
    } as ConnectionConfig,
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    useConnectionStore.setState({
      connections: mockConnections,
      activeConnectionId: 'conn_source',
    });

    vi.mocked(schemaDiffApi.fetchSchemaForDiff).mockImplementation(async (connId) => {
      if (connId === 'conn_source') {
        return {
          connectionId: 'conn_source',
          schemaName: 'public',
          driver: 'postgres',
          tables: [
            {
              id: 'users',
              name: 'users',
              x: 0,
              y: 0,
              columns: [
                { name: 'id', dataType: 'INT', isPrimaryKey: true, isNullable: false },
                { name: 'email', dataType: 'VARCHAR(255)', isPrimaryKey: false, isNullable: false },
              ],
            },
          ],
        };
      }
      return {
        connectionId: 'conn_target',
        schemaName: 'public',
        driver: 'postgres',
        tables: [
          {
            id: 'users',
            name: 'users',
            x: 0,
            y: 0,
            columns: [
              { name: 'id', dataType: 'INT', isPrimaryKey: true, isNullable: false },
              { name: 'email', dataType: 'VARCHAR(100)', isPrimaryKey: false, isNullable: true },
            ],
          },
        ],
      };
    });
  });

  it('renders modal with connection selectors and triggers comparison', async () => {
    render(
      <SchemaDiffModal
        isOpen={true}
        onClose={vi.fn()}
        initialConnectionId="conn_source"
      />
    );

    expect(screen.getByText(/schema diff & synchronization/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /compare schemas/i })).toBeInTheDocument();

    const compareBtn = screen.getByTestId('diff-compare-btn');
    fireEvent.click(compareBtn);

    await waitFor(() => {
      expect(screen.getByText('users')).toBeInTheDocument();
      expect(screen.getByText(/1 modified/i)).toBeInTheDocument();
    });

    // Check that migration tab is present
    const migrationTabBtn = screen.getByTestId('diff-tab-migration');
    fireEvent.click(migrationTabBtn);

    expect(screen.getByText(/migration up/i)).toBeInTheDocument();
  });

  it('executes runnable migration statements successfully and re-runs comparison', async () => {
    vi.mocked(dialogModule.showConfirmDialog).mockResolvedValue(true);
    vi.mocked(dbApi.executeDirectQuery).mockResolvedValue({
      columns: [],
      rows: [],
      execution_time_ms: 5,
    });

    render(
      <SchemaDiffModal
        isOpen={true}
        onClose={vi.fn()}
        initialConnectionId="conn_source"
      />
    );

    // Compare
    fireEvent.click(screen.getByTestId('diff-compare-btn'));
    await waitFor(() => {
      expect(screen.getByText('users')).toBeInTheDocument();
    });

    // Go to Migration UP
    fireEvent.click(screen.getByTestId('diff-tab-migration'));

    // Click execute
    const executeBtn = screen.getByRole('button', { name: /execute on target/i });
    fireEvent.click(executeBtn);

    await waitFor(() => {
      expect(dialogModule.showConfirmDialog).toHaveBeenCalled();
      expect(dbApi.executeDirectQuery).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Migration executed successfully'));
    });
  });

  it('displays real database error message when migration execution fails', async () => {
    vi.mocked(dialogModule.showConfirmDialog).mockResolvedValue(true);
    vi.mocked(dbApi.executeDirectQuery).mockRejectedValue(
      'near "uuid": syntax error at or near column definition'
    );

    render(
      <SchemaDiffModal
        isOpen={true}
        onClose={vi.fn()}
        initialConnectionId="conn_source"
      />
    );

    // Compare
    fireEvent.click(screen.getByTestId('diff-compare-btn'));
    await waitFor(() => {
      expect(screen.getByText('users')).toBeInTheDocument();
    });

    // Go to Migration UP
    fireEvent.click(screen.getByTestId('diff-tab-migration'));

    // Click execute
    const executeBtn = screen.getByRole('button', { name: /execute on target/i });
    fireEvent.click(executeBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Execution failed: near "uuid": syntax error at or near column definition'
      );
    });
  });
});
