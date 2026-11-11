import type { DatabaseDriver, ColumnMeta, CellValue } from '../types/db';
import { extractCellValue } from '../components/grid/gridUtils';

export interface NewTableColumnConfig {
  name: string;
  dataType: string;
  isPrimaryKey: boolean;
  nullable: boolean;
  defaultValue?: string;
  autoIncrement?: boolean;
}

export interface TableIndexConfig {
  id?: string;
  name: string;
  columns: string[];
  isUnique: boolean;
}

export interface TableIndexStructure {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary?: boolean;
  indexType?: string;
}

export interface CreateTableConfig {
  tableName: string;
  schemaName?: string;
  driver?: string;
  columns: NewTableColumnConfig[];
  indexes?: TableIndexConfig[];
}

export interface CreateIndexParams {
  tableName: string;
  schemaName?: string;
  driver?: string;
  indexName: string;
  columns: string[];
  isUnique?: boolean;
}

export interface DropIndexParams {
  tableName?: string;
  schemaName?: string;
  driver?: string;
  indexName: string;
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

export interface BuildDeleteOptions {
  driver: DatabaseDriver;
  tableName: string;
  schemaName?: string;
  columns: ColumnMeta[];
  row: CellValue[];
}

export interface BuildInsertOptions {
  driver: DatabaseDriver;
  tableName: string;
  schemaName?: string;
  columns: ColumnMeta[];
  values: Record<string, unknown>;
}

/**
 * Quotes an identifier correctly per database driver, escaping embedded quotes.
 */
export function quoteIdentifier(name: string, driver?: string): string {
  const isMysql = driver?.toLowerCase() === 'mysql';
  if (isMysql) {
    return `\`${name.replace(/`/g, '``')}\``;
  }
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Formats a fully-qualified table name with schema if supported.
 */
export function qualifyTable(tableName: string, schemaName?: string, driver?: string): string {
  const isPostgres =
    !driver || driver.toLowerCase() === 'postgres' || driver.toLowerCase() === 'postgresql';
  const isMysql = driver?.toLowerCase() === 'mysql';
  const qTable = quoteIdentifier(tableName, driver);

  if (schemaName && schemaName.trim() && (isPostgres || isMysql)) {
    const qSchema = quoteIdentifier(schemaName.trim(), driver);
    return `${qSchema}.${qTable}`;
  }

  return qTable;
}

/**
 * Helpers to identify SQL data types
 */
export function isDateTimeType(dataType?: string): boolean {
  if (!dataType) return false;
  const lower = dataType.toLowerCase();
  return (
    lower.includes('time') ||
    lower.includes('date') ||
    lower.includes('year')
  );
}

export function isNumericType(dataType?: string): boolean {
  if (!dataType) return false;
  const lower = dataType.toLowerCase();
  return (
    lower.includes('int') ||
    lower.includes('float') ||
    lower.includes('double') ||
    lower.includes('decimal') ||
    lower.includes('numeric') ||
    lower.includes('real')
  );
}

/**
 * Formats a JavaScript value as a safe SQL literal according to driver and type.
 */
