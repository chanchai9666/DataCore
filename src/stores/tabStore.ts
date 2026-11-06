import { create } from 'zustand';
import type { Tab } from '../types/db';
import { dbApi } from '../api/db';

export interface TabStoreState {
  tabs: Tab[];
  activeTabId: string | null;
  openTab: (tab: Tab) => void;
  closeTab: (tabId: string) => Promise<void>;
  setActiveTab: (tabId: string | null) => void;
  setAutoCommit: (tabId: string, autoCommit: boolean) => void;
  setQueryContent: (tabId: string, queryContent: string) => void;
  updateTab: (tabId: string, updates: Partial<Tab>) => void;
}

export const useTabStore = create<TabStoreState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: (tab: Tab) => {
    const { tabs } = get();
    const existingIndex = tabs.findIndex((t) => t.id === tab.id);
    if (existingIndex >= 0) {
      set({ activeTabId: tab.id });
    } else {
      set({
        tabs: [...tabs, tab],
        activeTabId: tab.id,
      });
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

    set({
      tabs: remainingTabs,
      activeTabId: nextActiveId,
    });
  },

  setActiveTab: (tabId: string | null) => {
    set({ activeTabId: tabId });
  },

  setAutoCommit: (tabId: string, autoCommit: boolean) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, autoCommit } : tab
      ),
    }));
  },

  setQueryContent: (tabId: string, queryContent: string) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, queryContent } : tab
      ),
    }));
  },

  updateTab: (tabId: string, updates: Partial<Tab>) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, ...updates } : tab
      ),
    }));
  },
}));
