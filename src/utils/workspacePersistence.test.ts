import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  saveWorkspaceDebounced,
  restoreWorkspaceState,
  getCurrentWorkspaceSnapshot,
} from './workspacePersistence';
import { workspaceApi } from '../api/workspaceApi';
import { useTabStore } from '../stores/tabStore';
import { useConnectionStore } from '../stores/connectionStore';

vi.mock('../api/workspaceApi', () => ({
  workspaceApi: {
    getWorkspaceState: vi.fn(),
    saveWorkspaceState: vi.fn(),
    clearWorkspaceState: vi.fn(),
  },
}));

describe('workspacePersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorage.clear();
    useTabStore.setState({ tabs: [], activeTabId: null });
    useConnectionStore.setState({ connections: [], activeConnectionId: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('collects current workspace snapshot accurately', () => {
    localStorage.setItem('datacore-sidebar-width', '320');
    localStorage.setItem('datacore-sidebar-collapsed', 'true');
    useConnectionStore.setState({ activeConnectionId: 'conn-alpha' });
    useTabStore.setState({
      tabs: [{ id: 't1', title: 'Query 1', type: 'sql' } as any],
      activeTabId: 't1',
    });

    const snapshot = getCurrentWorkspaceSnapshot();
    expect(snapshot.activeConnectionId).toBe('conn-alpha');
    expect(snapshot.activeTabId).toBe('t1');
    expect(snapshot.sidebarWidth).toBe(320);
    expect(snapshot.sidebarCollapsed).toBe(true);
    expect(snapshot.tabs?.length).toBe(1);
  });

  it('debounces auto-save calls and triggers workspaceApi.saveWorkspaceState', async () => {
    useConnectionStore.setState({ activeConnectionId: 'conn-beta' });
    saveWorkspaceDebounced({ sidebarWidth: 350 });

    // Not yet called immediately
    expect(workspaceApi.saveWorkspaceState).not.toHaveBeenCalled();

    // Advance timer past debounce threshold
    vi.advanceTimersByTime(600);
    await vi.runAllTimersAsync();

    expect(workspaceApi.saveWorkspaceState).toHaveBeenCalledTimes(1);
    expect(workspaceApi.saveWorkspaceState).toHaveBeenCalledWith(
      expect.objectContaining({
        activeConnectionId: 'conn-beta',
        sidebarWidth: 350,
      })
    );
    expect(localStorage.getItem('datacore-sidebar-width')).toBe('350');
  });

  it('restores workspace state into stores and localStorage', async () => {
    const savedState = {
      activeConnectionId: 'conn-restored',
      tabs: [{ id: 'tab-sql-saved', title: 'Draft SQL', type: 'sql', queryContent: 'SELECT 1;' }],
      activeTabId: 'tab-sql-saved',
      sidebarWidth: 290,
      sidebarCollapsed: false,
      sqlEditorRatio: null,
      customSettings: null,
    };
    vi.mocked(workspaceApi.getWorkspaceState).mockResolvedValueOnce(savedState as any);

    const result = await restoreWorkspaceState();
    expect(result).toEqual(savedState);

    expect(useConnectionStore.getState().activeConnectionId).toBe('conn-restored');
    expect(useTabStore.getState().tabs.length).toBe(1);
    expect(useTabStore.getState().tabs[0].id).toBe('tab-sql-saved');
    expect(useTabStore.getState().activeTabId).toBe('tab-sql-saved');
    expect(localStorage.getItem('datacore-sidebar-width')).toBe('290');
    expect(localStorage.getItem('datacore-sidebar-collapsed')).toBe('false');
  });
});
