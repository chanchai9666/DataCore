import type { ColumnMeta } from '../../types/db';
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
