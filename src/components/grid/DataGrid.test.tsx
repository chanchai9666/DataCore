import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DataGrid } from './DataGrid';
import { PaginationBar } from './PaginationBar';
import { CellDetailDrawer } from './CellDetailDrawer';
import { createGridColumns, createCellContent } from './gridUtils';
import { QueryResult } from '../../types/db';

const getDisplayData = (cell: ReturnType<typeof createCellContent>): string => {
  return (cell as any).displayData;
};

const mockQueryResult: QueryResult = {
  columns: [
    { name: 'id', data_type: 'INTEGER', nullable: false },
    { name: 'username', data_type: 'TEXT', nullable: false },
    { name: 'profile', data_type: 'JSON', nullable: true },
    { name: 'is_active', data_type: 'BOOLEAN', nullable: true },
    { name: 'avatar', data_type: 'BLOB', nullable: true },
    { name: 'bio', data_type: 'TEXT', nullable: true },
  ],
  rows: [
    [
      { Integer: 1 },
      { Text: 'alice' },
      { Json: { role: 'admin', age: 30 } },
      { Boolean: true },
      { Bytes: 'AQID' },
      null, // NULL cell
    ],
    [
      2,
      'bob',
      JSON.stringify({ role: 'user' }),
      false,
      null,
      'Null', // Rust enum NULL cell
    ],
  ],
  execution_time_ms: 12.5,
  rows_affected: null,
};

describe('Grid Utilities', () => {
  it('converts ColumnMeta array into Glide GridColumn array', () => {
    const gridCols = createGridColumns(mockQueryResult.columns);
    expect(gridCols).toHaveLength(6);
    expect(gridCols[0]).toMatchObject({
      id: 'id',
      title: 'id',
    });
    expect(gridCols[1]).toMatchObject({
      id: 'username',
      title: 'username',
    });
  });

  it('correctly creates cell content for NULL values with NULL indicator', () => {
    const colMeta = mockQueryResult.columns[5]; // bio (nullable)
    const nullCell = createCellContent(null, colMeta);
    expect(getDisplayData(nullCell)).toBe('NULL');
    // should have themeOverride or italic/dimmed styling
    expect(nullCell.themeOverride).toBeDefined();

    const rustNullCell = createCellContent('Null', colMeta);
    expect(getDisplayData(rustNullCell)).toBe('NULL');
  });

  it('correctly creates cell content for numbers and integers', () => {
    const colMeta = mockQueryResult.columns[0]; // id
    const cellRust = createCellContent({ Integer: 1 }, colMeta);
    expect(getDisplayData(cellRust)).toBe('1');

    const cellRaw = createCellContent(42, colMeta);
    expect(getDisplayData(cellRaw)).toBe('42');
  });

  it('correctly creates cell content for booleans', () => {
    const colMeta = mockQueryResult.columns[3]; // is_active
    const cellTrue = createCellContent({ Boolean: true }, colMeta);
    expect(getDisplayData(cellTrue)).toBe('true');

    const cellFalse = createCellContent(false, colMeta);
    expect(getDisplayData(cellFalse)).toBe('false');
  });

  it('correctly creates cell content for JSON objects', () => {
    const colMeta = mockQueryResult.columns[2]; // profile
    const cell = createCellContent({ Json: { role: 'admin', age: 30 } }, colMeta);
    expect(getDisplayData(cell)).toContain('role');
    expect(getDisplayData(cell)).toContain('admin');
  });

  it('correctly handles binary bytes', () => {
    const colMeta = mockQueryResult.columns[4]; // avatar
    const cell = createCellContent({ Bytes: 'AQID' }, colMeta);
    expect(getDisplayData(cell)).toContain('Binary');
  });
});

