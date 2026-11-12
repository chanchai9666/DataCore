import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { LockInspectorModal } from './LockInspectorModal';
import { dbApi } from '../../api/db';
import * as dialogModule from '../../utils/dialog';

vi.mock('../../utils/dialog', () => ({
  showConfirmDialog: vi.fn(),
}));

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

  it('prompts confirmation with showConfirmDialog before terminating session', async () => {
    vi.mocked(dbApi.executeDirectQuery)
      .mockResolvedValueOnce({
        columns: [],
        rows: [
          [
            { Integer: 2002 },
            { Text: 'testuser' },
            { Text: 'db1' },
            { Text: 'relation' },
            { Text: 'ExclusiveLock' },
            { Boolean: false },
            { Text: 'LOCK TABLE users' },
            { Integer: 10 },
            { Text: 'Lock' },
            { Text: 'relation' },
          ],
        ],
        execution_time_ms: 5,
      })
      .mockResolvedValueOnce({
        columns: [],
        rows: [],
        execution_time_ms: 1,
      })
      .mockResolvedValueOnce({
        columns: [],
        rows: [],
        execution_time_ms: 1,
      });

    vi.mocked(dialogModule.showConfirmDialog).mockResolvedValueOnce(false);

    render(
      <LockInspectorModal
        isOpen={true}
        connectionId="conn-1"
        driver="postgres"
        onClose={onClose}
      />
    );

    const killBtn = await screen.findByRole('button', { name: /kill session/i });
    fireEvent.click(killBtn);

    await waitFor(() => {
      expect(dialogModule.showConfirmDialog).toHaveBeenCalledWith(
        expect.stringContaining('2002'),
        expect.any(Object)
      );
    });

    // When cancelled, kill query was not executed
    expect(dbApi.executeDirectQuery).toHaveBeenCalledTimes(1);

    // Now confirm kill
    vi.mocked(dialogModule.showConfirmDialog).mockResolvedValueOnce(true);
    fireEvent.click(killBtn);

    await waitFor(() => {
      expect(dbApi.executeDirectQuery).toHaveBeenCalledWith(
        'conn-1',
        expect.stringContaining('pg_terminate_backend(2002)')
      );
    });
  });
});
