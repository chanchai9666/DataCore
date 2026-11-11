import { describe, it, expect, beforeEach } from 'vitest';
import { useStatusStore } from './statusStore';

describe('statusStore', () => {
  beforeEach(() => {
    useStatusStore.getState().reset();
  });

  it('initializes with default empty status', () => {
    const state = useStatusStore.getState();
    expect(state.lastQuery).toBeNull();
    expect(state.executionTimeMs).toBeNull();
    expect(state.rowCount).toBeNull();
  });

  it('updates status fields correctly', () => {
    useStatusStore.getState().setStatus({
      lastQuery: 'SELECT * FROM users LIMIT 10;',
      executionTimeMs: 42,
      rowCount: 10,
    });

    const state = useStatusStore.getState();
    expect(state.lastQuery).toBe('SELECT * FROM users LIMIT 10;');
    expect(state.executionTimeMs).toBe(42);
    expect(state.rowCount).toBe(10);
  });

  it('resets state correctly', () => {
    useStatusStore.getState().setStatus({
      lastQuery: 'DROP TABLE test;',
      executionTimeMs: 12,
      rowCount: 0,
    });
    useStatusStore.getState().reset();

    const state = useStatusStore.getState();
    expect(state.lastQuery).toBeNull();
    expect(state.executionTimeMs).toBeNull();
  });

  it('isolates metrics per tab and switches active metrics correctly', () => {
    // Set status for tab-1
    useStatusStore.getState().setTabStatus('tab-1', {
      lastQuery: 'SELECT * FROM users LIMIT 100;',
      executionTimeMs: 25,
      rowCount: 100,
    });

    // Set status for tab-2
    useStatusStore.getState().setTabStatus('tab-2', {
      lastQuery: 'SELECT * FROM orders WHERE total > 500;',
      executionTimeMs: 120,
      rowCount: 14,
    });

    // When activeTabId is set to tab-1
    useStatusStore.getState().setActiveTabId('tab-1');
    let state = useStatusStore.getState();
    expect(state.lastQuery).toBe('SELECT * FROM users LIMIT 100;');
    expect(state.executionTimeMs).toBe(25);
    expect(state.rowCount).toBe(100);

    // Switch activeTabId to tab-2
    useStatusStore.getState().setActiveTabId('tab-2');
    state = useStatusStore.getState();
    expect(state.lastQuery).toBe('SELECT * FROM orders WHERE total > 500;');
    expect(state.executionTimeMs).toBe(120);
    expect(state.rowCount).toBe(14);

    // Switch to a new tab with no recorded status yet
    useStatusStore.getState().setActiveTabId('tab-3');
    state = useStatusStore.getState();
    expect(state.lastQuery).toBeNull();
    expect(state.executionTimeMs).toBeNull();
    expect(state.rowCount).toBeNull();
  });

  it('removes tab status when closed', () => {
    useStatusStore.getState().setTabStatus('tab-1', {
      lastQuery: 'SELECT 1;',
      executionTimeMs: 5,
    });
    useStatusStore.getState().setActiveTabId('tab-1');

    useStatusStore.getState().removeTabStatus('tab-1');
    const state = useStatusStore.getState();
    expect(state.activeTabId).toBeNull();
    expect(state.lastQuery).toBeNull();
    expect(state.executionTimeMs).toBeNull();
  });
});
