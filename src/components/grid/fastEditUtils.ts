import type { ColumnMeta } from '../../types/db';
import type { CellChange } from '../../stores/pendingChangesStore';
import { isDateTimeType, isNumericType } from '../../api/queryBuilder';
import { isSensitiveColumn } from '../../utils/piiDetector';
import { isBooleanType } from './tableEditHelpers';

export type CellValidationResult =
  | { valid: true; value: unknown }
  | { valid: false; reason: string };

function isIntegerType(dataType: string): boolean {
  const lower = dataType.toLowerCase();
  return (
    lower.includes('int') ||
    lower.includes('serial') ||
    lower === 'bigint' ||
    lower === 'smallint' ||
    lower === 'tinyint' ||
    lower === 'mediumint'
  );
}

function isJsonType(dataType: string): boolean {
  const lower = dataType.toLowerCase();
  return lower.includes('json');
}

function isBinaryType(dataType: string): boolean {
  const lower = dataType.toLowerCase();
  return (
    lower.includes('bytea') ||
    lower.includes('blob') ||
    lower.includes('binary') ||
    lower === 'bytes'
  );
}

/**
 * Validates and coerces a string cell input against the target column's data type.
 */
export function validateCellValueForColumn(
  rawText: string,
  column: ColumnMeta
): CellValidationResult {
  const trimmed = rawText.trim();
  const upper = trimmed.toUpperCase();
  const isNullable = column.nullable !== false;
  const dataType = column.data_type || '';

  if (upper === 'NULL' || trimmed === '') {
    if (isNullable) {
      return { valid: true, value: null };
    }
    if (isNumericType(dataType) || isBooleanType(dataType) || isDateTimeType(dataType)) {
      return {
        valid: false,
        reason: `Column '${column.name}' is NOT NULL and cannot be empty.`,
      };
    }
    return { valid: true, value: '' };
  }

  if (isBinaryType(dataType)) {
    return {
      valid: false,
      reason: `Binary column '${column.name}' cannot be edited inline.`,
    };
  }

  if (isBooleanType(dataType)) {
    const lower = trimmed.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 't') {
      return { valid: true, value: true };
    }
    if (lower === 'false' || lower === '0' || lower === 'f') {
      return { valid: true, value: false };
    }
    return {
      valid: false,
      reason: `Invalid boolean value '${trimmed}' for column '${column.name}' (expected true/false).`,
    };
  }

  if (isNumericType(dataType)) {
    const num = Number(trimmed);
    if (trimmed === '' || !Number.isFinite(num)) {
      return {
        valid: false,
        reason: `Invalid numeric value '${trimmed}' for column '${column.name}'.`,
      };
    }
    if (isIntegerType(dataType) && !Number.isInteger(num)) {
      return {
        valid: false,
        reason: `Invalid integer value '${trimmed}' for column '${column.name}'.`,
      };
    }
    return { valid: true, value: num };
  }

  if (isDateTimeType(dataType)) {
    if (trimmed === '0') {
      return isNullable
        ? { valid: true, value: null }
        : { valid: false, reason: `Invalid date/time value '0' for NOT NULL column '${column.name}'.` };
    }
    if (upper === 'NOW' || upper === 'NOW()' || upper === 'CURRENT_TIMESTAMP') {
      return { valid: true, value: 'NOW()' };
    }
    // Accept ISO-like dates (YYYY-MM-DD...) or HH:MM(:SS) time strings
    const looksLikeDateOrTime =
      /^\d{4}-\d{2}-\d{2}/.test(trimmed) ||
      /^\d{2}:\d{2}(:\d{2})?/.test(trimmed) ||
      !Number.isNaN(Date.parse(trimmed));
    if (!looksLikeDateOrTime) {
      return {
        valid: false,
        reason: `Invalid date/time value '${trimmed}' for column '${column.name}'.`,
      };
    }
    return { valid: true, value: trimmed };
  }

  if (isJsonType(dataType)) {
    try {
      JSON.parse(trimmed);
      return { valid: true, value: trimmed };
    } catch {
      return {
        valid: false,
        reason: `Invalid JSON value for column '${column.name}'.`,
      };
    }
  }

  return { valid: true, value: rawText };
}

