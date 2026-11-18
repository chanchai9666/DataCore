import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { NativeRestoreModal } from './NativeRestoreModal';
import { dbApi } from '../../api/db';
import * as tauriDialog from '@tauri-apps/plugin-dialog';
import * as tauriEvent from '@tauri-apps/api/event';
import { useConnectionStore } from '../../stores/connectionStore';

vi.mock('../../api/db', () => ({
  dbApi: {
    checkNativeCliAvailability: vi.fn(),
    startNativeRestore: vi.fn(),
    cancelNativeTask: vi.fn(),
  },
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('NativeRestoreModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConnectionStore.setState({
      connections: [
        {
          id: 'conn-pg-1',
          name: 'Production PG',
          driver: 'postgres',
          database: 'production_db',
        },
      ],
    });
  });

  it('renders and checks restore tool availability', async () => {
    vi.mocked(dbApi.checkNativeCliAvailability).mockResolvedValueOnce({
      cli_name: 'pg_dump',
      available: true,
      path: '/opt/homebrew/bin/pg_dump',
    });

    render(
      <NativeRestoreModal
        isOpen={true}
        connectionId="conn-pg-1"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Native Database Restore')).toBeInTheDocument();

    await waitFor(() => {
      expect(dbApi.checkNativeCliAvailability).toHaveBeenCalledWith('conn-pg-1');
      expect(screen.getByText('pg_dump')).toBeInTheDocument();
    });
  });

  it('picks backup file and triggers startNativeRestore', async () => {
    vi.mocked(dbApi.checkNativeCliAvailability).mockResolvedValueOnce({
      cli_name: 'pg_dump',
      available: true,
      path: '/opt/homebrew/bin/pg_dump',
    });
    vi.mocked(tauriDialog.open).mockResolvedValueOnce('/backups/prod.dump');
    vi.mocked(tauriEvent.listen).mockResolvedValueOnce(vi.fn());
    vi.mocked(dbApi.startNativeRestore).mockResolvedValueOnce(0);

    const handleSuccess = vi.fn();
    render(
      <NativeRestoreModal
        isOpen={true}
        connectionId="conn-pg-1"
        onClose={vi.fn()}
        onSuccess={handleSuccess}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Start Restore')).toBeInTheDocument();
    });

    // Browse file
    const browseBtn = screen.getByText('Browse');
    fireEvent.click(browseBtn);
    await waitFor(() => {
      expect(tauriDialog.open).toHaveBeenCalled();
    });

    // Click Start Restore
    const startBtn = screen.getByText('Start Restore');
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(dbApi.startNativeRestore).toHaveBeenCalledWith(
        expect.stringMatching(/^restore-\d+$/),
        expect.objectContaining({
          connection_id: 'conn-pg-1',
          input_file: '/backups/prod.dump',
          clean: true,
          single_transaction: true,
        })
      );
      expect(handleSuccess).toHaveBeenCalled();
    });
  });

  it('displays native restore percentage bar advancing on log events and reaching 100%', async () => {
    vi.mocked(dbApi.checkNativeCliAvailability).mockResolvedValueOnce({
      cli_name: 'pg_dump',
      available: true,
      path: '/opt/homebrew/bin/pg_dump',
    });
    vi.mocked(tauriDialog.open).mockResolvedValueOnce('/backups/prod.dump');

    let eventCb: ((evt: any) => void) | null = null;
    vi.mocked(tauriEvent.listen).mockImplementationOnce(async (_name, cb: any) => {
      eventCb = cb;
      return () => {};
    });

    let resolveRestore!: (code: number) => void;
    vi.mocked(dbApi.startNativeRestore).mockImplementationOnce(
      () => new Promise((resolve) => { resolveRestore = resolve; })
    );

    render(
      <NativeRestoreModal
        isOpen={true}
        connectionId="conn-pg-1"
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Start Restore')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Browse'));
    await waitFor(() => expect(tauriDialog.open).toHaveBeenCalled());

    fireEvent.click(screen.getByText('Start Restore'));

    await waitFor(() => {
      expect(screen.getByTestId('native-restore-progress')).toBeInTheDocument();
      expect(dbApi.startNativeRestore).toHaveBeenCalled();
    });

    const taskId = vi.mocked(dbApi.startNativeRestore).mock.calls[0][0];
    act(() => {
      eventCb?.({
        payload: { task_id: taskId, line: 'pg_restore: restoring indexes (72%)', is_stderr: true },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('native-restore-percent')).toHaveTextContent('72%');
    });

    await act(async () => {
      resolveRestore(0);
    });

    await waitFor(() => {
      expect(screen.getByTestId('native-restore-percent')).toHaveTextContent('100%');
    });
  });
});
