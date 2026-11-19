import { create } from 'zustand';
import { setScreenProtection as setScreenProtectionIpc } from '../api/db';

export const SCREEN_PROTECTION_STORAGE_KEY = 'datacore-screen-protection';

function readStoredScreenProtection(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false;
  }
  return window.localStorage.getItem(SCREEN_PROTECTION_STORAGE_KEY) === 'true';
}

function persistScreenProtection(enabled: boolean): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(SCREEN_PROTECTION_STORAGE_KEY, enabled ? 'true' : 'false');
  }
}

interface PrivacyState {
  screenProtectionEnabled: boolean;
  isUpdating: boolean;
  error: string | null;
  setScreenProtection: (enabled: boolean) => Promise<void>;
  toggleScreenProtection: () => Promise<void>;
  syncScreenProtection: () => Promise<void>;
}

/**
 * Zustand store managing window screen-sharing protection (content protection) state.
 */
export const usePrivacyStore = create<PrivacyState>((set, get) => ({
  screenProtectionEnabled: readStoredScreenProtection(),
  isUpdating: false,
  error: null,

  setScreenProtection: async (enabled: boolean) => {
    set({ isUpdating: true, error: null });
    try {
      await setScreenProtectionIpc(enabled);
      persistScreenProtection(enabled);
      set({ screenProtectionEnabled: enabled, isUpdating: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ isUpdating: false, error: message });
    }
  },

  toggleScreenProtection: async () => {
    await get().setScreenProtection(!get().screenProtectionEnabled);
  },

  syncScreenProtection: async () => {
    const stored = readStoredScreenProtection();
    set({ screenProtectionEnabled: stored });
    try {
      await setScreenProtectionIpc(stored);
    } catch {
      // Ignore in non-Tauri browser environments (e.g., Vite web preview / tests)
    }
  },
}));
