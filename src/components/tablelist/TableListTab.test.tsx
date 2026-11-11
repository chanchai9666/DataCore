import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  TableListTab,
  formatBytes,
  formatApproxRows,
} from './TableListTab';
import { dbApi } from '../../api/db';
import * as tabHelpers from '../sidebar/tabHelpers';

vi.mock('../../api/db', () => ({
  dbApi: {
    getTableListMetadata: vi.fn(),
  },
}));

vi.mock('../sidebar/tabHelpers', () => ({
  openTableTab: vi.fn(),
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
});
