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
});
