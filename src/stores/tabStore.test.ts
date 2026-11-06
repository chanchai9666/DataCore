import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTabStore } from './tabStore';
import { dbApi } from '../api/db';
import type { Tab } from '../types/db';

vi.mock('../api/db', () => ({
  dbApi: {
    closeSession: vi.fn().mockResolvedValue(undefined),
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
});
