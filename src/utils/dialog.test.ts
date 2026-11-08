import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showConfirmDialog } from './dialog';
import * as tauriDialog from '@tauri-apps/plugin-dialog';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  confirm: vi.fn(),
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
