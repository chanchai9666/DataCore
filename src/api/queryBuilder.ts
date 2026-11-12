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
 * Finds all indices of primary key columns from metadata.
 * Prioritizes explicit primary key flags.
 * Falls back to an exact 'id' column if no column has is_primary_key === true.
 */
export function findPrimaryKeyIndexes(columns: ColumnMeta[]): number[] {
  const explicitPks = columns
    .map((c, idx) => (c.is_primary_key === true ? idx : -1))
    .filter((idx) => idx >= 0);

  if (explicitPks.length > 0) {
    return explicitPks;
  }

  const fallbackId = columns.findIndex((c) => c.name.toLowerCase() === 'id');
  if (fallbackId >= 0) {
    return [fallbackId];
  }

  return [];
}

/**
 * Finds the index of the first primary key column from metadata.
 * Provided for backwards compatibility with single-PK callers.
 */
export function findPrimaryKeyIndex(columns: ColumnMeta[]): number {
  const indexes = findPrimaryKeyIndexes(columns);
  return indexes.length > 0 ? indexes[0] : -1;
}

/**
 * Builds a WHERE clause identifying a single row by PK (including composite PKs) or all non-null values.
 */
export function buildWhereClause(
  columns: ColumnMeta[],
  row: CellValue[],
  driver: DatabaseDriver
): string {
  const pkIndexes = findPrimaryKeyIndexes(columns);
  if (pkIndexes.length > 0) {
    const pkConditions: string[] = [];
    for (const pkIdx of pkIndexes) {
      const pkCol = columns[pkIdx];
      const rawPk = extractCellValue(row[pkIdx]).rawValue;
      if (rawPk !== null && rawPk !== undefined) {
        pkConditions.push(
          `${quoteIdentifier(pkCol.name, driver)} = ${formatSqlLiteral(
            rawPk,
            driver,
            pkCol.data_type
          )}`
        );
      }
    }
    // If all composite PK columns have valid values, use composite PK WHERE
    if (pkConditions.length === pkIndexes.length) {
      return pkConditions.join(' AND ');
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

  if (conditions.length === 0) {
    throw new Error('Cannot identify target row: no columns or primary key available');
  }

  return conditions.join(' AND ');
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

  const pkIndexes = findPrimaryKeyIndexes(columns);
  if (pkIndexes.length > 0) {
    return `UPDATE ${fullTable} SET ${colSql} = ${valSql} WHERE ${whereSql};`;
  }

  // Fallback when no explicit primary key exists: guard to a single row to prevent mass modification
  const normDriver = driver?.toLowerCase();
  if (normDriver === 'mysql') {
    return `UPDATE ${fullTable} SET ${colSql} = ${valSql} WHERE ${whereSql} LIMIT 1;`;
  }
  if (normDriver === 'sqlite') {
    return `UPDATE ${fullTable} SET ${colSql} = ${valSql} WHERE rowid = (SELECT rowid FROM ${fullTable} WHERE ${whereSql} LIMIT 1);`;
  }
  // Postgres
  return `UPDATE ${fullTable} SET ${colSql} = ${valSql} WHERE ctid = (SELECT ctid FROM ${fullTable} WHERE ${whereSql} LIMIT 1);`;
}

/**
 * Builds a DELETE statement for a row.
 */
export function buildDeleteSql(options: BuildDeleteOptions): string {
  const { driver, tableName, schemaName, columns, row } = options;
  const fullTable = qualifyTable(tableName, schemaName, driver);
  const whereSql = buildWhereClause(columns, row, driver);

  const pkIndexes = findPrimaryKeyIndexes(columns);
  if (pkIndexes.length > 0) {
    return `DELETE FROM ${fullTable} WHERE ${whereSql};`;
  }

  // Fallback when no explicit primary key exists: guard to a single row to prevent mass deletion
  const normDriver = driver?.toLowerCase();
  if (normDriver === 'mysql') {
    return `DELETE FROM ${fullTable} WHERE ${whereSql} LIMIT 1;`;
  }
  if (normDriver === 'sqlite') {
    return `DELETE FROM ${fullTable} WHERE rowid = (SELECT rowid FROM ${fullTable} WHERE ${whereSql} LIMIT 1);`;
  }
  // Postgres
  return `DELETE FROM ${fullTable} WHERE ctid = (SELECT ctid FROM ${fullTable} WHERE ${whereSql} LIMIT 1);`;
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

export interface ExplainOptions {
  sql: string;
  driver?: DatabaseDriver | string;
  analyze?: boolean;
  format?: 'json' | 'text';
}

/**
 * Builds an EXPLAIN statement according to database driver capabilities.
 */
export function buildExplainSql(options: ExplainOptions): string {
  const { sql, driver, analyze = false, format = 'text' } = options;
  const cleanSql = sql.trim().replace(/;+$/, '');
  const d = (driver || '').toLowerCase();

  if (d.includes('sqlite')) {
    return `EXPLAIN QUERY PLAN ${cleanSql};`;
  }

  if (d.includes('mysql')) {
    if (analyze) {
      return `EXPLAIN ANALYZE ${cleanSql};`;
    }
    if (format === 'json') {
      return `EXPLAIN FORMAT=JSON ${cleanSql};`;
    }
    return `EXPLAIN ${cleanSql};`;
  }

  // PostgreSQL default
  if (analyze) {
    if (format === 'json') {
      return `EXPLAIN (ANALYZE, COSTS, VERBOSE, BUFFERS, FORMAT JSON) ${cleanSql};`;
    }
    return `EXPLAIN (ANALYZE, COSTS, VERBOSE, BUFFERS) ${cleanSql};`;
  }

  if (format === 'json') {
    return `EXPLAIN (COSTS, VERBOSE, FORMAT JSON) ${cleanSql};`;
  }
  return `EXPLAIN ${cleanSql};`;
}

export interface TableForeignKeyStructure {
  name: string;
  columnNames: string[];
  foreignTableName: string;
  foreignColumnNames: string[];
  onUpdate?: string;
  onDelete?: string;
}

export interface ExistingColumnDef {
  name: string;
  type?: string;
  nullable?: boolean;
  isPrimaryKey?: boolean;
  defaultValue?: string | null;
  isUnique?: boolean;
  checkConstraint?: string;
  isAutoIncrement?: boolean;
  collation?: string;
}

export interface ExistingForeignKeyDef {
  name: string;
  columnNames?: string[];
  columns?: string[];
  foreignTableName?: string;
  foreignTable?: string;
  foreignColumnNames?: string[];
  foreignColumns?: string[];
  onDelete?: string;
  onUpdate?: string;
}

export interface AddForeignKeyParams {
  tableName: string;
  schemaName?: string;
  driver?: string;
  constraintName?: string;
  columns: string[];
  foreignTable: string;
  foreignColumns: string[];
  onDelete?: string;
  onUpdate?: string;
  existingColumns?: ExistingColumnDef[];
}

export interface DropForeignKeyParams {
  tableName: string;
  schemaName?: string;
  driver?: string;
  constraintName: string;
  existingColumns?: ExistingColumnDef[];
  remainingForeignKeys?: ExistingForeignKeyDef[];
}

export interface TableConstraintStructure {
  name: string;
  type: 'CHECK' | 'UNIQUE' | 'PRIMARY KEY';
  definition?: string;
  columns?: string[];
}

export interface AddConstraintParams {
  tableName: string;
  schemaName?: string;
  driver?: string;
  name: string;
  type: 'CHECK' | 'UNIQUE';
  expression?: string;
  columns?: string[];
}

export interface DropConstraintParams {
  tableName: string;
  schemaName?: string;
  driver?: string;
  name: string;
  type?: 'CHECK' | 'UNIQUE';
}

/**
 * Builds an ALTER TABLE ADD CONSTRAINT FOREIGN KEY statement (or table-rebuild migration for SQLite).
 */
export function buildAddForeignKeySql(params: AddForeignKeyParams): string {
  const {
    tableName,
    schemaName,
    driver,
    constraintName,
    columns,
    foreignTable,
    foreignColumns,
    onDelete,
    onUpdate,
    existingColumns,
  } = params;

  const d = (driver || '').toLowerCase();
  const isSqlite = d.includes('sqlite');

  if (isSqlite) {
    if (!existingColumns || existingColumns.length === 0) {
      throw new Error(
        'SQLite does not support ALTER TABLE ADD CONSTRAINT FOREIGN KEY. Table rebuild requires existing column definitions.'
      );
    }

    const tempTable = `${tableName}_datacore_rebuild`;
    const quotedTemp = quoteIdentifier(tempTable, driver);
    const quotedOrig = quoteIdentifier(tableName, driver);
    const quotedForeign = quoteIdentifier(foreignTable, driver);

    const fkName = constraintName || `fk_${tableName}_${columns.join('_')}`;
    const quotedFkName = quoteIdentifier(fkName, driver);
    const cols = columns.map((c) => quoteIdentifier(c, driver)).join(', ');
    const foreignCols = foreignColumns.map((c) => quoteIdentifier(c, driver)).join(', ');

    let fkClause = `CONSTRAINT ${quotedFkName} FOREIGN KEY (${cols}) REFERENCES ${quotedForeign} (${foreignCols})`;
    if (onDelete && onDelete !== 'NO ACTION') {
      fkClause += ` ON DELETE ${onDelete.toUpperCase()}`;
    }
    if (onUpdate && onUpdate !== 'NO ACTION') {
      fkClause += ` ON UPDATE ${onUpdate.toUpperCase()}`;
    }

    const colDefs = existingColumns.map((col) => {
      let def = `${quoteIdentifier(col.name, driver)} ${col.type || 'TEXT'}`;
      if (col.isPrimaryKey) {
        def += ' PRIMARY KEY';
        if (col.isAutoIncrement) {
          def += ' AUTOINCREMENT';
        }
      }
      if (col.isUnique && !col.isPrimaryKey) {
        def += ' UNIQUE';
      }
      if (col.nullable === false && !col.isPrimaryKey) {
        def += ' NOT NULL';
      }
      if (col.defaultValue !== undefined && col.defaultValue !== null && col.defaultValue !== '') {
        def += ` DEFAULT ${col.defaultValue}`;
      }
      if (col.checkConstraint) {
        def += ` CHECK (${col.checkConstraint})`;
      }
      if (col.collation) {
        def += ` COLLATE ${col.collation}`;
      }
      return def;
    });

    const allDefs = [...colDefs, fkClause].join(',\n  ');
    const colNames = existingColumns.map((c) => quoteIdentifier(c.name, driver)).join(', ');

    return [
      'PRAGMA foreign_keys = OFF;',
      'BEGIN TRANSACTION;',
      `CREATE TABLE ${quotedTemp} (\n  ${allDefs}\n);`,
      `INSERT INTO ${quotedTemp} (${colNames}) SELECT ${colNames} FROM ${quotedOrig};`,
      `DROP TABLE ${quotedOrig};`,
      `ALTER TABLE ${quotedTemp} RENAME TO ${quotedOrig};`,
      'COMMIT;',
      'PRAGMA foreign_keys = ON;',
    ].join('\n');
  }

  const fullTable = qualifyTable(tableName, schemaName, driver);
  const fullForeignTable = qualifyTable(foreignTable, schemaName, driver);
  const cols = columns.map((c) => quoteIdentifier(c, driver)).join(', ');
  const foreignCols = foreignColumns.map((c) => quoteIdentifier(c, driver)).join(', ');

  const fkName = constraintName || `fk_${tableName}_${columns.join('_')}`;
  const quotedFkName = quoteIdentifier(fkName, driver);

  let sql = `ALTER TABLE ${fullTable} ADD CONSTRAINT ${quotedFkName} FOREIGN KEY (${cols}) REFERENCES ${fullForeignTable} (${foreignCols})`;
  if (onDelete && onDelete !== 'NO ACTION') {
    sql += ` ON DELETE ${onDelete.toUpperCase()}`;
  }
  if (onUpdate && onUpdate !== 'NO ACTION') {
    sql += ` ON UPDATE ${onUpdate.toUpperCase()}`;
  }
  return `${sql};`;
}

/**
 * Builds a statement to drop a foreign key constraint (or table-rebuild migration for SQLite).
 */
export function buildDropForeignKeySql(params: DropForeignKeyParams): string {
  const { tableName, schemaName, driver, constraintName, existingColumns, remainingForeignKeys } = params;
  const d = (driver || '').toLowerCase();

  if (d.includes('sqlite')) {
    if (!existingColumns || existingColumns.length === 0) {
      throw new Error(
        'SQLite does not support ALTER TABLE DROP CONSTRAINT. Table rebuild requires existing column definitions.'
      );
    }

    const tempTable = `${tableName}_datacore_rebuild`;
    const quotedTemp = quoteIdentifier(tempTable, driver);
    const quotedOrig = quoteIdentifier(tableName, driver);

    const colDefs = existingColumns.map((col) => {
      let def = `${quoteIdentifier(col.name, driver)} ${col.type || 'TEXT'}`;
      if (col.isPrimaryKey) {
        def += ' PRIMARY KEY';
        if (col.isAutoIncrement) {
          def += ' AUTOINCREMENT';
        }
      }
      if (col.isUnique && !col.isPrimaryKey) {
        def += ' UNIQUE';
      }
      if (col.nullable === false && !col.isPrimaryKey) {
        def += ' NOT NULL';
      }
      if (col.defaultValue !== undefined && col.defaultValue !== null && col.defaultValue !== '') {
        def += ` DEFAULT ${col.defaultValue}`;
      }
      if (col.checkConstraint) {
        def += ` CHECK (${col.checkConstraint})`;
      }
      if (col.collation) {
        def += ` COLLATE ${col.collation}`;
      }
      return def;
    });

    const fkClauses = (remainingForeignKeys || [])
      .filter((fk) => fk.name !== constraintName)
      .map((fk) => {
        const quotedFkName = quoteIdentifier(fk.name, driver);
        const colList = fk.columnNames || fk.columns || [];
        const foreignColList = fk.foreignColumnNames || fk.foreignColumns || [];
        const fTable = fk.foreignTableName || fk.foreignTable || '';
        const cols = colList.map((c) => quoteIdentifier(c, driver)).join(', ');
        const foreignCols = foreignColList.map((c) => quoteIdentifier(c, driver)).join(', ');
        const quotedForeign = quoteIdentifier(fTable, driver);
        let clause = `CONSTRAINT ${quotedFkName} FOREIGN KEY (${cols}) REFERENCES ${quotedForeign} (${foreignCols})`;
        if (fk.onDelete && fk.onDelete !== 'NO ACTION') clause += ` ON DELETE ${fk.onDelete.toUpperCase()}`;
        if (fk.onUpdate && fk.onUpdate !== 'NO ACTION') clause += ` ON UPDATE ${fk.onUpdate.toUpperCase()}`;
        return clause;
      });

    const allDefs = [...colDefs, ...fkClauses].join(',\n  ');
    const colNames = existingColumns.map((c) => quoteIdentifier(c.name, driver)).join(', ');

    return [
      'PRAGMA foreign_keys = OFF;',
      'BEGIN TRANSACTION;',
      `CREATE TABLE ${quotedTemp} (\n  ${allDefs}\n);`,
      `INSERT INTO ${quotedTemp} (${colNames}) SELECT ${colNames} FROM ${quotedOrig};`,
      `DROP TABLE ${quotedOrig};`,
      `ALTER TABLE ${quotedTemp} RENAME TO ${quotedOrig};`,
      'COMMIT;',
      'PRAGMA foreign_keys = ON;',
    ].join('\n');
  }

  const fullTable = qualifyTable(tableName, schemaName, driver);
  const quotedFk = quoteIdentifier(constraintName, driver);

  if (d.includes('mysql')) {
    return `ALTER TABLE ${fullTable} DROP FOREIGN KEY ${quotedFk};`;
  }
  return `ALTER TABLE ${fullTable} DROP CONSTRAINT ${quotedFk};`;
}

/**
 * Builds an ALTER TABLE ADD CONSTRAINT (CHECK or UNIQUE) statement.
 */
export function buildAddConstraintSql(params: AddConstraintParams): string {
  const { tableName, schemaName, driver, name, type, expression, columns } = params;
  const fullTable = qualifyTable(tableName, schemaName, driver);
  const quotedName = quoteIdentifier(name, driver);

  if (type === 'CHECK') {
    const expr = expression || '1=1';
    return `ALTER TABLE ${fullTable} ADD CONSTRAINT ${quotedName} CHECK (${expr});`;
  }

  const cols = (columns || []).map((c) => quoteIdentifier(c, driver)).join(', ');
  return `ALTER TABLE ${fullTable} ADD CONSTRAINT ${quotedName} UNIQUE (${cols});`;
}

/**
 * Builds a statement to drop a constraint.
 */
export function buildDropConstraintSql(params: DropConstraintParams): string {
  const { tableName, schemaName, driver, name, type } = params;
  const fullTable = qualifyTable(tableName, schemaName, driver);
  const quotedName = quoteIdentifier(name, driver);
  const d = (driver || '').toLowerCase();

  if (d.includes('mysql')) {
    if (type === 'CHECK') {
      return `ALTER TABLE ${fullTable} DROP CHECK ${quotedName};`;
    }
    return `ALTER TABLE ${fullTable} DROP INDEX ${quotedName};`;
  }

  return `ALTER TABLE ${fullTable} DROP CONSTRAINT ${quotedName};`;
}
