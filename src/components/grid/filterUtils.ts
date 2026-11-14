import type { ColumnMeta, FilterCondition, CellValue } from '../../types/db';

/**
 * Determines if a string value can safely be emitted as an unquoted numeric literal in SQL.
 * Values with leading zeros (e.g. "0123", "-0123") must retain quotes to prevent type coercion
 * errors on PostgreSQL or loss of leading zeros in SQLite/MySQL.
 */
export const isSafeUnquotedNumber = (val: string): boolean => {
  if (/^-?0\d+/.test(val)) return false;
  return /^-?\d+(\.\d+)?$/.test(val);
};

/**
 * Builds an escaped SQL WHERE clause string from a list of filter conditions.
 */
export function buildSqlWhereClause(
  conditions: FilterCondition[],
  conjunction: 'AND' | 'OR' = 'AND',
  driver?: string
): string {
  const activeConditions = conditions.filter(
    (c) =>
      c.column &&
      (c.operator === 'IS NULL' ||
        c.operator === 'IS NOT NULL' ||
        (c.value !== undefined && c.value.trim() !== ''))
  );

  if (activeConditions.length === 0) return '';

  const quoteId = (name: string) => {
    if (driver === 'mysql') {
      return `\`${name.replace(/`/g, '``')}\``;
    }
    return `"${name.replace(/"/g, '""')}"`;
  };

  const escapeString = (s: string) => {
    const escapedQuotes = s.replace(/'/g, "''");
    return driver === 'mysql' ? escapedQuotes.replace(/\\/g, '\\\\') : escapedQuotes;
  };

  const parts = activeConditions.map((cond) => {
    const col = quoteId(cond.column);
    const val = cond.value?.trim() ?? '';

    switch (cond.operator) {
      case 'IS NULL':
        return `${col} IS NULL`;
      case 'IS NOT NULL':
        return `${col} IS NOT NULL`;
      case 'LIKE':
      case 'NOT LIKE': {
        const escaped = escapeString(val);
        const pattern = escaped.includes('%') || escaped.includes('_') ? escaped : `%${escaped}%`;
        return `${col} ${cond.operator} '${pattern}'`;
      }
      default: {
        // Numeric literals without quotes only if purely numeric and not having leading zeros
        if (isSafeUnquotedNumber(val)) {
          return `${col} ${cond.operator} ${val}`;
        }
        const escaped = escapeString(val);
        return `${col} ${cond.operator} '${escaped}'`;
      }
    }
  });

  return parts.join(` ${conjunction} `);
}

/**
 * Extracts plain string representation from CellValue.
 */
function extractRawCellValue(val: CellValue): unknown {
  if (val === null || val === undefined || val === 'Null') return null;
  if (typeof val === 'object') {
    const record = val as Record<string, unknown>;
    if ('Text' in record && typeof record.Text === 'string') return record.Text;
    if ('Integer' in record && typeof record.Integer === 'number') return record.Integer;
    if ('Float' in record && typeof record.Float === 'number') return record.Float;
    if ('Boolean' in record && typeof record.Boolean === 'boolean') return record.Boolean;
  }
  return val;
}

/**
 * Evaluates a single filter condition against a row value in memory.
 */
function evaluateCondition(cellRaw: unknown, cond: FilterCondition): boolean {
  const isNull = cellRaw === null || cellRaw === undefined || cellRaw === 'NULL';

  if (cond.operator === 'IS NULL') return isNull;
  if (cond.operator === 'IS NOT NULL') return !isNull;

  if (isNull) return false;

  const filterVal = cond.value.trim();
  const cellStr = String(cellRaw).toLowerCase();
  const filterStr = filterVal.toLowerCase();

  switch (cond.operator) {
    case 'LIKE':
      return cellStr.includes(filterStr.replace(/%/g, ''));
    case 'NOT LIKE':
      return !cellStr.includes(filterStr.replace(/%/g, ''));
    case '=':
    case '!=':
    case '>':
    case '<':
    case '>=':
    case '<=': {
      const numCell = Number(cellRaw);
      const numFilter = Number(filterVal);
      const isNumeric = !isNaN(numCell) && !isNaN(numFilter) && filterVal !== '';

      if (isNumeric) {
        if (cond.operator === '=') return numCell === numFilter;
        if (cond.operator === '!=') return numCell !== numFilter;
        if (cond.operator === '>') return numCell > numFilter;
        if (cond.operator === '<') return numCell < numFilter;
        if (cond.operator === '>=') return numCell >= numFilter;
        if (cond.operator === '<=') return numCell <= numFilter;
      } else {
        const cmp = cellStr.localeCompare(filterStr);
        if (cond.operator === '=') return cellStr === filterStr;
        if (cond.operator === '!=') return cellStr !== filterStr;
        if (cond.operator === '>') return cmp > 0;
        if (cond.operator === '<') return cmp < 0;
        if (cond.operator === '>=') return cmp >= 0;
        if (cond.operator === '<=') return cmp <= 0;
      }
      return false;
    }
    default:
      return true;
  }
}

/**
 * Filters rows in memory based on conditions.
 */
export function filterInMemoryRows(
  columns: ColumnMeta[],
  rows: CellValue[][],
  conditions: FilterCondition[],
  conjunction: 'AND' | 'OR' = 'AND'
): CellValue[][] {
  const activeConditions = conditions.filter(
    (c) =>
      c.column &&
      (c.operator === 'IS NULL' ||
        c.operator === 'IS NOT NULL' ||
        (c.value !== undefined && c.value.trim() !== ''))
  );

  if (activeConditions.length === 0) return rows;

  const colIndexMap = new Map<string, number>();
  columns.forEach((col, idx) => colIndexMap.set(col.name, idx));

  return rows.filter((row) => {
    if (conjunction === 'AND') {
      return activeConditions.every((cond) => {
        const colIdx = colIndexMap.get(cond.column);
        if (colIdx === undefined) return true;
        const cellVal = extractRawCellValue(row[colIdx]);
        return evaluateCondition(cellVal, cond);
      });
    } else {
      return activeConditions.some((cond) => {
        const colIdx = colIndexMap.get(cond.column);
        if (colIdx === undefined) return false;
        const cellVal = extractRawCellValue(row[colIdx]);
        return evaluateCondition(cellVal, cond);
      });
    }
  });
}
