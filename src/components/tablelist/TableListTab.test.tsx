import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  TableListTab,
  formatBytes,
  formatApproxRows,
  getTablePrefix,
  groupTablesByPrefix,
  getTableHealthStatus,
} from './TableListTab';
import { dbApi } from '../../api/db';
import * as tabHelpers from '../sidebar/tabHelpers';
import { showConfirmDialog } from '../../utils/dialog';
import { useTableListCacheStore } from '../../stores/tableListCacheStore';

vi.mock('../../api/db', () => ({
  dbApi: {
    getTableListMetadata: vi.fn(),
    getObjectDdl: vi.fn(),
    executeDirectQuery: vi.fn(),
  },
}));

vi.mock('../../utils/dialog', () => ({
  showConfirmDialog: vi.fn(),
}));

vi.mock('../sidebar/tabHelpers', () => ({
  openTableTab: vi.fn(),
  openQueryTab: vi.fn(),
  openQueryBuilderTab: vi.fn(),
}));

describe('TableListTab formatting helpers', () => {
  it('formats bytes properly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-10)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(1073741824)).toBe('1.0 GB');
  });

  it('formats approx row count properly', () => {
    expect(formatApproxRows(-1)).toBe('-');
    expect(formatApproxRows(0)).toBe('~0');
    expect(formatApproxRows(42)).toBe('~42');
    expect(formatApproxRows(1500)).toBe('~1.5K');
    expect(formatApproxRows(2500000)).toBe('~2.5M');
  });
});

