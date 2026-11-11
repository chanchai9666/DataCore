import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
});
