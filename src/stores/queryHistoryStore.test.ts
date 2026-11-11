import { describe, it, expect, beforeEach } from 'vitest';
import { useQueryHistoryStore, MAX_QUERY_HISTORY_ITEMS } from './queryHistoryStore';

describe('useQueryHistoryStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useQueryHistoryStore.getState().clearAll();
  });

  it('initializes with empty history', () => {
    expect(useQueryHistoryStore.getState().history).toEqual([]);
  });

  it('adds history item with auto id and timestamp', () => {
    useQueryHistoryStore.getState().addHistoryItem({
      sql: 'SELECT * FROM users;',
      executionTimeMs: 12,
      rowCount: 5,
      status: 'success',
      connectionId: 'conn-1',
      connectionName: 'Test Conn',
      database: 'test_db',
    });

    const { history } = useQueryHistoryStore.getState();
    expect(history.length).toBe(1);
    expect(history[0].sql).toBe('SELECT * FROM users;');
    expect(history[0].executionTimeMs).toBe(12);
    expect(history[0].rowCount).toBe(5);
    expect(history[0].status).toBe('success');
    expect(history[0].id).toBeDefined();
    expect(history[0].executedAt).toBeGreaterThan(0);
  });

  it('puts the newest item at the beginning of the list', () => {
    useQueryHistoryStore.getState().addHistoryItem({
      sql: 'SELECT 1;',
      executionTimeMs: 1,
      status: 'success',
    });
    useQueryHistoryStore.getState().addHistoryItem({
      sql: 'SELECT 2;',
      executionTimeMs: 2,
      status: 'success',
    });

    const { history } = useQueryHistoryStore.getState();
    expect(history.length).toBe(2);
    expect(history[0].sql).toBe('SELECT 2;');
    expect(history[1].sql).toBe('SELECT 1;');
  });

  it('limits history to MAX_QUERY_HISTORY_ITEMS (200 items)', () => {
    for (let i = 0; i < MAX_QUERY_HISTORY_ITEMS + 20; i++) {
      useQueryHistoryStore.getState().addHistoryItem({
        sql: `SELECT ${i};`,
        executionTimeMs: 5,
        status: 'success',
      });
    }

    const { history } = useQueryHistoryStore.getState();
    expect(history.length).toBe(MAX_QUERY_HISTORY_ITEMS);
    expect(history[0].sql).toBe(`SELECT ${MAX_QUERY_HISTORY_ITEMS + 19};`);
  });

  it('removes a single item by id', () => {
    useQueryHistoryStore.getState().addHistoryItem({
      sql: 'SELECT 1;',
      executionTimeMs: 1,
      status: 'success',
    });
    const item = useQueryHistoryStore.getState().history[0];
    expect(item).toBeDefined();

    useQueryHistoryStore.getState().removeHistoryItem(item.id);
    expect(useQueryHistoryStore.getState().history.length).toBe(0);
  });

  it('clears all history', () => {
    useQueryHistoryStore.getState().addHistoryItem({
      sql: 'SELECT 1;',
      executionTimeMs: 1,
      status: 'success',
    });
    useQueryHistoryStore.getState().addHistoryItem({
      sql: 'SELECT 2;',
      executionTimeMs: 1,
      status: 'success',
    });

    expect(useQueryHistoryStore.getState().history.length).toBe(2);
    useQueryHistoryStore.getState().clearAll();
    expect(useQueryHistoryStore.getState().history.length).toBe(0);
  });

  it('persists history into localStorage', () => {
    useQueryHistoryStore.getState().addHistoryItem({
      sql: 'SELECT * FROM products;',
      executionTimeMs: 40,
      status: 'success',
    });

    const stored = localStorage.getItem('datacore_query_history_v1');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.length).toBe(1);
    expect(parsed[0].sql).toBe('SELECT * FROM products;');
  });
});
