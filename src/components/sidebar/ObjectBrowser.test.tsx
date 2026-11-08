import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectBrowser } from './ObjectBrowser';
import { useConnectionStore } from '../../stores/connectionStore';
import { useTabStore } from '../../stores/tabStore';
import { dbApi } from '../../api/db';
import type { ConnectionConfig, SchemaNode } from '../../types/db';
import * as tauriDialog from '@tauri-apps/plugin-dialog';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  confirm: vi.fn(),
}));

vi.mock('../../api/db', () => ({
  dbApi: {
    getConnections: vi.fn(),
    getSchemaTree: vi.fn(),
    deleteConnection: vi.fn(),
  },
}));

describe('ObjectBrowser', () => {
  const mockConnection: ConnectionConfig = {
    id: 'conn-1',
    name: 'Production SQLite',
    driver: 'sqlite',
    database: '/path/to/db.sqlite',
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
          name: 'active_users',
          node_type: 'view',
          schema: 'main',
        },
      ],
    },
  ];

  const expandToTables = async () => {
    const connNode = await screen.findByTestId('tree-node-Production SQLite');
    fireEvent.click(connNode);
    const dbNode = await screen.findByTestId('tree-node-main');
    fireEvent.click(dbNode);
    const tablesFolder = await screen.findByTestId('tree-node-Tables (2)');
    fireEvent.click(tablesFolder);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useConnectionStore.setState({
      connections: [mockConnection],
      activeConnectionId: 'conn-1',
      connectedConnectionIds: [],
      loading: false,
      error: null,
    });
    useTabStore.setState({
      tabs: [],
      activeTabId: null,
    });
    vi.mocked(dbApi.getSchemaTree).mockResolvedValue(mockSchema);
  });

  it('renders connections and does not auto-expand tree structure initially', async () => {
    render(<ObjectBrowser />);

    // Connection name should be displayed
    expect(await screen.findByText('Production SQLite')).toBeInTheDocument();

    // Tree structure should remain collapsed initially (not auto-expanded)
    expect(screen.queryByText('main')).not.toBeInTheDocument();
    expect(screen.queryByText('users')).not.toBeInTheDocument();

    // Clicking connection expands database
    const connNode = screen.getByTestId('tree-node-Production SQLite');
    fireEvent.click(connNode);
    expect(await screen.findByText('main')).toBeInTheDocument();

    // Clicking database expands tables/views folders
    const dbNode = screen.getByTestId('tree-node-main');
    fireEvent.click(dbNode);
    expect(await screen.findByText('Tables (2)')).toBeInTheDocument();

    // Clicking Tables expands tables
    const tablesFolder = screen.getByTestId('tree-node-Tables (2)');
    fireEvent.click(tablesFolder);
    expect(await screen.findByText('users')).toBeInTheDocument();
    expect(screen.getByText('orders')).toBeInTheDocument();
  });

  it('opens a table tab when a table node is double-clicked', async () => {
    render(<ObjectBrowser />);
    await expandToTables();

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

  it('opens a table structure tab when Edit Structure is clicked from context menu', async () => {
    render(<ObjectBrowser />);
    await expandToTables();

    const userTableNode = await screen.findByText('users');
    fireEvent.contextMenu(userTableNode);

    const editStructureBtn = await screen.findByTestId('edit-structure-btn');
    expect(editStructureBtn).toBeInTheDocument();
    fireEvent.click(editStructureBtn);

    const tabs = useTabStore.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({
      connectionId: 'conn-1',
      type: 'table',
      title: 'users',
      tableName: 'users',
      schemaName: 'main',
      viewMode: 'structure',
    });
  });

  it('filters nodes based on search input and expands matching results', async () => {
    render(<ObjectBrowser />);
    await expandToTables();

    const filterInput = screen.getByPlaceholderText(/search|filter/i);
    fireEvent.change(filterInput, { target: { value: 'orders' } });

    expect(await screen.findByText('orders')).toBeInTheDocument();
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

  it('disconnects connection and stops auto-fetching schema when Disconnect is clicked, and reconnects on Connect', async () => {
    render(<ObjectBrowser />);

    const connElement = await screen.findByText('Production SQLite');

    // Initially disconnected: context menu shows Connect button
    fireEvent.contextMenu(connElement);
    const initialConnectBtn = await screen.findByTestId('connect-connection-btn');
    expect(initialConnectBtn).toBeInTheDocument();

    // Connect to the database
    fireEvent.click(initialConnectBtn);
    await waitFor(() => {
      expect(dbApi.getSchemaTree).toHaveBeenCalledWith('conn-1');
    });

    // Right-click connection again: should now show Disconnect button
    fireEvent.contextMenu(connElement);
    const disconnectBtn = await screen.findByTestId('disconnect-connection-btn');
    expect(disconnectBtn).toBeInTheDocument();
    fireEvent.click(disconnectBtn);

    // Active connection should be cleared
    expect(useConnectionStore.getState().activeConnectionId).toBeNull();

    // Schema calls should not be triggered again automatically
    const initialCallCount = vi.mocked(dbApi.getSchemaTree).mock.calls.length;

    // Right-click connection again - should now show "Connect" button
    fireEvent.contextMenu(connElement);
    const connectBtn = await screen.findByTestId('connect-connection-btn');
    expect(connectBtn).toBeInTheDocument();

    // Click Connect to reconnect
    fireEvent.click(connectBtn);
    await waitFor(() => {
      expect(vi.mocked(dbApi.getSchemaTree).mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  it('opens a table tab via context menu on table node', async () => {
    render(<ObjectBrowser />);
    await expandToTables();

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
    await expandToTables();

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

  it('triggers onEditConnection when Edit Connection is clicked in connection context menu', async () => {
    const handleEdit = vi.fn();
    render(<ObjectBrowser onEditConnection={handleEdit} />);

    const connElement = await screen.findByText('Production SQLite');
    fireEvent.contextMenu(connElement);

    const editBtn = await screen.findByRole('button', { name: /edit connection/i });
    fireEvent.click(editBtn);

    expect(handleEdit).toHaveBeenCalledTimes(1);
    expect(handleEdit).toHaveBeenCalledWith(mockConnection);
  });

  it('deletes connection when Delete Connection is clicked with confirmation', async () => {
    vi.mocked(tauriDialog.confirm).mockResolvedValue(true);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleteSpy = vi.fn().mockResolvedValue(undefined);
    vi.mocked(dbApi.deleteConnection).mockImplementation(deleteSpy);

    render(<ObjectBrowser />);

    const connElement = await screen.findByText('Production SQLite');
    fireEvent.contextMenu(connElement);

    const deleteBtn = await screen.findByRole('button', { name: /delete connection/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(useConnectionStore.getState().connections).toHaveLength(0);
    });
    confirmSpy.mockRestore();
  });

  it('displays error node with Edit and Retry options when schema fetch fails', async () => {
    const handleEdit = vi.fn();
    vi.mocked(dbApi.getSchemaTree).mockRejectedValueOnce(
      new Error('password authentication failed')
    );

    render(<ObjectBrowser onEditConnection={handleEdit} />);

    // Expand connection to view error node
    const connNode = await screen.findByTestId('tree-node-Production SQLite');
    fireEvent.click(connNode);

    // Error message should be rendered in the tree
    const errorNode = await screen.findByText(/password authentication failed/i);
    expect(errorNode).toBeInTheDocument();

    // Clicking Edit in the error node invokes onEditConnection
    const editBtn = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editBtn);
    expect(handleEdit).toHaveBeenCalledWith(mockConnection);

    // Clicking Retry attempts schema fetch again
    vi.mocked(dbApi.getSchemaTree).mockResolvedValueOnce(mockSchema);
    const retryBtn = screen.getByTitle(/retry loading schema/i);
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(dbApi.getSchemaTree).toHaveBeenCalledTimes(2);
    });
  });

  it('groups tables and views into Tables and Views folders', async () => {
    render(<ObjectBrowser />);

    // Expand connection and database
    fireEvent.click(await screen.findByTestId('tree-node-Production SQLite'));
    fireEvent.click(await screen.findByTestId('tree-node-main'));

    // Folders with count badges should be displayed
    expect(await screen.findByText('Tables (2)')).toBeInTheDocument();
    expect(screen.getByText('Views (1)')).toBeInTheDocument();
  });

  it('pins public schema at top and groups system schemas into System Schemas folder for Postgres', async () => {
    const postgresSchema: SchemaNode[] = [
      {
        name: 'postgres',
        node_type: 'database',
        children: [
          {
            name: 'auth',
            node_type: 'schema',
            children: [{ name: 'users', node_type: 'table', schema: 'auth' }],
          },
          {
            name: 'public',
            node_type: 'schema',
            children: [{ name: 'products', node_type: 'table', schema: 'public' }],
          },
          {
            name: 'storage',
            node_type: 'schema',
            children: [{ name: 'buckets', node_type: 'table', schema: 'storage' }],
          },
        ],
      },
    ];

    vi.mocked(dbApi.getSchemaTree).mockResolvedValueOnce(postgresSchema);
    render(<ObjectBrowser />);

    // Expand connection and postgres db
    fireEvent.click(await screen.findByTestId('tree-node-Production SQLite'));
    fireEvent.click(await screen.findByTestId('tree-node-postgres'));

    // public schema should be rendered
    expect(await screen.findByText('public')).toBeInTheDocument();
    // System schemas should be grouped
    expect(screen.getByText('System Schemas (2)')).toBeInTheDocument();
  });

  it('opens DropTableModal when Drop Table is clicked from table context menu', async () => {
    render(<ObjectBrowser />);
    await expandToTables();

    const userTableNode = await screen.findByText('users');
    fireEvent.contextMenu(userTableNode);

    const dropTableBtn = await screen.findByTestId('drop-table-btn');
    expect(dropTableBtn).toBeInTheDocument();
    fireEvent.click(dropTableBtn);

    expect(await screen.findByRole('heading', { name: /drop table/i })).toBeInTheDocument();
  });

  it('opens CrossDbCopyModal when Copy Table to Database is clicked from table context menu', async () => {
    render(<ObjectBrowser />);
    await expandToTables();

    const userTableNode = await screen.findByText('users');
    fireEvent.contextMenu(userTableNode);

    const copyBtn = await screen.findByTestId('copy-table-cross-db-btn');
    expect(copyBtn).toBeInTheDocument();
    fireEvent.click(copyBtn);

    expect(await screen.findByText('Copy Table to Database (Cross-DB Transfer)')).toBeInTheDocument();
  });

  it('opens CreateTableModal when New Table is clicked from database context menu', async () => {
    render(<ObjectBrowser />);

    // Expand connection to show database
    fireEvent.click(await screen.findByTestId('tree-node-Production SQLite'));

    const mainDbNode = await screen.findByText('main');
    fireEvent.contextMenu(mainDbNode);

    const newTableBtn = await screen.findByTestId('new-table-btn');
    expect(newTableBtn).toBeInTheDocument();
    fireEvent.click(newTableBtn);

    expect(await screen.findByRole('heading', { name: /create new table/i })).toBeInTheDocument();
  });

  describe('Database Connection Status Colors & Expander Arrow', () => {
    it('shows gray icon and arrow spacer (no chevron) when disconnected', async () => {
      render(<ObjectBrowser />);

      const connNode = await screen.findByTestId('tree-node-Production SQLite');
      const icon = connNode.querySelector('[data-testid="icon-connection"]');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute('data-status', 'disconnected');
      expect(icon?.getAttribute('class')).toContain('text-gray-400');

      // Expander arrow should NOT be visible when disconnected (arrow-spacer is shown instead)
      const arrowSpacer = connNode.querySelector('[data-testid="arrow-spacer"]');
      expect(arrowSpacer).toBeInTheDocument();
      expect(connNode.querySelector('[data-testid="chevron-right"]')).toBeNull();
      expect(connNode.querySelector('[data-testid="chevron-down"]')).toBeNull();
    });

    it('shows amber icon with pulse when connecting, with no chevron arrow', async () => {
      let resolveSchema: (value: SchemaNode[]) => void = () => {};
      const schemaPromise = new Promise<SchemaNode[]>((resolve) => {
        resolveSchema = resolve;
      });
      vi.mocked(dbApi.getSchemaTree).mockReturnValueOnce(schemaPromise);

      render(<ObjectBrowser />);

      const connNode = await screen.findByTestId('tree-node-Production SQLite');
      fireEvent.click(connNode); // Trigger connect

      await waitFor(() => {
        const freshNode = screen.getByTestId('tree-node-Production SQLite');
        const icon = freshNode.querySelector('[data-testid="icon-connection"]');
        expect(icon).toHaveAttribute('data-status', 'connecting');
        expect(icon?.getAttribute('class')).toContain('text-amber-500');
        expect(icon?.getAttribute('class')).toContain('animate-pulse');

        // Chevron should still NOT be shown while connecting
        expect(freshNode.querySelector('[data-testid="arrow-spacer"]')).toBeInTheDocument();
        expect(freshNode.querySelector('[data-testid="chevron-right"]')).toBeNull();
        expect(freshNode.querySelector('[data-testid="chevron-down"]')).toBeNull();
      });

      // Resolve schema
      resolveSchema(mockSchema);
      await waitFor(() => {
        const freshNode = screen.getByTestId('tree-node-Production SQLite');
        const icon = freshNode.querySelector('[data-testid="icon-connection"]');
        expect(icon).toHaveAttribute('data-status', 'connected');
      });
    });

    it('shows green icon and chevron arrow when connected', async () => {
      vi.mocked(dbApi.getSchemaTree).mockResolvedValueOnce(mockSchema);
      render(<ObjectBrowser />);

      const connNode = await screen.findByTestId('tree-node-Production SQLite');
      fireEvent.click(connNode); // Connect

      await waitFor(() => {
        const freshNode = screen.getByTestId('tree-node-Production SQLite');
        const icon = freshNode.querySelector('[data-testid="icon-connection"]');
        expect(icon).toHaveAttribute('data-status', 'connected');
        expect(icon?.getAttribute('class')).toContain('text-emerald-500');

        // Chevron arrow should now be shown because connection is connected
        const chevron = freshNode.querySelector('[data-testid="chevron-down"], [data-testid="chevron-right"]');
        expect(chevron).toBeInTheDocument();
        expect(freshNode.querySelector('[data-testid="arrow-spacer"]')).toBeNull();
      });
    });

    it('shows red icon and error status with no chevron arrow when connection fails', async () => {
      vi.mocked(dbApi.getSchemaTree).mockRejectedValueOnce(new Error('Connection refused'));
      render(<ObjectBrowser />);

      const connNode = await screen.findByTestId('tree-node-Production SQLite');
      fireEvent.click(connNode); // Trigger connect which fails

      await waitFor(() => {
        const freshNode = screen.getByTestId('tree-node-Production SQLite');
        const icon = freshNode.querySelector('[data-testid="icon-connection"]');
        expect(icon).toHaveAttribute('data-status', 'error');
        expect(icon?.getAttribute('class')).toContain('text-red-500');

        // Chevron arrow should NOT be shown on error
        expect(freshNode.querySelector('[data-testid="arrow-spacer"]')).toBeInTheDocument();
        expect(freshNode.querySelector('[data-testid="chevron-right"]')).toBeNull();
        expect(freshNode.querySelector('[data-testid="chevron-down"]')).toBeNull();
      });
    });
  });
});
