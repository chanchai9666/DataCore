import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import DataEditor, {
  GridCell,
  Item,
  GridSelection,
  CompactSelection,
  GridCellKind,
  type GridColumn,
  type EditableGridCell,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import { Eye, Loader2, Database, CheckCircle2, AlertCircle, Filter, Download } from 'lucide-react';
import { QueryResult, CellValue, TableFilterState, TableSortState } from '../../types/db';
import { CellDetailDrawer } from './CellDetailDrawer';
import { FilterBar } from './FilterBar';
import { GridBottomBar } from './GridBottomBar';
import { lightGridTheme, darkGridTheme } from './gridTheme';
import { usePendingChangesStore } from '../../stores/pendingChangesStore';
import { createGridColumns, createCellContent } from './gridUtils';
import { formatSelectionAsText } from './clipboardUtils';
import { toast } from 'sonner';
import { ExportModal } from '../transfer/ExportModal';

export interface DataGridProps {
  data: QueryResult | null;
  isLoading?: boolean;
  page?: number;
  pageSize?: number;
  totalRows?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onRefresh?: () => void;
  onCellEdited?: (cell: readonly [number, number], newValue: EditableGridCell) => void;
  onRowDelete?: (rowIndex: number) => void;
  onRowsDelete?: (rowIndices: number[]) => void;
  onAddRow?: () => void;
  isEditable?: boolean;
  statusMessage?: { type: 'success' | 'error'; text: string } | null;
  theme?: 'dark' | 'light';
  filterState?: TableFilterState;
  onFilterChange?: (state: TableFilterState) => void;
  onApplyFilter?: () => void;
  onClearFilter?: () => void;
  isFilterOpen?: boolean;
  onToggleFilter?: () => void;
  driver?: string;
  sortState?: TableSortState;
  onSortChange?: (sortState: TableSortState | undefined) => void;
  columnWidths?: Record<string, number>;
  onColumnResize?: (columnId: string, newWidth: number) => void;
  connectionId?: string;
  tableName?: string;
  initialQuery?: string;
  onExport?: () => void;
}

export const DataGrid: React.FC<DataGridProps> = ({
  data,
  isLoading = false,
  page = 1,
  pageSize = 100,
  totalRows,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  onCellEdited,
  onRowDelete,
  onRowsDelete,
  onAddRow,
  isEditable = false,
  statusMessage = null,
  theme = 'dark',
  filterState,
  onFilterChange,
  onApplyFilter,
  onClearFilter,
  isFilterOpen,
  onToggleFilter,
  driver,
  sortState,
  onSortChange,
  columnWidths,
  onColumnResize,
  connectionId,
  tableName,
  initialQuery,
  onExport,
}) => {
  const [selectedCell, setSelectedCell] = useState<Item | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [internalFilterOpen, setInternalFilterOpen] = useState(false);
  const [internalSortState, setInternalSortState] = useState<TableSortState | undefined>(undefined);
  const [internalColumnWidths, setInternalColumnWidths] = useState<Record<string, number>>({});

  const activeSortState = sortState !== undefined ? sortState : internalSortState;
  const activeColumnWidths = columnWidths ?? internalColumnWidths;
  const [gridSelection, setGridSelection] = useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
    current: undefined,
  });

  const [internalFilterState, setInternalFilterState] = useState<TableFilterState>({
    enabled: true,
    conjunction: 'AND',
    conditions: [
      {
        id: 'c1',
        column: data?.columns?.[0]?.name || '',
        operator: '=',
        value: '',
      },
    ],
  });

  const activeFilterState = filterState ?? internalFilterState;
  const handleFilterChange = onFilterChange ?? setInternalFilterState;

  const isFilterVisible = isFilterOpen !== undefined ? isFilterOpen : internalFilterOpen;
  const handleToggleFilter = () => {
    if (onToggleFilter) {
      onToggleFilter();
    } else {
      setInternalFilterOpen((prev) => !prev);
    }
  };

  const isAltPressedRef = useRef(false);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') isAltPressedRef.current = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') isAltPressedRef.current = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const selectedRowIndices = useMemo(() => {
    return gridSelection.rows.toArray();
  }, [gridSelection.rows]);

  const hasSelectedRows = selectedRowIndices.length > 0;

  const isFilterActive = useMemo(() => {
    return (
      activeFilterState.enabled &&
      activeFilterState.conditions.some(
        (c) =>
          c.column &&
          (c.operator === 'IS NULL' ||
            c.operator === 'IS NOT NULL' ||
            (c.value !== undefined && c.value.trim() !== ''))
      )
    );
  }, [activeFilterState]);

  const columns = useMemo(() => {
    if (!data?.columns) return [];
    return createGridColumns(data.columns, activeColumnWidths, activeSortState);
  }, [data?.columns, activeColumnWidths, activeSortState]);

  const handleHeaderClicked = useCallback(
    (colIndex: number, event?: any) => {
      if (!data?.columns || colIndex < 0 || colIndex >= data.columns.length) return;
      const isAlt = event?.altKey === true || isAltPressedRef.current;

      if (isAlt) {
        const colName = data.columns[colIndex].name;
        let nextSort: TableSortState | undefined;
        if (activeSortState?.column === colName) {
          if (activeSortState.direction === 'ASC') {
            nextSort = { column: colName, direction: 'DESC' };
          } else {
            nextSort = undefined; // Cycle to None
          }
        } else {
          nextSort = { column: colName, direction: 'ASC' };
        }

        if (onSortChange) {
          onSortChange(nextSort);
        } else {
          setInternalSortState(nextSort);
        }
      } else {
        const isMulti = event?.shiftKey || event?.metaKey || event?.ctrlKey;
        setGridSelection((prev) => {
          let nextCols = CompactSelection.fromSingleSelection(colIndex);
          if (isMulti && prev.columns) {
            nextCols = prev.columns.add(colIndex);
          }
          return {
            columns: nextCols,
            rows: CompactSelection.empty(),
            current: undefined,
          };
        });
      }
    },
    [data?.columns, activeSortState, onSortChange]
  );

  const handleColumnResize = useCallback(
    (col: GridColumn, newSize: number) => {
      const colId = col.id ?? col.title;
      if (onColumnResize && colId) {
        onColumnResize(colId, newSize);
      } else if (colId) {
        setInternalColumnWidths((prev) => ({
          ...prev,
          [colId]: newSize,
        }));
      }
    },
    [onColumnResize]
  );

  const rowsCount = data?.rows?.length || 0;
  const computedTotalRows = totalRows !== undefined ? totalRows : rowsCount;

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      if (!data || !data.rows[row] || col >= data.columns.length) {
        return createCellContent(null);
      }
      const cellValue = data.rows[row][col];
      const columnMeta = data.columns[col];
      return createCellContent(cellValue, columnMeta);
    },
    [data]
  );

  const activeCellInfo = useMemo(() => {
    if (!data || !data.rows.length || !data.columns.length) return null;
    const colIdx = selectedCell ? selectedCell[0] : 0;
    const rowIdx = selectedCell ? selectedCell[1] : 0;

    const columnMeta = data.columns[colIdx];
    const rowData = data.rows[rowIdx];
    const cellValue: CellValue = rowData ? rowData[colIdx] : null;

    return {
      columnName: columnMeta ? columnMeta.name : `Column ${colIdx + 1}`,
      dataType: columnMeta ? columnMeta.data_type : 'UNKNOWN',
      value: cellValue,
      rowIndex: rowIdx,
      colIndex: colIdx,
    };
  }, [data, selectedCell]);

  const handleCellActivated = useCallback((cell: Item) => {
    setSelectedCell(cell);
    setDrawerOpen(true);
  }, []);

  const handleCellClicked = useCallback((cell: Item) => {
    setSelectedCell(cell);
  }, []);

  const handleInspectClick = () => {
    if (!selectedCell && rowsCount > 0 && columns.length > 0) {
      setSelectedCell([0, 0]);
    }
    setDrawerOpen(true);
  };

  const handleSaveDrawerValue = useCallback(
    (newVal: unknown) => {
      if (selectedCell && onCellEdited) {
        const col = selectedCell[0];
        const row = selectedCell[1];
        let cell: EditableGridCell;
        if (newVal === null) {
          cell = { kind: GridCellKind.Text, data: 'NULL', displayData: 'NULL', allowOverlay: true };
        } else if (typeof newVal === 'number') {
          cell = { kind: GridCellKind.Number, data: newVal, displayData: String(newVal), allowOverlay: true };
        } else if (typeof newVal === 'boolean') {
          cell = { kind: GridCellKind.Boolean, data: newVal, allowOverlay: false };
        } else {
          cell = { kind: GridCellKind.Text, data: String(newVal), displayData: String(newVal), allowOverlay: true };
        }
        onCellEdited([col, row], cell);
      }
    },
    [selectedCell, onCellEdited]
  );

  const gridTheme = theme === 'dark' ? darkGridTheme : lightGridTheme;

  const tableKey = `${connectionId || 'default'}.${tableName || 'query'}`;
  const hasPending = usePendingChangesStore((s) => s.hasPendingChanges(tableKey));
  const pendingCount = usePendingChangesStore((s) => s.getPendingChangesCount(tableKey));

  const handleDeleteSelected = useCallback(() => {
    if (hasSelectedRows) {
      if (selectedRowIndices.length > 1) {
        if (window.confirm(`Are you sure you want to delete ${selectedRowIndices.length} rows?`)) {
          if (onRowsDelete) {
            onRowsDelete(selectedRowIndices);
          } else if (onRowDelete) {
            [...selectedRowIndices].sort((a, b) => b - a).forEach((idx) => onRowDelete(idx));
          }
        }
      } else if (onRowDelete) {
        onRowDelete(selectedRowIndices[0]);
      }
    } else if (selectedCell && onRowDelete) {
      onRowDelete(selectedCell[1]);
    }
  }, [hasSelectedRows, selectedRowIndices, selectedCell, onRowsDelete, onRowDelete]);

  const handleCellEditedWithStaging = useCallback(
    (cell: readonly [number, number], newValue: EditableGridCell) => {
      const [colIndex, rowIndex] = cell;
      const colMeta = data?.columns[colIndex];
      const oldValue = data?.rows[rowIndex]?.[colIndex];

      if (colMeta) {
        usePendingChangesStore.getState().stageCellEdit(tableKey, {
          rowIndex,
          colIndex,
          colName: colMeta.name,
          oldValue,
          newValue: 'data' in newValue ? (newValue as any).data : newValue,
        });
      }

      onCellEdited?.(cell, newValue);
    },
    [data, tableKey, onCellEdited]
  );

  const handleCommitChanges = () => {
    usePendingChangesStore.getState().discardChanges(tableKey);
    onRefresh?.();
  };

  const handleDiscardChanges = () => {
    usePendingChangesStore.getState().discardChanges(tableKey);
    onRefresh?.();
  };

  const handleSelectAll = useCallback(() => {
    if (!data?.columns?.length || !data?.rows?.length) return;
    let allCols = CompactSelection.empty();
    for (let i = 0; i < data.columns.length; i++) {
      allCols = allCols.add(i);
    }
    let allRows = CompactSelection.empty();
    for (let i = 0; i < data.rows.length; i++) {
      allRows = allRows.add(i);
    }
    setGridSelection({
      columns: allCols,
      rows: allRows,
      current: undefined,
    });
  }, [data?.columns?.length, data?.rows?.length]);

  const handleCopy = useCallback(
    (includeHeaders: boolean) => {
      if (!data) return;
      let sel = gridSelection;
      if (
        sel.columns.length === 0 &&
        sel.rows.length === 0 &&
        !sel.current?.cell &&
        !sel.current?.range &&
        selectedCell
      ) {
        sel = {
          ...sel,
          current: {
            cell: selectedCell,
            range: { x: selectedCell[0], y: selectedCell[1], width: 1, height: 1 },
            rangeStack: [],
          },
        };
      }
      const text = formatSelectionAsText(sel, data, includeHeaders);
      if (text) {
        if (navigator?.clipboard?.writeText) {
          navigator.clipboard.writeText(text).catch((err) => {
            console.error('Failed to copy to clipboard', err);
          });
        }
        toast.success(
          includeHeaders ? 'Copied with headers to clipboard' : 'Copied to clipboard'
        );
      }
    },
    [data, gridSelection, selectedCell]
  );

  const handleContainerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const isCmdOrCtrl = e.metaKey || e.ctrlKey;
    if (!isCmdOrCtrl) return;

    if (e.key.toLowerCase() === 'a') {
      e.preventDefault();
      handleSelectAll();
    } else if (e.key.toLowerCase() === 'c') {
      e.preventDefault();
      handleCopy(e.shiftKey);
    }
  };

  return (
    <div
      data-testid="data-grid-container"
      tabIndex={0}
      onKeyDown={handleContainerKeyDown}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: 'var(--bg-primary, #181818)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          backgroundColor: 'var(--bg-secondary, #202020)',
          borderBottom: '1px solid var(--border-color, #333333)',
          fontSize: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Database size={14} style={{ color: '#3b82f6' }} />
          <span style={{ color: 'var(--text-secondary, #aaaaaa)' }}>
            {data?.columns ? `${data.columns.length} columns` : '0 columns'}
          </span>
          {data?.execution_time_ms !== undefined && (
            <span style={{ color: 'var(--text-muted, #777777)' }}>
              ({data.execution_time_ms} ms)
            </span>
          )}

          {statusMessage && (
            <div
              data-testid="grid-status-badge"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 500,
                backgroundColor:
                  statusMessage.type === 'success'
                    ? 'rgba(6, 78, 59, 0.7)'
                    : 'rgba(127, 29, 29, 0.7)',
                color: statusMessage.type === 'success' ? '#34d399' : '#f87171',
                border: `1px solid ${
                  statusMessage.type === 'success' ? '#059669' : '#b91c1c'
                }`,
              }}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 size={12} />
              ) : (
                <AlertCircle size={12} />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Filter Toggle Button */}
          <button
            type="button"
            aria-label="Toggle Filter"
            title="Toggle Filter Bar"
            data-testid="toggle-filter-btn"
            onClick={handleToggleFilter}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '3px 10px',
              fontSize: '12px',
              backgroundColor: isFilterActive
                ? '#1e3a8a'
                : isFilterVisible
                ? '#2563eb'
                : 'var(--btn-bg, #2b2b2b)',
              color: '#ffffff',
              border: isFilterActive
                ? '1px solid #3b82f6'
                : '1px solid var(--border-color, #444444)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            <Filter size={13} />
            Filter
          </button>

          <button
            type="button"
            aria-label="Inspect Cell"
            title="Inspect selected cell value"
            onClick={handleInspectClick}
            disabled={rowsCount === 0 || isLoading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '3px 10px',
              fontSize: '12px',
              backgroundColor: 'var(--btn-bg, #2b2b2b)',
              color:
                rowsCount > 0
                  ? 'var(--text-primary, #ffffff)'
                  : 'var(--text-disabled, #666666)',
              border: '1px solid var(--border-color, #444444)',
              borderRadius: '4px',
              cursor: rowsCount > 0 ? 'pointer' : 'not-allowed',
              opacity: rowsCount > 0 ? 1 : 0.6,
            }}
          >
            <Eye size={13} />
            Inspect Cell
          </button>

          {(onExport || (connectionId && tableName)) && (
            <button
              type="button"
              aria-label="Export Data"
              title="Export table data to CSV or JSON"
              data-testid="grid-export-btn"
              onClick={() => {
                if (onExport) {
                  onExport();
                } else {
                  setIsExportModalOpen(true);
                }
              }}
              disabled={isLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '3px 10px',
                fontSize: '12px',
                backgroundColor: 'var(--btn-bg, #2b2b2b)',
                color: 'var(--text-primary, #ffffff)',
                border: '1px solid var(--border-color, #444444)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              <Download size={13} />
              Export
            </button>
          )}
        </div>
      </div>

      {/* Grid Content / Empty / Loading */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {isLoading ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: '12px',
              color: 'var(--text-secondary, #aaaaaa)',
              fontSize: '14px',
            }}
          >
            <Loader2 size={28} className="animate-spin" style={{ color: '#3b82f6' }} />
            <span>Loading data...</span>
          </div>
        ) : !data || rowsCount === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: '8px',
              color: 'var(--text-secondary, #888888)',
              fontSize: '14px',
            }}
          >
            <Database size={32} style={{ opacity: 0.3 }} />
            <span>No data to display</span>
          </div>
        ) : (
          <div style={{ width: '100%', height: '100%' }}>
            <DataEditor
              width="100%"
              height="100%"
              columns={columns}
              rows={rowsCount}
              getCellContent={getCellContent}
              getCellsForSelection={true}
              rowMarkers="clickable-number"
              rowSelect="multi"
              columnSelect="multi"
              columnSelectionBlending="exclusive"
              rowSelectionBlending="exclusive"
              rangeSelectionBlending="exclusive"
              smoothScrollX
              smoothScrollY
              rowHeight={24}
              headerHeight={26}
              gridSelection={gridSelection}
              onGridSelectionChange={setGridSelection}
              onCellActivated={handleCellActivated}
              onCellClicked={handleCellClicked}
              onCellEdited={handleCellEditedWithStaging}
              onHeaderClicked={handleHeaderClicked}
              onColumnResize={handleColumnResize}
              theme={gridTheme}
            />
          </div>
        )}
      </div>

      {/* Filter Bar (above Bottom Action Bar) */}
      {isFilterVisible && (
        <FilterBar
          columns={data?.columns || []}
          filterState={activeFilterState}
          onChange={handleFilterChange}
          onApply={onApplyFilter || (() => {})}
          onClear={onClearFilter || (() => {})}
          onClose={() => handleToggleFilter()}
          theme={theme}
          driver={driver}
        />
      )}

      {/* Bottom Action Bar */}
      <GridBottomBar
        page={page}
        pageSize={pageSize}
        totalRows={computedTotalRows}
        onPageChange={onPageChange || (() => {})}
        onPageSizeChange={onPageSizeChange}
        onRefresh={onRefresh}
        isLoading={isLoading}
        onAddRow={isEditable && onAddRow ? onAddRow : undefined}
        onDeleteRow={isEditable ? handleDeleteSelected : undefined}
        canDelete={isEditable && (hasSelectedRows || selectedCell !== null)}
        hasPendingChanges={hasPending}
        pendingCount={pendingCount}
        onCommit={handleCommitChanges}
        onDiscard={handleDiscardChanges}
      />

      {/* Detail Drawer */}
      <CellDetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        cellInfo={activeCellInfo}
        onSaveValue={handleSaveDrawerValue}
      />

      {/* Export Modal */}
      {connectionId && tableName && (
        <ExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          connectionId={connectionId}
          tableName={tableName}
          initialQuery={initialQuery}
          totalRows={computedTotalRows}
        />
      )}
    </div>
  );
};

export default DataGrid;
