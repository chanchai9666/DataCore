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

  it('renders empty state when there are no open tabs', () => {
    render(<DockLayout />);
    expect(screen.getByText(/no open tabs/i)).toBeInTheDocument();
  });

  it('opens a new query tab when + button is clicked', () => {
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

  it('collapses and expands the sidebar', () => {
    render(<DockLayout />);

    const collapseBtn = screen.getByRole('button', { name: /collapse sidebar/i });
    fireEvent.click(collapseBtn);

    expect(screen.queryByText(/explorer/i)).not.toBeInTheDocument();

    const expandBtn = screen.getByRole('button', { name: /expand sidebar/i });
    fireEvent.click(expandBtn);

    expect(screen.getByText(/explorer/i)).toBeInTheDocument();
  });
});
