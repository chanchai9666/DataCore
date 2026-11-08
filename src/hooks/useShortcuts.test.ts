import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useShortcuts } from './useShortcuts';
import { useTabStore } from '../stores/tabStore';
import { useConnectionStore } from '../stores/connectionStore';

describe('useShortcuts Hook', () => {
  beforeEach(() => {
    useTabStore.setState({
      tabs: [{ id: 'tab-1', connectionId: 'conn-1', title: 'Query 1', type: 'query', autoCommit: true, queryContent: '' }],
      activeTabId: 'tab-1',
    });
    useConnectionStore.setState({
      connections: [{ id: 'conn-1', name: 'DB', driver: 'sqlite', database: 'test.db' }],
      activeConnectionId: 'conn-1',
    });
  });

  it('triggers onNewConnection when Cmd+N is pressed', () => {
    const onNewConnection = vi.fn();
    renderHook(() => useShortcuts({ onNewConnection }));

    const event = new KeyboardEvent('keydown', { key: 'n', metaKey: true, cancelable: true });
    window.dispatchEvent(event);

    expect(onNewConnection).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('closes active tab when Cmd+W is pressed', () => {
    const closeTabMock = vi.fn();
    useTabStore.setState({ closeTab: closeTabMock });

    renderHook(() => useShortcuts());

    const event = new KeyboardEvent('keydown', { key: 'w', metaKey: true, cancelable: true });
    window.dispatchEvent(event);

    expect(closeTabMock).toHaveBeenCalledWith('tab-1');
    expect(event.defaultPrevented).toBe(true);
  });
});
