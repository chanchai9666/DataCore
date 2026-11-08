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
import { Eye, Loader2, Database, CheckCircle2, AlertCircle, Filter, Download, X } from 'lucide-react';
import { QueryResult, CellValue, TableFilterState, TableSortState } from '../../types/db';
import { CellDetailDrawer } from './CellDetailDrawer';
import { FilterBar } from './FilterBar';
import { GridBottomBar } from './GridBottomBar';
import { lightGridTheme, darkGridTheme } from './gridTheme';
import { usePendingChangesStore } from '../../stores/pendingChangesStore';
import { createGridColumns, createCellContent } from './gridUtils';
import { formatSelectionAsText } from './clipboardUtils';
import { toast } from 'sonner';
import * as ContextMenu from '@radix-ui/react-context-menu';
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
  isAutoCommit?: boolean;
  onToggleAutoCommit?: () => void;
  onCommitChanges?: (tableKey: string) => void;
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
  isAutoCommit: isAutoCommitProp,
  onToggleAutoCommit: onToggleAutoCommitProp,
  onCommitChanges,
}) => {
  const [selectedCell, setSelectedCell] = useState<Item | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [internalFilterOpen, setInternalFilterOpen] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<typeof statusMessage>(statusMessage);

  useEffect(() => {
    setCurrentStatus(statusMessage);
    if (!statusMessage) return;

    const duration = statusMessage.type === 'success' ? 4000 : 7000;
    const timer = setTimeout(() => {
      setCurrentStatus(null);
    }, duration);

    return () => clearTimeout(timer);
  }, [statusMessage]);
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
    const handleBlur = () => {
      isAltPressedRef.current = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
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
        event?.preventDefault?.();
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

  const tableKey = `${connectionId || 'default'}.${tableName || 'query'}`;
  const storeIsAutoCommit = usePendingChangesStore((s) => s.isAutoCommitMode(tableKey));
  const activeIsAutoCommit = isAutoCommitProp !== undefined ? isAutoCommitProp : storeIsAutoCommit;
  const tableChanges = usePendingChangesStore((s) => s.tables[tableKey]);
  const hasPending = usePendingChangesStore((s) => s.hasPendingChanges(tableKey));
  const pendingCount = usePendingChangesStore((s) => s.getPendingChangesCount(tableKey));

  const baseRowsCount = data?.rows?.length || 0;
  const addedRowsCount = tableChanges?.addedRows?.length || 0;
  const rowsCount = baseRowsCount + addedRowsCount;
  const computedTotalRows = totalRows !== undefined ? totalRows + addedRowsCount : rowsCount;

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      if (!data || col >= data.columns.length) {
        return createCellContent(null);
      }
      const columnMeta = data.columns[col];

      // 1. Staged added row
      if (row >= baseRowsCount) {
        const addedIdx = row - baseRowsCount;
        const addedRow = tableChanges?.addedRows?.[addedIdx];
        const rawVal = addedRow ? (addedRow[columnMeta.name] as CellValue) : null;
        const cell = createCellContent(rawVal, columnMeta);
        return {
          ...cell,
          themeOverride: {
            ...cell.themeOverride,
            bgCell: theme === 'dark' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(209, 250, 229, 0.85)',
          },
        };
      }

      // 2. Staged deleted row or edited cell
      const isDeleted = tableChanges?.deletedRowIndices?.includes(row);
      const cellEditKey = `${row}:${col}`;
      const cellEdit = tableChanges?.cellEdits?.[cellEditKey];

      const rawVal = cellEdit ? (cellEdit.newValue as CellValue) : data.rows[row]?.[col];
      let cell = createCellContent(rawVal, columnMeta);

      if (isDeleted) {
        cell = {
          ...cell,
          themeOverride: {
            ...cell.themeOverride,
            bgCell: theme === 'dark' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(254, 226, 226, 0.85)',
          },
        };
      } else if (cellEdit) {
        cell = {
          ...cell,
          themeOverride: {
            ...cell.themeOverride,
            bgCell: theme === 'dark' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(219, 234, 254, 0.85)',
          },
        };
      }

      return cell;
    },
    [data, baseRowsCount, tableChanges, theme]
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

      if (!activeIsAutoCommit) {
        if (colMeta) {
          usePendingChangesStore.getState().stageCellEdit(tableKey, {
            rowIndex,
            colIndex,
            colName: colMeta.name,
            oldValue,
            newValue: 'data' in newValue ? (newValue as any).data : newValue,
          });
        }
      } else {
        onCellEdited?.(cell, newValue);
      }
    },
    [data, tableKey, activeIsAutoCommit, onCellEdited]
  );

  const handleToggleAutoCommit = useCallback(() => {
    if (onToggleAutoCommitProp) {
      onToggleAutoCommitProp();
      return;
    }
    if (activeIsAutoCommit) {
      usePendingChangesStore.getState().setAutoCommitMode(tableKey, false);
    } else {
      if (hasPending) {
        const confirmed = window.confirm(
          'You have uncommitted changes in Staging Mode. Switching to Auto-Commit will discard these pending changes. Do you want to proceed?'
        );
        if (!confirmed) return;
        usePendingChangesStore.getState().discardChanges(tableKey);
      }
      usePendingChangesStore.getState().setAutoCommitMode(tableKey, true);
    }
  }, [onToggleAutoCommitProp, activeIsAutoCommit, hasPending, tableKey]);

  const handleCommitChanges = () => {
    if (onCommitChanges) {
      onCommitChanges(tableKey);
    } else {
      usePendingChangesStore.getState().discardChanges(tableKey);
      onRefresh?.();
    }
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
      if (!data || !data.rows.length || !data.columns.length) return;
      let sel = gridSelection;
      if (
        sel.columns.length === 0 &&
        sel.rows.length === 0 &&
        !sel.current?.cell &&
        !sel.current?.range
      ) {
        const cell = selectedCell ?? [0, 0];
        sel = {
          ...sel,
          current: {
            cell,
            range: { x: cell[0], y: cell[1], width: 1, height: 1 },
            rangeStack: [],
          },
        };
      }
      const text = formatSelectionAsText(sel, data, includeHeaders);
      if (text !== null) {
        if (navigator?.clipboard?.writeText) {
          navigator.clipboard
            .writeText(text)
            .then(() => {
              toast.success(
                includeHeaders ? 'Copied with headers to clipboard' : 'Copied to clipboard'
              );
            })
            .catch((err) => {
              console.error('Failed to copy to clipboard', err);
              toast.error('Failed to copy to clipboard');
            });
        }
      }
    },
    [data, gridSelection, selectedCell]
  );

  const handleContainerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && showSearch) {
      e.preventDefault();
      setShowSearch(false);
      setSearchValue('');
      return;
    }

    const target = e.target as HTMLElement;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      return;
    }

    const isCmdOrCtrl = e.metaKey || e.ctrlKey;
    if (!isCmdOrCtrl) return;

    if (e.key.toLowerCase() === 'a') {
      e.preventDefault();
      handleSelectAll();
    } else if (e.key.toLowerCase() === 'c') {
      e.preventDefault();
      handleCopy(e.shiftKey);
    } else if (e.key.toLowerCase() === 'f') {
      e.preventDefault();
      setShowSearch((prev) => !prev);
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

          {currentStatus && (
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
                  currentStatus.type === 'success'
                    ? 'rgba(6, 78, 59, 0.7)'
                    : 'rgba(127, 29, 29, 0.7)',
                color: currentStatus.type === 'success' ? '#34d399' : '#f87171',
                border: `1px solid ${
                  currentStatus.type === 'success' ? '#059669' : '#b91c1c'
                }`,
              }}
            >
              {currentStatus.type === 'success' ? (
                <CheckCircle2 size={12} />
              ) : (
                <AlertCircle size={12} />
              )}
              <span>{currentStatus.text}</span>
              <button
                type="button"
                aria-label="Dismiss status message"
                data-testid="dismiss-status-badge-btn"
                onClick={() => setCurrentStatus(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '1px',
                  marginLeft: '4px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  color: 'inherit',
                  opacity: 0.7,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
              >
                <X size={11} />
              </button>
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
          <ContextMenu.Root>
            <ContextMenu.Trigger asChild>
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
                  showSearch={showSearch}
                  onSearchClose={() => {
                    setShowSearch(false);
                    setSearchValue('');
                  }}
                  searchValue={searchValue}
                  onSearchValueChange={setSearchValue}
                  theme={gridTheme}
                />
              </div>
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Content
                data-testid="grid-context-menu"
                className="z-50 min-w-[180px] bg-[#252526] text-white border border-[#3e3e42] rounded-md shadow-xl py-1 px-1 text-xs select-none"
              >
                <ContextMenu.Item
                  data-testid="ctx-menu-copy"
                  className="px-2 py-1.5 flex items-center justify-between rounded hover:bg-[#094771] cursor-pointer outline-none"
                  onSelect={() => handleCopy(false)}
                >
                  <span>Copy</span>
                  <span className="text-gray-400 text-[10px]">⌘C</span>
                </ContextMenu.Item>
                <ContextMenu.Item
                  data-testid="ctx-menu-copy-headers"
                  className="px-2 py-1.5 flex items-center justify-between rounded hover:bg-[#094771] cursor-pointer outline-none"
                  onSelect={() => handleCopy(true)}
                >
                  <span>Copy with Headers</span>
                  <span className="text-gray-400 text-[10px]">⇧⌘C</span>
                </ContextMenu.Item>
                <ContextMenu.Separator className="h-px bg-[#3e3e42] my-1" />
                <ContextMenu.Item
                  data-testid="ctx-menu-select-all"
                  className="px-2 py-1.5 flex items-center justify-between rounded hover:bg-[#094771] cursor-pointer outline-none"
                  onSelect={handleSelectAll}
                >
                  <span>Select All</span>
                  <span className="text-gray-400 text-[10px]">⌘A</span>
                </ContextMenu.Item>
                <ContextMenu.Item
                  data-testid="ctx-menu-find"
                  className="px-2 py-1.5 flex items-center justify-between rounded hover:bg-[#094771] cursor-pointer outline-none"
                  onSelect={() => setShowSearch(true)}
                >
                  <span>Find in Table</span>
                  <span className="text-gray-400 text-[10px]">⌘F</span>
                </ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Portal>
          </ContextMenu.Root>
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
        isAutoCommit={activeIsAutoCommit}
        onToggleAutoCommit={handleToggleAutoCommit}
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
