import type { CellValue } from '../types/db';

/**
 * Formats a CellValue into a human-readable string representation.
 */
export function formatCellValue(val: CellValue): string {
  if (val === null || val === undefined || val === 'Null') {
    return 'NULL';
  }
  if (typeof val === 'object') {
    if (Array.isArray(val)) {
      return JSON.stringify(val);
    }
    const record = val as Record<string, unknown>;
    if (typeof record.Text === 'string') return record.Text;
    if (typeof record.Integer === 'number') return String(record.Integer);
    if (typeof record.Float === 'number') return String(record.Float);
    if (typeof record.Real === 'number') return String(record.Real);
    if (typeof record.Boolean === 'boolean') return String(record.Boolean);
    if ('Json' in record) return JSON.stringify(record.Json);
    if (typeof record.Bytes === 'string') return `[Binary: ${record.Bytes.length} bytes]`;
    return JSON.stringify(val);
  }
  return String(val);
}
