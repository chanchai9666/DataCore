import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TableMaintenanceModal } from './TableMaintenanceModal';
import { dbApi } from '../../api/db';

vi.mock('../../api/db', () => ({
  dbApi: {
    executeDirectQuery: vi.fn().mockResolvedValue({
      columns: [{ name: 'status', data_type: 'text' }],
      rows: [['ok']],
      execution_time_ms: 18,
    }),
  },
}));

describe('TableMaintenanceModal', () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <TableMaintenanceModal
        isOpen={false}
        tableName="users"
        schemaName="public"
        connectionId="conn-1"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders modal with table details, default analyze operation, and SQL preview', () => {
    render(
      <TableMaintenanceModal
        isOpen={true}
        tableName="users"
        schemaName="public"
        connectionId="conn-1"
        driver="postgres"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Table Maintenance & Diagnostics' })
    ).toBeInTheDocument();
    expect(screen.getByText(/public\.users/i)).toBeInTheDocument();
    expect(screen.getByText('ANALYZE "public"."users";')).toBeInTheDocument();
  });

  it('switches operation tabs and updates SQL preview correctly', () => {
    render(
      <TableMaintenanceModal
        isOpen={true}
        tableName="users"
        schemaName="public"
        connectionId="conn-1"
        driver="postgres"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    // Switch to Check Integrity
    fireEvent.click(screen.getByTestId('maintenance-op-check'));
    expect(
      screen.getByText('SELECT count(*) AS checked_rows FROM "public"."users";')
    ).toBeInTheDocument();

    // Switch to Optimize
    fireEvent.click(screen.getByTestId('maintenance-op-optimize'));
    expect(screen.getByText('VACUUM (ANALYZE) "public"."users";')).toBeInTheDocument();

    // Switch to Reindex
    fireEvent.click(screen.getByTestId('maintenance-op-reindex'));
    expect(screen.getByText('REINDEX TABLE "public"."users";')).toBeInTheDocument();
  });

  it('executes operation, displays execution time and diagnostic result, and calls onSuccess', async () => {
    render(
      <TableMaintenanceModal
        isOpen={true}
        tableName="users"
        schemaName="public"
        connectionId="conn-1"
        driver="postgres"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const execBtn = screen.getByTestId('execute-maintenance-btn');
    fireEvent.click(execBtn);

    await waitFor(() => {
      expect(dbApi.executeDirectQuery).toHaveBeenCalledWith(
        'conn-1',
        'ANALYZE "public"."users";'
      );
    });

    expect(await screen.findByText('Execution Complete (ANALYZE)')).toBeInTheDocument();
    expect(screen.getByTestId('maintenance-exec-time')).toHaveTextContent('18 ms');
    expect(screen.getByText('ok')).toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalled();
  });

  it('displays error if execution fails', async () => {
    (dbApi.executeDirectQuery as any).mockRejectedValueOnce(
      new Error('relation "users" does not exist')
    );

    render(
      <TableMaintenanceModal
        isOpen={true}
        tableName="users"
        schemaName="public"
        connectionId="conn-1"
        driver="postgres"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const execBtn = screen.getByTestId('execute-maintenance-btn');
    fireEvent.click(execBtn);

    expect(
      await screen.findByText('relation "users" does not exist')
    ).toBeInTheDocument();
  });
});
