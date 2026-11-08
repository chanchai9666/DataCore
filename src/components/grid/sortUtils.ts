import { CellValue, ColumnMeta } from '../../types/db';

/**
 * Checks whether a CellValue represents a SQL NULL.
 */
export function isNullCellValue(val: CellValue): boolean {
  return val === null || val === undefined || val === 'Null';
}

/**
 * Extracts a normalized raw primitive for comparison.
 */
export function normalizeForSort(val: CellValue): number | boolean | string | null {
  if (isNullCellValue(val)) return null;

  if (typeof val === 'number') return val;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') return val;

  if (typeof val === 'object') {
    const record = val as Record<string, unknown>;
    if (typeof record.Integer === 'number') return record.Integer;
    if (typeof record.Float === 'number') return record.Float;
    if (typeof record.Boolean === 'boolean') return record.Boolean;
    if (typeof record.Text === 'string') return record.Text;
    if ('Json' in record) return JSON.stringify(record.Json);
    if (typeof record.Bytes === 'string') return record.Bytes;
    return JSON.stringify(val);
  }

  return String(val);
}

/**
 * Compares two CellValues.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 * Note: NULL values are considered equal to each other.
 */
export function comparePrimitives(
  aNorm: number | boolean | string,
  bNorm: number | boolean | string
): number {
  if (typeof aNorm === 'number' && typeof bNorm === 'number') {
    return aNorm - bNorm;
  }
  if (typeof aNorm === 'boolean' && typeof bNorm === 'boolean') {
    return aNorm === bNorm ? 0 : aNorm ? 1 : -1;
  }
  return String(aNorm).localeCompare(String(bNorm));
}

/**
 * Sorts in-memory rows based on a specified column name and direction.
 * NULL values are positioned at the bottom regardless of sort direction.
 */
export function sortInMemoryRows(
  columns: ColumnMeta[],
  rows: CellValue[][],
  sortCol: string,
  sortDir: 'ASC' | 'DESC'
): CellValue[][] {
  const colIndex = columns.findIndex((c) => c.name === sortCol);
  if (colIndex === -1 || rows.length <= 1) {
    return [...rows];
  }

  const sorted = [...rows];
  sorted.sort((rowA, rowB) => {
    const aVal = rowA[colIndex];
    const bVal = rowB[colIndex];

    const aNull = isNullCellValue(aVal);
    const bNull = isNullCellValue(bVal);

    // NULLs always placed at the bottom
    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;

    const aNorm = normalizeForSort(aVal)!;
    const bNorm = normalizeForSort(bVal)!;

    const cmp = comparePrimitives(aNorm, bNorm);
    return sortDir === 'DESC' ? -cmp : cmp;
  });

  return sorted;
}