export function formatSqlLiteral(
  val: unknown,
  driver?: DatabaseDriver | string,
  dataType?: string
): string {
  if (val === null || val === undefined) {
    return 'NULL';
  }

  const isDateTime = isDateTimeType(dataType);
  const isNumeric = isNumericType(dataType);

  if (typeof val === 'string') {
    const trimmed = val.trim();
    const upper = trimmed.toUpperCase();

    if (upper === 'NULL') {
      return 'NULL';
    }

    if (isDateTime) {
      if (trimmed === '' || trimmed === '0') {
        return 'NULL';
      }
      if (upper === 'NOW' || upper === 'NOW()' || upper === 'CURRENT_TIMESTAMP') {
        if (driver && driver.toLowerCase().includes('sqlite')) {
          return "datetime('now')";
        }
        return 'NOW()';
      }
    }

    if (isNumeric) {
      if (trimmed === '') {
        return 'NULL';
      }
      const num = Number(trimmed);
      if (!isNaN(num)) {
        return String(num);
      }
    }

    const escaped = val.replace(/'/g, "''");
    return `'${escaped}'`;
  }

  if (typeof val === 'number') {
    if (isNaN(val)) return 'NULL';
    if (isDateTime && val === 0) {
      return 'NULL';
    }
    return String(val);
  }

  if (typeof val === 'boolean') {
    const isPostgres = !driver || driver.toLowerCase().includes('postgres');
    if (isPostgres) {
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

/**
 * Finds the index of the primary key column from metadata.
 */
export function findPrimaryKeyIndex(columns: ColumnMeta[]): number {
  const explicitPk = columns.findIndex((c) => c.is_primary_key === true);
  if (explicitPk >= 0) return explicitPk;

  const candidates = ['id', '_id', 'uuid', 'pk'];
  for (const name of candidates) {
    const idx = columns.findIndex((c) => c.name.toLowerCase() === name);
    if (idx >= 0) return idx;
  }

  return columns.findIndex((c) => c.name.toLowerCase().endsWith('_id') || c.name.toLowerCase().endsWith('id'));
}

/**
 * Builds a WHERE clause identifying a single row by PK or all non-null values.
 */
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
      return `${quoteIdentifier(pkCol.name, driver)} = ${formatSqlLiteral(
        rawPk,
        driver,
        pkCol.data_type
      )}`;
    }
  }

  // Fallback: Composite WHERE with all columns
  const conditions: string[] = [];
  columns.forEach((col, idx) => {
    const raw = extractCellValue(row[idx]).rawValue;
    const colName = quoteIdentifier(col.name, driver);
    if (raw === null || raw === undefined) {
      conditions.push(`${colName} IS NULL`);
    } else {
      conditions.push(`${colName} = ${formatSqlLiteral(raw, driver, col.data_type)}`);
    }
  });

  return conditions.length > 0 ? conditions.join(' AND ') : '1 = 1';
}

/**
 * Builds a DROP TABLE statement according to database driver.
 */
export function buildDropTableSql(
  tableName: string,
  schemaName?: string,
  driver?: string,
  cascade?: boolean
): string {
  const fullTable = qualifyTable(tableName, schemaName, driver);
  const cascadePart =
    cascade && (!driver || driver.toLowerCase().includes('postgres')) ? ' CASCADE' : '';
  return `DROP TABLE ${fullTable}${cascadePart};`;
}

/**
 * Builds an ALTER TABLE ... RENAME TO statement according to database driver.
 */
export function buildRenameTableSql(
  oldTableName: string,
  newTableName: string,
  schemaName?: string,
  driver?: string
): string {
  const fullOldTable = qualifyTable(oldTableName.trim(), schemaName, driver);
  const quotedNewTable = quoteIdentifier(newTableName.trim(), driver);
  return `ALTER TABLE ${fullOldTable} RENAME TO ${quotedNewTable};`;
}

export type TableMaintenanceOp = 'analyze' | 'check' | 'optimize' | 'reindex';

/**
 * Builds table maintenance SQL statement (Analyze, Check, Optimize, Reindex/Repair)
 * adapted per database engine.
 */
export function buildTableMaintenanceSql(
  operation: TableMaintenanceOp,
  tableName: string,
  schemaName?: string,
  driver?: string
): string {
  const normDriver = driver?.toLowerCase() || 'postgres';
  const isPostgres = normDriver.includes('postgres');
  const isMysql = normDriver.includes('mysql');

  const fullTable = qualifyTable(tableName.trim(), schemaName, driver);

  switch (operation) {
    case 'analyze':
      if (isPostgres) return `ANALYZE ${fullTable};`;
      if (isMysql) return `ANALYZE TABLE ${fullTable};`;
      return `ANALYZE ${fullTable};`;
    case 'check':
      if (isPostgres) return `SELECT count(*) AS checked_rows FROM ${fullTable};`;
      if (isMysql) return `CHECK TABLE ${fullTable};`;
      return `PRAGMA integrity_check;`;
    case 'optimize':
      if (isPostgres) return `VACUUM (ANALYZE) ${fullTable};`;
      if (isMysql) return `OPTIMIZE TABLE ${fullTable};`;
      return `VACUUM;`;
    case 'reindex':
      if (isPostgres) return `REINDEX TABLE ${fullTable};`;
      if (isMysql) return `REPAIR TABLE ${fullTable};`;
      return `REINDEX ${fullTable};`;
  }
}

/**
 * Builds a CREATE INDEX statement according to database driver.
 */
export function buildCreateIndexSql(params: CreateIndexParams): string {
  const { tableName, schemaName, driver, indexName, columns, isUnique } = params;
  const cleanName = indexName.trim();
  const cleanTable = tableName.trim();

  if (!cleanName || !cleanTable || !columns || columns.length === 0) {
    return '';
  }

  const fullTable = qualifyTable(cleanTable, schemaName, driver);
  const qIndex = quoteIdentifier(cleanName, driver);
  const qCols = columns
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => quoteIdentifier(c, driver))
    .join(', ');

  if (!qCols) return '';

  const uniquePrefix = isUnique ? 'UNIQUE ' : '';
  return `CREATE ${uniquePrefix}INDEX ${qIndex} ON ${fullTable} (${qCols});`;
}