describe('TableListTab component', () => {
  const mockTables = [
    {
      name: 'users',
      approxRowCount: 1200,
      dataSizeBytes: 10240,
      indexSizeBytes: 2048,
      totalSizeBytes: 12288,
      engine: 'InnoDB',
      collation: 'utf8mb4_unicode_ci',
    },
    {
      name: 'orders',
      approxRowCount: 50000,
      dataSizeBytes: 204800,
      indexSizeBytes: 40960,
      totalSizeBytes: 245760,
      engine: 'InnoDB',
      collation: 'utf8mb4_unicode_ci',
    },
    {
      name: 'categories',
      approxRowCount: 25,
      dataSizeBytes: 2048,
      indexSizeBytes: 1024,
      totalSizeBytes: 3072,
      engine: 'MyISAM',
      collation: 'utf8mb4_general_ci',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem('datacore-table-list-view-mode');
    localStorage.removeItem('datacore-table-list-group-in-list');
    useTableListCacheStore.getState().clearCache();
    (dbApi.getTableListMetadata as any).mockResolvedValue(mockTables);
  });

  it('renders table list and metadata rows', async () => {
    render(
      <TableListTab
        connectionId="conn-1"
        schemaName="public"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('users')).toBeInTheDocument();
      expect(screen.getByText('orders')).toBeInTheDocument();
      expect(screen.getByText('categories')).toBeInTheDocument();
    });

    expect(screen.getByText('~1.2K')).toBeInTheDocument();
    expect(screen.getByText('~50.0K')).toBeInTheDocument();
    expect(screen.getByText('~25')).toBeInTheDocument();
    expect(screen.getByText('3 tables')).toBeInTheDocument();
  });

  it('filters tables by search query', async () => {
    render(
      <TableListTab
        connectionId="conn-1"
        schemaName="public"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('users')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search tables...');
    fireEvent.change(searchInput, { target: { value: 'ord' } });

    expect(screen.getByText('orders')).toBeInTheDocument();
    expect(screen.queryByText('users')).not.toBeInTheDocument();
    expect(screen.queryByText('categories')).not.toBeInTheDocument();
    expect(screen.getByText('1 table')).toBeInTheDocument();
  });

  it('calls openTableTab on double click', async () => {
    render(
      <TableListTab
        connectionId="conn-1"
        schemaName="public"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('users')).toBeInTheDocument();
    });

    const usersRow = screen.getByText('users').closest('tr');
    expect(usersRow).not.toBeNull();
    fireEvent.doubleClick(usersRow!);

    expect(tabHelpers.openTableTab).toHaveBeenCalledWith({
      connectionId: 'conn-1',
      tableName: 'users',
      schemaName: 'public',
      viewMode: 'data',
    });
  });

  it('triggers onDuplicateTable when duplicate button is clicked', async () => {
    const onDuplicateTable = vi.fn();
    render(
      <TableListTab
        connectionId="conn-1"
        schemaName="public"
        onDuplicateTable={onDuplicateTable}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('users')).toBeInTheDocument();
    });

    const duplicateButtons = screen.getAllByTitle('Duplicate Table');
    fireEvent.click(duplicateButtons[0]);

    expect(onDuplicateTable).toHaveBeenCalledWith('categories'); // Sorted alphabetically by default
  });

  it('refetches tables when refresh button is clicked', async () => {
    render(
      <TableListTab
        connectionId="conn-1"
        schemaName="public"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('users')).toBeInTheDocument();
    });

    const refreshBtn = screen.getByTitle('Refresh tables metadata');
    fireEvent.click(refreshBtn);

    expect(dbApi.getTableListMetadata).toHaveBeenCalledTimes(2);
  });

  it('opens context menu on table row right click and triggers actions', async () => {
    const onOpenTable = vi.fn();
    const onOpenStructure = vi.fn();
    const onDuplicateTable = vi.fn();
    const onCopyTableToDb = vi.fn();
    const onImportSql = vi.fn();
    const onImportData = vi.fn();

    render(
      <TableListTab
        connectionId="conn-1"
        schemaName="public"
        onOpenTable={onOpenTable}
        onOpenStructure={onOpenStructure}
        onDuplicateTable={onDuplicateTable}
        onCopyTableToDb={onCopyTableToDb}
        onImportSql={onImportSql}
        onImportData={onImportData}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('users')).toBeInTheDocument();
    });

    const usersRow = screen.getByText('users').closest('tr');
    expect(usersRow).not.toBeNull();

    // Right click
    fireEvent.contextMenu(usersRow!, { clientX: 200, clientY: 300 });

    const menu = screen.getByTestId('table-list-context-menu');
    expect(menu).toBeInTheDocument();

    // Verify menu items
    expect(screen.getByTestId('ctx-open-table')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-design-table')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-duplicate-table')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-copy-to-db')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-export-sql')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-export-data')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-import-sql')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-import-data')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-query-table')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-query-builder')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-view-ddl')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-copy-name')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-rename-table')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-maintenance-table')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-drop-table')).toBeInTheDocument();

    // Click Open Table Data
    fireEvent.click(screen.getByTestId('ctx-open-table'));
    expect(onOpenTable).toHaveBeenCalledWith('users');
    expect(screen.queryByTestId('table-list-context-menu')).not.toBeInTheDocument();

    // Reopen menu and test Design Table Structure
    fireEvent.contextMenu(usersRow!, { clientX: 200, clientY: 300 });
    fireEvent.click(screen.getByTestId('ctx-design-table'));
    expect(onOpenStructure).toHaveBeenCalledWith('users');

    // Reopen menu and test Duplicate
    fireEvent.contextMenu(usersRow!, { clientX: 200, clientY: 300 });
    fireEvent.click(screen.getByTestId('ctx-duplicate-table'));
    expect(onDuplicateTable).toHaveBeenCalledWith('users');

    // Reopen menu and test Copy Table to DB
    fireEvent.contextMenu(usersRow!, { clientX: 200, clientY: 300 });
    fireEvent.click(screen.getByTestId('ctx-copy-to-db'));
    expect(onCopyTableToDb).toHaveBeenCalledWith('users');

    // Reopen menu and test Import as SQL Dump
    fireEvent.contextMenu(usersRow!, { clientX: 200, clientY: 300 });
    fireEvent.click(screen.getByTestId('ctx-import-sql'));
    expect(onImportSql).toHaveBeenCalledWith('users');

    // Reopen menu and test Import Table Data
    fireEvent.contextMenu(usersRow!, { clientX: 200, clientY: 300 });
    fireEvent.click(screen.getByTestId('ctx-import-data'));
    expect(onImportData).toHaveBeenCalledWith('users');
  });

  it('closes context menu when Escape is pressed', async () => {
    render(
      <TableListTab
        connectionId="conn-1"
        schemaName="public"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('users')).toBeInTheDocument();
    });

    const usersRow = screen.getByText('users').closest('tr');
    fireEvent.contextMenu(usersRow!, { clientX: 200, clientY: 300 });
    expect(screen.getByTestId('table-list-context-menu')).toBeInTheDocument();

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('table-list-context-menu')).not.toBeInTheDocument();
  });

  it('opens CrossDbCopyModal when Copy Table to Database is clicked and no custom handler is provided', async () => {
    render(
      <TableListTab
        connectionId="conn-1"
        schemaName="public"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('users')).toBeInTheDocument();
    });

    const usersRow = screen.getByText('users').closest('tr');
    fireEvent.contextMenu(usersRow!, { clientX: 200, clientY: 300 });
    fireEvent.click(screen.getByTestId('ctx-copy-to-db'));

    expect(await screen.findByText('Copy Table to Database (Cross-DB Transfer)')).toBeInTheDocument();
  });

  it('opens RenameTableModal when Rename Table is clicked in context menu', async () => {
    render(
      <TableListTab
        connectionId="conn-1"
        schemaName="public"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('users')).toBeInTheDocument();
    });

    const usersRow = screen.getByText('users').closest('tr');
    fireEvent.contextMenu(usersRow!, { clientX: 200, clientY: 300 });
    fireEvent.click(screen.getByTestId('ctx-rename-table'));

    expect(await screen.findByRole('heading', { name: /rename table/i })).toBeInTheDocument();
  });

  it('opens TableMaintenanceModal when Table Maintenance is clicked in context menu', async () => {
    render(
      <TableListTab
        connectionId="conn-1"
        schemaName="public"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('users')).toBeInTheDocument();
    });

    const usersRow = screen.getByText('users').closest('tr');
    fireEvent.contextMenu(usersRow!, { clientX: 200, clientY: 300 });
    fireEvent.click(screen.getByTestId('ctx-maintenance-table'));

    expect(
      await screen.findByRole('heading', { name: /Table Maintenance & Diagnostics/i })
    ).toBeInTheDocument();
  });

  it('positions context menu at cursor coordinates immediately without flashing at 0,0', async () => {
    render(
      <TableListTab
        connectionId="conn-1"
        schemaName="public"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('users')).toBeInTheDocument();
    });

    const usersRow = screen.getByText('users').closest('tr');
    fireEvent.contextMenu(usersRow!, { clientX: 250, clientY: 360 });

    const menu = screen.getByTestId('table-list-context-menu');
    expect(menu.style.left).toBe('250px');
    expect(menu.style.top).toBe('360px');
  });

  it('supports multi-select with Cmd/Ctrl+Click, Shift+Click, and keyboard shortcuts', async () => {
    const onOpenTable = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <TableListTab
        connectionId="conn-1"
        schemaName="public"
        onOpenTable={onOpenTable}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('users')).toBeInTheDocument();
    });

    const categoriesRow = screen.getByText('categories').closest('tr')!;
    const ordersRow = screen.getByText('orders').closest('tr')!;
    const usersRow = screen.getByText('users').closest('tr')!;
    const container = screen.getByTestId('table-list-container');

    // Single click selects categories
    fireEvent.click(categoriesRow);
    expect(categoriesRow).toHaveAttribute('aria-selected', 'true');

    // Shift+Click on users selects categories, orders, users
    fireEvent.click(usersRow, { shiftKey: true });
    expect(screen.getByTestId('table-list-selected-badge')).toHaveTextContent('3 selected');
    expect(ordersRow).toHaveAttribute('aria-selected', 'true');

    // Cmd+C copies all 3 selected table names
    fireEvent.keyDown(container, { key: 'c', metaKey: true });
    expect(writeText).toHaveBeenCalledWith('categories\norders\nusers');

    // Enter opens all 3 selected tables
    fireEvent.keyDown(container, { key: 'Enter' });
    expect(onOpenTable).toHaveBeenCalledTimes(3);

    // Escape clears selection
    fireEvent.keyDown(container, { key: 'Escape' });
    expect(screen.queryByTestId('table-list-selected-badge')).not.toBeInTheDocument();

    // Cmd+A selects all tables
    fireEvent.keyDown(container, { key: 'a', metaKey: true });
    expect(screen.getByTestId('table-list-selected-badge')).toHaveTextContent('3 selected');
  });

  it('triggers Query Table, Visual Query Builder, and View DDL from context menu', async () => {
    (dbApi.getObjectDdl as any).mockResolvedValue('CREATE TABLE users (id INT);');

    render(
      <TableListTab
        connectionId="conn-1"
        schemaName="public"
        driver="postgres"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('users')).toBeInTheDocument();
    });

    const usersRow = screen.getByText('users').closest('tr')!;

    // Query Table
    fireEvent.contextMenu(usersRow, { clientX: 200, clientY: 300 });
    fireEvent.click(screen.getByTestId('ctx-query-table'));
    expect(tabHelpers.openQueryTab).toHaveBeenCalledWith({
      connectionId: 'conn-1',
      connectionName: 'users',
      schemaName: 'public',
      tableName: 'users',
      driver: 'postgres',
    });

    // Visual Query Builder
    fireEvent.contextMenu(usersRow, { clientX: 200, clientY: 300 });
    fireEvent.click(screen.getByTestId('ctx-query-builder'));
    expect(tabHelpers.openQueryBuilderTab).toHaveBeenCalledWith({
      connectionId: 'conn-1',
      tableName: 'users',
      schemaName: 'public',
    });

    // View DDL / Source
    fireEvent.contextMenu(usersRow, { clientX: 200, clientY: 300 });
    fireEvent.click(screen.getByTestId('ctx-view-ddl'));
    await waitFor(() => {
      expect(dbApi.getObjectDdl).toHaveBeenCalledWith('conn-1', 'public', 'users', 'table');
      expect(tabHelpers.openQueryTab).toHaveBeenCalledWith({
        connectionId: 'conn-1',
        connectionName: 'users',
        schemaName: 'public',
        tableName: 'users',
        driver: 'postgres',
        initialQuery: 'CREATE TABLE users (id INT);',
      });
    });
  });

  it('provides full batch actions in context menu when multiple tables are selected', async () => {
    (dbApi.getObjectDdl as any).mockImplementation((_connId: string, _schema: string, name: string) =>
      Promise.resolve(`CREATE TABLE ${name} (id INT);`)
    );
    (dbApi.executeDirectQuery as any).mockResolvedValue({ rows: [], columns: [] });
    (showConfirmDialog as any).mockResolvedValue(true);

    render(
      <TableListTab
        connectionId="conn-1"
        schemaName="public"
        driver="postgres"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('users')).toBeInTheDocument();
    });

    const categoriesRow = screen.getByText('categories').closest('tr')!;
    const ordersRow = screen.getByText('orders').closest('tr')!;
    fireEvent.click(categoriesRow);
    fireEvent.click(ordersRow, { metaKey: true });

    fireEvent.contextMenu(ordersRow, { clientX: 200, clientY: 300 });

    expect(screen.getByTestId('ctx-open-selected-tables')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-design-selected-tables')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-export-selected-sql')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-import-sql')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-query-selected-tables')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-query-builder')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-view-selected-ddl')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-copy-selected-names')).toBeInTheDocument();
    expect(screen.getByTestId('ctx-drop-selected-tables')).toBeInTheDocument();

    // Edit Structure for multiple tables
    fireEvent.click(screen.getByTestId('ctx-design-selected-tables'));
    expect(tabHelpers.openTableTab).toHaveBeenCalledWith({
      connectionId: 'conn-1',
      tableName: 'categories',
      schemaName: 'public',
      viewMode: 'structure',
    });
    expect(tabHelpers.openTableTab).toHaveBeenCalledWith({
      connectionId: 'conn-1',
      tableName: 'orders',
      schemaName: 'public',
      viewMode: 'structure',
    });

    // Query multiple tables
    fireEvent.contextMenu(ordersRow, { clientX: 200, clientY: 300 });
    fireEvent.click(screen.getByTestId('ctx-query-selected-tables'));
    expect(tabHelpers.openQueryTab).toHaveBeenCalledWith(expect.objectContaining({
      connectionId: 'conn-1',
      initialQuery: 'SELECT * FROM "public"."categories" LIMIT 100;\nSELECT * FROM "public"."orders" LIMIT 100;\n',
    }));

    // View DDL for multiple tables
    fireEvent.contextMenu(ordersRow, { clientX: 200, clientY: 300 });
    fireEvent.click(screen.getByTestId('ctx-view-selected-ddl'));
    await waitFor(() => {
      expect(tabHelpers.openQueryTab).toHaveBeenCalledWith(expect.objectContaining({
        initialQuery: 'CREATE TABLE categories (id INT);\n\nCREATE TABLE orders (id INT);',
      }));
    });

    // Drop multiple tables
    fireEvent.contextMenu(ordersRow, { clientX: 200, clientY: 300 });
    fireEvent.click(screen.getByTestId('ctx-drop-selected-tables'));
    await waitFor(() => {
      expect(showConfirmDialog).toHaveBeenCalled();
      expect(dbApi.executeDirectQuery).toHaveBeenCalledWith('conn-1', 'DROP TABLE "public"."categories";');
      expect(dbApi.executeDirectQuery).toHaveBeenCalledWith('conn-1', 'DROP TABLE "public"."orders";');
    });
  });

  it('uses cached table metadata when remounted without auto-reloading, and refreshes on right-click Refresh Tables', async () => {
    const { unmount } = render(
      <TableListTab
        connectionId="conn-1"
        schemaName="public"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('users')).toBeInTheDocument();
    });
    expect(dbApi.getTableListMetadata).toHaveBeenCalledTimes(1);

    // Unmount and remount (simulating switching away from tab and switching back)
    unmount();
    render(
      <TableListTab
        connectionId="conn-1"
        schemaName="public"
      />
    );

    expect(screen.getByText('users')).toBeInTheDocument();
    expect(dbApi.getTableListMetadata).toHaveBeenCalledTimes(1);

    // Right-click empty background area -> Refresh Tables
    const scrollArea = screen.getByTestId('table-list-container').querySelector('.overflow-auto')!;
    fireEvent.contextMenu(scrollArea, { clientX: 120, clientY: 180 });
    fireEvent.click(screen.getByTestId('ctx-refresh-tables'));

    await waitFor(() => {
      expect(dbApi.getTableListMetadata).toHaveBeenCalledTimes(2);
    });

    // Right-click a table row -> Refresh Tables
    const usersRow = screen.getByText('users').closest('tr')!;
    fireEvent.contextMenu(usersRow, { clientX: 200, clientY: 300 });
    fireEvent.click(screen.getByTestId('ctx-refresh-tables'));

    await waitFor(() => {
      expect(dbApi.getTableListMetadata).toHaveBeenCalledTimes(3);
    });
  });

  it('computes table prefixes, prefix groups, and health statuses accurately', () => {
    expect(getTablePrefix('sale_orders')).toBe('sale');
    expect(getTablePrefix('users')).toBe('');
    expect(getTablePrefix('_internal')).toBe('');

    const sample = [
      { name: 'sale_orders', approxRowCount: 100, dataSizeBytes: 8192, indexSizeBytes: 2048, totalSizeBytes: 10240 },
      { name: 'sale_items', approxRowCount: 500, dataSizeBytes: 16384, indexSizeBytes: 4096, totalSizeBytes: 20480 },
      { name: 'audit_logs', approxRowCount: 0, dataSizeBytes: 4096, indexSizeBytes: 0, totalSizeBytes: 4096 },
      { name: 'users', approxRowCount: 50, dataSizeBytes: 2048, indexSizeBytes: 8192, totalSizeBytes: 10240 },
    ];

    const groups = groupTablesByPrefix(sample);
    expect(groups).toHaveLength(2);
    expect(groups[0].key).toBe('sale');
    expect(groups[0].tables.map((t) => t.name)).toEqual(['sale_orders', 'sale_items']);
    expect(groups[1].key).toBe('__other__');
    expect(groups[1].tables.map((t) => t.name)).toEqual(['audit_logs', 'users']);

    expect(getTableHealthStatus(sample[0])).toBe('healthy');
    expect(getTableHealthStatus(sample[2])).toBe('needs_analyze');
    expect(getTableHealthStatus(sample[3])).toBe('index_heavy');
  });

  it('switches to Card / Grid view, persists view mode, and supports card interactions', async () => {
    const onOpenTable = vi.fn();
    render(
      <TableListTab
        connectionId="conn-1"
        schemaName="public"
        onOpenTable={onOpenTable}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('users')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('view-mode-grid'));
    expect(screen.getByTestId('table-list-grid-view')).toBeInTheDocument();
    expect(localStorage.getItem('datacore-table-list-view-mode')).toBe('grid');

    const usersCard = screen.getByTestId('table-card-users');
    fireEvent.click(usersCard);
    expect(usersCard).toHaveAttribute('aria-selected', 'true');

    fireEvent.doubleClick(usersCard);
    expect(onOpenTable).toHaveBeenCalledWith('users');

    fireEvent.contextMenu(usersCard, { clientX: 150, clientY: 220 });
    expect(screen.getByTestId('table-list-context-menu')).toBeInTheDocument();
  });

  it('switches to Grouped by Prefix Masonry Board view and supports board item interactions', async () => {
    const onOpenTable = vi.fn();
    (dbApi.getTableListMetadata as any).mockResolvedValue([
      { name: 'sale_orders', approxRowCount: 100, dataSizeBytes: 4096, indexSizeBytes: 1024, totalSizeBytes: 5120 },
      { name: 'sale_items', approxRowCount: 250, dataSizeBytes: 8192, indexSizeBytes: 2048, totalSizeBytes: 10240 },
      { name: 'users', approxRowCount: 15, dataSizeBytes: 2048, indexSizeBytes: 512, totalSizeBytes: 2560 },
    ]);

    render(
      <TableListTab
        connectionId="conn-1"
        schemaName="public"
        onOpenTable={onOpenTable}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('sale_orders')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('view-mode-grouped'));
    expect(screen.getByTestId('table-list-grouped-view')).toBeInTheDocument();
    expect(screen.getByTestId('board-group-sale')).toBeInTheDocument();
    expect(screen.getByTestId('board-group-__other__')).toBeInTheDocument();

    const item = screen.getByTestId('board-item-sale_orders');
    fireEvent.click(item);
    expect(item).toHaveAttribute('aria-selected', 'true');

    fireEvent.doubleClick(item);
    expect(onOpenTable).toHaveBeenCalledWith('sale_orders');

    fireEvent.contextMenu(item, { clientX: 140, clientY: 200 });
    expect(screen.getByTestId('table-list-context-menu')).toBeInTheDocument();
  });

  it('toggles prefix grouping in List view and collapses/expands prefix groups', async () => {
    (dbApi.getTableListMetadata as any).mockResolvedValue([
      { name: 'sale_orders', approxRowCount: 100, dataSizeBytes: 4096, indexSizeBytes: 1024, totalSizeBytes: 5120 },
      { name: 'sale_items', approxRowCount: 250, dataSizeBytes: 8192, indexSizeBytes: 2048, totalSizeBytes: 10240 },
      { name: 'users', approxRowCount: 15, dataSizeBytes: 2048, indexSizeBytes: 512, totalSizeBytes: 2560 },
    ]);

    render(
      <TableListTab
        connectionId="conn-1"
        schemaName="public"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('sale_orders')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('toggle-group-in-list'));
    expect(screen.getByTestId('table-list-grouped-list')).toBeInTheDocument();
    expect(localStorage.getItem('datacore-table-list-group-in-list')).toBe('true');
    expect(screen.getByTestId('prefix-group-sale')).toBeInTheDocument();
    expect(screen.getByTestId('prefix-group-__other__')).toBeInTheDocument();

    // Collapse sale group
    fireEvent.click(screen.getByTestId('prefix-group-sale'));
    expect(screen.queryByText('sale_orders')).not.toBeInTheDocument();

    // Expand sale group again
    fireEvent.click(screen.getByTestId('prefix-group-sale'));
    expect(screen.getByText('sale_orders')).toBeInTheDocument();
  });

  it('switches to Storage & Health view and displays KPIs and health badges', async () => {
    (dbApi.getTableListMetadata as any).mockResolvedValue([
      { name: 'healthy_tbl', approxRowCount: 100, dataSizeBytes: 8192, indexSizeBytes: 2048, totalSizeBytes: 10240 },
      { name: 'stale_tbl', approxRowCount: 0, dataSizeBytes: 4096, indexSizeBytes: 0, totalSizeBytes: 4096 },
      { name: 'index_tbl', approxRowCount: 50, dataSizeBytes: 2048, indexSizeBytes: 8192, totalSizeBytes: 10240 },
    ]);

    render(
      <TableListTab
        connectionId="conn-1"
        schemaName="public"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('healthy_tbl')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('view-mode-storage'));
    expect(screen.getByTestId('table-list-storage-view')).toBeInTheDocument();
    expect(screen.getByText('Total Tables')).toBeInTheDocument();
    expect(screen.getByText('Total Storage')).toBeInTheDocument();
    expect(screen.getByText('Health Alerts')).toBeInTheDocument();
    expect(screen.getByText('Needs ANALYZE')).toBeInTheDocument();
    expect(screen.getByText('Index > Data')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toBeInTheDocument();
  });

  it('uses semantic CSS theme tokens instead of hardcoded bg-white for Warm Paper compatibility', async () => {
    vi.mocked(dbApi.getTableListMetadata).mockResolvedValue([
      {
        name: 'users',
        approxRowCount: 10,
        totalSizeBytes: 1024,
        dataSizeBytes: 512,
        indexSizeBytes: 512,
      },
    ]);

    render(
      <TableListTab
        connectionId="conn-1"
        schemaName="public"
        theme="light"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('users')).toBeInTheDocument();
    });

    const container = screen.getByTestId('table-list-container');
    expect(container.className).toContain('bg-[var(--bg-grid)]');
    expect(container.className).not.toContain('bg-white');

    fireEvent.contextMenu(screen.getByText('users'), { clientX: 50, clientY: 50 });
    const ctxMenu = screen.getByTestId('table-list-context-menu');
    expect(ctxMenu.className).toContain('bg-[var(--bg-panel)]');
    expect(ctxMenu.className).not.toContain('bg-white');
  });
});
