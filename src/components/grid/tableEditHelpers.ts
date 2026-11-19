import type { CellValue, ColumnMeta } from '../../types/db';
import type { CellChange } from '../../stores/pendingChangesStore';
import { isDateTimeType, isNumericType } from '../../api/queryBuilder';

export {
  quoteIdentifier as escapeIdentifier,
  qualifyTable as formatTableName,
  formatSqlLiteral,
  buildUpdateSql,
  buildDeleteSql,
  buildInsertSql,
} from '../../api/queryBuilder';

/**
 * Returns true if the column data type represents a boolean type.
 */
export function isBooleanType(dataType: string): boolean {
  const lower = dataType.toLowerCase();
  return lower === 'bool' || lower.includes('boolean') || lower === 'tinyint(1)' || lower === 'bit';
}

/**
 * Sanitizes and coerces user input from grid editing based on column type.
 * Converts '0' or empty inputs on nullable date/time columns to null.
 * Normalizes NOW/CURRENT_TIMESTAMP keywords.
 * Converts empty strings on nullable numeric columns to null.
 * Coerces boolean strings ('true', 'false', '1', '0', 't', 'f') on boolean columns.
 */
export function sanitizeEditedCellValue(
  val: unknown,
  column?: ColumnMeta
): unknown {
  if (val === null || val === undefined) {
    return null;
  }

  const dataType = column?.data_type || '';
  const isDateTime = isDateTimeType(dataType);
  const isNumeric = isNumericType(dataType);
  const isBool = isBooleanType(dataType);
  const isNullable = column?.nullable !== false;

  if (typeof val === 'string') {
    const trimmed = val.trim();
    const upper = trimmed.toUpperCase();

    if (upper === 'NULL' || trimmed === '') {
      return isNullable ? null : '';
    }

    if (isDateTime) {
      if (trimmed === '0') {
        return isNullable ? null : val;
      }
      if (upper === 'NOW' || upper === 'NOW()' || upper === 'CURRENT_TIMESTAMP') {
        return 'NOW()';
      }
      return trimmed;
    }

    if (isNumeric) {
      if (trimmed === '') {
        return isNullable ? null : 0;
      }
      const num = Number(trimmed);
      if (!isNaN(num)) {
        return num;
      }
      return val;
    }

    if (isBool) {
      const lower = trimmed.toLowerCase();
      if (lower === 'true' || lower === '1' || lower === 't') return true;
      if (lower === 'false' || lower === '0' || lower === 'f') return false;
      return val;
    }

    return val;
  }

  if (typeof val === 'number') {
    if (isNaN(val)) return null;
    if (isDateTime && val === 0) {
      return isNullable ? null : val;
    }
    return val;
  }

  return val;
}

/**
 * Converts a plain JS value into the tagged CellValue representation used in table rows.
 */
export function toCellValue(val: unknown): CellValue {
  if (val === null || val === undefined) {
    return 'Null';
  }
  if (typeof val === 'boolean') {
    return { Boolean: val };
  }
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { Integer: val } : { Float: val };
  }
  if (typeof val === 'object') {
    return val as CellValue;
  }
  return { Text: String(val) };
}

export interface ApplyTableMutationsParams {
  rows: CellValue[][];
  columns: ColumnMeta[];
  cellEdits?: Record<string, CellChange>;
  addedRows?: Record<string, unknown>[];
  /** Pre-resolved full rows returned from INSERT RETURNING * / OUTPUT INSERTED.* / LAST_INSERT_ID */
  resolvedAddedRows?: CellValue[][];
  deletedRowIndices?: number[];
}

/**
 * Maps a returned QueryResult row into the target table's column order.
 */
export function mapReturnedRowToTableRow(
  returnedRow: CellValue[],
  returnedColumns: ColumnMeta[],
  tableColumns: ColumnMeta[],
  fallbackRecord: Record<string, unknown> = {}
): CellValue[] {
  const indexByName = new Map<string, number>();
  returnedColumns.forEach((col, idx) => {
    indexByName.set(col.name.toLowerCase(), idx);
  });

  return tableColumns.map((col, colIdx) => {
    const retIdx = indexByName.get(col.name.toLowerCase());
    if (retIdx !== undefined && retIdx < returnedRow.length) {
      return returnedRow[retIdx];
    }
    if (returnedColumns.length === 0 && colIdx < returnedRow.length) {
      return returnedRow[colIdx];
    }
    return toCellValue(fallbackRecord[col.name]);
  });
}

/**
 * Applies committed cell edits, row deletions, and row additions to the in-memory
 * grid rows without reloading the table from the database.
 */
export function applyTableMutations(params: ApplyTableMutationsParams): {
  rows: CellValue[][];
  rowDelta: number;
} {
  const {
    rows,
    columns,
    cellEdits = {},
    addedRows = [],
    resolvedAddedRows,
    deletedRowIndices = [],
  } = params;
  const deletedSet = new Set(deletedRowIndices);

  const nextRows: CellValue[][] = rows.map((row) => [...row]);

  for (const edit of Object.values(cellEdits)) {
    if (
      edit.rowIndex >= 0 &&
      edit.rowIndex < nextRows.length &&
      edit.colIndex >= 0 &&
      edit.colIndex < columns.length
    ) {
      nextRows[edit.rowIndex][edit.colIndex] = toCellValue(edit.newValue);
    }
  }

  const survivingRows =
    deletedSet.size > 0
      ? nextRows.filter((_, idx) => !deletedSet.has(idx))
      : nextRows;

  const appendedRows: CellValue[][] = resolvedAddedRows
    ? resolvedAddedRows
    : addedRows.map((record) => columns.map((col) => toCellValue(record[col.name])));

  const finalRows = [...survivingRows, ...appendedRows];
  const deletedCount = nextRows.length - survivingRows.length;
  const rowDelta = appendedRows.length - deletedCount;

  return { rows: finalRows, rowDelta };
}