/**
 * Builds a DROP INDEX statement according to database driver.
 */
export function buildDropIndexSql(params: DropIndexParams): string {
  const { tableName, schemaName, driver, indexName } = params;
  const cleanName = indexName.trim();
  if (!cleanName) return '';

  const isMysql = driver?.toLowerCase() === 'mysql';
  const isPostgres = !driver || driver.toLowerCase().includes('postgres');

  if (isMysql) {
    const qIndex = quoteIdentifier(cleanName, driver);
    const qTable = quoteIdentifier((tableName || '').trim(), driver);
    return `DROP INDEX ${qIndex} ON ${qTable};`;
  }

  if (isPostgres && schemaName && schemaName.trim()) {
    const qSchema = quoteIdentifier(schemaName.trim(), driver);
    const qIndex = quoteIdentifier(cleanName, driver);
    return `DROP INDEX ${qSchema}.${qIndex};`;
  }

  return `DROP INDEX ${quoteIdentifier(cleanName, driver)};`;
}

/**
 * Builds a CREATE TABLE statement according to database driver, column specifications, and indexes.
 */
export function buildCreateTableSql(config: CreateTableConfig): string {
  const { tableName, schemaName, driver, columns, indexes } = config;
  const cleanTableName = tableName.trim();

  if (!cleanTableName || !columns || columns.length === 0) {
    return '';
  }

  const fullTable = qualifyTable(cleanTableName, schemaName, driver);
  const isMysql = driver?.toLowerCase() === 'mysql';
  const isSqlite = driver?.toLowerCase() === 'sqlite';

  const pkColumns = columns.filter((c) => c.isPrimaryKey && c.name.trim());
  const hasSinglePk = pkColumns.length === 1;
  const hasCompositePk = pkColumns.length > 1;

  const columnDefs: string[] = [];

  for (const col of columns) {
    const colName = col.name.trim();
    if (!colName) continue;

    const qCol = quoteIdentifier(colName, driver);
    const colType = col.dataType.trim();

    let def = `${qCol} ${colType}`;

    if (isSqlite && col.isPrimaryKey && hasSinglePk) {
      if (col.autoIncrement) {
        def += ' PRIMARY KEY AUTOINCREMENT';
      } else {
        def += ' PRIMARY KEY';
      }
    } else if (!isMysql && !isSqlite && col.isPrimaryKey && hasSinglePk) {
      def += ' PRIMARY KEY';
    } else {
      if (!col.nullable) {
        def += ' NOT NULL';
      }
      if (col.defaultValue && col.defaultValue.trim()) {
        def += ` DEFAULT ${col.defaultValue.trim()}`;
      }
      if (isMysql && col.autoIncrement) {
        def += ' AUTO_INCREMENT';
      }
    }

    columnDefs.push(def);
  }

  if (columnDefs.length === 0) {
    return '';
  }

  // Composite Primary Key or MySQL Single PK definition
  if (hasCompositePk || (isMysql && hasSinglePk)) {
    const pkNames = pkColumns.map((c) => quoteIdentifier(c.name.trim(), driver)).join(', ');
    columnDefs.push(`PRIMARY KEY (${pkNames})`);
  }

  const formattedDefs = columnDefs.map((d) => `  ${d}`).join(',\n');
  const tableSql = `CREATE TABLE ${fullTable} (\n${formattedDefs}\n);`;

  // Append any secondary CREATE INDEX statements
  if (indexes && indexes.length > 0) {
    const indexSqls = indexes
      .filter((idx) => idx.name.trim() && idx.columns.length > 0)
      .map((idx) =>
        buildCreateIndexSql({
          tableName: cleanTableName,
          schemaName,
          driver,
          indexName: idx.name,
          columns: idx.columns,
          isUnique: idx.isUnique,
        })
      )
      .filter((s) => s.length > 0);

    if (indexSqls.length > 0) {
      return `${tableSql}\n\n${indexSqls.join('\n')}`;
    }
  }

  return tableSql;
}

