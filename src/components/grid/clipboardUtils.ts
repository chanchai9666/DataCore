import { GridSelection } from '@glideapps/glide-data-grid';
import { QueryResult, CellValue } from '../../types/db';
import { extractCellValue } from './gridUtils';
import { isSensitiveColumn, maskCellValue } from '../../utils/piiDetector';

export function formatCellValue(val: unknown, columnName?: string, isMasked: boolean = false): string {
  const extracted = extractCellValue(val as CellValue);
  if (isMasked && columnName && isSensitiveColumn(columnName)) {
    return maskCellValue(extracted.displayString, columnName);
  }
  return extracted.displayString;
}

export function getTargetColsAndRows(
  selection: GridSelection,
  data: QueryResult
): { targetCols: number[]; targetRows: number[] } | null {
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
    targetCols = colIndices.filter((c) => c >= 0 && c < numCols);
    targetRows = rowIndices.filter((r) => r >= 0 && r < numRows);
  } else if (colIndices.length > 0) {
    targetCols = colIndices.filter((c) => c >= 0 && c < numCols);
    targetRows = Array.from({ length: numRows }, (_, i) => i);
  } else if (rowIndices.length > 0) {
    targetCols = Array.from({ length: numCols }, (_, i) => i);
    targetRows = rowIndices.filter((r) => r >= 0 && r < numRows);
  } else if (selection.current?.range) {
    const { x, y, width, height } = selection.current.range;
    for (let c = x; c < x + width && c < numCols; c++) {
      if (c >= 0) targetCols.push(c);
    }
    for (let r = y; r < y + height && r < numRows; r++) {
      if (r >= 0) targetRows.push(r);
    }
  } else if (selection.current?.cell) {
    const [c, r] = selection.current.cell;
    if (c >= 0 && c < numCols && r >= 0 && r < numRows) {
      targetCols = [c];
      targetRows = [r];
    }
  }

  if (targetCols.length === 0 || targetRows.length === 0) {
    return null;
  }

  return { targetCols, targetRows };
}

export function formatSelectionAsText(
  selection: GridSelection,
  data: QueryResult,
  includeHeaders: boolean = false,
  isMasked: boolean = false
): string | null {
  const targets = getTargetColsAndRows(selection, data);
  if (!targets) return null;

  const { targetCols, targetRows } = targets;
  const lines: string[] = [];

  if (includeHeaders) {
    const headerLine = targetCols.map((c) => data.columns[c]?.name || '').join('\t');
    lines.push(headerLine);
  }

  for (const r of targetRows) {
    const rowData = data.rows[r];
    if (!rowData) continue;
    const rowStr = targetCols
      .map((c) => formatCellValue(rowData[c], data.columns[c]?.name, isMasked))
      .join('\t');
    lines.push(rowStr);
  }

  return lines.join('\n');
}

/**
 * Formats the selected cells or rows as a SQL INSERT statement.
 */
export function formatSelectionAsSqlInsert(
  selection: GridSelection,
  data: QueryResult,
  tableName: string = 'my_table',
  isMasked: boolean = false
): string | null {
  const targets = getTargetColsAndRows(selection, data);
  if (!targets) return null;

  const { targetCols, targetRows } = targets;
  const colNames = targetCols.map((c) => data.columns[c]?.name || `col_${c}`);

  const formatSqlLiteral = (val: unknown, colName: string): string => {
    const extracted = extractCellValue(val as CellValue);
    if (extracted.type === 'null' || extracted.rawValue === null || extracted.rawValue === undefined) {
      return 'NULL';
    }

    if (isMasked && isSensitiveColumn(colName)) {
      const masked = maskCellValue(extracted.displayString, colName);
      return `'${masked.replace(/'/g, "''")}'`;
    }

    if (typeof extracted.rawValue === 'number') {
      return String(extracted.rawValue);
    }
    if (typeof extracted.rawValue === 'boolean') {
      return extracted.rawValue ? 'TRUE' : 'FALSE';
    }

    const str = String(extracted.rawValue);
    return `'${str.replace(/'/g, "''")}'`;
  };

  const valuesLines = targetRows
    .map((r) => {
      const row = data.rows[r];
      if (!row) return null;
      const rowVals = targetCols.map((c) => formatSqlLiteral(row[c], colNames[targetCols.indexOf(c)]));
      return `  (${rowVals.join(', ')})`;
    })
    .filter(Boolean);

  if (valuesLines.length === 0) return null;

  return `INSERT INTO ${tableName} (${colNames.join(', ')}) VALUES\n${valuesLines.join(',\n')};`;
}

