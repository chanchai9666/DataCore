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
    deleteConnection: vi.fn(),
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

  it('opens a table structure tab when Edit Structure is clicked from context menu', async () => {
    render(<ObjectBrowser />);

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
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleteSpy = vi.fn().mockResolvedValue(undefined);
    vi.mocked(dbApi.deleteConnection).mockImplementation(deleteSpy);

    render(<ObjectBrowser />);

    const connElement = await screen.findByText('Production SQLite');
    fireEvent.contextMenu(connElement);

    const deleteBtn = await screen.findByRole('button', { name: /delete connection/i });
    fireEvent.click(deleteBtn);

    expect(confirmSpy).toHaveBeenCalled();
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
      expect(screen.getByText('users')).toBeInTheDocument();
    });
  });

  it('groups tables and views into Tables and Views folders', async () => {
    render(<ObjectBrowser />);

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

    // public schema should be rendered
    expect(await screen.findByText('public')).toBeInTheDocument();
    // System schemas should be grouped
    expect(screen.getByText('System Schemas (2)')).toBeInTheDocument();
  });

  it('opens DropTableModal when Drop Table is clicked from table context menu', async () => {
    render(<ObjectBrowser />);

    const userTableNode = await screen.findByText('users');
    fireEvent.contextMenu(userTableNode);

    const dropTableBtn = await screen.findByTestId('drop-table-btn');
    expect(dropTableBtn).toBeInTheDocument();
    fireEvent.click(dropTableBtn);

    expect(await screen.findByRole('heading', { name: /drop table/i })).toBeInTheDocument();
  });

  it('opens CreateTableModal when New Table is clicked from database context menu', async () => {
    render(<ObjectBrowser />);

    const mainDbNode = await screen.findByText('main');
    fireEvent.contextMenu(mainDbNode);

    const newTableBtn = await screen.findByTestId('new-table-btn');
    expect(newTableBtn).toBeInTheDocument();
    fireEvent.click(newTableBtn);

    expect(await screen.findByRole('heading', { name: /create new table/i })).toBeInTheDocument();
  });
});
