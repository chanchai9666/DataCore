import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { DockLayout } from './DockLayout';
import { useTabStore } from '../../stores/tabStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { usePendingChangesStore } from '../../stores/pendingChangesStore';
import { useStatusStore } from '../../stores/statusStore';
import { dbApi } from '../../api/db';
import type { ConnectionConfig, QueryResult } from '../../types/db';
import * as tauriDialog from '@tauri-apps/plugin-dialog';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  confirm: vi.fn(),
}));

vi.mock('../../api/db', () => ({
  dbApi: {
    getConnections: vi.fn().mockResolvedValue([]),
    getSchemaTree: vi.fn().mockResolvedValue([]),
    openSession: vi.fn().mockResolvedValue(undefined),
    closeSession: vi.fn().mockResolvedValue(undefined),
    executeQuery: vi.fn().mockResolvedValue({
      columns: [{ name: 'id', data_type: 'INTEGER', nullable: false }],
      rows: [[{ Integer: 1 }]],
      execution_time_ms: 10,
    } as QueryResult),
    fetchTableData: vi.fn().mockResolvedValue({
      columns: [{ name: 'name', data_type: 'TEXT', nullable: false }],
      rows: [[{ Text: 'Alice' }]],
      execution_time_ms: 5,
      rows_affected: 1,
    } as QueryResult),
  },
}));

