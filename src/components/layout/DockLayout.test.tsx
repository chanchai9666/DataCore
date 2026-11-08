import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DockLayout } from './DockLayout';
import { useTabStore } from '../../stores/tabStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { dbApi } from '../../api/db';
import type { ConnectionConfig, QueryResult } from '../../types/db';

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
    vi.clearAllMocks();
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
});
