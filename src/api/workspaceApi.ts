import { invoke } from '@tauri-apps/api/core';
import type { WorkspaceState } from '../types/bindings';

export const getWorkspaceState = async (): Promise<WorkspaceState | null> => {
  try {
    return await invoke<WorkspaceState | null>('get_workspace_state');
  } catch (err) {
    console.error('Failed to get workspace state from backend:', err);
    return null;
  }
};

export const saveWorkspaceState = async (state: WorkspaceState): Promise<void> => {
  try {
    await invoke<void>('save_workspace_state', { state });
  } catch (err) {
    console.error('Failed to save workspace state to backend:', err);
  }
};

export const clearWorkspaceState = async (): Promise<void> => {
  try {
    await invoke<void>('clear_workspace_state');
  } catch (err) {
    console.error('Failed to clear workspace state from backend:', err);
  }
};

export const workspaceApi = {
  getWorkspaceState,
  saveWorkspaceState,
  clearWorkspaceState,
};
