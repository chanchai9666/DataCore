import { describe, it, expect, beforeEach } from 'vitest';
import { useShortcutStore, KEYMAP_PRESET_CONFIGS } from './shortcutStore';

describe('shortcutStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useShortcutStore.getState().setPreset('datacore');
  });

  it('initializes with default datacore preset', () => {
    const state = useShortcutStore.getState();
    expect(state.preset).toBe('datacore');
    expect(KEYMAP_PRESET_CONFIGS.datacore.name).toBe('DataCore (Default)');
  });

  it('updates preset and persists to localStorage', () => {
    useShortcutStore.getState().setPreset('tableplus');
    expect(useShortcutStore.getState().preset).toBe('tableplus');
    expect(localStorage.getItem('datacore_keymap_preset')).toBe('tableplus');
  });

  it('provides distinct keyboard mappings for each preset', () => {
    const configs = KEYMAP_PRESET_CONFIGS;
    expect(configs.datacore.runQuery.mac).toEqual(['⌘', 'Enter']);
    expect(configs.tableplus.runQuery.mac).toEqual(['⌘', 'R']);
    expect(configs.datagrip.searchTables.mac).toEqual(['⌘', 'O']);
    expect(configs.vscode.commandPalette.mac).toEqual(['⌘', '⇧', 'P']);
  });
});
