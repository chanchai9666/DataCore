import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showConfirmDialog, pickSqliteDatabaseFile } from './dialog';
import * as tauriDialog from '@tauri-apps/plugin-dialog';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  confirm: vi.fn(),
  open: vi.fn(),
}));

describe('showConfirmDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls tauri dialog confirm with warning kind by default', async () => {
    vi.mocked(tauriDialog.confirm).mockResolvedValue(true);

    const result = await showConfirmDialog('Are you sure you want to delete this row?', {
      title: 'Confirm Deletion',
    });

    expect(result).toBe(true);
    expect(tauriDialog.confirm).toHaveBeenCalledWith(
      'Are you sure you want to delete this row?',
      expect.objectContaining({
        title: 'Confirm Deletion',
        kind: 'warning',
      })
    );
  });

  it('returns false when user clicks cancel in tauri dialog', async () => {
    vi.mocked(tauriDialog.confirm).mockResolvedValue(false);

    const result = await showConfirmDialog('Delete row?');

    expect(result).toBe(false);
  });

  it('falls back to window.confirm when tauri dialog throws', async () => {
    vi.mocked(tauriDialog.confirm).mockRejectedValue(new Error('Tauri API not available'));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const result = await showConfirmDialog('Proceed?');

    expect(result).toBe(true);
    expect(confirmSpy).toHaveBeenCalledWith('Proceed?');
    confirmSpy.mockRestore();
  });

  it('handles async window.confirm returning false in fallback', async () => {
    vi.mocked(tauriDialog.confirm).mockRejectedValue(new Error('Tauri API not available'));
    const confirmSpy = vi.spyOn(window, 'confirm').mockResolvedValue(false as any);

    const result = await showConfirmDialog('Proceed?');

    expect(result).toBe(false);
    confirmSpy.mockRestore();
  });
});

describe('pickSqliteDatabaseFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns selected file path when a single file is chosen', async () => {
    vi.mocked(tauriDialog.open).mockResolvedValue('/path/to/chinook.db');

    const result = await pickSqliteDatabaseFile();

    expect(result).toBe('/path/to/chinook.db');
    expect(tauriDialog.open).toHaveBeenCalledWith(
      expect.objectContaining({
        multiple: false,
        directory: false,
        title: 'Select SQLite Database',
        filters: expect.arrayContaining([
          expect.objectContaining({
            extensions: expect.arrayContaining(['db', 'sqlite', 'sqlite3']),
          }),
        ]),
      })
    );
  });

  it('returns first file path when open returns an array', async () => {
    vi.mocked(tauriDialog.open).mockResolvedValue(['/path/to/first.db', '/path/to/second.db']);

    const result = await pickSqliteDatabaseFile();

    expect(result).toBe('/path/to/first.db');
  });

  it('returns null when user cancels file picker dialog', async () => {
    vi.mocked(tauriDialog.open).mockResolvedValue(null);

    const result = await pickSqliteDatabaseFile();

    expect(result).toBeNull();
  });

  it('returns null when tauri dialog throws an error', async () => {
    vi.mocked(tauriDialog.open).mockRejectedValue(new Error('Dialog open failed'));

    const result = await pickSqliteDatabaseFile();

    expect(result).toBeNull();
  });
});
