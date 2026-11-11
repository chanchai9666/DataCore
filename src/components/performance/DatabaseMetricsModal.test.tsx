import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DatabaseMetricsModal } from './DatabaseMetricsModal';
import { dbApi } from '../../api/db';

vi.mock('../../api/db', () => ({
  dbApi: {
    executeDirectQuery: vi.fn(),
  },
}));

describe('DatabaseMetricsModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    render(
      <DatabaseMetricsModal
        isOpen={false}
        connectionId="conn-1"
        driver="postgres"
        onClose={onClose}
      />
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders buffer cache hit ratio when open', async () => {
    vi.mocked(dbApi.executeDirectQuery).mockResolvedValueOnce({
      columns: [],
      rows: [
        [
          { Text: 'mydb' },
          { Integer: 50 }, // blks_read
          { Integer: 9950 }, // blks_hit
          { Real: 99.5 }, // cache_hit_ratio
          { Integer: 1200 }, // xact_commit
          { Integer: 4 }, // xact_rollback
          { Integer: 0 }, // deadlocks
        ],
      ],
      execution_time_ms: 12,
    });

    render(
      <DatabaseMetricsModal
        isOpen={true}
        connectionId="conn-1"
        driver="postgres"
        databaseName="mydb"
        onClose={onClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByText('Database Performance & Buffer Cache')).toBeDefined();
      expect(screen.getByText('99.50%')).toBeDefined();
      expect(screen.getByText('Optimal Performance')).toBeDefined();
    });
  });
});