/**
 * Formats the selected cells or rows as a JSON array of objects.
 */
export function formatSelectionAsJson(
  selection: GridSelection,
  data: QueryResult,
  isMasked: boolean = false
): string | null {
  const targets = getTargetColsAndRows(selection, data);
  if (!targets) return null;

  const { targetCols, targetRows } = targets;
  const colNames = targetCols.map((c) => data.columns[c]?.name || `col_${c}`);

  const records = targetRows
    .map((r) => {
      const row = data.rows[r];
      if (!row) return null;
      const record: Record<string, unknown> = {};
      targetCols.forEach((c, idx) => {
        const colName = colNames[idx];
        const extracted = extractCellValue(row[c] as CellValue);
        if (extracted.type === 'null' || extracted.rawValue === null || extracted.rawValue === undefined) {
          record[colName] = null;
        } else if (isMasked && isSensitiveColumn(colName)) {
          record[colName] = maskCellValue(extracted.displayString, colName);
        } else {
          record[colName] = extracted.rawValue;
        }
      });
      return record;
    })
    .filter(Boolean);

  return JSON.stringify(records, null, 2);
}

/**
 * Formats the selected cells or rows as a Markdown table.
 */
export function formatSelectionAsMarkdownTable(
  selection: GridSelection,
  data: QueryResult,
  isMasked: boolean = false
): string | null {
  const targets = getTargetColsAndRows(selection, data);
  if (!targets) return null;

  const { targetCols, targetRows } = targets;
  const colNames = targetCols.map((c) => data.columns[c]?.name || `col_${c}`);

  const headerLine = `| ${colNames.join(' | ')} |`;
  const separatorLine = `| ${colNames.map(() => '---').join(' | ')} |`;

  const rowsLines = targetRows
    .map((r) => {
      const row = data.rows[r];
      if (!row) return null;
      const cells = targetCols.map((c) => formatCellValue(row[c], data.columns[c]?.name, isMasked));
      return `| ${cells.join(' | ')} |`;
    })
    .filter(Boolean);

  return [headerLine, separatorLine, ...rowsLines].join('\n');
}

/**
 * Formats the selected column values as a SQL IN (...) clause list.
 */
export function formatSelectionAsSqlInClause(
  selection: GridSelection,
  data: QueryResult,
  isMasked: boolean = false
): string | null {
  const targets = getTargetColsAndRows(selection, data);
  if (!targets) return null;

  const { targetCols, targetRows } = targets;
  // Use first selected column
  const colIndex = targetCols[0];
  const colName = data.columns[colIndex]?.name || 'col';

  const values = targetRows
    .map((r) => {
      const row = data.rows[r];
      if (!row) return null;
      const extracted = extractCellValue(row[colIndex] as CellValue);
      if (extracted.type === 'null' || extracted.rawValue === null || extracted.rawValue === undefined) {
        return 'NULL';
      }
      if (isMasked && isSensitiveColumn(colName)) {
        const masked = maskCellValue(extracted.displayString, colName);
        return `'${masked.replace(/'/g, "''")}'`;
      }
      if (typeof extracted.rawValue === 'number') {
        return String(extracted.rawValue);
      }
      return `'${String(extracted.rawValue).replace(/'/g, "''")}'`;
    })
    .filter((v): v is string => v !== null);

  if (values.length === 0) return null;

  return `IN (${values.join(', ')})`;
}

/**
 * Formats the selected cells or rows as RFC-4180 compliant CSV.
 */
export function formatSelectionAsCsv(
  selection: GridSelection,
  data: QueryResult,
  includeHeaders: boolean = true,
  isMasked: boolean = false
): string | null {
  const targets = getTargetColsAndRows(selection, data);
  if (!targets) return null;

  const { targetCols, targetRows } = targets;

  const escapeCsv = (val: string): string => {
    if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const lines: string[] = [];

  if (includeHeaders) {
    const headerLine = targetCols.map((c) => escapeCsv(data.columns[c]?.name || '')).join(',');
    lines.push(headerLine);
  }

  for (const r of targetRows) {
    const row = data.rows[r];
    if (!row) continue;
    const rowStr = targetCols
      .map((c) => escapeCsv(formatCellValue(row[c], data.columns[c]?.name, isMasked)))
      .join(',');
    lines.push(rowStr);
  }

  return lines.join('\n');
}
