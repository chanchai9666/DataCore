import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { EditorView } from '@codemirror/view';
import { SqlEditor } from './SqlEditor';
import { EditorToolbar } from './EditorToolbar';
import { useTabStore } from '../../stores/tabStore';
import { dbApi } from '../../api/db';
import type { QueryResult, Tab } from '../../types/db';

describe('EditorToolbar', () => {
  const defaultProps = {
    isRunning: false,
    autoCommit: true,
    executionTimeMs: null,
    rowCount: null,
    rowsAffected: null,
    errorMessage: null,
    onRun: vi.fn(),
    onCancel: vi.fn(),
    onToggleAutoCommit: vi.fn(),
    onCommit: vi.fn(),
    onRollback: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders toolbar buttons and handles clicks', () => {
    render(<EditorToolbar {...defaultProps} />);

    const runBtn = screen.getByRole('button', { name: /run/i });
    fireEvent.click(runBtn);
    expect(defaultProps.onRun).toHaveBeenCalledTimes(1);

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    expect(cancelBtn).toBeDisabled();

    // AutoCommit toggle
    const toggleBtn = screen.getByRole('switch', { name: /auto-commit/i });
    expect(toggleBtn).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggleBtn);
    expect(defaultProps.onToggleAutoCommit).toHaveBeenCalledWith(false);

    // Commit and Rollback should be disabled when autoCommit is true
    const commitBtn = screen.getByRole('button', { name: /commit/i });
    const rollbackBtn = screen.getByRole('button', { name: /rollback/i });
    expect(commitBtn).toBeDisabled();
    expect(rollbackBtn).toBeDisabled();
  });

  it('enables Commit and Rollback when autoCommit is false', () => {
    render(<EditorToolbar {...defaultProps} autoCommit={false} />);

    const commitBtn = screen.getByRole('button', { name: /^commit/i });
    const rollbackBtn = screen.getByRole('button', { name: /^rollback/i });

    expect(commitBtn).not.toBeDisabled();
    expect(rollbackBtn).not.toBeDisabled();

    fireEvent.click(commitBtn);
    expect(defaultProps.onCommit).toHaveBeenCalledTimes(1);

    fireEvent.click(rollbackBtn);
    expect(defaultProps.onRollback).toHaveBeenCalledTimes(1);
  });

  it('displays running spinner and enables cancel button when isRunning is true', () => {
    render(<EditorToolbar {...defaultProps} isRunning={true} />);

    const runBtn = screen.getByRole('button', { name: /run/i });
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });

    expect(runBtn).toBeDisabled();
    expect(cancelBtn).not.toBeDisabled();
    expect(screen.getByTestId('running-spinner')).toBeInTheDocument();

    fireEvent.click(cancelBtn);
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('displays execution metrics when provided', () => {
    render(
      <EditorToolbar
        {...defaultProps}
        executionTimeMs={42}
        rowCount={10}
        rowsAffected={2}
      />
    );

    expect(screen.getByText(/42 ms/i)).toBeInTheDocument();
    expect(screen.getByText(/10 rows/i)).toBeInTheDocument();
    expect(screen.getByText(/2 affected/i)).toBeInTheDocument();
  });
});

