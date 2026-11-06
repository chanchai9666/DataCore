import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from '../../src/App';
import { useConnectionStore } from '../../src/stores/connectionStore';
import { useTabStore } from '../../src/stores/tabStore';
import type { ConnectionConfig, QueryResult, SchemaNode } from '../../src/types/db';

// Mock Tauri invoke to simulate the backend IPC layer
const savedConnections: ConnectionConfig[] = [];
let mockTables: string[] = ['users'];

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args?: Record<string, any>) => {
    switch (cmd) {
      case 'get_connections':
        return [...savedConnections];

      case 'save_connection': {
        const config = args?.config as ConnectionConfig;
        const idx = savedConnections.findIndex((c) => c.id === config.id);
        if (idx >= 0) {
          savedConnections[idx] = config;
        } else {
          savedConnections.push(config);
        }
        return;
      }

      case 'delete_connection': {
        const id = args?.connectionId || args?.connection_id;
        const idx = savedConnections.findIndex((c) => c.id === id);
        if (idx >= 0) savedConnections.splice(idx, 1);
        return;
      }

      case 'test_connection':
        return 12; // 12ms latency

      case 'open_session':
      case 'close_session':
      case 'set_autocommit':
      case 'cancel_query':
      case 'commit_transaction':
      case 'rollback_transaction':
        return;

      case 'get_schema_tree': {
        const tree: SchemaNode[] = [
          {
            name: 'main',
            node_type: 'database',
            children: mockTables.map((tbl) => ({
              name: tbl,
              node_type: 'table',
              schema: 'main',
            })),
          },
        ];
        return tree;
      }

      case 'execute_query': {
        const sql = (args?.sql || '').trim();
        if (sql.toUpperCase().startsWith('CREATE') || sql.toUpperCase().startsWith('INSERT')) {
          return {
            columns: [],
            rows: [],
            execution_time_ms: 5,
            rows_affected: 1,
          } as QueryResult;
        }

        // Default query result for SELECT
        return {
          columns: [
            { name: 'id', data_type: 'INTEGER', nullable: false },
            { name: 'name', data_type: 'TEXT', nullable: true },
          ],
          rows: [
            [{ Integer: 1 }, { Text: 'Alice' }],
            [{ Integer: 2 }, { Text: 'Bob' }],
          ],
          execution_time_ms: 10,
          rows_affected: null,
        } as QueryResult;
      }

      case 'fetch_table_data': {
        return {
          columns: [
            { name: 'id', data_type: 'INTEGER', nullable: false },
            { name: 'name', data_type: 'TEXT', nullable: true },
          ],
          rows: [
            [{ Integer: 1 }, { Text: 'Alice' }],
            [{ Integer: 2 }, { Text: 'Bob' }],
          ],
          execution_time_ms: 8,
          rows_affected: 2,
        } as QueryResult;
      }

      default:
        return null;
    }
  }),
}));

describe('E2E Workflow Test', () => {
  beforeEach(() => {
    savedConnections.length = 0;
    mockTables = ['users'];
    useConnectionStore.setState({
      connections: [],
      activeConnectionId: null,
      loading: false,
      error: null,
    });
    useTabStore.setState({
      tabs: [],
      activeTabId: null,
    });
  });

  it('completes the full user journey: connects, browses schema, executes query, and views table data', async () => {
    render(<App />);

    // 1. Initial State: TitleBar renders with "DataCore", ObjectBrowser and empty state exist
    expect(screen.getByText('DataCore')).toBeInTheDocument();
    expect(screen.getByText(/no open tabs/i)).toBeInTheDocument();

    // 2. Open ConnectionDialog and add SQLite connection
    const newConnBtn = screen.getByRole('button', { name: /\+ New Connection|New Connection/i });
    fireEvent.click(newConnBtn);

    // Dialog is visible
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('New Connection')).toBeInTheDocument();

    // Select SQLite driver tab
    const sqliteTab = screen.getByRole('tab', { name: /sqlite/i });
    fireEvent.click(sqliteTab);

    // Fill form
    const nameInput = screen.getByLabelText(/connection name/i);
    fireEvent.change(nameInput, { target: { value: 'My SQLite DB' } });

    const pathInput = screen.getByLabelText(/database path/i);
    fireEvent.change(pathInput, { target: { value: '/tmp/test.db' } });

    // Save connection
    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    fireEvent.click(saveBtn);

    // Dialog closes
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Connection appears in Object Browser
    const connNode = await screen.findByTestId('tree-node-My SQLite DB');
    expect(connNode).toBeInTheDocument();

    // 3. Open a Query tab via the + button in tab bar
    const addTabBtn = screen.getByTestId('add-query-tab-btn');
    fireEvent.click(addTabBtn);

    // Verify Query tab is opened
    expect(await screen.findByText(/Query/i)).toBeInTheDocument();
    const queryTab = useTabStore.getState().tabs.find((t) => t.type === 'query')!;

    // 3a. Execute DDL query: CREATE TABLE
    await act(async () => {
      useTabStore
        .getState()
        .setQueryContent(
          queryTab.id,
          'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);'
        );
    });
    const runBtn = screen.getByRole('button', { name: /run/i });
    fireEvent.click(runBtn);

    // Verify DDL execution metric displayed
    expect(await screen.findByText(/1 affected/i)).toBeInTheDocument();

    // 3b. Execute DML query: SELECT
    await act(async () => {
      useTabStore
        .getState()
        .setQueryContent(queryTab.id, 'SELECT id, name FROM users;');
    });
    fireEvent.click(runBtn);

    // Verify DataGrid displays columns and rows from query result
    const rowCounts = await screen.findAllByText(/2 rows/i);
    expect(rowCounts.length).toBeGreaterThan(0);
    expect(screen.getByTestId('data-grid-container')).toBeInTheDocument();

    // Verify draggable vertical split resizer between editor and grid
    const splitResizer = screen.getByTestId('split-resizer');
    expect(splitResizer).toBeInTheDocument();
    fireEvent.mouseDown(splitResizer, { clientY: 200 });
    fireEvent.mouseMove(window, { clientY: 250 });
    fireEvent.mouseUp(window);

    // 4. Open Table tab via Object Browser
    // Double-click "users" table node to open table tab
    const usersTableNode = await screen.findByTestId('tree-node-users');
    fireEvent.doubleClick(usersTableNode);

    // Verify Table tab is opened and active
    await waitFor(() => {
      const tabs = screen.getAllByRole('tab');
      expect(tabs.some((t) => t.textContent?.includes('users'))).toBe(true);
    });

    // Verify DataGrid is displayed for table data
    expect(screen.getByTestId('data-grid-container')).toBeInTheDocument();
  });
});
