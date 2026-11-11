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
});
