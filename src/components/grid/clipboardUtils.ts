import { GridSelection } from '@glideapps/glide-data-grid';
import { QueryResult, CellValue } from '../../types/db';
import { extractCellValue } from './gridUtils';

export function formatCellValue(val: unknown): string {
  return extractCellValue(val as CellValue).displayString;
}

export function formatSelectionAsText(
  selection: GridSelection,
  data: QueryResult,
  includeHeaders: boolean = false
): string | null {
  if (!data || !data.rows || data.rows.length === 0 || !data.columns || data.columns.length === 0) {
    return null;
  }

  const numCols = data.columns.length;
  const numRows = data.rows.length;

  const colIndices = selection.columns ? selection.columns.toArray() : [];
  const rowIndices = selection.rows ? selection.rows.toArray() : [];

  let targetCols: number[] = [];
  let targetRows: number[] = [];

  if (colIndices.length > 0 && rowIndices.length > 0) {
    // Both columns and rows selected (e.g. Select All or cross selection)
    targetCols = colIndices.filter((c) => c >= 0 && c < numCols);
    targetRows = rowIndices.filter((r) => r >= 0 && r < numRows);
  } else if (colIndices.length > 0) {
    // Column selection (entire column(s) across all rows)
    targetCols = colIndices.filter((c) => c >= 0 && c < numCols);
    targetRows = Array.from({ length: numRows }, (_, i) => i);
  } else if (rowIndices.length > 0) {
    // Row selection (entire row(s) across all columns)
    targetCols = Array.from({ length: numCols }, (_, i) => i);
    targetRows = rowIndices.filter((r) => r >= 0 && r < numRows);
  } else if (selection.current?.range) {
    // Rectangular range selection
    const { x, y, width, height } = selection.current.range;
    for (let c = x; c < x + width && c < numCols; c++) {
      if (c >= 0) targetCols.push(c);
    }
    for (let r = y; r < y + height && r < numRows; r++) {
      if (r >= 0) targetRows.push(r);
    }
  } else if (selection.current?.cell) {
    // Single cell selection
    const [c, r] = selection.current.cell;
    if (c >= 0 && c < numCols && r >= 0 && r < numRows) {
      targetCols = [c];
      targetRows = [r];
    }
  }

  if (targetCols.length === 0 || targetRows.length === 0) {
    return null;
  }

  const lines: string[] = [];

  if (includeHeaders) {
    const headerLine = targetCols.map((c) => data.columns[c]?.name || '').join('\t');
    lines.push(headerLine);
  }

  for (const r of targetRows) {
    const rowData = data.rows[r];
    if (!rowData) continue;
    const rowStr = targetCols.map((c) => formatCellValue(rowData[c])).join('\t');
    lines.push(rowStr);
  }

  return lines.join('\n');
}
