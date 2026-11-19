import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
import { Eye, Loader2, Database, CheckCircle2, AlertCircle, Filter, Download, X, ChevronRight } from 'lucide-react';
import { QueryResult, CellValue, TableFilterState, TableSortState } from '../../types/db';
import { CellDetailDrawer } from './CellDetailDrawer';
import { FilterBar } from './FilterBar';
import { GridBottomBar } from './GridBottomBar';
import { RecordFormView } from './RecordFormView';
import { lightGridTheme, darkGridTheme } from './gridTheme';
import { usePendingChangesStore } from '../../stores/pendingChangesStore';
import { useFastEditStore } from '../../stores/fastEditStore';
import { useStatusStore } from '../../stores/statusStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { createGridColumns, createCellContent } from './gridUtils';
import { sanitizeEditedCellValue } from './tableEditHelpers';
import {
  validateCellValueForColumn,
  parseClipboardTsv,
  computePasteOperations,
} from './fastEditUtils';
import { isSensitiveColumn } from '../../utils/piiDetector';
import { showConfirmDialog } from '../../utils/dialog';
import {
  formatSelectionAsText,
  formatSelectionAsSqlInsert,
  formatSelectionAsJson,
  formatSelectionAsMarkdownTable,
  formatSelectionAsSqlInClause,
  formatSelectionAsCsv,
} from './clipboardUtils';
import { toast } from 'sonner';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { ExportModal } from '../transfer/ExportModal';
import { ForeignKeyPeekPopover } from './ForeignKeyPeekPopover';
import type { TableForeignKeyStructure } from '../../api/queryBuilder';

export interface DataGridProps {
  data: QueryResult | null;
  isLoading?: boolean;
  page?: number;
  pageSize?: number;
  totalRows?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  isApproximateCount?: boolean;
  onExactCount?: () => void;
  isCountingExact?: boolean;
  paginationMode?: 'offset' | 'keyset';
  canUseKeyset?: boolean;
  onTogglePaginationMode?: () => void;
  hasMoreKeyset?: boolean;
  onRefresh?: () => void;
  onCellEdited?: (cell: readonly [number, number], newValue: EditableGridCell) => void;
  onRowDelete?: (rowIndex: number) => void;
  onRowsDelete?: (rowIndices: number[]) => void;
  onAddRow?: () => void;
  isEditable?: boolean;
  isReadOnly?: boolean;
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
  isMasked?: boolean;
  onToggleMask?: () => void;
  defaultMasked?: boolean;
  foreignKeys?: TableForeignKeyStructure[];
  onNavigateToRecord?: (foreignTable: string, foreignColumn: string, value: unknown) => void;
  onPeekForeignKey?: (foreignTable: string, foreignColumn: string, value: unknown) => Promise<Record<string, unknown> | null>;
}