/**
 * Builds an UPDATE statement for an inline edited cell.
 */
export function buildUpdateSql(options: BuildUpdateOptions): string {
  const { driver, tableName, schemaName, columns, row, colIndex, newValue } = options;
  const targetCol = columns[colIndex];
  const fullTable = qualifyTable(tableName, schemaName, driver);
  const colSql = quoteIdentifier(targetCol.name, driver);
  const valSql = formatSqlLiteral(newValue, driver, targetCol.data_type);
  const whereSql = buildWhereClause(columns, row, driver);

  let sql = `UPDATE ${fullTable} SET ${colSql} = ${valSql} WHERE ${whereSql}`;
  if (driver === 'mysql' && findPrimaryKeyIndex(columns) < 0) {
    sql += ' LIMIT 1';
  }
  return `${sql};`;
}

/**
 * Builds a DELETE statement for a row.
 */
export function buildDeleteSql(options: BuildDeleteOptions): string {
  const { driver, tableName, schemaName, columns, row } = options;
  const fullTable = qualifyTable(tableName, schemaName, driver);
  const whereSql = buildWhereClause(columns, row, driver);

  let sql = `DELETE FROM ${fullTable} WHERE ${whereSql}`;
  if (driver === 'mysql' && findPrimaryKeyIndex(columns) < 0) {
    sql += ' LIMIT 1';
  }
  return `${sql};`;
}

/**
 * Builds an INSERT statement for a new row.
 */
export function buildInsertSql(options: BuildInsertOptions): string {
  const { driver, tableName, schemaName, columns, values } = options;
  const fullTable = qualifyTable(tableName, schemaName, driver);

  const colNames: string[] = [];
  const colVals: string[] = [];

  columns.forEach((col) => {
    if (Object.prototype.hasOwnProperty.call(values, col.name)) {
      const val = values[col.name];
      const lowerName = col.name.toLowerCase();
      const lowerType = (col.data_type || '').toLowerCase();
      const isAutoCol =
        col.is_primary_key === true ||
        col.is_auto_increment === true ||
        lowerName === 'id' ||
        lowerName.endsWith('_id') ||
        lowerName.endsWith('id') ||
        lowerType.includes('serial') ||
        lowerType.includes('auto_increment') ||
        lowerType.includes('identity');

      if (val === undefined || (isAutoCol && (val === '' || val === null))) {
        return;
      }
      colNames.push(quoteIdentifier(col.name, driver));
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
