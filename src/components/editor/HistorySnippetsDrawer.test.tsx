import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HistorySnippetsDrawer } from './HistorySnippetsDrawer';
import { useQueryHistoryStore } from '../../stores/queryHistoryStore';
import { useSnippetStore } from '../../stores/snippetStore';

describe('HistorySnippetsDrawer', () => {
  const mockOnClose = vi.fn();
  const mockOnSelectSql = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useQueryHistoryStore.getState().clearAll();
    useSnippetStore.getState().resetToDefaults();
  });

  it('renders history tab with recorded query', () => {
    useQueryHistoryStore.getState().addHistoryItem({
      sql: 'SELECT * FROM users WHERE active = true;',
      executionTimeMs: 15,
      rowCount: 42,
      status: 'success',
      connectionId: 'conn-1',
      connectionName: 'Production DB',
      database: 'prod_db',
    });

    render(
      <HistorySnippetsDrawer
        isOpen={true}
        onClose={mockOnClose}
        initialTab="history"
        onSelectSql={mockOnSelectSql}
      />
    );

    expect(screen.getByText('Query History & Snippets')).toBeDefined();
    expect(screen.getByText(/SELECT \* FROM users WHERE active = true;/)).toBeDefined();
    expect(screen.getByText('42 rows')).toBeDefined();
    expect(screen.getByText('15ms')).toBeDefined();
  });

  it('filters history items by search query', () => {
    useQueryHistoryStore.getState().addHistoryItem({
      sql: 'SELECT * FROM users;',
      executionTimeMs: 10,
      status: 'success',
    });
    useQueryHistoryStore.getState().addHistoryItem({
      sql: 'SELECT * FROM orders;',
      executionTimeMs: 20,
      status: 'success',
    });

    render(
      <HistorySnippetsDrawer
        isOpen={true}
        onClose={mockOnClose}
        initialTab="history"
        onSelectSql={mockOnSelectSql}
      />
    );

    const searchInput = screen.getByPlaceholderText(/search history/i);
    fireEvent.change(searchInput, { target: { value: 'orders' } });

    expect(screen.queryByText(/SELECT \* FROM users;/)).toBeNull();
    expect(screen.getByText(/SELECT \* FROM orders;/)).toBeDefined();
  });

  it('calls onSelectSql when Run or Insert is clicked', () => {
    useQueryHistoryStore.getState().addHistoryItem({
      sql: 'SELECT 12345;',
      executionTimeMs: 5,
      status: 'success',
    });

    render(
      <HistorySnippetsDrawer
        isOpen={true}
        onClose={mockOnClose}
        initialTab="history"
        onSelectSql={mockOnSelectSql}
      />
    );

    const insertBtn = screen.getByRole('button', { name: /insert/i });
    fireEvent.click(insertBtn);

    expect(mockOnSelectSql).toHaveBeenCalledWith('SELECT 12345;', 'insert');
  });

  it('switches to snippets tab and displays default snippets', () => {
    render(
      <HistorySnippetsDrawer
        isOpen={true}
        onClose={mockOnClose}
        initialTab="snippets"
        onSelectSql={mockOnSelectSql}
      />
    );

    expect(screen.getByText(/Table Sizes & Estimated Rows/i)).toBeDefined();
    expect(screen.getByText(/Active Running Queries/i)).toBeDefined();
  });

  it('can create a new snippet through modal/form', () => {
    render(
      <HistorySnippetsDrawer
        isOpen={true}
        onClose={mockOnClose}
        initialTab="snippets"
        onSelectSql={mockOnSelectSql}
      />
    );

    const newBtn = screen.getByRole('button', { name: /\+ new snippet/i });
    fireEvent.click(newBtn);

    const titleInput = screen.getByPlaceholderText(/snippet title/i);
    const sqlInput = screen.getByPlaceholderText(/enter sql query/i);
    const saveBtn = screen.getByRole('button', { name: /save snippet/i });

    fireEvent.change(titleInput, { target: { value: 'My Custom Count' } });
    fireEvent.change(sqlInput, { target: { value: 'SELECT COUNT(*) FROM items;' } });
    fireEvent.click(saveBtn);

    expect(screen.getByText('My Custom Count')).toBeDefined();
    const snippets = useSnippetStore.getState().snippets;
    expect(snippets.some((s) => s.title === 'My Custom Count')).toBe(true);
  });

  it('deletes a history item', () => {
    useQueryHistoryStore.getState().addHistoryItem({
      sql: 'SELECT DELETE_ME;',
      executionTimeMs: 5,
      status: 'success',
    });

    render(
      <HistorySnippetsDrawer
        isOpen={true}
        onClose={mockOnClose}
        initialTab="history"
        onSelectSql={mockOnSelectSql}
      />
    );

    expect(screen.getByText(/SELECT DELETE_ME;/)).toBeDefined();

    const deleteBtn = screen.getByTitle(/delete from history/i);
    fireEvent.click(deleteBtn);

    expect(screen.queryByText(/SELECT DELETE_ME;/)).toBeNull();
    expect(useQueryHistoryStore.getState().history.length).toBe(0);
  });
});