export const DataGrid: React.FC<DataGridProps> = ({
  data,
  isLoading = false,
  page = 1,
  pageSize = 100,
  totalRows,
  onPageChange,
  onPageSizeChange,
  isApproximateCount,
  onExactCount,
  isCountingExact,
  paginationMode,
  canUseKeyset,
  onTogglePaginationMode,
  hasMoreKeyset,
  onRefresh,
  onCellEdited,
  onRowDelete,
  onRowsDelete,
  onAddRow,
  isEditable = false,
  isReadOnly: isReadOnlyProp,
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
  isMasked: isMaskedProp,
  onToggleMask: onToggleMaskProp,
  defaultMasked = true,
  foreignKeys,
  onNavigateToRecord,
  onPeekForeignKey,
}) => {
  const { t } = useTranslation();
  const connection = useConnectionStore((state) =>
    connectionId ? state.connections.find((c) => c.id === connectionId) : undefined
  );
  const effectiveReadOnly = isReadOnlyProp ?? Boolean(connection?.readOnly || connection?.read_only);
  const effectiveIsEditable = isEditable && !effectiveReadOnly;

  const [internalIsMasked, setInternalIsMasked] = useState(defaultMasked);
  const activeIsMasked = isMaskedProp !== undefined ? isMaskedProp : internalIsMasked;
  const handleToggleMask = onToggleMaskProp ?? (() => setInternalIsMasked((prev) => !prev));

  const [selectedCell, setSelectedCell] = useState<Item | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'form'>('grid');
  const [formRowIndex, setFormRowIndex] = useState<number>(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fkPopoverInfo, setFkPopoverInfo] = useState<{
    isOpen: boolean;
    targetTable: string;
    targetColumn: string;
    value: unknown;
    position: { x: number; y: number };
  } | null>(null);
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

  const activeFilterConditionsCount = useMemo(() => {
    if (!activeFilterState.enabled) return 0;
    return activeFilterState.conditions.filter(
      (c) =>
        c.column &&
        (c.operator === 'IS NULL' ||
          c.operator === 'IS NOT NULL' ||
          (c.value !== undefined && c.value.trim() !== ''))
    ).length;
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
  const fastEditStoreEnabled = useFastEditStore((s) =>
    connectionId ? Boolean(s.fastEditByConnection[connectionId]) : false
  );
  const activeIsFastEdit = Boolean(
    connectionId && effectiveIsEditable && !effectiveReadOnly && fastEditStoreEnabled
  );
  const storeIsAutoCommit = usePendingChangesStore((s) => s.isAutoCommitMode(tableKey));
  const activeIsAutoCommit = activeIsFastEdit
    ? false
    : isAutoCommitProp !== undefined
    ? isAutoCommitProp
    : storeIsAutoCommit;
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
        const cell = createCellContent(rawVal, columnMeta, activeIsMasked, activeIsFastEdit);
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
      let cell = createCellContent(rawVal, columnMeta, activeIsMasked, activeIsFastEdit);

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
    [data, baseRowsCount, tableChanges, theme, activeIsMasked, activeIsFastEdit]
  );

  const activeCellInfo = useMemo(() => {
    if (!data || !data.rows.length || !data.columns.length) return null;
    const colIdx = selectedCell ? selectedCell[0] : 0;
    const rowIdx = selectedCell ? selectedCell[1] : 0;

    const columnMeta = data.columns[colIdx];
    const rowData = data.rows[rowIdx];

    const cellKey = `${rowIdx}:${colIdx}`;
    const stagedEdit = tableChanges?.cellEdits?.[cellKey];
    const isAddedRow = rowIdx >= baseRowsCount;

    let cellValue: CellValue;
    let originalValue: CellValue | undefined = undefined;
    let isStaged = false;

    if (isAddedRow) {
      const addedRow = tableChanges?.addedRows?.[rowIdx - baseRowsCount];
      const colName = columnMeta?.name;
      cellValue = (colName && addedRow ? (addedRow[colName] as CellValue) : null) ?? null;
      isStaged = true;
    } else {
      const rawOriginal = rowData ? rowData[colIdx] : null;
      if (stagedEdit) {
        cellValue = stagedEdit.newValue as CellValue;
        originalValue = rawOriginal;
        isStaged = true;
      } else {
        cellValue = rawOriginal;
      }
    }

    const colName = columnMeta?.name;
    const matchedFk = foreignKeys?.find((fk) => colName && fk.columnNames.includes(colName));
    const foreignKeyInfo = matchedFk
      ? {
          foreignTable: matchedFk.foreignTableName,
          foreignColumn: matchedFk.foreignColumnNames[0] || 'id',
        }
      : undefined;

    return {
      columnName: columnMeta ? columnMeta.name : `Column ${colIdx + 1}`,
      dataType: columnMeta ? columnMeta.data_type : 'UNKNOWN',
      value: cellValue,
      originalValue,
      isStaged,
      rowIndex: rowIdx,
      colIndex: colIdx,
      foreignKeyInfo,
    };
  }, [data, selectedCell, tableChanges, baseRowsCount, foreignKeys]);

  const handleCellActivated = useCallback(
    (cell: Item) => {
      setSelectedCell(cell);
      if (activeIsFastEdit) {
        return;
      }
      setDrawerOpen(true);
    },
    [activeIsFastEdit]
  );

  const handleCellClicked = useCallback(
    (cell: Item, event?: { metaKey?: boolean; ctrlKey?: boolean; bounds?: { x: number; y: number } }) => {
      setSelectedCell(cell);

      if ((event?.metaKey || event?.ctrlKey) && foreignKeys && foreignKeys.length > 0 && data) {
        const [colIdx, rowIdx] = cell;
        const colName = data.columns[colIdx]?.name;
        const matchedFk = foreignKeys.find((fk) => colName && fk.columnNames.includes(colName));
        if (matchedFk) {
          const rowData = data.rows[rowIdx];
          const rawValue = rowData ? rowData[colIdx] : null;
          setFkPopoverInfo({
            isOpen: true,
            targetTable: matchedFk.foreignTableName,
            targetColumn: matchedFk.foreignColumnNames[0] || 'id',
            value: rawValue,
            position: event.bounds ? { x: event.bounds.x, y: event.bounds.y } : { x: 300, y: 300 },
          });
        }
      }
    },
    [data, foreignKeys]
  );

  const handleInspectClick = () => {
    if (!selectedCell && rowsCount > 0 && columns.length > 0) {
      setSelectedCell([0, 0]);
    }
    setDrawerOpen(true);
  };

  useEffect(() => {
    if (selectedCell && columns[selectedCell[0]]) {
      const colName = columns[selectedCell[0]].title || columns[selectedCell[0]].id;
      useStatusStore.getState().setStatus({
        selectedCellInfo: `${colName} : Row ${selectedCell[1] + 1}`,
      });
    } else {
      useStatusStore.getState().setStatus({ selectedCellInfo: null });
    }
  }, [selectedCell, columns]);

  const handleCellEditedWithStaging = useCallback(
    (cell: readonly [number, number], newValue: EditableGridCell) => {
      if (effectiveReadOnly) return;
      const [colIndex, rowIndex] = cell;
      const colMeta = data?.columns[colIndex];
      const oldValue = data?.rows[rowIndex]?.[colIndex];

      if (activeIsFastEdit && colMeta) {
        if (activeIsMasked && isSensitiveColumn(colMeta.name)) {
          toast.warning('Unmask PII columns before editing masked cells.');
          return;
        }

        const rawInput =
          'data' in newValue
            ? (newValue as any).data === undefined || (newValue as any).data === null
              ? 'NULL'
              : String((newValue as any).data)
            : '';

        const validation = validateCellValueForColumn(rawInput, colMeta);
        if (!validation.valid) {
          toast.error(validation.reason);
          return;
        }

        const store = usePendingChangesStore.getState();
        if (rowIndex >= baseRowsCount) {
          store.updateAddedRowCell(tableKey, rowIndex - baseRowsCount, colMeta.name, validation.value);
        } else {
          store.stageCellEdit(tableKey, {
            rowIndex,
            colIndex,
            colName: colMeta.name,
            oldValue,
            newValue: validation.value,
          });
        }
        return;
      }

      if (!activeIsAutoCommit) {
        if (colMeta) {
          let val: unknown = 'data' in newValue ? (newValue as any).data : newValue;
          if (newValue.kind === GridCellKind.Text) {
            if (val === 'NULL' || (val === '' && newValue.displayData === 'NULL')) {
              val = null;
            }
          }
          val = sanitizeEditedCellValue(val, colMeta);

          const store = usePendingChangesStore.getState();
          if (rowIndex >= baseRowsCount) {
            store.updateAddedRowCell(tableKey, rowIndex - baseRowsCount, colMeta.name, val);
          } else {
            store.stageCellEdit(tableKey, {
              rowIndex,
              colIndex,
              colName: colMeta.name,
              oldValue,
              newValue: val,
            });
          }
        }
      } else {
        onCellEdited?.(cell, newValue);
      }
    },
    [data, tableKey, activeIsAutoCommit, activeIsFastEdit, activeIsMasked, baseRowsCount, onCellEdited, effectiveReadOnly]
  );

  const handleGridPaste = useCallback(
    (target: Item, values: readonly (readonly string[])[]): boolean => {
      if (!activeIsFastEdit || effectiveReadOnly || !data?.columns.length) {
        return false;
      }
      const [startCol, startRow] = target;
      const store = usePendingChangesStore.getState();
      const currentChanges = store.getTableChanges(tableKey);

      const ops = computePasteOperations({
        startCol,
        startRow,
        matrix: values,
        columns: data.columns,
        baseRowsCount,
        existingAddedRowsCount: currentChanges.addedRows.length,
        deletedRowIndices: currentChanges.deletedRowIndices,
        isMasked: activeIsMasked,
        getOriginalValue: (rIdx, cIdx) => data.rows[rIdx]?.[cIdx],
      });

      for (const edit of ops.cellEdits) {
        store.stageCellEdit(tableKey, edit);
      }
      for (const update of ops.addedRowUpdates) {
        store.updateAddedRowCell(tableKey, update.addedRowIndex, update.colName, update.value);
      }
      for (const newRow of ops.newRows) {
        store.stageAddRow(tableKey, newRow);
      }

      if (ops.skippedMaskedCount > 0) {
        toast.warning('Unmask PII columns before pasting into masked cells.');
      }
      if (ops.invalidCells.length > 0) {
        toast.error(ops.invalidCells[0].reason);
      }

      // Return false so Glide Data Grid does not also run its internal paste
      return false;
    },
    [activeIsFastEdit, effectiveReadOnly, data, tableKey, baseRowsCount, activeIsMasked]
  );

  const handleSaveDrawerValue = useCallback(
    (newVal: unknown) => {
      if (selectedCell) {
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
        handleCellEditedWithStaging([col, row], cell);
      }
    },
    [selectedCell, handleCellEditedWithStaging]
  );

  const gridTheme = theme === 'dark' ? darkGridTheme : lightGridTheme;

  const handleDeleteSelected = useCallback(async () => {
    if (hasSelectedRows) {
      if (selectedRowIndices.length > 1) {
        if (onRowsDelete) {
          onRowsDelete(selectedRowIndices);
        } else if (onRowDelete) {
          const confirmed = await showConfirmDialog(
            `Are you sure you want to delete ${selectedRowIndices.length} rows?`,
            { title: 'Delete Rows', kind: 'warning' }
          );
          if (confirmed) {
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

  const handleToggleFastEdit = useCallback(async () => {
    if (!connectionId || effectiveReadOnly || !effectiveIsEditable) return;
    if (!activeIsFastEdit) {
      const confirmed = await showConfirmDialog(
        t(
          'grid.fastEditConfirmMessage',
          'Warning: Fast Edit Mode allows direct inline editing and Excel-style multi-cell paste in the table. Auto-Commit will be disabled, so you must manually Commit (or press Cmd+S / Ctrl+S) to save changes to the database. Enable Fast Edit Mode?'
        ),
        {
          title: t('grid.fastEditConfirmTitle', 'Enable Fast Edit Mode'),
          kind: 'warning',
        }
      );
      if (!confirmed) return;
    }
    const nextEnabled = useFastEditStore.getState().toggleFastEdit(connectionId);
    if (nextEnabled) {
      usePendingChangesStore.getState().setAutoCommitMode(tableKey, false);
    }
  }, [connectionId, effectiveReadOnly, effectiveIsEditable, activeIsFastEdit, tableKey, t]);

  const handleToggleAutoCommit = useCallback(async () => {
    if (activeIsFastEdit) return;
    if (onToggleAutoCommitProp) {
      onToggleAutoCommitProp();
      return;
    }
    if (activeIsAutoCommit) {
      usePendingChangesStore.getState().setAutoCommitMode(tableKey, false);
    } else {
      if (hasPending) {
        const confirmed = await showConfirmDialog(
          'You have uncommitted changes in Staging Mode. Switching to Auto-Commit will discard these pending changes. Do you want to proceed?',
          { title: 'Switch to Auto-Commit', kind: 'warning' }
        );
        if (!confirmed) return;
        usePendingChangesStore.getState().discardChanges(tableKey);
      }
      usePendingChangesStore.getState().setAutoCommitMode(tableKey, true);
    }
  }, [onToggleAutoCommitProp, activeIsAutoCommit, hasPending, tableKey]);

  const handleCommitChanges = async () => {
    if (hasPending) {
      const confirmed = await showConfirmDialog(
        t('grid.commitConfirmMessage', {
          count: pendingCount,
          defaultValue: `Warning: You are about to commit ${pendingCount} pending change(s) to the database. This action will modify real database records. Do you want to proceed?`,
        }),
        {
          title: t('grid.commitConfirmTitle', 'Confirm Commit Changes'),
          kind: 'warning',
        }
      );
      if (!confirmed) return;
    }
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
      const text = formatSelectionAsText(sel, data, includeHeaders, activeIsMasked);
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
    [data, gridSelection, selectedCell, activeIsMasked]
  );

  const handleCopyAs = useCallback(
    (format: 'insert' | 'json' | 'markdown' | 'in' | 'csv') => {
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

      let text: string | null = null;
      let label = '';

      switch (format) {
        case 'insert':
          text = formatSelectionAsSqlInsert(sel, data, tableName || 'my_table', activeIsMasked);
          label = 'SQL INSERT';
          break;
        case 'json':
          text = formatSelectionAsJson(sel, data, activeIsMasked);
          label = 'JSON';
          break;
        case 'markdown':
          text = formatSelectionAsMarkdownTable(sel, data, activeIsMasked);
          label = 'Markdown Table';
          break;
        case 'in':
          text = formatSelectionAsSqlInClause(sel, data, activeIsMasked);
          label = 'SQL IN (...)';
          break;
        case 'csv':
          text = formatSelectionAsCsv(sel, data, true, activeIsMasked);
          label = 'CSV';
          break;
      }

      if (text !== null && navigator?.clipboard?.writeText) {
        navigator.clipboard
          .writeText(text)
          .then(() => {
            toast.success(`Copied as ${label}`);
          })
          .catch((err) => {
            console.error(`Failed to copy as ${label}`, err);
            toast.error(`Failed to copy as ${label}`);
          });
      }
    },
    [data, gridSelection, selectedCell, activeIsMasked, tableName]
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
    } else if (e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (!effectiveReadOnly && hasPending) {
        handleCommitChanges();
      }
    }
  };

  const handleContainerPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (!activeIsFastEdit || effectiveReadOnly || rowsCount > 0 || !data?.columns.length) {
      return;
    }
    const text = e.clipboardData?.getData('text/plain');
    if (!text) return;
    const matrix = parseClipboardTsv(text);
    if (matrix.length === 0) return;
    e.preventDefault();
    handleGridPaste([0, 0], matrix);
  };

  return (
    <div
      data-testid="data-grid-container"
      tabIndex={0}
      onKeyDown={handleContainerKeyDown}
      onPaste={handleContainerPaste}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: 'var(--bg-grid)',
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
                ? theme === 'light' ? '#2563eb' : '#1e40af'
                : isFilterVisible
                ? theme === 'light' ? '#dbeafe' : '#1e3a8a'
                : 'var(--btn-bg, #2b2b2b)',
              color: isFilterActive
                ? '#ffffff'
                : isFilterVisible
                ? theme === 'light' ? '#1d4ed8' : '#ffffff'
                : 'var(--text-primary, #ffffff)',
              border: isFilterActive
                ? '1px solid #3b82f6'
                : isFilterVisible
                ? theme === 'light' ? '1px solid #93c5fd' : '1px solid #3b82f6'
                : '1px solid var(--border-color, #444444)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 500,
              transition: 'all 0.15s ease',
            }}
          >
            <Filter size={13} />
            <span>Filter</span>
            {isFilterActive && activeFilterConditionsCount > 0 && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                  color: '#ffffff',
                  fontSize: '10px',
                  fontWeight: 600,
                  borderRadius: '9999px',
                  padding: '0 5px',
                  minWidth: '16px',
                  height: '16px',
                  lineHeight: '16px',
                  marginLeft: '2px',
                }}
              >
                {activeFilterConditionsCount}
              </span>
            )}
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
        ) : viewMode === 'form' ? (
          <RecordFormView
            columns={data.columns || []}
            rows={data.rows || []}
            selectedRowIndex={formRowIndex}
            onSelectRowIndex={(idx) => {
              setFormRowIndex(idx);
              setSelectedCell([0, idx]);
            }}
            isReadOnly={effectiveReadOnly || !effectiveIsEditable}
            isMasked={activeIsMasked}
            foreignKeys={foreignKeys}
            onEditField={
              effectiveReadOnly || !effectiveIsEditable
                ? undefined
                : (rowIdx, colIdx, newVal) => {
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
                    handleCellEditedWithStaging([colIdx, rowIdx], cell);
                  }
            }
            onNavigateToRecord={onNavigateToRecord}
          />
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
                  onCellEdited={effectiveReadOnly ? undefined : handleCellEditedWithStaging}
                  editOnType={activeIsFastEdit}
                  onPaste={activeIsFastEdit ? handleGridPaste : undefined}
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
                className="z-50 min-w-[180px] bg-white dark:bg-[#252526] text-gray-800 dark:text-white border border-gray-200 dark:border-[#3e3e42] rounded-md shadow-xl py-1 px-1 text-xs select-none"
              >
                <ContextMenu.Item
                  data-testid="ctx-menu-copy"
                  className="px-2 py-1.5 flex items-center justify-between rounded hover:bg-blue-50 dark:hover:bg-[#094771] hover:text-blue-600 dark:hover:text-white cursor-pointer outline-none"
                  onSelect={() => handleCopy(false)}
                >
                  <span>Copy</span>
                  <span className="text-gray-400 text-[10px]">⌘C</span>
                </ContextMenu.Item>
                <ContextMenu.Item
                  data-testid="ctx-menu-copy-headers"
                  className="px-2 py-1.5 flex items-center justify-between rounded hover:bg-blue-50 dark:hover:bg-[#094771] hover:text-blue-600 dark:hover:text-white cursor-pointer outline-none"
                  onSelect={() => handleCopy(true)}
                >
                  <span>Copy with Headers</span>
                  <span className="text-gray-400 text-[10px]">⇧⌘C</span>
                </ContextMenu.Item>
                <ContextMenu.Sub>
                  <ContextMenu.SubTrigger
                    data-testid="ctx-menu-copy-as"
                    className="px-2 py-1.5 flex items-center justify-between rounded hover:bg-blue-50 dark:hover:bg-[#094771] hover:text-blue-600 dark:hover:text-white cursor-pointer outline-none"
                  >
                    <span>Copy As</span>
                    <ChevronRight size={12} className="text-gray-400" />
                  </ContextMenu.SubTrigger>
                  <ContextMenu.Portal>
                    <ContextMenu.SubContent
                      data-testid="ctx-menu-copy-as-content"
                      className="z-50 min-w-[160px] bg-white dark:bg-[#252526] text-gray-800 dark:text-white border border-gray-200 dark:border-[#3e3e42] rounded-md shadow-xl py-1 px-1 text-xs select-none"
                    >
                      <ContextMenu.Item
                        data-testid="ctx-menu-copy-insert"
                        className="px-2 py-1.5 flex items-center justify-between rounded hover:bg-blue-50 dark:hover:bg-[#094771] hover:text-blue-600 dark:hover:text-white cursor-pointer outline-none"
                        onSelect={() => handleCopyAs('insert')}
                      >
                        <span>SQL INSERT</span>
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        data-testid="ctx-menu-copy-json"
                        className="px-2 py-1.5 flex items-center justify-between rounded hover:bg-blue-50 dark:hover:bg-[#094771] hover:text-blue-600 dark:hover:text-white cursor-pointer outline-none"
                        onSelect={() => handleCopyAs('json')}
                      >
                        <span>JSON</span>
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        data-testid="ctx-menu-copy-markdown"
                        className="px-2 py-1.5 flex items-center justify-between rounded hover:bg-blue-50 dark:hover:bg-[#094771] hover:text-blue-600 dark:hover:text-white cursor-pointer outline-none"
                        onSelect={() => handleCopyAs('markdown')}
                      >
                        <span>Markdown Table</span>
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        data-testid="ctx-menu-copy-in"
                        className="px-2 py-1.5 flex items-center justify-between rounded hover:bg-blue-50 dark:hover:bg-[#094771] hover:text-blue-600 dark:hover:text-white cursor-pointer outline-none"
                        onSelect={() => handleCopyAs('in')}
                      >
                        <span>SQL IN (...)</span>
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        data-testid="ctx-menu-copy-csv"
                        className="px-2 py-1.5 flex items-center justify-between rounded hover:bg-blue-50 dark:hover:bg-[#094771] hover:text-blue-600 dark:hover:text-white cursor-pointer outline-none"
                        onSelect={() => handleCopyAs('csv')}
                      >
                        <span>CSV</span>
                      </ContextMenu.Item>
                    </ContextMenu.SubContent>
                  </ContextMenu.Portal>
                </ContextMenu.Sub>
                <ContextMenu.Separator className="h-px bg-gray-200 dark:bg-[#3e3e42] my-1" />
                <ContextMenu.Item
                  data-testid="ctx-menu-select-all"
                  className="px-2 py-1.5 flex items-center justify-between rounded hover:bg-blue-50 dark:hover:bg-[#094771] hover:text-blue-600 dark:hover:text-white cursor-pointer outline-none"
                  onSelect={handleSelectAll}
                >
                  <span>Select All</span>
                  <span className="text-gray-400 text-[10px]">⌘A</span>
                </ContextMenu.Item>
                <ContextMenu.Item
                  data-testid="ctx-menu-find"
                  className="px-2 py-1.5 flex items-center justify-between rounded hover:bg-blue-50 dark:hover:bg-[#094771] hover:text-blue-600 dark:hover:text-white cursor-pointer outline-none"
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
        isApproximateCount={isApproximateCount ?? Boolean(data?.is_approximate_count)}
        onExactCount={onExactCount}
        isCountingExact={isCountingExact}
        paginationMode={paginationMode}
        canUseKeyset={canUseKeyset}
        onTogglePaginationMode={onTogglePaginationMode}
        hasMoreKeyset={hasMoreKeyset}
        onRefresh={onRefresh}
        isLoading={isLoading}
        isReadOnly={effectiveReadOnly}
        onAddRow={effectiveIsEditable && onAddRow ? onAddRow : undefined}
        onDeleteRow={effectiveIsEditable ? handleDeleteSelected : undefined}
        canDelete={effectiveIsEditable && (hasSelectedRows || selectedCell !== null)}
        isAutoCommit={activeIsAutoCommit}
        onToggleAutoCommit={effectiveReadOnly ? undefined : handleToggleAutoCommit}
        isFastEdit={activeIsFastEdit}
        onToggleFastEdit={
          connectionId && effectiveIsEditable && !effectiveReadOnly
            ? handleToggleFastEdit
            : undefined
        }
        hasPendingChanges={hasPending}
        pendingCount={pendingCount}
        onCommit={handleCommitChanges}
        onDiscard={handleDiscardChanges}
        isMasked={activeIsMasked}
        onToggleMask={handleToggleMask}
        viewMode={viewMode}
        onViewModeChange={(mode) => {
          if (mode === 'form') {
            setFormRowIndex(selectedCell ? selectedCell[1] : 0);
          }
          setViewMode(mode);
        }}
      />

      {/* Detail Drawer */}
      <CellDetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        cellInfo={activeCellInfo}
        onSaveValue={effectiveIsEditable && (isEditable || Boolean(onCellEdited)) ? handleSaveDrawerValue : undefined}
        onNavigateToForeignKey={onNavigateToRecord}
      />

      {/* Foreign Key Peek Popover */}
      {fkPopoverInfo && (
        <ForeignKeyPeekPopover
          isOpen={fkPopoverInfo.isOpen}
          onClose={() => setFkPopoverInfo(null)}
          targetTable={fkPopoverInfo.targetTable}
          targetColumn={fkPopoverInfo.targetColumn}
          value={fkPopoverInfo.value}
          position={fkPopoverInfo.position}
          onNavigate={onNavigateToRecord}
          onPeek={onPeekForeignKey}
        />
      )}

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
