import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Tab } from '../types/db';
import { dbApi } from '../api/db';
import { useStatusStore } from './statusStore';

export interface TabStoreState {
  tabs: Tab[];
  activeTabId: string | null;
  openTab: (tab: Tab) => void;
  closeTab: (tabId: string) => Promise<void>;
  closeTabsForConnection: (connectionId: string) => Promise<void>;
  setActiveTab: (tabId: string | null) => void;
  setAutoCommit: (tabId: string, autoCommit: boolean) => void;
  setQueryContent: (tabId: string, queryContent: string) => void;
  updateTab: (tabId: string, updates: Partial<Tab>) => void;
}

export const useTabStore = create<TabStoreState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,

      openTab: (tab: Tab) => {
        const { tabs } = get();
        const existingIndex = tabs.findIndex((t) => t.id === tab.id);
        if (existingIndex >= 0) {
          set({ activeTabId: tab.id });
          useStatusStore.getState().setActiveTabId(tab.id);
        } else {
          const isTableType = tab.type === 'table' || tab.type === 'table-list';
          const tabToOpen: Tab = isTableType ? { ...tab, isLoaded: tab.isLoaded ?? true } : tab;
          set({
            tabs: [...tabs, tabToOpen],
            activeTabId: tab.id,
          });
          useStatusStore.getState().setActiveTabId(tab.id);
        }
      },

      closeTab: async (tabId: string) => {
        try {
          await dbApi.closeSession(tabId);
        } catch (err) {
          console.error(`Failed to close session for tab ${tabId}:`, err);
        }

        const { tabs, activeTabId } = get();
        const remainingTabs = tabs.filter((t) => t.id !== tabId);

        let nextActiveId = activeTabId;
        if (activeTabId === tabId) {
          if (remainingTabs.length > 0) {
            const closedIndex = tabs.findIndex((t) => t.id === tabId);
            const newIndex = Math.min(closedIndex, remainingTabs.length - 1);
            nextActiveId = remainingTabs[newIndex].id;
          } else {
            nextActiveId = null;
          }
        }

        useStatusStore.getState().removeTabStatus(tabId);
        useStatusStore.getState().setActiveTabId(nextActiveId);

        set({
          tabs: remainingTabs,
          activeTabId: nextActiveId,
        });
      },

      closeTabsForConnection: async (connectionId: string) => {
        try {
          await dbApi.disconnectConnection(connectionId);
        } catch (err) {
          console.error(`Failed to disconnect sessions for connection ${connectionId}:`, err);
        }

        const { tabs, activeTabId } = get();
        const remainingTabs = tabs.filter((t) => t.connectionId !== connectionId);
        let nextActiveId = activeTabId;
        if (activeTabId && !remainingTabs.some((t) => t.id === activeTabId)) {
          nextActiveId = remainingTabs.length > 0 ? remainingTabs[0].id : null;
        }

        for (const tab of tabs.filter((t) => t.connectionId === connectionId)) {
          useStatusStore.getState().removeTabStatus(tab.id);
        }
        useStatusStore.getState().setActiveTabId(nextActiveId);

        set({
          tabs: remainingTabs,
          activeTabId: nextActiveId,
        });
      },

      setActiveTab: (tabId: string | null) => {
        set({ activeTabId: tabId });
        useStatusStore.getState().setActiveTabId(tabId);
      },

      setAutoCommit: (tabId: string, autoCommit: boolean) => {
        get().updateTab(tabId, { autoCommit });
      },

      setQueryContent: (tabId: string, queryContent: string) => {
        get().updateTab(tabId, { queryContent });
      },

      updateTab: (tabId: string, updates: Partial<Tab>) => {
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === tabId ? { ...tab, ...updates } : tab
          ),
        }));
      },
    }),
    {
      name: 'datacore_tabs',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tabs: state.tabs.map(({ isLoaded: _isLoaded, ...rest }) => rest),
        activeTabId: state.activeTabId,
      }),
    }
  )
);
