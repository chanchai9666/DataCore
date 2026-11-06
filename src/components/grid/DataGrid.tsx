import React, { useState, useCallback, useMemo } from 'react';
import DataEditor, {
  GridCell,
  Item,
  GridSelection,
  CompactSelection,
  Theme,
  type EditableGridCell,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import { Eye, Loader2, Database } from 'lucide-react';
import { QueryResult, CellValue } from '../../types/db';
import { PaginationBar } from './PaginationBar';
import { CellDetailDrawer } from './CellDetailDrawer';
import { createGridColumns, createCellContent } from './gridUtils';

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
  theme?: 'dark' | 'light';
}

const darkGridTheme: Partial<Theme> = {
  accentColor: '#3b82f6',
  accentLight: 'rgba(59, 130, 246, 0.1)',
  bgCell: '#181818',
  bgCellMedium: '#1f1f1f',
  bgHeader: '#222222',
  bgHeaderHasFocus: '#2a2a2a',
  bgHeaderHovered: '#262626',
  borderColor: '#333333',
  headerBottomBorderColor: '#3a3a3a',
  textDark: '#e5e7eb',
  textMedium: '#9ca3af',
  textLight: '#6b7280',
  textHeader: '#d1d5db',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  baseFontStyle: '13px',
  headerFontStyle: '600 12px',
  editorFontSize: '13px',
};

const lightGridTheme: Partial<Theme> = {
  accentColor: '#2563eb',
  accentLight: 'rgba(37, 99, 235, 0.1)',
  bgCell: '#ffffff',
  bgCellMedium: '#f9fafb',
  bgHeader: '#f3f4f6',
  bgHeaderHasFocus: '#e5e7eb',
  bgHeaderHovered: '#ebebeb',
  borderColor: '#e5e7eb',
  headerBottomBorderColor: '#d1d5db',
  textDark: '#111827',
  textMedium: '#4b5563',
  textLight: '#9ca3af',
  textHeader: '#374151',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  baseFontStyle: '13px',
  headerFontStyle: '600 12px',
  editorFontSize: '13px',
};

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
  theme = 'dark',
}) => {
  const [selectedCell, setSelectedCell] = useState<Item | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [gridSelection, setGridSelection] = useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
    current: undefined,
  });

  const columns = useMemo(() => {
    if (!data?.columns) return [];
    return createGridColumns(data.columns);
  }, [data?.columns]);

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

  const gridTheme = theme === 'dark' ? darkGridTheme : lightGridTheme;

  return (
    <div
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Database size={14} style={{ color: '#3b82f6' }} />
          <span style={{ color: 'var(--text-secondary, #aaaaaa)' }}>
            {data?.columns ? `${data.columns.length} columns` : '0 columns'}
          </span>
          {data?.execution_time_ms !== undefined && (
            <span style={{ color: 'var(--text-muted, #777777)' }}>
              ({data.execution_time_ms} ms)
            </span>
          )}
        </div>

        <button
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
            color: rowsCount > 0 ? 'var(--text-primary, #ffffff)' : 'var(--text-disabled, #666666)',
            border: '1px solid var(--border-color, #444444)',
            borderRadius: '4px',
            cursor: rowsCount > 0 ? 'pointer' : 'not-allowed',
            opacity: rowsCount > 0 ? 1 : 0.6,
          }}
        >
          <Eye size={13} />
          Inspect Cell
        </button>
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
              rowMarkers="number"
              smoothScrollX
              smoothScrollY
              gridSelection={gridSelection}
              onGridSelectionChange={setGridSelection}
              onCellActivated={handleCellActivated}
              onCellClicked={handleCellClicked}
              onCellEdited={onCellEdited}
              theme={gridTheme}
            />
          </div>
        )}
      </div>

      {/* Pagination Bar */}
      <PaginationBar
        page={page}
        pageSize={pageSize}
        totalRows={computedTotalRows}
        onPageChange={onPageChange || (() => {})}
        onPageSizeChange={onPageSizeChange}
        onRefresh={onRefresh}
        isLoading={isLoading}
      />

      {/* Detail Drawer */}
      <CellDetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        cellInfo={activeCellInfo}
      />
    </div>
  );
};

export default DataGrid;
