import { create } from 'zustand';

export type KeymapPreset = 'datacore' | 'tableplus' | 'datagrip' | 'vscode';

export interface KeymapConfig {
  name: string;
  description: string;
  runQuery: { mac: string[]; win: string[] };
  newQuery: { mac: string[]; win: string[] };
  commandPalette: { mac: string[]; win: string[] };
  searchTables: { mac: string[]; win: string[] };
  toggleSidebar: { mac: string[]; win: string[] };
  closeTab: { mac: string[]; win: string[] };
}

export const KEYMAP_PRESET_CONFIGS: Record<KeymapPreset, KeymapConfig> = {
  datacore: {
    name: 'DataCore (Default)',
    description: 'Native Apple-inspired keymap optimized for speed and clarity',
    runQuery: { mac: ['⌘', 'Enter'], win: ['Ctrl', 'Enter'] },
    newQuery: { mac: ['⌘', 'T'], win: ['Ctrl', 'T'] },
    commandPalette: { mac: ['⌘', 'K'], win: ['Ctrl', 'K'] },
    searchTables: { mac: ['⌘', 'P'], win: ['Ctrl', 'P'] },
    toggleSidebar: { mac: ['⌘', 'B'], win: ['Ctrl', 'B'] },
    closeTab: { mac: ['⌘', 'W'], win: ['Ctrl', 'W'] },
  },
  tableplus: {
    name: 'TablePlus',
    description: 'Familiar TablePlus shortcuts for instant muscle-memory transition',
    runQuery: { mac: ['⌘', 'R'], win: ['Ctrl', 'R'] },
    newQuery: { mac: ['⌘', 'T'], win: ['Ctrl', 'T'] },
    commandPalette: { mac: ['⌘', 'K'], win: ['Ctrl', 'K'] },
    searchTables: { mac: ['⌘', 'P'], win: ['Ctrl', 'P'] },
    toggleSidebar: { mac: ['⌘', 'B'], win: ['Ctrl', 'B'] },
    closeTab: { mac: ['⌘', 'W'], win: ['Ctrl', 'W'] },
  },
  datagrip: {
    name: 'DataGrip / JetBrains',
    description: 'JetBrains IDE style database shortcuts (Cmd+Enter, Cmd+N, Cmd+O)',
    runQuery: { mac: ['⌘', 'Enter'], win: ['Ctrl', 'Enter'] },
    newQuery: { mac: ['⌘', 'N'], win: ['Ctrl', 'N'] },
    commandPalette: { mac: ['⇧', '⇧'], win: ['Shift', 'Shift'] },
    searchTables: { mac: ['⌘', 'O'], win: ['Ctrl', 'O'] },
    toggleSidebar: { mac: ['⌘', '1'], win: ['Alt', '1'] },
    closeTab: { mac: ['⌘', 'W'], win: ['Ctrl', 'F4'] },
  },
  vscode: {
    name: 'VS Code',
    description: 'Visual Studio Code standard keys (Cmd+Shift+P, Cmd+P, Cmd+B)',
    runQuery: { mac: ['⌘', 'Enter'], win: ['Ctrl', 'Enter'] },
    newQuery: { mac: ['⌘', 'N'], win: ['Ctrl', 'N'] },
    commandPalette: { mac: ['⌘', '⇧', 'P'], win: ['Ctrl', 'Shift', 'P'] },
    searchTables: { mac: ['⌘', 'P'], win: ['Ctrl', 'P'] },
    toggleSidebar: { mac: ['⌘', 'B'], win: ['Ctrl', 'B'] },
    closeTab: { mac: ['⌘', 'W'], win: ['Ctrl', 'W'] },
  },
};

const STORAGE_KEY = 'datacore_keymap_preset';

function loadStoredPreset(): KeymapPreset {
  if (typeof window === 'undefined') return 'datacore';
  try {
    const val = localStorage.getItem(STORAGE_KEY) as KeymapPreset | null;
    if (val && ['datacore', 'tableplus', 'datagrip', 'vscode'].includes(val)) {
      return val;
    }
  } catch {
    // Ignore storage error
  }
  return 'datacore';
}

export interface ShortcutStoreState {
  preset: KeymapPreset;
  setPreset: (preset: KeymapPreset) => void;
}

export const useShortcutStore = create<ShortcutStoreState>((set) => ({
  preset: loadStoredPreset(),
  setPreset: (preset: KeymapPreset) => {
    try {
      localStorage.setItem(STORAGE_KEY, preset);
    } catch {
      // Ignore storage error
    }
    set({ preset });
  },
}));
