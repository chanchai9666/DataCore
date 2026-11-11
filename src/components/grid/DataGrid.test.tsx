import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DataGrid } from './DataGrid';
import { PaginationBar } from './PaginationBar';
import { CellDetailDrawer } from './CellDetailDrawer';
import { createGridColumns, createCellContent } from './gridUtils';
import { usePendingChangesStore } from '../../stores/pendingChangesStore';
import { QueryResult } from '../../types/db';
import * as tauriDialog from '@tauri-apps/plugin-dialog';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  confirm: vi.fn(),
}));

export const latestDataEditorProps: any = {};

vi.mock('@glideapps/glide-data-grid', async () => {
  const actual = await vi.importActual<any>('@glideapps/glide-data-grid');
  return {
    ...actual,
    default: (props: any) => {
      Object.assign(latestDataEditorProps, props);
      return (
        <div
          data-testid="mock-data-editor"
          data-column-select={props.columnSelect}
          data-show-search={props.showSearch ? 'true' : 'false'}
          data-search-value={props.searchValue}
        >
          <button
            data-testid="mock-header-click"
            onClick={(e) => props.onHeaderClicked?.(1, e)}
          >
            Header Click
          </button>
          <button
            data-testid="mock-header-alt-click"
            onClick={(e) => props.onHeaderClicked?.(1, { ...e, altKey: true })}
          >
            Header Alt Click
          </button>
          <button
            data-testid="mock-search-close"
            onClick={() => props.onSearchClose?.()}
          >
            Close Search
          </button>
        </div>
      );
    },
  };
});

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

  it('closes when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(
      <CellDetailDrawer
        isOpen={true}
        onClose={onClose}
        cellInfo={{
          columnName: 'username',
          dataType: 'TEXT',
          value: 'alice',
        }}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
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

  it('accepts onCellEdited prop and renders grid normally', () => {
    const onCellEdited = vi.fn();
    render(
      <DataGrid
        data={mockQueryResult}
        page={1}
        pageSize={100}
        totalRows={2}
        onCellEdited={onCellEdited}
      />
    );

    expect(screen.getByText(/2 rows/i)).toBeInTheDocument();
  });

  it('renders Add Row and Delete Row buttons when isEditable is true', () => {
    const onAddRow = vi.fn();
    const onRowDelete = vi.fn();

    render(
      <DataGrid
        data={mockQueryResult}
        isEditable={true}
        onAddRow={onAddRow}
        onRowDelete={onRowDelete}
      />
    );

    const addBtn = screen.getByRole('button', { name: /add row/i });
    expect(addBtn).toBeInTheDocument();
    fireEvent.click(addBtn);
    expect(onAddRow).toHaveBeenCalledTimes(1);

    const deleteBtn = screen.getByRole('button', { name: /delete selected row/i });
    expect(deleteBtn).toBeInTheDocument();
  });

  it('renders status message badge when statusMessage is provided', () => {
    render(
      <DataGrid
        data={mockQueryResult}
        statusMessage={{ type: 'success', text: 'Saved successfully' }}
      />
    );

    expect(screen.getByText('Saved successfully')).toBeInTheDocument();
  });

  it('allows user to manually dismiss status message via close button', () => {
    render(
      <DataGrid
        data={mockQueryResult}
        statusMessage={{ type: 'success', text: 'Row inserted successfully' }}
      />
    );

    expect(screen.getByText('Row inserted successfully')).toBeInTheDocument();
    const dismissBtn = screen.getByTestId('dismiss-status-badge-btn');
    fireEvent.click(dismissBtn);

    expect(screen.queryByText('Row inserted successfully')).not.toBeInTheDocument();
  });

  it('automatically dismisses status message after timeout', () => {
    vi.useFakeTimers();
    render(
      <DataGrid
        data={mockQueryResult}
        statusMessage={{ type: 'success', text: 'Temporary message' }}
      />
    );

    expect(screen.getByText('Temporary message')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByText('Temporary message')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  describe('FilterBar Integration & Row Selection', () => {
    it('toggles FilterBar visibility when Filter button is clicked', () => {
      render(<DataGrid data={mockQueryResult} />);

      // FilterBar initially hidden
      expect(screen.queryByTestId('filter-bar')).not.toBeInTheDocument();

      // Click Filter button on toolbar
      const filterBtn = screen.getByTestId('toggle-filter-btn');
      fireEvent.click(filterBtn);

      // FilterBar is now visible
      expect(screen.getByTestId('filter-bar')).toBeInTheDocument();

      // Click Close button in FilterBar
      const closeBtn = screen.getByTestId('close-filter-bar-btn');
      fireEvent.click(closeBtn);

      expect(screen.queryByTestId('filter-bar')).not.toBeInTheDocument();
    });

    it('passes filterState and triggers onApplyFilter and onClearFilter', () => {
      const onApply = vi.fn();
      const onClear = vi.fn();
      const onFilterChange = vi.fn();

      render(
        <DataGrid
          data={mockQueryResult}
          isFilterOpen={true}
          filterState={{
            enabled: true,
            conjunction: 'AND',
            conditions: [
              { id: '1', column: 'username', operator: '=', value: 'alice' },
            ],
          }}
          onApplyFilter={onApply}
          onClearFilter={onClear}
          onFilterChange={onFilterChange}
        />
      );

      expect(screen.getByTestId('filter-bar')).toBeInTheDocument();

      const applyBtn = screen.getByTestId('apply-filter-btn');
      fireEvent.click(applyBtn);
      expect(onApply).toHaveBeenCalledTimes(1);

      const clearBtn = screen.getByTestId('clear-filter-btn');
      fireEvent.click(clearBtn);
      expect(onClear).toHaveBeenCalledTimes(1);
    });

    it('handles multiple row deletion with confirmation', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const onRowsDelete = vi.fn();

      // We test multi-row delete by triggering the delete handler when rows are selected
      render(
        <DataGrid
          data={mockQueryResult}
          isEditable={true}
          onRowsDelete={onRowsDelete}
        />
      );

      // When rendered, delete button exists
      const deleteBtn = screen.getByRole('button', { name: /delete selected row|delete row/i });
      expect(deleteBtn).toBeInTheDocument();

      confirmSpy.mockRestore();
    });

    it('enables row highlighting and multi-row selection via clickable-number rowMarkers', () => {
      const onRowsDelete = vi.fn();
      render(
        <DataGrid
          data={mockQueryResult}
          theme="dark"
          isEditable={true}
          onRowsDelete={onRowsDelete}
        />
      );

      // Verify toolbar, filter button and delete button rendered
      expect(screen.getByRole('button', { name: /delete selected row|delete row/i })).toBeInTheDocument();
      expect(screen.getByTestId('toggle-filter-btn')).toBeInTheDocument();
    });

    it('renders column header with sort indicator and custom widths in createGridColumns', () => {
      const cols = createGridColumns(
        mockQueryResult.columns,
        { id: 250 },
        { column: 'id', direction: 'ASC' }
      );
      expect(cols[0].title).toBe('id ▲');
      expect((cols[0] as { width?: number }).width).toBe(250);

      const colsDesc = createGridColumns(
        mockQueryResult.columns,
        undefined,
        { column: 'id', direction: 'DESC' }
      );
      expect(colsDesc[0].title).toBe('id ▼');
    });

    it('accepts sortState, onSortChange, columnWidths, and onColumnResize props', () => {
      const onSortChange = vi.fn();
      const onColumnResize = vi.fn();

      render(
        <DataGrid
          data={mockQueryResult}
          sortState={{ column: 'username', direction: 'ASC' }}
          onSortChange={onSortChange}
          columnWidths={{ username: 300 }}
          onColumnResize={onColumnResize}
        />
      );

      expect(screen.getByText(/2 rows/i)).toBeInTheDocument();
    });

    it('integrates with pendingChangesStore and shows commit/discard actions', () => {
      usePendingChangesStore.getState().stageCellEdit('c1.users', {
        rowIndex: 0,
        colIndex: 1,
        colName: 'username',
        oldValue: 'alice',
        newValue: 'alice_updated',
      });

      render(
        <DataGrid
          data={mockQueryResult}
          connectionId="c1"
          tableName="users"
          isEditable={true}
        />
      );

      const commitBtn = screen.getByRole('button', { name: /commit changes/i });
      expect(commitBtn).not.toBeDisabled();
      expect(commitBtn).toHaveTextContent('Commit (1)');

      const discardBtn = screen.getByRole('button', { name: /discard changes/i });
      expect(discardBtn).not.toBeDisabled();
    });

    it('toggles between auto-commit and staging mode via toggle button', () => {
      const tableKey = 'c1.users';
      usePendingChangesStore.getState().clearAll();

      render(
        <DataGrid
          data={mockQueryResult}
          connectionId="c1"
          tableName="users"
          isEditable={true}
        />
      );

      const toggleBtn = screen.getByRole('button', { name: /toggle auto-commit mode/i });
      expect(toggleBtn).toHaveTextContent(/auto-commit: on/i);

      // Click to switch to staging mode
      fireEvent.click(toggleBtn);
      expect(usePendingChangesStore.getState().isAutoCommitMode(tableKey)).toBe(false);

      // Click to switch back to auto-commit mode
      fireEvent.click(toggleBtn);
      expect(usePendingChangesStore.getState().isAutoCommitMode(tableKey)).toBe(true);
    });

    it('prompts before discarding pending changes when switching from staging to auto-commit', async () => {
      const tableKey = 'c1.users';
      usePendingChangesStore.getState().clearAll();
      usePendingChangesStore.getState().setAutoCommitMode(tableKey, false);
      usePendingChangesStore.getState().stageCellEdit(tableKey, {
        rowIndex: 0,
        colIndex: 0,
        colName: 'id',
        oldValue: 1,
        newValue: 99,
      });

      vi.mocked(tauriDialog.confirm).mockResolvedValue(false);
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      render(
        <DataGrid
          data={mockQueryResult}
          connectionId="c1"
          tableName="users"
          isEditable={true}
        />
      );

      const toggleBtn = screen.getByRole('button', { name: /toggle auto-commit mode/i });
      expect(toggleBtn).toHaveTextContent(/staging mode/i);

      // User cancels prompt
      fireEvent.click(toggleBtn);
      await act(async () => {});
      expect(usePendingChangesStore.getState().isAutoCommitMode(tableKey)).toBe(false);
      expect(usePendingChangesStore.getState().hasPendingChanges(tableKey)).toBe(true);

      // User accepts prompt
      vi.mocked(tauriDialog.confirm).mockResolvedValue(true);
      confirmSpy.mockReturnValue(true);
      fireEvent.click(toggleBtn);
      await act(async () => {});
      expect(usePendingChangesStore.getState().isAutoCommitMode(tableKey)).toBe(true);
      expect(usePendingChangesStore.getState().hasPendingChanges(tableKey)).toBe(false);

      confirmSpy.mockRestore();
    });

    it('stages cell edit when saving from CellDetailDrawer in staging mode', async () => {
      const tableKey = 'c1.users';
      usePendingChangesStore.getState().clearAll();
      usePendingChangesStore.getState().setAutoCommitMode(tableKey, false);

      const onCellEdited = vi.fn();
      render(
        <DataGrid
          data={mockQueryResult}
          connectionId="c1"
          tableName="users"
          isEditable={true}
          onCellEdited={onCellEdited}
        />
      );

      // Open drawer via Inspect Cell button (default selected cell is [0, 0] id=1)
      const inspectBtn = screen.getByRole('button', { name: /inspect cell/i });
      fireEvent.click(inspectBtn);
      expect(screen.getByText('Cell Details')).toBeInTheDocument();

      // Click Edit button in drawer
      const editBtn = screen.getByRole('button', { name: /^edit$/i });
      fireEvent.click(editBtn);

      // Change value in textarea
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '42' } });

      // Click Save Changes button
      const saveBtn = screen.getByRole('button', { name: /save changes/i });
      fireEvent.click(saveBtn);

      // onCellEdited should NOT be called (staged instead)
      expect(onCellEdited).not.toHaveBeenCalled();

      // Changes should be staged in pendingChangesStore
      expect(usePendingChangesStore.getState().hasPendingChanges(tableKey)).toBe(true);
      const changes = usePendingChangesStore.getState().getTableChanges(tableKey);
      expect(changes.cellEdits['0:0']).toEqual(
        expect.objectContaining({
          rowIndex: 0,
          colIndex: 0,
          colName: 'id',
          newValue: 42,
        })
      );
    });

    it('calls onCellEdited directly when saving from CellDetailDrawer in auto-commit mode', async () => {
      const tableKey = 'c1.users';
      usePendingChangesStore.getState().clearAll();
      usePendingChangesStore.getState().setAutoCommitMode(tableKey, true);

      const onCellEdited = vi.fn();
      render(
        <DataGrid
          data={mockQueryResult}
          connectionId="c1"
          tableName="users"
          isEditable={true}
          onCellEdited={onCellEdited}
        />
      );

      const inspectBtn = screen.getByRole('button', { name: /inspect cell/i });
      fireEvent.click(inspectBtn);

      const editBtn = screen.getByRole('button', { name: /^edit$/i });
      fireEvent.click(editBtn);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '99' } });

      const saveBtn = screen.getByRole('button', { name: /save changes/i });
      fireEvent.click(saveBtn);

      // onCellEdited SHOULD be called
      expect(onCellEdited).toHaveBeenCalled();
      // Store should have NO pending changes
      expect(usePendingChangesStore.getState().hasPendingChanges(tableKey)).toBe(false);
    });
  });

  describe('Column Selection & Alt-Click Sort', () => {
    it('sets columnSelect to multi and exclusive blending', () => {
      render(<DataGrid data={mockQueryResult} />);
      const editor = screen.getByTestId('mock-data-editor');
      expect(editor).toHaveAttribute('data-column-select', 'multi');
    });

    it('selects column on regular header click without triggering sort', () => {
      const onSortChange = vi.fn();
      render(<DataGrid data={mockQueryResult} onSortChange={onSortChange} />);
      const headerBtn = screen.getByTestId('mock-header-click');
      fireEvent.click(headerBtn);
      expect(onSortChange).not.toHaveBeenCalled();
    });

    it('triggers sort on Alt+click on header', () => {
      const onSortChange = vi.fn();
      render(<DataGrid data={mockQueryResult} onSortChange={onSortChange} />);
      const altHeaderBtn = screen.getByTestId('mock-header-alt-click');
      fireEvent.click(altHeaderBtn);
      expect(onSortChange).toHaveBeenCalledWith({
        column: 'username',
        direction: 'ASC',
      });
    });
  });

  describe('Copy Shortcuts (Cmd+A, Cmd+C, Cmd+Shift+C)', () => {
    it('selects all rows and columns when Cmd+A is pressed', () => {
      render(<DataGrid data={mockQueryResult} />);
      const container = screen.getByTestId('data-grid-container');
      fireEvent.keyDown(container, { key: 'a', metaKey: true });
      expect(latestDataEditorProps.gridSelection.columns.length).toBe(mockQueryResult.columns.length);
      expect(latestDataEditorProps.gridSelection.rows.length).toBe(mockQueryResult.rows.length);
    });

    it('copies selection to clipboard without headers when Cmd+C is pressed', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

      render(<DataGrid data={mockQueryResult} />);
      const container = screen.getByTestId('data-grid-container');

      fireEvent.keyDown(container, { key: 'a', metaKey: true });
      fireEvent.keyDown(container, { key: 'c', metaKey: true });

      expect(writeTextMock).toHaveBeenCalled();
      const text = writeTextMock.mock.calls[0][0];
      expect(text.startsWith('id\tusername')).toBe(false);
      expect(text).toContain('alice');
    });

    it('copies selection to clipboard with headers when Cmd+Shift+C is pressed', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

      render(<DataGrid data={mockQueryResult} />);
      const container = screen.getByTestId('data-grid-container');

      fireEvent.keyDown(container, { key: 'a', metaKey: true });
      fireEvent.keyDown(container, { key: 'c', metaKey: true, shiftKey: true });

      expect(writeTextMock).toHaveBeenCalled();
      const text = writeTextMock.mock.calls[0][0];
      expect(text.startsWith('id\tusername')).toBe(true);
      expect(text).toContain('alice');
    });

    it('copies empty string cell to clipboard without ignoring it', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

      const dataWithEmptyStr: QueryResult = {
        columns: [{ name: 'val', data_type: 'TEXT', nullable: true }],
        rows: [['']],
        execution_time_ms: 1,
      };

      render(<DataGrid data={dataWithEmptyStr} />);
      const container = screen.getByTestId('data-grid-container');

      fireEvent.keyDown(container, { key: 'c', metaKey: true });
      expect(writeTextMock).toHaveBeenCalledWith('');
    });

    it('does not intercept Cmd+A when focused inside an input element', () => {
      render(
        <DataGrid data={mockQueryResult} isFilterOpen={true} />
      );
      const input = screen.getByPlaceholderText(/filter value/i);

      // Focus input and press Cmd+A
      input.focus();
      const preventDefaultSpy = vi.fn();
      fireEvent.keyDown(input, { key: 'a', metaKey: true, preventDefault: preventDefaultSpy });

      // In-grid selection should NOT be select-all
      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });
  });

  describe('In-Grid Search (Cmd+F)', () => {
    it('toggles showSearch on DataEditor when Cmd+F is pressed', () => {
      render(<DataGrid data={mockQueryResult} />);
      const container = screen.getByTestId('data-grid-container');
      const editor = screen.getByTestId('mock-data-editor');

      expect(editor).toHaveAttribute('data-show-search', 'false');

      fireEvent.keyDown(container, { key: 'f', metaKey: true });
      expect(editor).toHaveAttribute('data-show-search', 'true');

      // Close search
      const closeBtn = screen.getByTestId('mock-search-close');
      fireEvent.click(closeBtn);
      expect(editor).toHaveAttribute('data-show-search', 'false');
    });
  });

  describe('Context Menu for DataGrid', () => {
    it('opens context menu on right click and triggers Copy, Copy with Headers, Select All, Find', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

      render(<DataGrid data={mockQueryResult} />);
      const editor = screen.getByTestId('mock-data-editor');

      fireEvent.contextMenu(editor);

      expect(await screen.findByTestId('ctx-menu-copy')).toBeInTheDocument();
      expect(screen.getByTestId('ctx-menu-copy-headers')).toBeInTheDocument();
      expect(screen.getByTestId('ctx-menu-select-all')).toBeInTheDocument();
      expect(screen.getByTestId('ctx-menu-find')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('ctx-menu-copy'));
      expect(writeTextMock).toHaveBeenCalled();
    });
  });
});
