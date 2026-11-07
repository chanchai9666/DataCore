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
});