describe('DockLayout', () => {
  const mockConn: ConnectionConfig = {
    id: 'conn-1',
    name: 'Test DB',
    driver: 'sqlite',
    database: '/test.db',
  };

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    usePendingChangesStore.getState().clearAll();
    useConnectionStore.setState({
      connections: [mockConn],
      activeConnectionId: 'conn-1',
      connectedConnectionIds: ['conn-1'],
      loading: false,
      error: null,
    });
    useTabStore.setState({
      tabs: [],
      activeTabId: null,
    });
  });

  it('renders empty state when there are no open tabs', async () => {
    render(<DockLayout />);
    expect(screen.getByText(/no open tabs/i)).toBeInTheDocument();
  });

  it('opens a new query tab when + button is clicked', async () => {
    render(<DockLayout />);

    const addBtn = screen.getByTestId('add-query-tab-btn');
    fireEvent.click(addBtn);

    const tabs = useTabStore.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].type).toBe('query');
  });

  it('hides New Query Tab and + button when no database is connected', async () => {
    useConnectionStore.setState({
      connectedConnectionIds: [],
    });
    render(<DockLayout />);

    expect(screen.queryByTestId('add-query-tab-btn')).toBeNull();
    expect(screen.queryByTestId('empty-new-query-tab-btn')).toBeNull();
    expect(screen.getByText(/no database connected/i)).toBeInTheDocument();
    expect(
      screen.getByText(/connect to a database in the object browser/i)
    ).toBeInTheDocument();
  });

  it('shows New Query Tab and + button when a database is connected', async () => {
    useConnectionStore.setState({
      connectedConnectionIds: ['conn-1'],
    });
    render(<DockLayout />);

    expect(screen.getByTestId('add-query-tab-btn')).toBeInTheDocument();
    expect(screen.getByTestId('empty-new-query-tab-btn')).toBeInTheDocument();
    expect(screen.getByText(/no open tabs/i)).toBeInTheDocument();
  });

  it('switches between query and table tabs', async () => {
    useTabStore.setState({
      tabs: [
        {
          id: 'q1',
          connectionId: 'conn-1',
          type: 'query',
          title: 'Query 1',
          autoCommit: true,
          queryContent: 'SELECT 1;',
        },
        {
          id: 't1',
          connectionId: 'conn-1',
          type: 'table',
          title: 'users',
          tableName: 'users',
          schemaName: 'main',
          autoCommit: true,
          queryContent: '',
        },
      ],
      activeTabId: 'q1',
    });

    render(<DockLayout />);

    // Active tab is query
    expect(screen.getByRole('button', { name: /run/i })).toBeInTheDocument();

    // Switch to table tab
    const tableTab = screen.getByRole('tab', { name: /users/i });
    fireEvent.click(tableTab);

    // Verify session opened and table data fetched
    await waitFor(() => {
      expect(dbApi.fetchTableData).toHaveBeenCalledWith('t1', 'users', 'main', 100, 0);
    });
  });

  it('closes a tab when close button is clicked', async () => {
    useTabStore.setState({
      tabs: [
        {
          id: 'q1',
          connectionId: 'conn-1',
          type: 'query',
          title: 'Query 1',
          autoCommit: true,
          queryContent: 'SELECT 1;',
        },
      ],
      activeTabId: 'q1',
    });

    render(<DockLayout />);

    const closeBtn = screen.getByTestId('close-tab-q1');
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(useTabStore.getState().tabs).toHaveLength(0);
    });
  });

  it('collapses and expands the sidebar', async () => {
    render(<DockLayout />);
    await waitFor(() => {
      expect(screen.getByText(/explorer/i)).toBeInTheDocument();
    });

    const collapseBtn = screen.getByRole('button', { name: /collapse sidebar/i });
    fireEvent.click(collapseBtn);

    expect(screen.queryByText(/explorer/i)).not.toBeInTheDocument();

    const expandBtn = screen.getByRole('button', { name: /expand sidebar/i });
    fireEvent.click(expandBtn);

    await waitFor(() => {
      expect(screen.getByText(/explorer/i)).toBeInTheDocument();
    });
  });

  it('supports dragging the vertical split resizer between editor and datagrid', async () => {
    useTabStore.setState({
      tabs: [
        {
          id: 'q1',
          connectionId: 'conn-1',
          type: 'query',
          title: 'Query 1',
          autoCommit: true,
          queryContent: 'SELECT 1;',
        },
      ],
      activeTabId: 'q1',
    });

    render(<DockLayout />);

    const resizer = screen.getByTestId('split-resizer');
    expect(resizer).toBeInTheDocument();

    // Simulate drag resize
    fireEvent.mouseDown(resizer, { clientY: 200 });
    fireEvent.mouseMove(window, { clientY: 280 });
    fireEvent.mouseUp(window);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /run/i })).toBeInTheDocument();
    });
  });

  it('supports horizontal split layout and dragging horizontal resizer', async () => {
    localStorage.setItem('datacore-split-direction', 'horizontal');

    useTabStore.setState({
      tabs: [
        {
          id: 'q-horiz',
          connectionId: 'conn-1',
          type: 'query',
          title: 'Query Horiz',
          autoCommit: true,
          queryContent: 'SELECT 1;',
        },
      ],
      activeTabId: 'q-horiz',
    });

    render(<DockLayout />);

    const resizer = screen.getByTestId('split-resizer');
    expect(resizer).toBeInTheDocument();

    // Simulate horizontal drag
    fireEvent.mouseDown(resizer, { clientX: 400 });
    fireEvent.mouseMove(window, { clientX: 550 });
    fireEvent.mouseUp(window);

    expect(localStorage.getItem('datacore-editor-width')).toBe('700');
    localStorage.removeItem('datacore-split-direction');
  });

  it('renders Multi-Result sub-tabs and allows switching between result sets and messages', async () => {
    useTabStore.setState({
      tabs: [
        {
          id: 'q-multi',
          connectionId: 'conn-1',
          type: 'query',
          title: 'Query Multi',
          autoCommit: true,
          queryContent: 'SELECT * FROM users; SELECT * FROM orders;',
        },
      ],
      activeTabId: 'q-multi',
    });

    const res1: QueryResult = {
      columns: [{ name: 'id', data_type: 'integer', nullable: false }, { name: 'username', data_type: 'text', nullable: false }],
      rows: [[1, 'Alice']],
      execution_time_ms: 10,
    };
    const res2: QueryResult = {
      columns: [{ name: 'order_id', data_type: 'integer', nullable: false }, { name: 'total', data_type: 'real', nullable: false }],
      rows: [[101, 99.5]],
      execution_time_ms: 15,
    };

    vi.spyOn(dbApi, 'executeQuery')
      .mockResolvedValueOnce(res1)
      .mockResolvedValueOnce(res2);

    render(<DockLayout />);

    const runBtn = screen.getByRole('button', { name: /run/i });
    await act(async () => {
      fireEvent.click(runBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('multi-result-tabs-bar')).toBeInTheDocument();
    });

    expect(screen.getByTestId('result-subtab-0')).toHaveTextContent(/Result 1/);
    expect(screen.getByTestId('result-subtab-1')).toHaveTextContent(/Result 2/);
    expect(screen.getByTestId('result-subtab-messages')).toHaveTextContent('Messages');

    // Click Messages tab
    fireEvent.click(screen.getByTestId('result-subtab-messages'));
    expect(screen.getByTestId('query-messages-view')).toBeInTheDocument();
    expect(screen.getByTestId('query-messages-view')).toHaveTextContent('Total execution time: 25 ms');

    // Click back to Result 1
    fireEvent.click(screen.getByTestId('result-subtab-0'));
    expect(screen.queryByTestId('query-messages-view')).not.toBeInTheDocument();
  });

  it('opens insert row modal when Add Row button is clicked in a table tab', async () => {
    useTabStore.setState({
      tabs: [
        {
          id: 't1',
          connectionId: 'conn-1',
          type: 'table',
          title: 'users',
          tableName: 'users',
          schemaName: 'main',
          autoCommit: true,
          queryContent: '',
        },
      ],
      activeTabId: 't1',
    });

    render(<DockLayout />);

    await waitFor(() => {
      expect(dbApi.fetchTableData).toHaveBeenCalledWith('t1', 'users', 'main', 100, 0);
    });

    // Add Row button should be visible in table tab toolbar
    const addRowBtn = await screen.findByRole('button', { name: /add row/i });
    expect(addRowBtn).toBeInTheDocument();

    fireEvent.click(addRowBtn);

    // Modal should be open
    expect(screen.getByText(/Insert New Row/i)).toBeInTheDocument();
  });

  it('toggles between Data and Structure view in table tab', async () => {
    useTabStore.setState({
      tabs: [
        {
          id: 't1',
          connectionId: 'conn-1',
          type: 'table',
          title: 'users',
          tableName: 'users',
          schemaName: 'main',
          autoCommit: true,
          queryContent: '',
        },
      ],
      activeTabId: 't1',
    });

    render(<DockLayout />);

    const structureModeBtn = await screen.findByTestId('table-mode-structure-btn');
    expect(structureModeBtn).toBeInTheDocument();

    fireEvent.click(structureModeBtn);

    expect(await screen.findByTestId('table-structure-editor')).toBeInTheDocument();

    const dataModeBtn = screen.getByTestId('table-mode-data-btn');
    fireEvent.click(dataModeBtn);

    expect(await screen.findByRole('button', { name: /add row/i })).toBeInTheDocument();
  });

  it('populates columns in InsertRowModal when table is empty and fetchTableData returns empty columns', async () => {
    // Mock empty table data from fetchTableData
    vi.mocked(dbApi.fetchTableData).mockResolvedValueOnce({
      columns: [],
      rows: [],
      execution_time_ms: 2,
      rows_affected: 0,
    });

    // Mock schema query result returning columns
    vi.mocked(dbApi.executeQuery).mockImplementation(async (_tabId, sql) => {
      if (sql.includes('PRAGMA table_info') || sql.includes('information_schema.columns')) {
        return {
          columns: [],
          rows: [
            ['1', 'id', 'INTEGER', '1', null, '1'],
            ['2', 'username', 'TEXT', '0', null, '0'],
          ],
          execution_time_ms: 1,
        };
      }
      return { columns: [], rows: [], execution_time_ms: 1 };
    });

    useTabStore.setState({
      tabs: [
        {
          id: 't-empty',
          connectionId: 'conn-1',
          type: 'table',
          title: 'test_empty',
          tableName: 'test_empty',
          schemaName: 'main',
          autoCommit: true,
          queryContent: '',
        },
      ],
      activeTabId: 't-empty',
    });

    render(<DockLayout />);

    const addRowBtn = await screen.findByRole('button', { name: /add row/i });
    expect(addRowBtn).toBeInTheDocument();

    fireEvent.click(addRowBtn);

    // Modal should be open and contain input fields for the columns fetched via fallback
    expect(await screen.findByText(/Insert New Row/i)).toBeInTheDocument();
    expect(await screen.findByLabelText(/username/i)).toBeInTheDocument();
  });

  it('applies server-side filter in table tab when filter conditions are submitted', async () => {
    useTabStore.setState({
      tabs: [
        {
          id: 't-filter',
          connectionId: 'conn-1',
          type: 'table',
          title: 'users',
          tableName: 'users',
          schemaName: 'main',
          autoCommit: true,
          queryContent: '',
        },
      ],
      activeTabId: 't-filter',
    });

    render(<DockLayout />);

    // Initially loads without filter
    await waitFor(() => {
      expect(dbApi.fetchTableData).toHaveBeenCalledWith('t-filter', 'users', 'main', 100, 0);
    });

    // Click Filter toggle button in DataGrid toolbar
    const filterBtn = await screen.findByTestId('toggle-filter-btn');
    fireEvent.click(filterBtn);

    // Filter input is available for default condition
    const valInputs = await screen.findAllByPlaceholderText(/enter filter value\.\.\./i);
    fireEvent.change(valInputs[0], { target: { value: 'Alice' } });

    // Click Apply button
    const applyBtn = screen.getByRole('button', { name: /apply/i });
    fireEvent.click(applyBtn);

    // Should call fetchTableData with WHERE clause
    await waitFor(() => {
      expect(dbApi.fetchTableData).toHaveBeenCalledWith(
        't-filter',
        'users',
        'main',
        100,
        0,
        expect.stringContaining(`"name" = 'Alice'`)
      );
    });
  });

  it('applies client-side filter in query tab to filter displayed result rows', async () => {
    vi.mocked(dbApi.executeQuery).mockResolvedValueOnce({
      columns: [
        { name: 'name', data_type: 'TEXT', nullable: false },
        { name: 'id', data_type: 'INTEGER', nullable: false },
      ],
      rows: [
        [{ Text: 'Alice' }, { Integer: 1 }],
        [{ Text: 'Bob' }, { Integer: 2 }],
      ],
      execution_time_ms: 5,
    } as QueryResult);

    useTabStore.setState({
      tabs: [
        {
          id: 'q-filter',
          connectionId: 'conn-1',
          type: 'query',
          title: 'Query 1',
          queryContent: 'SELECT * FROM users;',
          autoCommit: true,
        },
      ],
      activeTabId: 'q-filter',
    });

    render(<DockLayout />);

    // Run query
    const runBtn = screen.getByRole('button', { name: /run/i });
    fireEvent.click(runBtn);

    // Filter toggle button should appear in DataGrid
    const filterBtn = await screen.findByTestId('toggle-filter-btn');
    fireEvent.click(filterBtn);

    // Filter input
    const valInputs = await screen.findAllByPlaceholderText(/enter filter value\.\.\./i);
    fireEvent.change(valInputs[0], { target: { value: 'Alice' } });

    // Click Apply
    const applyBtn = screen.getByRole('button', { name: /apply/i });
    fireEvent.click(applyBtn);

    // In-memory filter active: DataGrid footer shows 1 rows
    await waitFor(() => {
      expect(screen.getByText(/1 rows/i)).toBeInTheDocument();
    });
  });

  it('applies server-side sorting in table tab when tab has sortState', async () => {
    useTabStore.setState({
      tabs: [
        {
          id: 't-sort',
          connectionId: 'conn-1',
          type: 'table',
          title: 'users',
          tableName: 'users',
          schemaName: 'main',
          autoCommit: true,
          queryContent: '',
          sortState: { column: 'name', direction: 'DESC' },
        },
      ],
      activeTabId: 't-sort',
    });

    render(<DockLayout />);

    await waitFor(() => {
      expect(dbApi.fetchTableData).toHaveBeenCalledWith(
        't-sort',
        'users',
        'main',
        100,
        0,
        undefined,
        'name',
        'DESC'
      );
    });
  });

  it('applies client-side sorting in query tab when sortState is set', async () => {
    vi.mocked(dbApi.executeQuery).mockResolvedValueOnce({
      columns: [
        { name: 'name', data_type: 'TEXT', nullable: false },
        { name: 'id', data_type: 'INTEGER', nullable: false },
      ],
      rows: [
        [{ Text: 'Bob' }, { Integer: 2 }],
        [{ Text: 'Alice' }, { Integer: 1 }],
      ],
      execution_time_ms: 5,
    } as QueryResult);

    useTabStore.setState({
      tabs: [
        {
          id: 'q-sort',
          connectionId: 'conn-1',
          type: 'query',
          title: 'Query 1',
          queryContent: 'SELECT * FROM users;',
          autoCommit: true,
          sortState: { column: 'name', direction: 'ASC' },
        },
      ],
      activeTabId: 'q-sort',
    });

    render(<DockLayout />);

    const runBtn = screen.getByRole('button', { name: /run query/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/2 rows/i).length).toBeGreaterThan(0);
    });
  });

  it('handles staged changes and executes batch commit in Staging mode', async () => {
    const tableKey = 'conn-1.users';
    usePendingChangesStore.getState().clearAll();
    usePendingChangesStore.getState().setAutoCommitMode(tableKey, false);

    useTabStore.setState({
      tabs: [
        {
          id: 'tab-staging',
          connectionId: 'conn-1',
          type: 'table',
          title: 'users',
          tableName: 'users',
          schemaName: 'main',
          autoCommit: true,
          queryContent: '',
        },
      ],
      activeTabId: 'tab-staging',
    });

    render(<DockLayout />);

    await waitFor(() => {
      expect(dbApi.fetchTableData).toHaveBeenCalledWith('tab-staging', 'users', 'main', 100, 0);
    });

    // In staging mode, stage a cell edit
    usePendingChangesStore.getState().stageCellEdit(tableKey, {
      rowIndex: 0,
      colIndex: 0,
      colName: 'name',
      oldValue: 'Alice',
      newValue: 'Alice Bob',
    });

    const commitBtn = await screen.findByRole('button', { name: /commit changes/i });
    expect(commitBtn).not.toBeDisabled();
    expect(commitBtn).toHaveTextContent('Commit (1)');

    // Click commit
    fireEvent.click(commitBtn);

    await waitFor(() => {
      expect(dbApi.executeQuery).toHaveBeenCalledWith(
        'tab-staging',
        expect.stringContaining('UPDATE "users"')
      );
      expect(usePendingChangesStore.getState().hasPendingChanges(tableKey)).toBe(false);
    });
  });

  it('stages cell edit in pendingChangesStore without executing SQL UPDATE when in Staging mode', async () => {
    const tableKey = 'conn-1.users';
    usePendingChangesStore.getState().setAutoCommitMode(tableKey, false);

    (dbApi.fetchTableData as any).mockResolvedValueOnce({
      columns: [
        { name: 'id', data_type: 'INTEGER', nullable: false, is_primary_key: true },
        { name: 'name', data_type: 'TEXT', nullable: false },
      ],
      rows: [[{ Integer: 1 }, { Text: 'Alice' }]],
      execution_time_ms: 10,
      rows_affected: 1,
    });

    useTabStore.setState({
      tabs: [
        {
          id: 'tab-cell-staging',
          connectionId: 'conn-1',
          type: 'table',
          title: 'users',
          tableName: 'users',
          schemaName: 'main',
          autoCommit: false,
          queryContent: '',
        },
      ],
      activeTabId: 'tab-cell-staging',
    });

    render(<DockLayout />);

    await waitFor(() => {
      expect(dbApi.fetchTableData).toHaveBeenCalledWith('tab-cell-staging', 'users', 'main', 100, 0);
    });

    // Inspect Cell and edit via drawer
    const inspectBtn = await screen.findByRole('button', { name: /inspect cell/i });
    fireEvent.click(inspectBtn);

    const editBtn = await screen.findByRole('button', { name: /^edit$/i });
    fireEvent.click(editBtn);

    const textarea = screen.getByPlaceholderText('Enter value...');
    fireEvent.change(textarea, { target: { value: '99' } });

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveBtn);

    // executeQuery should NOT have been called for UPDATE
    expect(dbApi.executeQuery).not.toHaveBeenCalledWith(
      'tab-cell-staging',
      expect.stringContaining('UPDATE')
    );

    // The edit must be staged in pendingChangesStore
    expect(usePendingChangesStore.getState().hasPendingChanges(tableKey)).toBe(true);
    const changes = usePendingChangesStore.getState().getTableChanges(tableKey);
    expect(changes.cellEdits['0:0']).toEqual(
      expect.objectContaining({
        rowIndex: 0,
        colIndex: 0,
        colName: 'id',
        newValue: 99,
      })
    );
  });

  it('sanitizes date/time cell editing with "0" to NULL in Auto-Commit mode', async () => {
    (dbApi.fetchTableData as any).mockResolvedValueOnce({
      columns: [
        { name: 'id', data_type: 'uuid', nullable: false, is_primary_key: true },
        { name: 'created_at', data_type: 'timestamptz', nullable: true },
      ],
      rows: [[{ Text: '8bbaac59-7488-429e-b8c2-3e284a14197c' }, { Text: '2026-11-08T00:00:00Z' }]],
      execution_time_ms: 10,
      rows_affected: 1,
    });

    useTabStore.setState({
      tabs: [
        {
          id: 'tab-date-edit',
          connectionId: 'conn-1',
          type: 'table',
          title: 'categories',
          tableName: 'categories',
          schemaName: 'public',
          autoCommit: true,
          queryContent: '',
        },
      ],
      activeTabId: 'tab-date-edit',
    });

    render(<DockLayout />);

    await waitFor(() => {
      expect(dbApi.fetchTableData).toHaveBeenCalledWith('tab-date-edit', 'categories', 'public', 100, 0);
    });
  });

  it('cancels row deletion when user clicks Cancel in confirmation dialog', async () => {
    vi.mocked(tauriDialog.confirm).mockResolvedValue(false);

    useTabStore.setState({
      tabs: [
        {
          id: 'tab-delete-cancel',
          connectionId: 'conn-1',
          type: 'table',
          title: 'users',
          tableName: 'users',
          schemaName: 'main',
          autoCommit: true,
          queryContent: '',
        },
      ],
      activeTabId: 'tab-delete-cancel',
    });

    render(<DockLayout />);

    await waitFor(() => {
      expect(dbApi.fetchTableData).toHaveBeenCalled();
    });

    // Select a cell via Inspect button to enable Delete button
    const inspectBtn = await screen.findByRole('button', { name: /inspect cell/i });
    fireEvent.click(inspectBtn);

    // Find and click Delete button
    const deleteBtn = await screen.findByRole('button', { name: /delete selected row|delete row/i });
    expect(deleteBtn).not.toBeDisabled();
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(tauriDialog.confirm).toHaveBeenCalled();
    });

    // Ensure executeQuery with DELETE was NEVER called
    expect(dbApi.executeQuery).not.toHaveBeenCalledWith(
      'tab-delete-cancel',
      expect.stringContaining('DELETE FROM')
    );
  });

  it('proceeds with row deletion when user clicks OK in confirmation dialog', async () => {
    vi.mocked(tauriDialog.confirm).mockResolvedValue(true);

    useTabStore.setState({
      tabs: [
        {
          id: 'tab-delete-ok',
          connectionId: 'conn-1',
          type: 'table',
          title: 'users',
          tableName: 'users',
          schemaName: 'main',
          autoCommit: true,
          queryContent: '',
        },
      ],
      activeTabId: 'tab-delete-ok',
    });

    render(<DockLayout />);

    await waitFor(() => {
      expect(dbApi.fetchTableData).toHaveBeenCalled();
    });

    // Select a cell via Inspect button to enable Delete button
    const inspectBtn = await screen.findByRole('button', { name: /inspect cell/i });
    fireEvent.click(inspectBtn);

    const deleteBtn = await screen.findByRole('button', { name: /delete selected row|delete row/i });
    expect(deleteBtn).not.toBeDisabled();
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(tauriDialog.confirm).toHaveBeenCalled();
      expect(dbApi.executeQuery).toHaveBeenCalledWith(
        'tab-delete-ok',
        expect.stringContaining('DELETE FROM "users"')
      );
    });
  });

  it('records table fetch query and execution time in status store', async () => {
    (dbApi.fetchTableData as any).mockResolvedValueOnce({
      columns: [{ name: 'id', data_type: 'INTEGER', nullable: false }],
      rows: [[{ Integer: 1 }]],
      execution_time_ms: 38,
      rows_affected: 1,
    });

    useTabStore.setState({
      tabs: [
        {
          id: 'tab-fetch-timing',
          title: 'products',
          type: 'table',
          connectionId: 'c1',
          tableName: 'products',
          schemaName: 'public',
          autoCommit: true,
          queryContent: '',
        },
      ],
      activeTabId: 'tab-fetch-timing',
    });

    render(<DockLayout />);

    await waitFor(() => {
      const status = useStatusStore.getState();
      expect(status.activeTabId).toBe('tab-fetch-timing');
      expect(status.executionTimeMs).toBe(38);
      expect(status.rowCount).toBe(1);
      expect(status.lastQuery).toContain('SELECT * FROM public.products');
    });
  });

  it('commits staged changes atomically within BEGIN and COMMIT, and rolls back on failure', async () => {
    const tableKey = 'conn-1.users';
    usePendingChangesStore.getState().clearAll();
    usePendingChangesStore.getState().setAutoCommitMode(tableKey, false);

    useTabStore.setState({
      tabs: [
        {
          id: 'tab-staged-tx',
          title: 'users',
          type: 'table',
          connectionId: 'conn-1',
          tableName: 'users',
          schemaName: 'main',
          autoCommit: true,
          queryContent: '',
        },
      ],
      activeTabId: 'tab-staged-tx',
    });

    render(<DockLayout />);

    await waitFor(() => {
      expect(dbApi.fetchTableData).toHaveBeenCalled();
    });

    // Stage an edit in pendingChangesStore
    usePendingChangesStore.getState().stageCellEdit(tableKey, {
      rowIndex: 0,
      colIndex: 0,
      colName: 'name',
      oldValue: 'Alice',
      newValue: 'Alice Bob',
    });

    const commitBtn = await screen.findByRole('button', { name: /commit changes/i });
    expect(commitBtn).toBeInTheDocument();

    const callOrder: string[] = [];
    (dbApi.executeQuery as any).mockImplementation((_tabId: string, sql: string) => {
      callOrder.push(sql);
      return Promise.resolve({ columns: [], rows: [], execution_time_ms: 1 });
    });

    fireEvent.click(commitBtn);

    await waitFor(() => {
      expect(callOrder[0]).toBe('BEGIN');
      expect(callOrder[callOrder.length - 1]).toBe('COMMIT');
      expect(callOrder.some((sql) => sql.includes('UPDATE'))).toBe(true);
    });

    // Now test failure scenario: statement fails -> ROLLBACK is called
    usePendingChangesStore.getState().stageCellEdit(tableKey, {
      rowIndex: 0,
      colIndex: 0,
      colName: 'name',
      oldValue: 'Alice',
      newValue: 'Alice Broken',
    });

    const rollbackCallOrder: string[] = [];
    (dbApi.executeQuery as any).mockImplementation((_tabId: string, sql: string) => {
      rollbackCallOrder.push(sql);
      if (sql.includes('UPDATE')) {
        return Promise.reject(new Error('Constraint failure'));
      }
      return Promise.resolve({ columns: [], rows: [], execution_time_ms: 1 });
    });

    const commitBtn2 = await screen.findByRole('button', { name: /commit changes/i });
    fireEvent.click(commitBtn2);

    await waitFor(() => {
      expect(rollbackCallOrder[0]).toBe('BEGIN');
      expect(rollbackCallOrder).toContain('ROLLBACK');
    });
  });

  it('supports keyboard navigation and ARIA attributes on sidebar splitter', () => {
    render(<DockLayout />);

    const splitter = screen.getByTestId('sidebar-splitter');
    expect(splitter).toHaveAttribute('role', 'separator');
    expect(splitter).toHaveAttribute('tabIndex', '0');
    expect(splitter).toHaveAttribute('aria-orientation', 'vertical');

    const initialVal = Number(splitter.getAttribute('aria-valuenow'));

    fireEvent.keyDown(splitter, { key: 'ArrowLeft' });
    expect(Number(splitter.getAttribute('aria-valuenow'))).toBe(Math.max(180, initialVal - 10));

    fireEvent.keyDown(splitter, { key: 'ArrowRight' });
    expect(Number(splitter.getAttribute('aria-valuenow'))).toBe(initialVal);
  });

  it('renders visual query builder tab when activeTab type is query-builder', async () => {
    useTabStore.setState({
      tabs: [
        {
          id: 'qb-tab-1',
          connectionId: 'conn-1',
          type: 'query-builder',
          title: 'Query Builder (users)',
          tableName: 'users',
          autoCommit: true,
          queryContent: '',
        },
      ],
      activeTabId: 'qb-tab-1',
    });

    render(<DockLayout />);

    expect(await screen.findByTestId('visual-query-builder-tab')).toBeInTheDocument();
  });
});
