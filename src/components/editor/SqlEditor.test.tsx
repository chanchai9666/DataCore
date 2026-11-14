import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { EditorView } from '@codemirror/view';
import { SqlEditor } from './SqlEditor';
import { EditorToolbar } from './EditorToolbar';
import { useTabStore } from '../../stores/tabStore';
import { useConnectionStore } from '../../stores/connectionStore';
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

  it('displays full error message without truncating to 50 characters', () => {
    const longError =
      'syntax error at or near "SELCT": this is a very long error message that exceeds fifty characters easily';
    render(<EditorToolbar {...defaultProps} errorMessage={longError} />);

    const errorEl = screen.getByTestId('toolbar-error-message');
    expect(errorEl).toBeInTheDocument();
    expect(errorEl.textContent).toBe(`Error: ${longError}`);
    expect(errorEl.textContent?.length).toBeGreaterThan(50);
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
      expect(dbApi.executeQuery).toHaveBeenCalledWith('tab-test-1', 'SELECT * FROM users LIMIT 1000;');
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
      expect(dbApi.executeQuery).toHaveBeenCalledWith('tab-test-1', 'SELECT * FROM users LIMIT 1000;');
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
      expect(dbApi.executeQuery).toHaveBeenCalledWith('tab-test-2', 'SELECT 1 LIMIT 1000;');
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
    expect(history[0].sql).toBe('SELECT * FROM users LIMIT 1000;');
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

  it('triggers Explain and opens ExecutionPlanDrawer', async () => {
    vi.spyOn(dbApi, 'executeQuery').mockResolvedValue({
      columns: [{ name: 'QUERY PLAN', data_type: 'TEXT', nullable: true }],
      rows: [[{ Text: 'Seq Scan on users' }]],
      execution_time_ms: 10,
    });

    render(<SqlEditor />);

    const explainBtn = screen.getByRole('button', { name: /^explain$/i });
    await act(async () => {
      fireEvent.click(explainBtn);
    });

    await waitFor(() => {
      expect(dbApi.executeQuery).toHaveBeenCalledWith(
        'tab-test-1',
        expect.stringContaining('EXPLAIN')
      );
    });

    expect(screen.getByRole('dialog', { name: /query execution plan/i })).toBeInTheDocument();
    expect(screen.getByText(/Seq Scan on users/)).toBeInTheDocument();
  });

  it('triggers Explain Analyze when Analyze button is clicked', async () => {
    vi.spyOn(dbApi, 'executeQuery').mockResolvedValue({
      columns: [{ name: 'QUERY PLAN', data_type: 'TEXT', nullable: true }],
      rows: [[{ Text: 'Seq Scan on users' }]],
      execution_time_ms: 15,
    });

    render(<SqlEditor />);

    const analyzeBtn = screen.getByRole('button', { name: /explain analyze/i });
    await act(async () => {
      fireEvent.click(analyzeBtn);
    });

    await waitFor(() => {
      expect(dbApi.executeQuery).toHaveBeenCalledWith(
        'tab-test-1',
        expect.stringMatching(/EXPLAIN.*ANALYZE/i)
      );
    });

    expect(screen.getByRole('dialog', { name: /query execution plan/i })).toBeInTheDocument();
  });

  it('applies Safe Limit 1000 automatically to SELECT queries without limit', async () => {
    vi.spyOn(dbApi, 'executeQuery').mockResolvedValue(mockQueryResult);

    render(<SqlEditor />);

    const runBtn = screen.getByRole('button', { name: /run/i });
    await act(async () => {
      fireEvent.click(runBtn);
    });

    await waitFor(() => {
      expect(dbApi.executeQuery).toHaveBeenCalledWith(
        'tab-test-1',
        'SELECT * FROM users LIMIT 1000;'
      );
    });

    expect(screen.getByTestId('safe-limit-badge')).toBeInTheDocument();
  });

  it('allows disabling Safe Limit via toolbar selector', async () => {
    vi.spyOn(dbApi, 'executeQuery').mockResolvedValue(mockQueryResult);

    render(<SqlEditor />);

    const limitSelect = screen.getByLabelText(/safe limit/i);
    fireEvent.change(limitSelect, { target: { value: 'none' } });

    const runBtn = screen.getByRole('button', { name: /run/i });
    await act(async () => {
      fireEvent.click(runBtn);
    });

    await waitFor(() => {
      expect(dbApi.executeQuery).toHaveBeenCalledWith(
        'tab-test-1',
        'SELECT * FROM users;'
      );
    });

    expect(screen.queryByTestId('safe-limit-badge')).not.toBeInTheDocument();
  });

  it('intercepts dangerous query like DROP TABLE and prompts confirmation modal', async () => {
    vi.spyOn(dbApi, 'executeQuery').mockResolvedValue(mockQueryResult);

    const dropTab: Tab = {
      ...sampleTab,
      id: 'tab-drop-1',
      queryContent: 'DROP TABLE users;',
    };
    useTabStore.setState({
      tabs: [dropTab],
      activeTabId: 'tab-drop-1',
    });

    render(<SqlEditor tabId="tab-drop-1" />);

    const runBtn = screen.getByRole('button', { name: /run/i });
    await act(async () => {
      fireEvent.click(runBtn);
    });

    // Confirmation modal should appear
    expect(screen.getByRole('alertdialog', { name: /dangerous query warning/i })).toBeInTheDocument();
    expect(screen.getByText(/destructive drop command detected/i)).toBeInTheDocument();

    // Query should NOT have been executed yet
    expect(dbApi.executeQuery).not.toHaveBeenCalled();

    // Click "Execute Anyway"
    const confirmBtn = screen.getByRole('button', { name: /execute anyway/i });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() => {
      expect(dbApi.executeQuery).toHaveBeenCalledWith('tab-drop-1', 'DROP TABLE users;');
    });

    // Modal closes
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('cancels dangerous query when Cancel is clicked in modal', async () => {
    vi.spyOn(dbApi, 'executeQuery').mockResolvedValue(mockQueryResult);

    const deleteTab: Tab = {
      ...sampleTab,
      id: 'tab-del-1',
      queryContent: 'DELETE FROM users;',
    };
    useTabStore.setState({
      tabs: [deleteTab],
      activeTabId: 'tab-del-1',
    });

    render(<SqlEditor tabId="tab-del-1" />);

    const runBtn = screen.getByRole('button', { name: /run/i });
    await act(async () => {
      fireEvent.click(runBtn);
    });

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    // Click Cancel
    const cancelBtn = screen.getByRole('button', { name: /^cancel$/i });
    await act(async () => {
      fireEvent.click(cancelBtn);
    });

    // Modal closes without executing
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(dbApi.executeQuery).not.toHaveBeenCalled();
  });

  it('displays Error Callout Panel with full message and error code when query fails', async () => {
    const errorStr =
      'Database error: ERROR: 42601: syntax error at or near "FROMM" at character 10';
    vi.spyOn(dbApi, 'executeQuery').mockRejectedValue(new Error(errorStr));

    render(<SqlEditor />);

    const runBtn = screen.getByRole('button', { name: /run/i });
    await act(async () => {
      fireEvent.click(runBtn);
    });

    // Error callout should appear
    const callout = await screen.findByTestId('sql-error-callout');
    expect(callout).toBeInTheDocument();

    // Check Error Type title
    expect(screen.getByText('Syntax Error')).toBeInTheDocument();

    // Check Error Code badge
    const codeBadge = screen.getByTestId('error-code-badge');
    expect(codeBadge).toHaveTextContent('Code: 42601');

    // Check Clean Message display
    const msgEl = screen.getByTestId('error-callout-message');
    expect(msgEl).toHaveTextContent('syntax error at or near "FROMM" at character 10');
  });

  it('allows copying full error to clipboard and dismissing error callout panel', async () => {
    const errorStr =
      'Database error: syntax error at or near "SELCT"';
    vi.spyOn(dbApi, 'executeQuery').mockRejectedValue(new Error(errorStr));

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<SqlEditor />);

    const runBtn = screen.getByRole('button', { name: /run/i });
    await act(async () => {
      fireEvent.click(runBtn);
    });

    expect(await screen.findByTestId('sql-error-callout')).toBeInTheDocument();

    // Copy button
    const copyBtn = screen.getByTestId('copy-error-btn');
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeTextMock).toHaveBeenCalledWith(errorStr);
    expect(screen.getByText('Copied!')).toBeInTheDocument();

    // Dismiss button
    const dismissBtn = screen.getByTestId('dismiss-error-btn');
    act(() => {
      fireEvent.click(dismissBtn);
    });

    expect(screen.queryByTestId('sql-error-callout')).not.toBeInTheDocument();
  });

  it('highlights error line and jumps cursor when line badge is clicked', async () => {
    const query = 'SELECT *\nFROMM users\nWHERE id = 1;';
    const testTab: Tab = {
      ...sampleTab,
      id: 'tab-line-err',
      queryContent: query,
    };
    useTabStore.setState({
      tabs: [testTab],
      activeTabId: 'tab-line-err',
    });

    let viewInstance: EditorView | null = null;
    const errorStr =
      'Database error: ERROR: syntax error at or near "FROMM" at character 11';
    vi.spyOn(dbApi, 'executeQuery').mockRejectedValue(new Error(errorStr));

    render(
      <SqlEditor
        tabId="tab-line-err"
        onEditorCreated={(v) => {
          viewInstance = v;
        }}
      />
    );

    const runBtn = screen.getByRole('button', { name: /run/i });
    await act(async () => {
      fireEvent.click(runBtn);
    });

    const callout = await screen.findByTestId('sql-error-callout');
    expect(callout).toBeInTheDocument();

    const lineBadge = screen.getByTestId('error-line-badge');
    expect(lineBadge).toHaveTextContent(/Line 2/);

    // Clicking line badge focuses and dispatches jump
    await act(async () => {
      fireEvent.click(lineBadge);
    });

    expect(viewInstance).not.toBeNull();
    // Selection should be placed on line 2
    expect(viewInstance!.state.selection.main.anchor).toBeGreaterThanOrEqual(9);
  });

  it('clears error callout panel when active tab changes', async () => {
    const errorStr = 'Database error: relation "users" does not exist';
    vi.spyOn(dbApi, 'executeQuery').mockRejectedValue(new Error(errorStr));

    render(<SqlEditor />);

    const runBtn = screen.getByRole('button', { name: /run/i });
    await act(async () => {
      fireEvent.click(runBtn);
    });

    expect(await screen.findByTestId('sql-error-callout')).toBeInTheDocument();

    // Switch tab
    act(() => {
      useTabStore.setState({
        tabs: [
          sampleTab,
          {
            id: 'tab-test-2',
            title: 'Tab 2',
            type: 'query',
            connectionId: 'conn-1',
            queryContent: 'SELECT 1;',
            autoCommit: true,
          },
        ],
        activeTabId: 'tab-test-2',
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId('sql-error-callout')).not.toBeInTheDocument();
    });
  });

  describe('Read-Only Mode in SqlEditor', () => {
    it('displays the Read-Only banner when isReadOnly is true', () => {
      render(<SqlEditor isReadOnly={true} />);
      const banner = screen.getByTestId('sql-readonly-banner');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent(/read-only mode active/i);
    });

    it('rejects write queries (DML/DDL) in read-only mode and displays error message', async () => {
      const execSpy = vi.spyOn(dbApi, 'executeQuery');
      useTabStore.setState({
        tabs: [
          {
            id: 'tab-ro-test',
            title: 'RO Query Tab',
            type: 'query',
            connectionId: 'conn-1',
            queryContent: 'DELETE FROM users WHERE id = 1;',
            autoCommit: true,
          },
        ],
        activeTabId: 'tab-ro-test',
      });

      render(<SqlEditor isReadOnly={true} tabId="tab-ro-test" />);

      const runBtn = screen.getByRole('button', { name: /run/i });
      await act(async () => {
        fireEvent.click(runBtn);
      });

      // dbApi.executeQuery should NOT have been called
      expect(execSpy).not.toHaveBeenCalled();

      // Error callout should display write query rejection message
      const callout = await screen.findByTestId('sql-error-callout');
      expect(callout).toBeInTheDocument();
      expect(callout).toHaveTextContent(/read-only mode: write query rejected/i);
    });

    it('allows SELECT queries in read-only mode', async () => {
      const mockResult: QueryResult = {
        columns: [{ name: 'val', data_type: 'INTEGER', nullable: true }],
        rows: [[{ Integer: 123 }]],
        execution_time_ms: 5,
        rows_affected: null,
      };
      const execSpy = vi.spyOn(dbApi, 'executeQuery').mockResolvedValue(mockResult);

      useTabStore.setState({
        tabs: [
          {
            id: 'tab-ro-select',
            title: 'RO Select Tab',
            type: 'query',
            connectionId: 'conn-1',
            queryContent: 'SELECT * FROM users;',
            autoCommit: true,
          },
        ],
        activeTabId: 'tab-ro-select',
      });

      render(<SqlEditor isReadOnly={true} tabId="tab-ro-select" />);

      const runBtn = screen.getByRole('button', { name: /run/i });
      await act(async () => {
        fireEvent.click(runBtn);
      });

      expect(execSpy).toHaveBeenCalledWith('tab-ro-select', expect.stringContaining('SELECT * FROM users'));
      expect(screen.queryByTestId('sql-error-callout')).not.toBeInTheDocument();
    });
  });

  describe('Schema-Aware Autocomplete (Issue #91)', () => {
    it('fetches schema on mount and invalidates on DDL query execution', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        users: ['id', 'email', 'name'],
        orders: ['id', 'user_id', 'amount'],
      });
      const invalidateSpy = vi.fn();

      const { useSchemaStore } = await import('../../stores/schemaStore');
      useSchemaStore.setState({
        fetchSchema: fetchSpy,
        invalidateSchema: invalidateSpy,
        schemas: {
          'conn-1': {
            users: ['id', 'email', 'name'],
            orders: ['id', 'user_id', 'amount'],
          },
        },
      });

      const ddlResult: QueryResult = {
        columns: [],
        rows: [],
        execution_time_ms: 12,
        rows_affected: 0,
      };
      vi.spyOn(dbApi, 'executeQuery').mockResolvedValue(ddlResult);

      useConnectionStore.setState({
        connections: [
          {
            id: 'conn-1',
            name: 'Postgres DB',
            driver: 'postgres',
            database: 'test_db',
          },
        ],
      });

      useTabStore.setState({
        tabs: [
          {
            id: 'tab-ddl',
            title: 'DDL Tab',
            type: 'query',
            connectionId: 'conn-1',
            queryContent: 'CREATE TABLE products (id INTEGER, name TEXT);',
            autoCommit: true,
          },
        ],
        activeTabId: 'tab-ddl',
      });

      render(<SqlEditor tabId="tab-ddl" />);

      expect(fetchSpy).toHaveBeenCalledWith('conn-1', 'postgres', undefined);

      const runBtn = screen.getByRole('button', { name: /run/i });
      await act(async () => {
        fireEvent.click(runBtn);
      });

      expect(invalidateSpy).toHaveBeenCalledWith('conn-1');
    });
  });

  describe('SQL Formatter (Issue #92)', () => {
    it('formats SQL when clicking Format button in toolbar', async () => {
      useTabStore.setState({
        tabs: [
          {
            id: 'tab-fmt',
            title: 'Format Tab',
            type: 'query',
            connectionId: 'conn-1',
            queryContent: 'select id,name from users where id=1;',
            autoCommit: true,
          },
        ],
        activeTabId: 'tab-fmt',
      });

      render(<SqlEditor tabId="tab-fmt" />);

      const formatBtn = screen.getByTestId('format-sql-btn');
      expect(formatBtn).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(formatBtn);
      });

      const updated = useTabStore.getState().tabs.find((t) => t.id === 'tab-fmt');
      expect(updated?.queryContent).toContain('SELECT');
      expect(updated?.queryContent).toContain('FROM');
      expect(updated?.queryContent).toContain('WHERE');
    });

    it('formats SQL on ⌘⇧F / Ctrl+Shift+F key press', async () => {
      useTabStore.setState({
        tabs: [
          {
            id: 'tab-fmt-key',
            title: 'Format Key Tab',
            type: 'query',
            connectionId: 'conn-1',
            queryContent: 'select * from products;',
            autoCommit: true,
          },
        ],
        activeTabId: 'tab-fmt-key',
      });

      const { container } = render(<SqlEditor tabId="tab-fmt-key" />);

      const editorContainer = container.querySelector('.sql-editor-container')!;
      fireEvent.keyDown(editorContainer, {
        key: 'f',
        shiftKey: true,
        metaKey: true,
      });

      const updated = useTabStore.getState().tabs.find((t) => t.id === 'tab-fmt-key');
      expect(updated?.queryContent).toContain('SELECT');
      expect(updated?.queryContent).toContain('FROM');
    });
  });

  describe('Multi-Statement Execution (Issue #92)', () => {
    it('executes multiple statements sequentially and reports allResults to onQueryResult', async () => {
      const res1: QueryResult = {
        columns: [{ name: 'id', data_type: 'integer', nullable: false }],
        rows: [[1]],
        execution_time_ms: 10,
        rows_affected: null,
      };
      const res2: QueryResult = {
        columns: [{ name: 'val', data_type: 'text', nullable: false }],
        rows: [['test']],
        execution_time_ms: 15,
        rows_affected: null,
      };

      const execSpy = vi.spyOn(dbApi, 'executeQuery')
        .mockResolvedValueOnce(res1)
        .mockResolvedValueOnce(res2);

      const handleResult = vi.fn();

      useTabStore.setState({
        tabs: [
          {
            id: 'tab-multi',
            title: 'Multi Tab',
            type: 'query',
            connectionId: 'conn-1',
            queryContent: 'SELECT 1; SELECT "test" as val;',
            autoCommit: true,
          },
        ],
        activeTabId: 'tab-multi',
      });

      render(<SqlEditor tabId="tab-multi" onQueryResult={handleResult} />);

      const runBtn = screen.getByRole('button', { name: /run/i });
      await act(async () => {
        fireEvent.click(runBtn);
      });

      expect(execSpy).toHaveBeenCalledTimes(2);
      expect(handleResult).toHaveBeenCalledWith(
        expect.objectContaining({ execution_time_ms: 25 }),
        expect.arrayContaining([
          expect.objectContaining({ statement: 'SELECT 1' }),
          expect.objectContaining({ statement: expect.stringContaining('SELECT "test" as val') }),
        ])
      );
    });
  });

  describe('Horizontal Split Layout (Issue #97)', () => {
    it('renders toggle split direction button and toggles direction', async () => {
      localStorage.removeItem('datacore-split-direction');

      useTabStore.setState({
        tabs: [
          {
            id: 'tab-split',
            title: 'Split Tab',
            type: 'query',
            connectionId: 'conn-1',
            queryContent: 'SELECT 1;',
            autoCommit: true,
          },
        ],
        activeTabId: 'tab-split',
      });

      render(<SqlEditor tabId="tab-split" />);

      const splitBtn = screen.getByTestId('toggle-split-btn');
      expect(splitBtn).toBeInTheDocument();
      expect(splitBtn).toHaveTextContent('Horizontal');

      await act(async () => {
        fireEvent.click(splitBtn);
      });

      expect(localStorage.getItem('datacore-split-direction')).toBe('horizontal');
      expect(splitBtn).toHaveTextContent('Vertical');
    });
  });
});