/**
 * Parses clipboard TSV text (from Excel, Google Sheets, or Glide Data Grid) into a 2D string matrix.
 * Strips a single trailing newline often appended by spreadsheet applications.
 */
export function parseClipboardTsv(text: string): string[][] {
  if (!text) return [];
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const trimmedTrailing = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  if (!trimmedTrailing && normalized === '\n') return [['']];
  return trimmedTrailing.split('\n').map((line) => line.split('\t'));
}

export interface ComputePasteParams {
  startCol: number;
  startRow: number;
  matrix: readonly (readonly string[])[];
  columns: ColumnMeta[];
  baseRowsCount: number;
  existingAddedRowsCount: number;
  deletedRowIndices: number[];
  isMasked: boolean;
  getOriginalValue: (rowIdx: number, colIdx: number) => unknown;
}

export interface InvalidPasteCell {
  row: number;
  colName: string;
  value: string;
  reason: string;
}

export interface ComputePasteResult {
  cellEdits: CellChange[];
  addedRowUpdates: Array<{ addedRowIndex: number; colName: string; value: unknown }>;
  newRows: Array<Record<string, unknown>>;
  skippedMaskedCount: number;
  invalidCells: InvalidPasteCell[];
}

/**
 * Computes staged cell edits, added-row updates, and newly appended rows for an Excel-style paste.
 * Truncates extra columns beyond table width, appends new rows when pasting past existing rows,
 * leaves unpasted columns undefined so DB DEFAULTs apply, and validates data types per column.
 */
export function computePasteOperations(params: ComputePasteParams): ComputePasteResult {
  const {
    startCol,
    startRow,
    matrix,
    columns,
    baseRowsCount,
    existingAddedRowsCount,
    deletedRowIndices,
    isMasked,
    getOriginalValue,
  } = params;

  const cellEdits: CellChange[] = [];
  const addedRowUpdates: Array<{ addedRowIndex: number; colName: string; value: unknown }> = [];
  const newRowsMap = new Map<number, Record<string, unknown>>();
  let skippedMaskedCount = 0;
  const invalidCells: InvalidPasteCell[] = [];

  const totalExistingRows = baseRowsCount + existingAddedRowsCount;

  for (let rOffset = 0; rOffset < matrix.length; rOffset++) {
    const targetRow = startRow + rOffset;
    const rowValues = matrix[rOffset];

    if (targetRow < baseRowsCount && deletedRowIndices.includes(targetRow)) {
      continue;
    }

    for (let cOffset = 0; cOffset < rowValues.length; cOffset++) {
      const targetCol = startCol + cOffset;
      // Truncate extra pasted columns beyond table width
      if (targetCol < 0 || targetCol >= columns.length) {
        break;
      }

      const colMeta = columns[targetCol];
      if (isMasked && isSensitiveColumn(colMeta.name)) {
        skippedMaskedCount++;
        continue;
      }

      const rawText = rowValues[cOffset];
      const validation = validateCellValueForColumn(rawText, colMeta);
      if (!validation.valid) {
        invalidCells.push({
          row: targetRow,
          colName: colMeta.name,
          value: rawText,
          reason: validation.reason,
        });
        continue;
      }

      if (targetRow < baseRowsCount) {
        cellEdits.push({
          rowIndex: targetRow,
          colIndex: targetCol,
          colName: colMeta.name,
          oldValue: getOriginalValue(targetRow, targetCol),
          newValue: validation.value,
        });
      } else if (targetRow < totalExistingRows) {
        addedRowUpdates.push({
          addedRowIndex: targetRow - baseRowsCount,
          colName: colMeta.name,
          value: validation.value,
        });
      } else {
        const newRowIdx = targetRow - totalExistingRows;
        let rowObj = newRowsMap.get(newRowIdx);
        if (!rowObj) {
          rowObj = {};
          newRowsMap.set(newRowIdx, rowObj);
        }
        rowObj[colMeta.name] = validation.value;
      }
    }
  }

  const sortedIndices = Array.from(newRowsMap.keys()).sort((a, b) => a - b);
  const newRows = sortedIndices.map((idx) => newRowsMap.get(idx)!);

  return {
    cellEdits,
    addedRowUpdates,
    newRows,
    skippedMaskedCount,
    invalidCells,
  };
}
