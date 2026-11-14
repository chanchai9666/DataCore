import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useShortcuts } from './useShortcuts';
import { useTabStore } from '../stores/tabStore';
import { useConnectionStore } from '../stores/connectionStore';

describe('useShortcuts Hook', () => {
  beforeEach(() => {
    useTabStore.setState({
      tabs: [
        { id: 'tab-1', connectionId: 'conn-1', title: 'Query 1', type: 'query', autoCommit: true, queryContent: 'SELECT 1' },
        { id: 'tab-2', connectionId: 'conn-1', title: 'Table Users', type: 'table', autoCommit: true, queryContent: '', tableName: 'users' },
      ],
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

  it('triggers onOpenShortcuts when Cmd+/ is pressed', () => {
    const onOpenShortcuts = vi.fn();
    renderHook(() => useShortcuts({ onOpenShortcuts }));

    const event = new KeyboardEvent('keydown', { key: '/', metaKey: true, cancelable: true });
    window.dispatchEvent(event);

    expect(onOpenShortcuts).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('triggers onOpenShortcuts when ? is pressed without modifiers when not in input', () => {
    const onOpenShortcuts = vi.fn();
    renderHook(() => useShortcuts({ onOpenShortcuts }));

    const event = new KeyboardEvent('keydown', { key: '?', cancelable: true });
    window.dispatchEvent(event);

    expect(onOpenShortcuts).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('triggers onToggleSidebar when Cmd+B is pressed', () => {
    const onToggleSidebar = vi.fn();
    renderHook(() => useShortcuts({ onToggleSidebar }));

    const event = new KeyboardEvent('keydown', { key: 'b', metaKey: true, cancelable: true });
    window.dispatchEvent(event);

    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('dispatches datacore:toggle-sidebar event when Cmd+B is pressed without explicit handler', () => {
    const customEventListener = vi.fn();
    window.addEventListener('datacore:toggle-sidebar', customEventListener);

    renderHook(() => useShortcuts());

    const event = new KeyboardEvent('keydown', { key: 'b', metaKey: true, cancelable: true });
    window.dispatchEvent(event);

    expect(customEventListener).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    window.removeEventListener('datacore:toggle-sidebar', customEventListener);
  });

  it('switches to previous tab when Cmd+[ is pressed', () => {
    useTabStore.setState({ activeTabId: 'tab-2' });
    renderHook(() => useShortcuts());

    const event = new KeyboardEvent('keydown', { key: '[', metaKey: true, cancelable: true });
    window.dispatchEvent(event);

    expect(useTabStore.getState().activeTabId).toBe('tab-1');
    expect(event.defaultPrevented).toBe(true);
  });

  it('switches to next tab when Cmd+] is pressed', () => {
    useTabStore.setState({ activeTabId: 'tab-1' });
    renderHook(() => useShortcuts());

    const event = new KeyboardEvent('keydown', { key: ']', metaKey: true, cancelable: true });
    window.dispatchEvent(event);

    expect(useTabStore.getState().activeTabId).toBe('tab-2');
    expect(event.defaultPrevented).toBe(true);
  });

  it('duplicates the active tab when Cmd+D is pressed', () => {
    const initialTabCount = useTabStore.getState().tabs.length;
    renderHook(() => useShortcuts());

    const event = new KeyboardEvent('keydown', { key: 'd', metaKey: true, cancelable: true });
    window.dispatchEvent(event);

    const updatedTabs = useTabStore.getState().tabs;
    expect(updatedTabs.length).toBe(initialTabCount + 1);
    expect(updatedTabs[updatedTabs.length - 1].title).toBe('Query 1 (Copy)');
    expect(event.defaultPrevented).toBe(true);
  });

  it('triggers onToggleTheme when Cmd+Shift+T is pressed', () => {
    const onToggleTheme = vi.fn();
    renderHook(() => useShortcuts({ onToggleTheme }));

    const event = new KeyboardEvent('keydown', { key: 't', metaKey: true, shiftKey: true, cancelable: true });
    window.dispatchEvent(event);

    expect(onToggleTheme).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('triggers onEscape when Escape key is pressed', () => {
    const onEscape = vi.fn();
    renderHook(() => useShortcuts({ onEscape }));

    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    window.dispatchEvent(event);

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('prevents default browser reload when Cmd+R or F5 is pressed', () => {
    renderHook(() => useShortcuts());

    const cmdREvent = new KeyboardEvent('keydown', { key: 'r', metaKey: true, cancelable: true });
    window.dispatchEvent(cmdREvent);
    expect(cmdREvent.defaultPrevented).toBe(true);

    const f5Event = new KeyboardEvent('keydown', { key: 'F5', cancelable: true });
    window.dispatchEvent(f5Event);
    expect(f5Event.defaultPrevented).toBe(true);
  });

  it('prevents default browser zoom when Cmd+= or Cmd+- is pressed', () => {
    renderHook(() => useShortcuts());

    const zoomInEvent = new KeyboardEvent('keydown', { key: '+', metaKey: true, cancelable: true });
    window.dispatchEvent(zoomInEvent);
    expect(zoomInEvent.defaultPrevented).toBe(true);

    const zoomOutEvent = new KeyboardEvent('keydown', { key: '-', metaKey: true, cancelable: true });
    window.dispatchEvent(zoomOutEvent);
    expect(zoomOutEvent.defaultPrevented).toBe(true);
  });
});
