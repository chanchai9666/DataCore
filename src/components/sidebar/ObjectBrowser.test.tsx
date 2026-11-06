import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ObjectBrowser } from './ObjectBrowser';
import { useConnectionStore } from '../../stores/connectionStore';
import { useTabStore } from '../../stores/tabStore';
import { dbApi } from '../../api/db';
import type { ConnectionConfig, SchemaNode } from '../../types/db';

vi.mock('../../api/db', () => ({
  dbApi: {
    getConnections: vi.fn(),
    getSchemaTree: vi.fn(),
    closeSession: vi.fn(),
  },
}));

describe('ObjectBrowser', () => {
  const mockConnection: ConnectionConfig = {
    id: 'conn-1',
    name: 'Production SQLite',
    driver: 'sqlite',
    database: '/path/to/prod.db',
  };

  const mockSchema: SchemaNode[] = [
    {
      name: 'main',
      node_type: 'database',
      children: [
        {
          name: 'users',
          node_type: 'table',
          schema: 'main',
        },
        {
          name: 'orders',
          node_type: 'table',
          schema: 'main',
        },
        {
          name: 'active_users_view',
          node_type: 'view',
          schema: 'main',
        },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    useConnectionStore.setState({
      connections: [mockConnection],
      activeConnectionId: null,
      loading: false,
      error: null,
    });
    useTabStore.setState({
      tabs: [],
      activeTabId: null,
    });
    vi.mocked(dbApi.getSchemaTree).mockResolvedValue(mockSchema);
  });

  it('renders connections and schema tree when loaded', async () => {
    render(<ObjectBrowser />);

    // Connection name should be displayed
    expect(await screen.findByText('Production SQLite')).toBeInTheDocument();

    // Database node should be displayed
    expect(await screen.findByText('main')).toBeInTheDocument();

    // Tables and views should be displayed
    expect(await screen.findByText('users')).toBeInTheDocument();
    expect(screen.getByText('orders')).toBeInTheDocument();
    expect(screen.getByText('active_users_view')).toBeInTheDocument();
  });

  it('opens a table tab when a table node is double-clicked', async () => {
    render(<ObjectBrowser />);

    const userTableNode = await screen.findByText('users');
    fireEvent.doubleClick(userTableNode);

    const tabs = useTabStore.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({
      connectionId: 'conn-1',
      type: 'table',
      title: 'users',
      tableName: 'users',
      schemaName: 'main',
      autoCommit: true,
      queryContent: '',
    });
    expect(tabs[0].id).toContain('table-');
  });

  it('filters nodes based on search input', async () => {
    render(<ObjectBrowser />);

    await screen.findByText('users');
    const filterInput = screen.getByPlaceholderText(/search|filter/i);

    fireEvent.change(filterInput, { target: { value: 'orders' } });

    expect(screen.getByText('orders')).toBeInTheDocument();
    expect(screen.queryByText('users')).not.toBeInTheDocument();
  });

  it('opens a query tab when new query action is triggered', async () => {
    render(<ObjectBrowser />);

    const connElement = await screen.findByText('Production SQLite');
    fireEvent.contextMenu(connElement);

    const newQueryBtn = await screen.findByText(/new query/i);
    fireEvent.click(newQueryBtn);

    const tabs = useTabStore.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].type).toBe('query');
    expect(tabs[0].connectionId).toBe('conn-1');
  });

  it('refreshes schema when refresh action is triggered', async () => {
    render(<ObjectBrowser />);

    const connElement = await screen.findByText('Production SQLite');
    fireEvent.contextMenu(connElement);

    const refreshBtn = await screen.findByText(/refresh/i);
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(dbApi.getSchemaTree).toHaveBeenCalledWith('conn-1');
    });
  });

  it('opens a table tab via context menu on table node', async () => {
    render(<ObjectBrowser />);

    const tableNode = await screen.findByText('orders');
    fireEvent.contextMenu(tableNode);

    const openTableBtn = await screen.findByRole('button', { name: /open table/i });
    fireEvent.click(openTableBtn);

    const tabs = useTabStore.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].tableName).toBe('orders');
    expect(tabs[0].type).toBe('table');
  });

  it('toggles expand and collapse when clicking on expander arrow', async () => {
    render(<ObjectBrowser />);

    await screen.findByText('users');
    const dbNode = screen.getByTestId('tree-node-main');
    const expander = dbNode.querySelector('span');
    expect(expander).not.toBeNull();

    // Click collapse
    if (expander) {
      fireEvent.click(expander);
    }
    await waitFor(() => {
      expect(screen.queryByText('users')).not.toBeInTheDocument();
    });

    // Click expand
    if (expander) {
      fireEvent.click(expander);
    }
    await waitFor(() => {
      expect(screen.getByText('users')).toBeInTheDocument();
    });
  });
});
