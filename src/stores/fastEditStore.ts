import { create } from 'zustand';

const STORAGE_KEY = 'datacore-fast-edit-mode';

function loadPersistedMap(): Record<string, boolean> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, boolean>;
    }
  } catch {
    // Ignore malformed storage entries
  }
  return {};
}

function savePersistedMap(map: Record<string, boolean>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

export interface FastEditStoreState {
  fastEditByConnection: Record<string, boolean>;
  isFastEditEnabled: (connectionId?: string) => boolean;
  setFastEditEnabled: (connectionId: string, enabled: boolean) => void;
  toggleFastEdit: (connectionId: string) => boolean;
  reset: () => void;
}

export const useFastEditStore = create<FastEditStoreState>((set, get) => ({
  fastEditByConnection: loadPersistedMap(),

  isFastEditEnabled: (connectionId?: string) => {
    if (!connectionId) return false;
    return Boolean(get().fastEditByConnection[connectionId]);
  },

  setFastEditEnabled: (connectionId: string, enabled: boolean) => {
    if (!connectionId) return;
    set((state) => {
      const next = {
        ...state.fastEditByConnection,
        [connectionId]: enabled,
      };
      savePersistedMap(next);
      return { fastEditByConnection: next };
    });
  },

  toggleFastEdit: (connectionId: string) => {
    const nextEnabled = !get().isFastEditEnabled(connectionId);
    get().setFastEditEnabled(connectionId, nextEnabled);
    return nextEnabled;
  },

  reset: () => {
    set({ fastEditByConnection: loadPersistedMap() });
  },
}));

export default useFastEditStore;
