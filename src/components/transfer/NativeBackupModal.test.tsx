import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { NativeBackupModal } from './NativeBackupModal';
import { dbApi } from '../../api/db';
import * as tauriDialog from '@tauri-apps/plugin-dialog';
import * as tauriEvent from '@tauri-apps/api/event';
import { useConnectionStore } from '../../stores/connectionStore';

vi.mock('../../api/db', () => ({
  dbApi: {
    checkNativeCliAvailability: vi.fn(),
    startNativeBackup: vi.fn(),
    cancelNativeTask: vi.fn(),
  },
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(),
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

describe('NativeBackupModal', () => {
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

  it('renders and checks CLI tool status on open', async () => {
    vi.mocked(dbApi.checkNativeCliAvailability).mockResolvedValueOnce({
      cli_name: 'pg_dump',
      available: true,
      path: '/opt/homebrew/bin/pg_dump',
      version: 'pg_dump (PostgreSQL) 16.2',
    });

    render(
      <NativeBackupModal
        isOpen={true}
        connectionId="conn-pg-1"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Native Database Backup')).toBeInTheDocument();

    await waitFor(() => {
      expect(dbApi.checkNativeCliAvailability).toHaveBeenCalledWith('conn-pg-1');
      expect(screen.getByText('pg_dump')).toBeInTheDocument();
      expect(screen.getByText('/opt/homebrew/bin/pg_dump')).toBeInTheDocument();
    });
  });

  it('handles file pick and triggers startNativeBackup with custom archive format', async () => {
    vi.mocked(dbApi.checkNativeCliAvailability).mockResolvedValueOnce({
      cli_name: 'pg_dump',
      available: true,
      path: '/usr/local/bin/pg_dump',
      version: 'pg_dump 15.0',
    });
    vi.mocked(tauriDialog.save).mockResolvedValueOnce('/backups/prod.dump');
    vi.mocked(tauriEvent.listen).mockResolvedValueOnce(vi.fn());
    vi.mocked(dbApi.startNativeBackup).mockResolvedValueOnce(0);

    const handleSuccess = vi.fn();
    render(
      <NativeBackupModal
        isOpen={true}
        connectionId="conn-pg-1"
        onClose={vi.fn()}
        onSuccess={handleSuccess}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Start Backup')).toBeInTheDocument();
    });

    // Browse file
    const browseBtn = screen.getByText('Browse');
    fireEvent.click(browseBtn);
    await waitFor(() => {
      expect(tauriDialog.save).toHaveBeenCalled();
    });

    // Click Start Backup
    const startBtn = screen.getByText('Start Backup');
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(dbApi.startNativeBackup).toHaveBeenCalledWith(
        expect.stringMatching(/^backup-\d+$/),
        expect.objectContaining({
          connection_id: 'conn-pg-1',
          output_file: '/backups/prod.dump',
          format: 'custom',
        })
      );
      expect(handleSuccess).toHaveBeenCalled();
    });
  });

  it('allows cancelling a running backup task', async () => {
    vi.mocked(dbApi.checkNativeCliAvailability).mockResolvedValueOnce({
      cli_name: 'pg_dump',
      available: true,
      path: '/usr/bin/pg_dump',
    });
    vi.mocked(tauriEvent.listen).mockResolvedValueOnce(vi.fn());
    vi.mocked(dbApi.cancelNativeTask).mockResolvedValueOnce();

    // startNativeBackup does not resolve immediately
    let resolveBackup: (code: number) => void = () => {};
    vi.mocked(dbApi.startNativeBackup).mockImplementationOnce(
      () => new Promise((resolve) => { resolveBackup = resolve; })
    );

    render(
      <NativeBackupModal
        isOpen={true}
        connectionId="conn-pg-1"
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Start Backup')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Start Backup'));

    await waitFor(() => {
      expect(screen.getByText('Cancel Process')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Cancel Process'));
    expect(dbApi.cancelNativeTask).toHaveBeenCalledWith(expect.stringMatching(/^backup-\d+$/));

    // Finish process
    resolveBackup(0);
  });

  it('displays native backup percentage bar advancing on log events and reaching 100%', async () => {
    vi.mocked(dbApi.checkNativeCliAvailability).mockResolvedValueOnce({
      cli_name: 'pg_dump',
      available: true,
      path: '/usr/bin/pg_dump',
    });

    let eventCb: ((evt: any) => void) | null = null;
    vi.mocked(tauriEvent.listen).mockImplementationOnce(async (_name, cb: any) => {
      eventCb = cb;
      return () => {};
    });

    let resolveBackup!: (code: number) => void;
    vi.mocked(dbApi.startNativeBackup).mockImplementationOnce(
      () => new Promise((resolve) => { resolveBackup = resolve; })
    );

    render(
      <NativeBackupModal
        isOpen={true}
        connectionId="conn-pg-1"
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Start Backup')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Start Backup'));

    await waitFor(() => {
      expect(screen.getByTestId('native-backup-progress')).toBeInTheDocument();
      expect(dbApi.startNativeBackup).toHaveBeenCalled();
    });

    const taskId = vi.mocked(dbApi.startNativeBackup).mock.calls[0][0];
    act(() => {
      eventCb?.({
        payload: { task_id: taskId, line: 'pg_dump: saving contents (45%)', is_stderr: true },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('native-backup-percent')).toHaveTextContent('45%');
    });

    await act(async () => {
      resolveBackup(0);
    });

    await waitFor(() => {
      expect(screen.getByTestId('native-backup-percent')).toHaveTextContent('100%');
    });
  });
});
