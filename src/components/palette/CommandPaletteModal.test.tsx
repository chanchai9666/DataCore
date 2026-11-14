import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  CommandPaletteModal,
  extractTablesAndViews,
  detectIsMac,
  type TableItem,
} from './CommandPaletteModal';
import { useConnectionStore } from '../../stores/connectionStore';
import { useTabStore } from '../../stores/tabStore';
import { dbApi } from '../../api/db';
import type { SchemaNode, ConnectionConfig } from '../../types/db';

vi.mock('../../api/db', () => ({
  dbApi: {
    getSchemaTree: vi.fn().mockResolvedValue([]),
    getConnections: vi.fn().mockResolvedValue([]),
  },
}));

const mockConnections: ConnectionConfig[] = [
  {
    id: 'conn-1',
    name: 'Production PostgreSQL',
    driver: 'postgres',
    database: 'prod_db',
    host: 'db.prod.internal',
  },
  {
    id: 'conn-2',
    name: 'Local SQLite',
    driver: 'sqlite',
    database: '/path/to/local.db',
  },
];

const mockTables: TableItem[] = [
  { name: 'users', type: 'table', schemaName: 'public' },
  { name: 'orders', type: 'table', schemaName: 'public' },
  { name: 'v_active_users', type: 'view', schemaName: 'public' },
];

describe('extractTablesAndViews utility', () => {
  it('extracts tables and views recursively across schemas and databases', () => {
    const tree: SchemaNode[] = [
      {
        name: 'postgres',
        node_type: 'database',
        children: [
          {
            name: 'public',
            node_type: 'schema',
            children: [
              { name: 'users', node_type: 'table' },
              { name: 'orders', node_type: 'table' },
              { name: 'active_orders', node_type: 'view' },
            ],
          },
          {
            name: 'analytics',
            node_type: 'schema',
            children: [{ name: 'daily_metrics', node_type: 'table' }],
          },
        ],
      },
    ];

    const results = extractTablesAndViews(tree);
    expect(results).toHaveLength(4);
    expect(results).toEqual([
      { name: 'users', type: 'table', schemaName: 'public' },
      { name: 'orders', type: 'table', schemaName: 'public' },
      { name: 'active_orders', type: 'view', schemaName: 'public' },
      { name: 'daily_metrics', type: 'table', schemaName: 'analytics' },
    ]);
  });

  it('handles empty or invalid tree nodes gracefully', () => {
    expect(extractTablesAndViews([])).toEqual([]);
    expect(extractTablesAndViews(null as unknown as SchemaNode[])).toEqual([]);
  });
});

describe('detectIsMac utility', () => {
  it('respects platform override', () => {
    expect(detectIsMac('mac')).toBe(true);
    expect(detectIsMac('windows')).toBe(false);
  });
});