describe('PaginationBar', () => {
  it('renders page info, total rows and handles page navigation', () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    const onRefresh = vi.fn();

    render(
      <PaginationBar
        page={2}
        pageSize={100}
        totalRows={350}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        onRefresh={onRefresh}
      />
    );

    expect(screen.getByText(/Page 2 of 4/i)).toBeInTheDocument();
    expect(screen.getByText(/350 rows/i)).toBeInTheDocument();

    const prevButton = screen.getByRole('button', { name: /previous/i });
    const nextButton = screen.getByRole('button', { name: /next/i });
    const refreshButton = screen.getByRole('button', { name: /refresh/i });

    expect(prevButton).not.toBeDisabled();
    expect(nextButton).not.toBeDisabled();

    fireEvent.click(prevButton);
    expect(onPageChange).toHaveBeenCalledWith(1);

    fireEvent.click(nextButton);
    expect(onPageChange).toHaveBeenCalledWith(3);

    fireEvent.click(refreshButton);
    expect(onRefresh).toHaveBeenCalled();
  });

  it('disables previous button on first page and next button on last page', () => {
    const onPageChange = vi.fn();

    const { rerender } = render(
      <PaginationBar
        page={1}
        pageSize={100}
        totalRows={100}
        onPageChange={onPageChange}
      />
    );

    const prevButton = screen.getByRole('button', { name: /previous/i });
    const nextButton = screen.getByRole('button', { name: /next/i });

    expect(prevButton).toBeDisabled();
    expect(nextButton).toBeDisabled();

    rerender(
      <PaginationBar
        page={3}
        pageSize={100}
        totalRows={250}
        onPageChange={onPageChange}
      />
    );

    expect(screen.getByRole('button', { name: /previous/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('allows changing page size', () => {
    const onPageSizeChange = vi.fn();

    render(
      <PaginationBar
        page={1}
        pageSize={100}
        totalRows={500}
        onPageChange={() => {}}
        onPageSizeChange={onPageSizeChange}
      />
    );

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '200' } });
    expect(onPageSizeChange).toHaveBeenCalledWith(200);
  });
});

describe('CellDetailDrawer', () => {
  it('renders cell details when open and allows copying value', async () => {
    const onClose = vi.fn();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(
      <CellDetailDrawer
        isOpen={true}
        onClose={onClose}
        cellInfo={{
          columnName: 'profile',
          dataType: 'JSON',
          value: { Json: { user: 'Alice', theme: 'dark' } },
          rowIndex: 0,
        }}
      />
    );

    expect(screen.getByText('Cell Details')).toBeInTheDocument();
    expect(screen.getByText('profile')).toBeInTheDocument();
    expect(screen.getByText('JSON')).toBeInTheDocument();
    expect(screen.getByText(/"user": "Alice"/i)).toBeInTheDocument();

    const copyBtn = screen.getByRole('button', { name: /copy/i });
    await act(async () => {
      fireEvent.click(copyBtn);
    });
    expect(writeTextMock).toHaveBeenCalled();

    const closeBtn = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not render when isOpen is false', () => {
    render(
      <CellDetailDrawer
        isOpen={false}
        onClose={() => {}}
        cellInfo={null}
      />
    );

    expect(screen.queryByText('Cell Details')).not.toBeInTheDocument();
  });
});

describe('DataGrid', () => {
  it('renders loading state when isLoading is true', () => {
    render(<DataGrid data={null} isLoading={true} />);
    expect(screen.getByText(/loading data/i)).toBeInTheDocument();
  });

  it('renders empty state when data is null or empty', () => {
    render(<DataGrid data={null} isLoading={false} />);
    expect(screen.getByText(/no data to display/i)).toBeInTheDocument();
  });

  it('renders grid with query result and pagination bar', () => {
    render(
      <DataGrid
        data={mockQueryResult}
        page={1}
        pageSize={100}
        totalRows={2}
      />
    );

    // Total rows display in pagination
    expect(screen.getByText(/2 rows/i)).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 1/i)).toBeInTheDocument();
  });

  it('opens CellDetailDrawer when Inspect button is clicked for a selected cell', () => {
    render(
      <DataGrid
        data={mockQueryResult}
        page={1}
        pageSize={100}
        totalRows={2}
      />
    );

    // Initially drawer is closed
    expect(screen.queryByText('Cell Details')).not.toBeInTheDocument();

    // Click "Inspect Cell" toolbar button
    const inspectBtn = screen.getByRole('button', { name: /inspect cell/i });
    fireEvent.click(inspectBtn);

    // Now drawer opens with cell details (defaulting to first cell if none selected)
    expect(screen.getByText('Cell Details')).toBeInTheDocument();
    expect(screen.getByText('id')).toBeInTheDocument();
  });
});
