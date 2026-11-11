import { create } from 'zustand';

export interface TabStatus {
  lastQuery: string | null;
  executionTimeMs: number | null;
  rowCount: number | null;
  selectedCellInfo: string | null;
  statusMessage: string | null;
}

export interface StatusState {
  activeTabId: string | null;
  tabStatusMap: Record<string, TabStatus>;

  // Current active metrics displayed on StatusBar
  lastQuery: string | null;
  executionTimeMs: number | null;
  rowCount: number | null;
  selectedCellInfo: string | null;
  statusMessage: string | null;

  setActiveTabId: (tabId: string | null) => void;
  setTabStatus: (tabId: string, updates: Partial<TabStatus>) => void;
  removeTabStatus: (tabId: string) => void;
  setStatus: (updates: Partial<TabStatus>) => void;
  reset: () => void;
}

const defaultTabStatus: TabStatus = {
  lastQuery: null,
  executionTimeMs: null,
  rowCount: null,
  selectedCellInfo: null,
  statusMessage: null,
};

export const useStatusStore = create<StatusState>((set, get) => ({
  activeTabId: null,
  tabStatusMap: {},

  lastQuery: null,
  executionTimeMs: null,
  rowCount: null,
  selectedCellInfo: null,
  statusMessage: null,

  setActiveTabId: (tabId: string | null) => {
    const { tabStatusMap } = get();
    const targetStatus = tabId && tabStatusMap[tabId] ? tabStatusMap[tabId] : defaultTabStatus;
    set({
      activeTabId: tabId,
      lastQuery: targetStatus.lastQuery,
      executionTimeMs: targetStatus.executionTimeMs,
      rowCount: targetStatus.rowCount,
      selectedCellInfo: targetStatus.selectedCellInfo,
      statusMessage: targetStatus.statusMessage,
    });
  },

  setTabStatus: (tabId: string, updates: Partial<TabStatus>) => {
    set((state) => {
      const existing = state.tabStatusMap[tabId] ?? { ...defaultTabStatus };
      const updated: TabStatus = { ...existing, ...updates };
      const nextMap = { ...state.tabStatusMap, [tabId]: updated };

      if (!state.activeTabId || state.activeTabId === tabId) {
        return {
          tabStatusMap: nextMap,
          activeTabId: state.activeTabId ?? tabId,
          lastQuery: updated.lastQuery,
          executionTimeMs: updated.executionTimeMs,
          rowCount: updated.rowCount,
          selectedCellInfo: updated.selectedCellInfo,
          statusMessage: updated.statusMessage,
        };
      }

      return { tabStatusMap: nextMap };
    });
  },

  removeTabStatus: (tabId: string) => {
    set((state) => {
      const nextMap = { ...state.tabStatusMap };
      delete nextMap[tabId];
      if (state.activeTabId === tabId) {
        return {
          tabStatusMap: nextMap,
          ...defaultTabStatus,
          activeTabId: null,
        };
      }
      return { tabStatusMap: nextMap };
    });
  },

  setStatus: (updates: Partial<TabStatus>) => {
    set((state) => {
      const activeId = state.activeTabId;
      const nextTop = {
        lastQuery: updates.lastQuery !== undefined ? updates.lastQuery : state.lastQuery,
        executionTimeMs:
          updates.executionTimeMs !== undefined ? updates.executionTimeMs : state.executionTimeMs,
        rowCount: updates.rowCount !== undefined ? updates.rowCount : state.rowCount,
        selectedCellInfo:
          updates.selectedCellInfo !== undefined ? updates.selectedCellInfo : state.selectedCellInfo,
        statusMessage:
          updates.statusMessage !== undefined ? updates.statusMessage : state.statusMessage,
      };

      if (activeId) {
        const existing = state.tabStatusMap[activeId] ?? { ...defaultTabStatus };
        return {
          ...nextTop,
          tabStatusMap: {
            ...state.tabStatusMap,
            [activeId]: { ...existing, ...updates },
          },
        };
      }

      return nextTop;
    });
  },

  reset: () =>
    set({
      activeTabId: null,
      tabStatusMap: {},
      ...defaultTabStatus,
    }),
}));

export default useStatusStore;
