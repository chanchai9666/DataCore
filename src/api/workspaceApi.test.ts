import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getWorkspaceState, saveWorkspaceState, clearWorkspaceState } from './workspaceApi';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('workspaceApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gets workspace state from invoke handler', async () => {
    const mockState = {
      activeConnectionId: 'conn-1',
      tabs: [],
      activeTabId: 'tab-1',
      sidebarWidth: 300,
      sidebarCollapsed: false,
    };
    vi.mocked(invoke).mockResolvedValueOnce(mockState);

    const result = await getWorkspaceState();
    expect(invoke).toHaveBeenCalledWith('get_workspace_state');
    expect(result).toEqual(mockState);
  });

  it('returns null gracefully when get_workspace_state fails', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('IPC error'));
    const result = await getWorkspaceState();
    expect(result).toBeNull();
  });

  it('saves workspace state via invoke handler', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    const mockState = {
      activeConnectionId: 'conn-prod',
      tabs: [],
      activeTabId: null,
      sidebarWidth: 280,
      sidebarCollapsed: true,
      sqlEditorRatio: 0.5,
      customSettings: null,
    };

    await saveWorkspaceState(mockState as any);
    expect(invoke).toHaveBeenCalledWith('save_workspace_state', { state: mockState });
  });

  it('clears workspace state via invoke handler', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await clearWorkspaceState();
    expect(invoke).toHaveBeenCalledWith('clear_workspace_state');
  });
});
