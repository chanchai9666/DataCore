import { create } from 'zustand';

export interface FolderMetadata {
  color?: string;
}

export const FOLDER_COLORS = [
  { name: 'Yellow (Default)', value: '#eab308' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Gray', value: '#9ca3af' },
];

const STORAGE_KEY = 'datacore_connection_folders_v1';

function loadStoredFolders(): { folderMetadata: Record<string, FolderMetadata>; customFolders: string[] } {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          folderMetadata: parsed.folderMetadata || {},
          customFolders: parsed.customFolders || [],
        };
      }
    }
  } catch {
    // Ignore storage parse errors
  }
  return { folderMetadata: {}, customFolders: [] };
}

function persistStoredFolders(state: { folderMetadata: Record<string, FolderMetadata>; customFolders: string[] }) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    // Ignore storage write errors
  }
}

export interface FolderStoreState {
  folderMetadata: Record<string, FolderMetadata>;
  customFolders: string[];
  setFolderColor: (folderName: string, color: string) => void;
  addFolder: (folderName: string, color?: string) => void;
  renameFolder: (oldName: string, newName: string) => void;
  removeFolder: (folderName: string) => void;
  clearAll: () => void;
}

export const useFolderStore = create<FolderStoreState>((set, get) => {
  const initial = loadStoredFolders();

  return {
    folderMetadata: initial.folderMetadata,
    customFolders: initial.customFolders,

    setFolderColor: (folderName: string, color: string) => {
      const trimmed = folderName.trim();
      if (!trimmed) return;
      const nextMeta = {
        ...get().folderMetadata,
        [trimmed]: { ...get().folderMetadata[trimmed], color },
      };
      set({ folderMetadata: nextMeta });
      persistStoredFolders({ folderMetadata: nextMeta, customFolders: get().customFolders });
    },

    addFolder: (folderName: string, color?: string) => {
      const trimmed = folderName.trim();
      if (!trimmed) return;
      const custom = get().customFolders;
      const nextCustom = custom.includes(trimmed) ? custom : [...custom, trimmed];
      const nextMeta = {
        ...get().folderMetadata,
        ...(color ? { [trimmed]: { color } } : {}),
      };
      set({ customFolders: nextCustom, folderMetadata: nextMeta });
      persistStoredFolders({ folderMetadata: nextMeta, customFolders: nextCustom });
    },

    renameFolder: (oldName: string, newName: string) => {
      const trimmedOld = oldName.trim();
      const trimmedNew = newName.trim();
      if (!trimmedOld || !trimmedNew || trimmedOld === trimmedNew) return;

      const custom = get().customFolders;
      const nextCustom = custom.map((f) => (f === trimmedOld ? trimmedNew : f));
      if (!nextCustom.includes(trimmedNew)) {
        nextCustom.push(trimmedNew);
      }

      const meta = { ...get().folderMetadata };
      if (meta[trimmedOld]) {
        meta[trimmedNew] = meta[trimmedOld];
        delete meta[trimmedOld];
      }

      set({ customFolders: nextCustom, folderMetadata: meta });
      persistStoredFolders({ folderMetadata: meta, customFolders: nextCustom });
    },

    removeFolder: (folderName: string) => {
      const trimmed = folderName.trim();
      const nextCustom = get().customFolders.filter((f) => f !== trimmed);
      const meta = { ...get().folderMetadata };
      delete meta[trimmed];

      set({ customFolders: nextCustom, folderMetadata: meta });
      persistStoredFolders({ folderMetadata: meta, customFolders: nextCustom });
    },

    clearAll: () => {
      set({ folderMetadata: {}, customFolders: [] });
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        // Ignore
      }
    },
  };
});
