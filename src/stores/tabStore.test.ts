import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTabStore } from './tabStore';
import { dbApi } from '../api/db';
import type { Tab } from '../types/db';

vi.mock('../api/db', () => ({
  dbApi: {
    closeSession: vi.fn().mockResolvedValue(undefined),
    disconnectConnection: vi.fn().mockResolvedValue(0),
  },
}));

describe('tabStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTabStore.setState({ tabs: [], activeTabId: null });
  });

  it('should open a new tab and make it active', () => {
    const tab: Tab = {
      id: 'tab-1',
      connectionId: 'conn-1',
      type: 'query',
      title: 'Query 1',
      autoCommit: true,
      queryContent: 'SELECT 1;',
    };

    useTabStore.getState().openTab(tab);

    const state = useTabStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]).toEqual(tab);
    expect(state.activeTabId).toBe('tab-1');
  });

  it('should switch active tab', () => {
    const tab1: Tab = {
      id: 'tab-1',
      connectionId: 'conn-1',
      type: 'query',
      title: 'Query 1',
      autoCommit: true,
      queryContent: 'SELECT 1;',
    };
    const tab2: Tab = {
      id: 'tab-2',
      connectionId: 'conn-1',
      type: 'table',
      title: 'users',
      autoCommit: true,
      queryContent: '',
      tableName: 'users',
    };

    useTabStore.getState().openTab(tab1);
    useTabStore.getState().openTab(tab2);

    expect(useTabStore.getState().activeTabId).toBe('tab-2');

    useTabStore.getState().setActiveTab('tab-1');
    expect(useTabStore.getState().activeTabId).toBe('tab-1');
  });

  it('should close tab and call dbApi.closeSession', async () => {
    const tab1: Tab = {
      id: 'tab-1',
      connectionId: 'conn-1',
      type: 'query',
      title: 'Query 1',
      autoCommit: true,
      queryContent: 'SELECT 1;',
    };
    const tab2: Tab = {
      id: 'tab-2',
      connectionId: 'conn-1',
      type: 'query',
      title: 'Query 2',
      autoCommit: true,
      queryContent: 'SELECT 2;',
    };

    useTabStore.getState().openTab(tab1);
    useTabStore.getState().openTab(tab2);

    await useTabStore.getState().closeTab('tab-2');

    expect(dbApi.closeSession).toHaveBeenCalledWith('tab-2');
    const state = useTabStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].id).toBe('tab-1');
    expect(state.activeTabId).toBe('tab-1');
  });

  it('should update queryContent and autoCommit', () => {
    const tab: Tab = {
      id: 'tab-1',
      connectionId: 'conn-1',
      type: 'query',
      title: 'Query 1',
      autoCommit: true,
      queryContent: 'SELECT 1;',
    };

    useTabStore.getState().openTab(tab);
    useTabStore.getState().setQueryContent('tab-1', 'SELECT * FROM users;');
    useTabStore.getState().setAutoCommit('tab-1', false);

    const state = useTabStore.getState();
    expect(state.tabs[0].queryContent).toBe('SELECT * FROM users;');
    expect(state.tabs[0].autoCommit).toBe(false);
  });

  it('should close all tabs and trigger disconnectConnection for a specific connectionId', async () => {
    vi.spyOn(dbApi, 'disconnectConnection').mockResolvedValue(2);

    const tab1: Tab = {
      id: 'tab-1',
      connectionId: 'conn-1',
      type: 'query',
      title: 'Query 1',
      autoCommit: true,
      queryContent: '',
    };
    const tab2: Tab = {
      id: 'tab-2',
      connectionId: 'conn-1',
      type: 'table',
      title: 'Table 1',
      autoCommit: true,
      queryContent: '',
    };
    const tab3: Tab = {
      id: 'tab-3',
      connectionId: 'conn-2',
      type: 'query',
      title: 'Query 3',
      autoCommit: true,
      queryContent: '',
    };

    useTabStore.getState().openTab(tab1);
    useTabStore.getState().openTab(tab2);
    useTabStore.getState().openTab(tab3);

    expect(useTabStore.getState().tabs).toHaveLength(3);

    await useTabStore.getState().closeTabsForConnection('conn-1');

    expect(dbApi.disconnectConnection).toHaveBeenCalledWith('conn-1');
    const state = useTabStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].id).toBe('tab-3');
    expect(state.activeTabId).toBe('tab-3');
  });

  it('should persist tabs and activeTabId to localStorage', () => {
    const tab: Tab = {
      id: 'tab-persist-1',
      connectionId: 'conn-1',
      type: 'query',
      title: 'Persistent Query',
      autoCommit: true,
      queryContent: 'SELECT * FROM persistent_table;',
    };

    useTabStore.getState().openTab(tab);

    const storedRaw = localStorage.getItem('datacore_tabs');
    expect(storedRaw).not.toBeNull();
    const parsed = JSON.parse(storedRaw!);
    expect(parsed.state.tabs).toHaveLength(1);
    expect(parsed.state.tabs[0].id).toBe('tab-persist-1');
    expect(parsed.state.tabs[0].queryContent).toBe('SELECT * FROM persistent_table;');
    expect(parsed.state.activeTabId).toBe('tab-persist-1');
  });

  it('sets isLoaded true for opened table tab and strips isLoaded in localStorage persistence', () => {
    const tableTab: Tab = {
      id: 'tab-table-persist',
      connectionId: 'conn-1',
      type: 'table',
      title: 'Products',
      tableName: 'products',
      schemaName: 'public',
      autoCommit: true,
      queryContent: '',
    };

    useTabStore.getState().openTab(tableTab);
    expect(useTabStore.getState().tabs.find((t) => t.id === 'tab-table-persist')?.isLoaded).toBe(true);

    const storedRaw = localStorage.getItem('datacore_tabs');
    expect(storedRaw).not.toBeNull();
    const parsed = JSON.parse(storedRaw!);
    const savedTab = parsed.state.tabs.find((t: Tab) => t.id === 'tab-table-persist');
    expect(savedTab).toBeDefined();
    expect(savedTab.isLoaded).toBeUndefined();
  });
});