describe('SqlEditor', () => {
  const sampleTab: Tab = {
    id: 'tab-test-1',
    connectionId: 'conn-1',
    type: 'query',
    title: 'Query 1',
    autoCommit: true,
    queryContent: 'SELECT * FROM users;',
  };

  const mockQueryResult: QueryResult = {
    columns: [
      { name: 'id', data_type: 'INTEGER', nullable: false },
      { name: 'name', data_type: 'TEXT', nullable: true },
    ],
    rows: [
      [{ Integer: 1 }, { Text: 'Alice' }],
      [{ Integer: 2 }, { Text: 'Bob' }],
    ],
    execution_time_ms: 15,
    rows_affected: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useTabStore.setState({
      tabs: [sampleTab],
      activeTabId: 'tab-test-1',
    });

    vi.spyOn(dbApi, 'executeQuery').mockResolvedValue(mockQueryResult);
    vi.spyOn(dbApi, 'cancelQuery').mockResolvedValue(undefined);
    vi.spyOn(dbApi, 'setAutocommit').mockResolvedValue(undefined);
    vi.spyOn(dbApi, 'commitTransaction').mockResolvedValue(undefined);
    vi.spyOn(dbApi, 'rollbackTransaction').mockResolvedValue(undefined);
  });

  it('renders editor with SQL content from active tab', () => {
    const { container } = render(<SqlEditor />);

    const cmContent = container.querySelector('.cm-content');
    expect(cmContent).toBeInTheDocument();
    expect(cmContent?.textContent).toContain('SELECT');
    expect(cmContent?.textContent).toContain('FROM users;');
  });

  it('executes query when clicking Run button in toolbar', async () => {
    const handleResult = vi.fn();
    render(<SqlEditor onQueryResult={handleResult} />);

    const runBtn = screen.getByRole('button', { name: /run/i });
    await act(async () => {
      fireEvent.click(runBtn);
    });

    await waitFor(() => {
      expect(dbApi.executeQuery).toHaveBeenCalledWith('tab-test-1', 'SELECT * FROM users;');
      expect(handleResult).toHaveBeenCalledWith(mockQueryResult);
    });

    // Verify stats in toolbar
    expect(screen.getByText(/15 ms/i)).toBeInTheDocument();
    expect(screen.getByText(/2 rows/i)).toBeInTheDocument();
  });

  it('executes query with keyboard shortcut Cmd+Enter / Ctrl+Enter', async () => {
    const handleResult = vi.fn();
    const { container } = render(<SqlEditor onQueryResult={handleResult} />);

    const cmElement = container.querySelector('.cm-content') || container.querySelector('.cm-editor');
    expect(cmElement).not.toBeNull();

    await act(async () => {
      fireEvent.keyDown(cmElement!, {
        key: 'Enter',
        metaKey: true,
        bubbles: true,
      });
    });

    await waitFor(() => {
      expect(dbApi.executeQuery).toHaveBeenCalledWith('tab-test-1', 'SELECT * FROM users;');
      expect(handleResult).toHaveBeenCalledWith(mockQueryResult);
    });
  });

  it('executes only selected SQL text if user made a selection', async () => {
    const handleResult = vi.fn();
    const multiQueryTab: Tab = {
      ...sampleTab,
      id: 'tab-test-2',
      queryContent: 'SELECT 1; SELECT 2;',
    };
    useTabStore.setState({
      tabs: [multiQueryTab],
      activeTabId: 'tab-test-2',
    });

    let viewInstance: EditorView | null = null;
    render(
      <SqlEditor
        tabId="tab-test-2"
        onQueryResult={handleResult}
        onEditorCreated={(v) => {
          viewInstance = v;
        }}
      />
    );

    expect(viewInstance).not.toBeNull();
    // Select first query: 'SELECT 1;' (index 0 to 9)
    act(() => {
      viewInstance!.dispatch({
        selection: { anchor: 0, head: 9 },
      });
    });

    const runBtn = screen.getByRole('button', { name: /run/i });
    await act(async () => {
      fireEvent.click(runBtn);
    });

    await waitFor(() => {
      expect(dbApi.executeQuery).toHaveBeenCalledWith('tab-test-2', 'SELECT 1;');
    });
  });

  it('cancels query when cancel button is clicked', async () => {
    let resolveQuery: (res: QueryResult) => void;
    vi.spyOn(dbApi, 'executeQuery').mockReturnValue(
      new Promise((resolve) => {
        resolveQuery = resolve;
      })
    );

    render(<SqlEditor />);

    const runBtn = screen.getByRole('button', { name: /run/i });
    await act(async () => {
      fireEvent.click(runBtn);
    });

    // Cancel button should be enabled while running
    const cancelBtn = await screen.findByRole('button', { name: /cancel/i });
    expect(cancelBtn).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(cancelBtn);
    });

    await waitFor(() => {
      expect(dbApi.cancelQuery).toHaveBeenCalledWith('tab-test-1');
    });

    // Resolve hanging promise
    await act(async () => {
      resolveQuery!(mockQueryResult);
    });
  });

  it('handles auto-commit toggle and updates dbApi and store', async () => {
    render(<SqlEditor />);

    const toggleBtn = screen.getByRole('switch', { name: /auto-commit/i });
    await act(async () => {
      fireEvent.click(toggleBtn);
    });

    await waitFor(() => {
      expect(dbApi.setAutocommit).toHaveBeenCalledWith('tab-test-1', false);
    });

    const currentTab = useTabStore.getState().tabs.find((t) => t.id === 'tab-test-1');
    expect(currentTab?.autoCommit).toBe(false);
  });

  it('calls commit and rollback transaction APIs', async () => {
    useTabStore.setState({
      tabs: [{ ...sampleTab, autoCommit: false }],
      activeTabId: 'tab-test-1',
    });

    render(<SqlEditor />);

    const commitBtn = screen.getByRole('button', { name: /^commit/i });
    await act(async () => {
      fireEvent.click(commitBtn);
    });

    await waitFor(() => {
      expect(dbApi.commitTransaction).toHaveBeenCalledWith('tab-test-1');
    });

    const rollbackBtn = screen.getByRole('button', { name: /^rollback/i });
    await act(async () => {
      fireEvent.click(rollbackBtn);
    });

    await waitFor(() => {
      expect(dbApi.rollbackTransaction).toHaveBeenCalledWith('tab-test-1');
    });
  });

  it('displays message when no tab is selected', () => {
    useTabStore.setState({
      tabs: [],
      activeTabId: null,
    });

    render(<SqlEditor />);
    expect(screen.getByText('No query tab selected')).toBeInTheDocument();
  });

  it('records executed query into useQueryHistoryStore', async () => {
    vi.spyOn(dbApi, 'executeQuery').mockResolvedValue(mockQueryResult);

    render(<SqlEditor />);

    const runBtn = screen.getByRole('button', { name: /run/i });
    await act(async () => {
      fireEvent.click(runBtn);
    });

    await waitFor(() => {
      expect(dbApi.executeQuery).toHaveBeenCalled();
    });

    // Check history store
    const { useQueryHistoryStore } = await import('../../stores/queryHistoryStore');
    const history = useQueryHistoryStore.getState().history;
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].sql).toBe('SELECT * FROM users;');
    expect(history[0].status).toBe('success');
  });

  it('opens history and snippets drawer when toolbar buttons are clicked', async () => {
    render(<SqlEditor />);

    const historyBtn = screen.getByRole('button', { name: /^history/i });
    fireEvent.click(historyBtn);

    expect(screen.getByRole('dialog', { name: /query history & snippets/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search history/i)).toBeInTheDocument();

    const snippetsBtn = screen.getByTitle('Saved SQL Snippets');
    fireEvent.click(snippetsBtn);

    expect(screen.getByPlaceholderText(/search snippets/i)).toBeInTheDocument();
  });
});