describe('CommandPaletteModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConnectionStore.setState({
      connections: mockConnections,
      activeConnectionId: 'conn-1',
    });
    useTabStore.setState({
      tabs: [],
      activeTabId: null,
    });
  });

  it('does not render modal dialog when isOpen is false', () => {
    render(
      <CommandPaletteModal
        isOpen={false}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByTestId('command-palette-modal')).not.toBeInTheDocument();
  });

  it('renders modal with search input, quick filters, and categories when isOpen is true', () => {
    render(
      <CommandPaletteModal
        isOpen={true}
        onClose={vi.fn()}
        initialTables={mockTables}
        platform="mac"
      />
    );

    expect(screen.getByTestId('command-palette-modal')).toBeInTheDocument();
    expect(screen.getByTestId('command-palette-input')).toBeInTheDocument();
    expect(screen.getByTestId('filter-pill-all')).toBeInTheDocument();
    expect(screen.getByTestId('filter-pill-actions')).toBeInTheDocument();
    expect(screen.getByTestId('filter-pill-tables')).toBeInTheDocument();
    expect(screen.getByTestId('filter-pill-connections')).toBeInTheDocument();

    // Verify category sections
    expect(screen.getByTestId('palette-category-Actions')).toBeInTheDocument();
    expect(screen.getByTestId('palette-category-Tables & Views')).toBeInTheDocument();
    expect(screen.getByTestId('palette-category-Connections')).toBeInTheDocument();
  });

  it('renders platform-specific keyboard badges for Mac (⌘) and Windows (Ctrl)', () => {
    const { rerender } = render(
      <CommandPaletteModal
        isOpen={true}
        onClose={vi.fn()}
        initialTables={mockTables}
        platform="mac"
      />
    );

    const macCmdBadges = screen.getAllByText('⌘');
    expect(macCmdBadges.length).toBeGreaterThan(0);

    rerender(
      <CommandPaletteModal
        isOpen={true}
        onClose={vi.fn()}
        initialTables={mockTables}
        platform="windows"
      />
    );

    const winCtrlBadges = screen.getAllByText('Ctrl');
    expect(winCtrlBadges.length).toBeGreaterThan(0);
  });

  it('filters actions, tables, and connections when searching text', () => {
    render(
      <CommandPaletteModal
        isOpen={true}
        onClose={vi.fn()}
        initialTables={mockTables}
      />
    );

    const input = screen.getByTestId('command-palette-input');

    // Search for "users" -> matches table "users" and "v_active_users", and action "User & Privilege Manager"
    fireEvent.change(input, { target: { value: 'users' } });

    expect(screen.getByText('public.users')).toBeInTheDocument();
    expect(screen.getByText('public.v_active_users')).toBeInTheDocument();
    expect(screen.getByText('User & Privilege Manager')).toBeInTheDocument();

    // Non-matching actions should not appear
    expect(screen.queryByText('New Database Connection')).not.toBeInTheDocument();
  });

  it('filters by category using prefix commands (> for Actions, @ for Tables, / for Connections)', () => {
    render(
      <CommandPaletteModal
        isOpen={true}
        onClose={vi.fn()}
        initialTables={mockTables}
      />
    );

    const input = screen.getByTestId('command-palette-input');

    // Prefix ">" should only show Actions
    fireEvent.change(input, { target: { value: '> query' } });
    expect(screen.getByText('New SQL Query Tab')).toBeInTheDocument();
    expect(screen.queryByTestId('palette-category-Tables & Views')).not.toBeInTheDocument();
    expect(screen.queryByTestId('palette-category-Connections')).not.toBeInTheDocument();

    // Prefix "@" should only show Tables & Views
    fireEvent.change(input, { target: { value: '@ orders' } });
    expect(screen.getByText('public.orders')).toBeInTheDocument();
    expect(screen.queryByTestId('palette-category-Actions')).not.toBeInTheDocument();

    // Prefix "/" should only show Connections
    fireEvent.change(input, { target: { value: '/ SQLite' } });
    expect(screen.getByText('Local SQLite')).toBeInTheDocument();
    expect(screen.queryByTestId('palette-category-Actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('palette-category-Tables & Views')).not.toBeInTheDocument();
  });

  it('sets filter prefix when clicking category filter pills', () => {
    render(
      <CommandPaletteModal
        isOpen={true}
        onClose={vi.fn()}
        initialTables={mockTables}
      />
    );

    const tablesPill = screen.getByTestId('filter-pill-tables');
    fireEvent.click(tablesPill);

    const input = screen.getByTestId('command-palette-input') as HTMLInputElement;
    expect(input.value).toBe('@ ');
    expect(screen.getByTestId('palette-category-Tables & Views')).toBeInTheDocument();
    expect(screen.queryByTestId('palette-category-Actions')).not.toBeInTheDocument();

    const allPill = screen.getByTestId('filter-pill-all');
    fireEvent.click(allPill);
    expect(input.value).toBe('');
    expect(screen.getByTestId('palette-category-Actions')).toBeInTheDocument();
  });

  it('displays empty state when search produces no matching items', () => {
    render(
      <CommandPaletteModal
        isOpen={true}
        onClose={vi.fn()}
        initialTables={mockTables}
      />
    );

    const input = screen.getByTestId('command-palette-input');
    fireEvent.change(input, { target: { value: 'nonexistent-query-item-xyz123' } });

    expect(screen.getByTestId('command-palette-empty')).toBeInTheDocument();
    expect(screen.getByText(/no matching commands or tables found/i)).toBeInTheDocument();

    // Clicking clear button resets query
    const clearBtn = screen.getByTestId('command-palette-clear-btn');
    fireEvent.click(clearBtn);

    expect(screen.queryByTestId('command-palette-empty')).not.toBeInTheDocument();
  });

  it('navigates with ArrowDown and ArrowUp and selects item with Enter', () => {
    const onNewConnection = vi.fn();
    const onClose = vi.fn();

    render(
      <CommandPaletteModal
        isOpen={true}
        onClose={onClose}
        onNewConnection={onNewConnection}
        initialTables={mockTables}
      />
    );

    const modal = screen.getByTestId('command-palette-modal');

    // Default first item (New SQL Query Tab) is selected
    const queryTabItem = screen.getByTestId('palette-item-action-new-query');
    expect(queryTabItem).toHaveAttribute('aria-selected', 'true');

    // Arrow down moves to New Database Connection
    fireEvent.keyDown(modal, { key: 'ArrowDown' });
    const newConnItem = screen.getByTestId('palette-item-action-new-connection');
    expect(newConnItem).toHaveAttribute('aria-selected', 'true');

    // Press Enter executes selected item
    fireEvent.keyDown(modal, { key: 'Enter' });
    expect(onNewConnection).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes modal when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(
      <CommandPaletteModal
        isOpen={true}
        onClose={onClose}
      />
    );

    const modal = screen.getByTestId('command-palette-modal');
    fireEvent.keyDown(modal, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('executes action callback when clicking on an item', () => {
    const onToggleTheme = vi.fn();
    const onClose = vi.fn();

    render(
      <CommandPaletteModal
        isOpen={true}
        onClose={onClose}
        onToggleTheme={onToggleTheme}
      />
    );

    const themeItem = screen.getByTestId('palette-item-action-toggle-theme');
    fireEvent.click(themeItem);

    expect(onToggleTheme).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('invokes onOpenTable when selecting a table item', () => {
    const onOpenTable = vi.fn();
    const onClose = vi.fn();

    render(
      <CommandPaletteModal
        isOpen={true}
        onClose={onClose}
        onOpenTable={onOpenTable}
        initialTables={mockTables}
      />
    );

    const tableItem = screen.getByTestId('palette-item-table-public-users');
    fireEvent.click(tableItem);

    expect(onOpenTable).toHaveBeenCalledWith('users', 'public');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('invokes onSelectConnection when selecting a connection item', () => {
    const onSelectConnection = vi.fn();
    const onClose = vi.fn();

    render(
      <CommandPaletteModal
        isOpen={true}
        onClose={onClose}
        onSelectConnection={onSelectConnection}
      />
    );

    const connItem = screen.getByTestId('palette-item-conn-conn-2');
    fireEvent.click(connItem);

    expect(onSelectConnection).toHaveBeenCalledWith('conn-2');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fetches schema tree from dbApi if initialTables not provided', async () => {
    const schemaNodes: SchemaNode[] = [
      {
        name: 'test_db',
        node_type: 'database',
        children: [{ name: 'products', node_type: 'table' }],
      },
    ];

    vi.mocked(dbApi.getSchemaTree).mockResolvedValueOnce(schemaNodes);

    render(
      <CommandPaletteModal
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(dbApi.getSchemaTree).toHaveBeenCalledWith('conn-1');
      expect(screen.getByText('products')).toBeInTheDocument();
    });
  });
});
