import { describe, it, expect, beforeEach } from 'vitest';
import { useSnippetStore, DEFAULT_SNIPPETS } from './snippetStore';

describe('useSnippetStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useSnippetStore.getState().resetToDefaults();
  });

  it('initializes with default snippets', () => {
    const snippets = useSnippetStore.getState().snippets;
    expect(snippets.length).toBeGreaterThan(0);
    expect(snippets[0].title).toBeDefined();
    expect(snippets[0].sql).toBeDefined();
  });

  it('adds a new snippet', () => {
    const created = useSnippetStore.getState().addSnippet({
      title: 'Count Users',
      description: 'Quick count of active users',
      sql: 'SELECT COUNT(*) FROM users WHERE is_active = true;',
      category: 'Analytics',
      tags: ['users', 'count'],
    });

    expect(created.id).toBeDefined();
    expect(created.title).toBe('Count Users');
    expect(created.createdAt).toBeGreaterThan(0);

    const snippets = useSnippetStore.getState().snippets;
    const found = snippets.find((s) => s.id === created.id);
    expect(found).toBeDefined();
    expect(found?.sql).toBe('SELECT COUNT(*) FROM users WHERE is_active = true;');
  });

  it('updates an existing snippet', () => {
    const created = useSnippetStore.getState().addSnippet({
      title: 'Draft Query',
      sql: 'SELECT 1;',
    });

    useSnippetStore.getState().updateSnippet(created.id, {
      title: 'Final Query',
      sql: 'SELECT 100;',
      category: 'Math',
    });

    const updated = useSnippetStore.getState().snippets.find((s) => s.id === created.id);
    expect(updated?.title).toBe('Final Query');
    expect(updated?.sql).toBe('SELECT 100;');
    expect(updated?.category).toBe('Math');
  });

  it('deletes a snippet', () => {
    const created = useSnippetStore.getState().addSnippet({
      title: 'Temporary Query',
      sql: 'SELECT 2;',
    });

    useSnippetStore.getState().deleteSnippet(created.id);
    const found = useSnippetStore.getState().snippets.find((s) => s.id === created.id);
    expect(found).toBeUndefined();
  });

  it('resets to default presets', () => {
    useSnippetStore.getState().addSnippet({
      title: 'Custom Query',
      sql: 'SELECT 99;',
    });

    useSnippetStore.getState().resetToDefaults();
    const snippets = useSnippetStore.getState().snippets;
    expect(snippets.length).toBe(DEFAULT_SNIPPETS.length);
    expect(snippets.find((s) => s.title === 'Custom Query')).toBeUndefined();
  });

  it('persists snippets to localStorage', () => {
    useSnippetStore.getState().addSnippet({
      title: 'Persistent Query',
      sql: 'SELECT NOW();',
    });

    const stored = localStorage.getItem('datacore_sql_snippets_v1');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.some((s: any) => s.title === 'Persistent Query')).toBe(true);
  });

  it('toggles pin and records run counts', () => {
    const created = useSnippetStore.getState().addSnippet({
      title: 'Daily Sales',
      sql: 'SELECT * FROM sales;',
      scope: 'database',
      connectionId: 'conn-1',
      database: 'pos_db',
    });

    expect(created.isPinned).toBe(false);
    expect(created.runCount).toBe(0);

    useSnippetStore.getState().togglePin(created.id);
    useSnippetStore.getState().recordRun(created.id);
    useSnippetStore.getState().recordRun(created.id);

    const updated = useSnippetStore.getState().snippets.find((s) => s.id === created.id);
    expect(updated?.isPinned).toBe(true);
    expect(updated?.runCount).toBe(2);
    expect(updated?.lastRunAt).toBeGreaterThan(0);
  });

  it('filters and sorts queries by database/connection context', () => {
    useSnippetStore.getState().addSnippet({
      title: 'POS DB Query',
      sql: 'SELECT * FROM orders;',
      scope: 'database',
      connectionId: 'conn-1',
      database: 'pos_db',
      isPinned: true,
    });
    useSnippetStore.getState().addSnippet({
      title: 'Other DB Query',
      sql: 'SELECT * FROM logs;',
      scope: 'database',
      connectionId: 'conn-2',
      database: 'analytics_db',
    });
    useSnippetStore.getState().addSnippet({
      title: 'Conn 1 Query',
      sql: 'SELECT 1;',
      scope: 'connection',
      connectionId: 'conn-1',
    });

    const ctxQueries = useSnippetStore.getState().getQueriesForContext({
      connectionId: 'conn-1',
      database: 'pos_db',
    });

    expect(ctxQueries[0].title).toBe('POS DB Query');
    expect(ctxQueries.some((q) => q.title === 'Conn 1 Query')).toBe(true);
    expect(ctxQueries.some((q) => q.title === 'Other DB Query')).toBe(false);
  });

  it('exports and imports saved queries in merge and replace modes', () => {
    const created = useSnippetStore.getState().addSnippet({
      title: 'Exportable Query',
      sql: 'SELECT COUNT(*) FROM products;',
      scope: 'database',
      connectionId: 'conn-1',
      connectionName: 'POS V1',
      database: 'pos_db',
      isPinned: true,
    });

    const json = useSnippetStore.getState().exportQueriesJson([created.id]);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(parsed.queries).toHaveLength(1);
    expect(parsed.queries[0].title).toBe('Exportable Query');

    useSnippetStore.getState().resetToDefaults();
    expect(useSnippetStore.getState().snippets.some((s) => s.title === 'Exportable Query')).toBe(false);

    const mergeResult = useSnippetStore.getState().importQueriesJson(json, 'merge');
    expect(mergeResult.importedCount).toBe(1);
    expect(useSnippetStore.getState().snippets.some((s) => s.title === 'Exportable Query')).toBe(true);
    expect(useSnippetStore.getState().snippets.length).toBe(DEFAULT_SNIPPETS.length + 1);

    const replaceResult = useSnippetStore.getState().importQueriesJson(json, 'replace');
    expect(replaceResult.importedCount).toBe(1);
    expect(useSnippetStore.getState().snippets).toHaveLength(1);
  });

  it('throws on invalid JSON import', () => {
    expect(() => useSnippetStore.getState().importQueriesJson('{bad json')).toThrow(
      'Invalid JSON format'
    );
  });

  it('detects duplicate saved query titles within the same scope and context', async () => {
    const { findDuplicateSnippetTitle } = await import('./snippetStore');
    const q1 = useSnippetStore.getState().addSnippet({
      title: 'อุปกรณ์ 1',
      sql: 'SELECT * FROM devices;',
      scope: 'database',
      connectionId: 'conn-1',
      database: 'postgres',
    });

    const all = useSnippetStore.getState().snippets;
    expect(
      findDuplicateSnippetTitle(all, {
        title: '  อุปกรณ์ 1 ',
        scope: 'database',
        connectionId: 'conn-1',
        database: 'postgres',
      })?.id
    ).toBe(q1.id);

    expect(
      findDuplicateSnippetTitle(all, {
        title: 'อุปกรณ์ 1',
        scope: 'database',
        connectionId: 'conn-1',
        database: 'postgres',
        excludeId: q1.id,
      })
    ).toBeUndefined();

    expect(
      findDuplicateSnippetTitle(all, {
        title: 'อุปกรณ์ 1',
        scope: 'database',
        connectionId: 'conn-1',
        database: 'other_db',
      })
    ).toBeUndefined();

    expect(
      findDuplicateSnippetTitle(all, {
        title: 'อุปกรณ์ 1',
        scope: 'global',
      })
    ).toBeUndefined();
  });
});
