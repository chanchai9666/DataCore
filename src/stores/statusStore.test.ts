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
});
