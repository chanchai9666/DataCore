import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setScreenProtection } from '../api/db';
import { SCREEN_PROTECTION_STORAGE_KEY, usePrivacyStore } from './privacyStore';

vi.mock('../api/db', () => ({
  setScreenProtection: vi.fn(),
}));

describe('privacyStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    usePrivacyStore.setState({
      screenProtectionEnabled: false,
      isUpdating: false,
      error: null,
    });
  });

  it('enables screen protection, invokes IPC, and persists to localStorage', async () => {
    vi.mocked(setScreenProtection).mockResolvedValueOnce(undefined);

    await usePrivacyStore.getState().setScreenProtection(true);

    expect(setScreenProtection).toHaveBeenCalledWith(true);
    expect(usePrivacyStore.getState().screenProtectionEnabled).toBe(true);
    expect(usePrivacyStore.getState().isUpdating).toBe(false);
    expect(usePrivacyStore.getState().error).toBeNull();
    expect(localStorage.getItem(SCREEN_PROTECTION_STORAGE_KEY)).toBe('true');
  });

  it('toggles screen protection from enabled to disabled', async () => {
    vi.mocked(setScreenProtection).mockResolvedValue(undefined);
    usePrivacyStore.setState({ screenProtectionEnabled: true });

    await usePrivacyStore.getState().toggleScreenProtection();

    expect(setScreenProtection).toHaveBeenCalledWith(false);
    expect(usePrivacyStore.getState().screenProtectionEnabled).toBe(false);
    expect(localStorage.getItem(SCREEN_PROTECTION_STORAGE_KEY)).toBe('false');
  });

  it('preserves previous state and sets error when IPC fails', async () => {
    vi.mocked(setScreenProtection).mockRejectedValueOnce(new Error('Window unavailable'));

    await usePrivacyStore.getState().setScreenProtection(true);

    expect(usePrivacyStore.getState().screenProtectionEnabled).toBe(false);
    expect(usePrivacyStore.getState().isUpdating).toBe(false);
    expect(usePrivacyStore.getState().error).toContain('Window unavailable');
    expect(localStorage.getItem(SCREEN_PROTECTION_STORAGE_KEY)).toBeNull();
  });

  it('syncs stored preference on startup', async () => {
    vi.mocked(setScreenProtection).mockResolvedValueOnce(undefined);
    localStorage.setItem(SCREEN_PROTECTION_STORAGE_KEY, 'true');

    await usePrivacyStore.getState().syncScreenProtection();

    expect(setScreenProtection).toHaveBeenCalledWith(true);
    expect(usePrivacyStore.getState().screenProtectionEnabled).toBe(true);
  });
});
