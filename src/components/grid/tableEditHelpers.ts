import type { DatabaseDriver, ColumnMeta, CellValue } from '../../types/db';
import { extractCellValue } from './gridUtils';

export function escapeIdentifier(name: string, driver: DatabaseDriver): string {
  if (driver === 'mysql') {
    return `\`${name.replace(/`/g, '``')}\``;
  }
  return `"${name.replace(/"/g, '""')}"`;
}

export function formatTableName(
  tableName: string,
  schemaName: string | undefined,
  driver: DatabaseDriver
): string {
  const escTable = escapeIdentifier(tableName, driver);
  if (schemaName && schemaName.trim().length > 0) {
    const escSchema = escapeIdentifier(schemaName, driver);
    return `${escSchema}.${escTable}`;
  }
  return escTable;
}

export function formatSqlLiteral(
  val: unknown,
  driver: DatabaseDriver,
  _dataType?: string
): string {
  if (val === null || val === undefined) {
    return 'NULL';
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.toUpperCase() === 'NULL') {
      return 'NULL';
    }
    // Escape single quotes by doubling them
    const escaped = val.replace(/'/g, "''");
    return `'${escaped}'`;
  }

  if (typeof val === 'number') {
    if (isNaN(val)) return 'NULL';
    return String(val);
  }

  if (typeof val === 'boolean') {
    if (driver === 'postgres') {
      return val ? 'TRUE' : 'FALSE';
    }
    return val ? '1' : '0';
  }

  if (typeof val === 'object') {
    const jsonStr = JSON.stringify(val).replace(/'/g, "''");
    return `'${jsonStr}'`;
  }

  return `'${String(val).replace(/'/g, "''")}'`;
}

export function findPrimaryKeyIndex(columns: ColumnMeta[]): number {
  // Look for conventional primary key column names
  const candidates = ['id', '_id', 'uuid', 'pk'];
  for (const name of candidates) {
    const idx = columns.findIndex((c) => c.name.toLowerCase() === name);
    if (idx >= 0) return idx;
  }
  // If ends with _id
  const endsWithId = columns.findIndex((c) => c.name.toLowerCase().endsWith('_id'));
  if (endsWithId >= 0) return endsWithId;

  return -1;
}

export function buildWhereClause(
  columns: ColumnMeta[],
  row: CellValue[],
  driver: DatabaseDriver
): string {
  const pkIdx = findPrimaryKeyIndex(columns);
  if (pkIdx >= 0) {
    const pkCol = columns[pkIdx];
    const rawPk = extractCellValue(row[pkIdx]).rawValue;
    if (rawPk !== null && rawPk !== undefined) {
      return `${escapeIdentifier(pkCol.name, driver)} = ${formatSqlLiteral(
        rawPk,
        driver,
        pkCol.data_type
      )}`;
    }
  }

  // Fallback: Composite WHERE with all non-null columns
  const conditions: string[] = [];
  columns.forEach((col, idx) => {
    const raw = extractCellValue(row[idx]).rawValue;
    const colName = escapeIdentifier(col.name, driver);
    if (raw === null || raw === undefined) {
      conditions.push(`${colName} IS NULL`);
    } else {
      conditions.push(`${colName} = ${formatSqlLiteral(raw, driver, col.data_type)}`);
    }
  });

  return conditions.length > 0 ? conditions.join(' AND ') : '1 = 1';
}

export interface BuildUpdateOptions {
  driver: DatabaseDriver;
  tableName: string;
  schemaName?: string;
  columns: ColumnMeta[];
  row: CellValue[];
  colIndex: number;
  newValue: unknown;
}

export function buildUpdateSql(options: BuildUpdateOptions): string {
  const { driver, tableName, schemaName, columns, row, colIndex, newValue } = options;
  const targetCol = columns[colIndex];
  const fullTable = formatTableName(tableName, schemaName, driver);
  const colSql = escapeIdentifier(targetCol.name, driver);
  const valSql = formatSqlLiteral(newValue, driver, targetCol.data_type);
  const whereSql = buildWhereClause(columns, row, driver);

  let sql = `UPDATE ${fullTable} SET ${colSql} = ${valSql} WHERE ${whereSql}`;
  if (driver === 'mysql' && findPrimaryKeyIndex(columns) < 0) {
    sql += ' LIMIT 1';
  }
  return `${sql};`;
}

export interface BuildDeleteOptions {
  driver: DatabaseDriver;
  tableName: string;
  schemaName?: string;
  columns: ColumnMeta[];
  row: CellValue[];
}

export function buildDeleteSql(options: BuildDeleteOptions): string {
  const { driver, tableName, schemaName, columns, row } = options;
  const fullTable = formatTableName(tableName, schemaName, driver);
  const whereSql = buildWhereClause(columns, row, driver);

  let sql = `DELETE FROM ${fullTable} WHERE ${whereSql}`;
  if (driver === 'mysql' && findPrimaryKeyIndex(columns) < 0) {
    sql += ' LIMIT 1';
  }
  return `${sql};`;
}

export interface BuildInsertOptions {
  driver: DatabaseDriver;
  tableName: string;
  schemaName?: string;
  columns: ColumnMeta[];
  values: Record<string, unknown>;
}

export function buildInsertSql(options: BuildInsertOptions): string {
  const { driver, tableName, schemaName, columns, values } = options;
  const fullTable = formatTableName(tableName, schemaName, driver);

  const colNames: string[] = [];
  const colVals: string[] = [];

  columns.forEach((col) => {
    if (Object.prototype.hasOwnProperty.call(values, col.name)) {
      const val = values[col.name];
      // Skip undefined or empty string for auto-increment / serial primary keys if left empty
      if (val === undefined || (val === '' && col.name.toLowerCase() === 'id')) {
        return;
      }
      colNames.push(escapeIdentifier(col.name, driver));
      colVals.push(formatSqlLiteral(val, driver, col.data_type));
    }
  });

  if (colNames.length === 0) {
    if (driver === 'postgres' || driver === 'sqlite') {
      return `INSERT INTO ${fullTable} DEFAULT VALUES;`;
    }
    return `INSERT INTO ${fullTable} () VALUES ();`;
  }

  return `INSERT INTO ${fullTable} (${colNames.join(', ')}) VALUES (${colVals.join(', ')});`;
}
