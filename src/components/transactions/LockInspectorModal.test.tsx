import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { LockInspectorModal } from './LockInspectorModal';
import { dbApi } from '../../api/db';

vi.mock('../../api/db', () => ({
  dbApi: {
    executeDirectQuery: vi.fn(),
  },
}));

describe('LockInspectorModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    render(
      <LockInspectorModal
        isOpen={false}
        connectionId="conn-1"
        driver="postgres"
        onClose={onClose}
      />
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('fetches locks and renders empty state if none', async () => {
    vi.mocked(dbApi.executeDirectQuery).mockResolvedValueOnce({
      columns: [],
      rows: [],
      execution_time_ms: 10,
    });

    render(
      <LockInspectorModal
        isOpen={true}
        connectionId="conn-1"
        driver="postgres"
        onClose={onClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('No Blocking Locks Detected')).toBeDefined();
    });
  });

  it('renders active lock rows when returned', async () => {
    vi.mocked(dbApi.executeDirectQuery).mockResolvedValueOnce({
      columns: [],
      rows: [
        [
          { Integer: 1001 },
          { Text: 'appuser' },
          { Text: 'production_db' },
          { Text: 'relation' },
          { Text: 'ExclusiveLock' },
          { Boolean: false }, // granted = false
          { Text: 'UPDATE orders SET status = 1' },
          { Integer: 45 },
          { Text: 'Lock' },
          { Text: 'transactionid' },
        ],
      ],
      execution_time_ms: 15,
    });

    render(
      <LockInspectorModal
        isOpen={true}
        connectionId="conn-1"
        driver="postgres"
        onClose={onClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/PID \/ Thread: 1001/)).toBeDefined();
      expect(screen.getByText('WAITING / BLOCKED')).toBeDefined();
      expect(screen.getByText('Kill Session')).toBeDefined();
    });
  });
});
