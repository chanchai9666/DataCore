import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TablePartitionsModal } from './TablePartitionsModal';
import { dbApi } from '../../api/db';

vi.mock('../../api/db', () => ({
  dbApi: {
    executeDirectQuery: vi.fn(),
  },
}));

describe('TablePartitionsModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    render(
      <TablePartitionsModal
        isOpen={false}
        tableName="orders"
        connectionId="conn-1"
        driver="postgres"
        onClose={onClose}
      />
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders partitioned sub-tables when returned', async () => {
    vi.mocked(dbApi.executeDirectQuery).mockResolvedValueOnce({
      columns: [],
      rows: [
        [
          { Text: 'orders_2026_q1' },
          { Text: "FOR VALUES FROM ('2026-01-01') TO ('2026-04-01')" },
          { Text: 'r' }, // range
          { Integer: 15400 },
          { Text: '12 MB' },
        ],
      ],
      execution_time_ms: 10,
    });

    render(
      <TablePartitionsModal
        isOpen={true}
        tableName="orders"
        connectionId="conn-1"
        driver="postgres"
        onClose={onClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByText('orders_2026_q1')).toBeDefined();
      expect(screen.getByText(/FOR VALUES FROM/)).toBeDefined();
    });
  });

  it('creates a monthly range partition and refreshes list', async () => {
    vi.mocked(dbApi.executeDirectQuery)
      .mockResolvedValueOnce({ columns: [], rows: [], execution_time_ms: 5 }) // initial fetch
      .mockResolvedValueOnce({ columns: [], rows: [], execution_time_ms: 8 }) // CREATE TABLE PARTITION OF
      .mockResolvedValueOnce({ columns: [], rows: [], execution_time_ms: 5 }); // refresh fetch

    render(
      <TablePartitionsModal
        isOpen={true}
        tableName="orders"
        schemaName="public"
        connectionId="conn-1"
        driver="postgres"
        onClose={onClose}
      />
    );

    const toggleCreateBtn = await screen.findByTestId('partition-create-toggle-btn');
    fireEvent.click(toggleCreateBtn);

    const nameInput = screen.getByTestId('partition-name-input') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'orders_2026_05' } });

    const yearInput = screen.getByTestId('partition-year-input');
    fireEvent.change(yearInput, { target: { value: '2026' } });

    const monthSelect = screen.getByTestId('partition-month-select');
    fireEvent.change(monthSelect, { target: { value: '5' } });

    const submitBtn = screen.getByTestId('partition-create-submit-btn');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(dbApi.executeDirectQuery).toHaveBeenCalledWith(
        'conn-1',
        'CREATE TABLE "public"."orders_2026_05" PARTITION OF "public"."orders" FOR VALUES FROM (\'2026-05-01\') TO (\'2026-06-01\');'
      );
    });
  });

  it('detaches and drops a partition with confirmation', async () => {
    vi.mocked(dbApi.executeDirectQuery)
      .mockResolvedValueOnce({
        columns: [],
        rows: [
          [
            { Text: 'orders_2025_01' },
            { Text: "FOR VALUES FROM ('2025-01-01') TO ('2025-02-01')" },
            { Text: 'r' },
            { Integer: 100 },
            { Text: '1 MB' },
          ],
        ],
        execution_time_ms: 5,
      })
      .mockResolvedValue({ columns: [], rows: [], execution_time_ms: 5 });

    render(
      <TablePartitionsModal
        isOpen={true}
        tableName="orders"
        schemaName="public"
        connectionId="conn-1"
        driver="postgres"
        onClose={onClose}
      />
    );

    const detachBtn = await screen.findByTestId('partition-detach-orders_2025_01');
    fireEvent.click(detachBtn);

    const confirmDetachBtn = await screen.findByTestId('partition-confirm-action-btn');
    fireEvent.click(confirmDetachBtn);

    await waitFor(() => {
      expect(dbApi.executeDirectQuery).toHaveBeenCalledWith(
        'conn-1',
        'ALTER TABLE "public"."orders" DETACH PARTITION "public"."orders_2025_01";'
      );
    });
  });

  it('runs background VACUUM ANALYZE / OPTIMIZE TABLE with progress status', async () => {
    vi.mocked(dbApi.executeDirectQuery)
      .mockResolvedValueOnce({ columns: [], rows: [], execution_time_ms: 5 }) // initial fetch
      .mockResolvedValueOnce({ columns: [], rows: [], execution_time_ms: 42 }); // VACUUM ANALYZE

    render(
      <TablePartitionsModal
        isOpen={true}
        tableName="orders"
        schemaName="public"
        connectionId="conn-1"
        driver="postgres"
        onClose={onClose}
      />
    );

    const maintBtn = await screen.findByTestId('partition-bg-maintenance-btn');
    fireEvent.click(maintBtn);

    await waitFor(() => {
      expect(dbApi.executeDirectQuery).toHaveBeenCalledWith(
        'conn-1',
        'VACUUM (ANALYZE) "public"."orders";'
      );
      expect(screen.getByTestId('partition-maintenance-status')).toBeDefined();
    });
  });
});
