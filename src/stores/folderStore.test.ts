import { describe, it, expect, beforeEach } from 'vitest';
import { useFolderStore, FOLDER_COLORS } from './folderStore';

describe('folderStore', () => {
  beforeEach(() => {
    useFolderStore.getState().clearAll();
  });

  it('initializes with empty folders and metadata', () => {
    const state = useFolderStore.getState();
    expect(state.customFolders).toEqual([]);
    expect(state.folderMetadata).toEqual({});
  });

  it('adds a new folder and sets its color', () => {
    useFolderStore.getState().addFolder('Production', '#3b82f6');
    const state = useFolderStore.getState();
    expect(state.customFolders).toContain('Production');
    expect(state.folderMetadata['Production']?.color).toBe('#3b82f6');
  });

  it('updates folder color via setFolderColor', () => {
    useFolderStore.getState().addFolder('Analytics');
    useFolderStore.getState().setFolderColor('Analytics', '#10b981');
    expect(useFolderStore.getState().folderMetadata['Analytics']?.color).toBe('#10b981');
  });

  it('renames a folder and preserves its color metadata', () => {
    useFolderStore.getState().addFolder('OldFolder', '#ef4444');
    useFolderStore.getState().renameFolder('OldFolder', 'NewFolder');

    const state = useFolderStore.getState();
    expect(state.customFolders).toContain('NewFolder');
    expect(state.customFolders).not.toContain('OldFolder');
    expect(state.folderMetadata['NewFolder']?.color).toBe('#ef4444');
    expect(state.folderMetadata['OldFolder']).toBeUndefined();
  });

  it('removes a folder and deletes its metadata', () => {
    useFolderStore.getState().addFolder('TempFolder', '#ec4899');
    useFolderStore.getState().removeFolder('TempFolder');

    const state = useFolderStore.getState();
    expect(state.customFolders).not.toContain('TempFolder');
    expect(state.folderMetadata['TempFolder']).toBeUndefined();
  });

  it('contains expected FOLDER_COLORS palette', () => {
    expect(FOLDER_COLORS.length).toBeGreaterThanOrEqual(8);
    expect(FOLDER_COLORS.some((c) => c.name.includes('Blue'))).toBe(true);
    expect(FOLDER_COLORS.some((c) => c.name.includes('Emerald'))).toBe(true);
  });
});
