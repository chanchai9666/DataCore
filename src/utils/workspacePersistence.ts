import { workspaceApi } from '../api/workspaceApi';
import type { WorkspaceState } from '../types/bindings';
import { useTabStore } from '../stores/tabStore';
import { useConnectionStore } from '../stores/connectionStore';

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 500;

export interface WorkspaceSnapshot {
  activeConnectionId?: string | null;
  tabs?: any[];
  activeTabId?: string | null;
  sidebarWidth?: number | null;
  sidebarCollapsed?: boolean | null;
  sqlEditorRatio?: number | null;
}

/**
 * Builds the current workspace state snapshot from active stores and local layout settings.
 */
export function getCurrentWorkspaceSnapshot(): WorkspaceSnapshot {
  const tabStore = useTabStore.getState();
  const connectionStore = useConnectionStore.getState();

  const sidebarWidthRaw = localStorage.getItem('datacore-sidebar-width');
  const sidebarCollapsedRaw = localStorage.getItem('datacore-sidebar-collapsed');

  return {
    activeConnectionId: connectionStore.activeConnectionId,
    tabs: tabStore.tabs,
    activeTabId: tabStore.activeTabId,
    sidebarWidth: sidebarWidthRaw ? Number(sidebarWidthRaw) : 280,
    sidebarCollapsed: sidebarCollapsedRaw === 'true',
  };
}

/**
 * Debounced auto-save for workspace state.
 * Saves to backend `~/.datacore/workspace_state.json` and updates localStorage fallback.
 */
export function saveWorkspaceDebounced(override?: Partial<WorkspaceSnapshot>): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(async () => {
    try {
      const current = getCurrentWorkspaceSnapshot();
      const payload: WorkspaceState = {
        activeConnectionId: override?.activeConnectionId !== undefined ? override.activeConnectionId : current.activeConnectionId ?? null,
        tabs: (override?.tabs !== undefined ? override.tabs : current.tabs) ?? [],
        activeTabId: override?.activeTabId !== undefined ? override.activeTabId : current.activeTabId ?? null,
        sidebarWidth: override?.sidebarWidth !== undefined ? override.sidebarWidth : current.sidebarWidth ?? 280,
        sidebarCollapsed: override?.sidebarCollapsed !== undefined ? override.sidebarCollapsed : current.sidebarCollapsed ?? false,
        sqlEditorRatio: override?.sqlEditorRatio ?? null,
        customSettings: null,
      };

      // 1. Save to native backend file (~/.datacore/workspace_state.json)
      await workspaceApi.saveWorkspaceState(payload);

      // 2. Save layout variables to localStorage
      if (payload.sidebarWidth) {
        localStorage.setItem('datacore-sidebar-width', String(payload.sidebarWidth));
      }
      if (payload.sidebarCollapsed !== null && payload.sidebarCollapsed !== undefined) {
        localStorage.setItem('datacore-sidebar-collapsed', String(payload.sidebarCollapsed));
      }
      if (payload.activeConnectionId) {
        localStorage.setItem('datacore-active-connection-id', payload.activeConnectionId);
      }
    } catch (err) {
      console.error('Failed to auto-save workspace state:', err);
    }
  }, DEBOUNCE_MS);
}

/**
 * Restores the saved workspace state into tabs and connection stores.
 */
export async function restoreWorkspaceState(): Promise<WorkspaceState | null> {
  try {
    const saved = await workspaceApi.getWorkspaceState();
    if (!saved) {
      // Fallback: check localStorage for active connection
      const cachedConnId = localStorage.getItem('datacore-active-connection-id');
      if (cachedConnId) {
        useConnectionStore.getState().setActiveConnection(cachedConnId);
      }
      return null;
    }

    // 1. Restore Active Connection
    if (saved.activeConnectionId) {
      useConnectionStore.getState().setActiveConnection(saved.activeConnectionId);
    }

    // 2. Restore Tabs if not already populated
    const currentTabs = useTabStore.getState().tabs;
    if (currentTabs.length === 0 && saved.tabs && saved.tabs.length > 0) {
      useTabStore.setState({
        tabs: saved.tabs as any,
        activeTabId: saved.activeTabId || (saved.tabs[0] as any)?.id || null,
      });
    }

    // 3. Restore layout settings
    if (saved.sidebarWidth) {
      localStorage.setItem('datacore-sidebar-width', String(saved.sidebarWidth));
    }
    if (saved.sidebarCollapsed !== null && saved.sidebarCollapsed !== undefined) {
      localStorage.setItem('datacore-sidebar-collapsed', String(saved.sidebarCollapsed));
    }

    return saved;
  } catch (err) {
    console.error('Failed to restore workspace state:', err);
    return null;
  }
}
