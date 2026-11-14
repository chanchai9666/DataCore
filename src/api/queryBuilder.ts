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
  sql?: string;
}

export interface TableTriggerDef {
  name: string;
  sql: string;
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
  originalDdl?: string;
  existingIndexes?: TableIndexStructure[];
  existingTriggers?: TableTriggerDef[];
}

export interface DropForeignKeyParams {
  tableName: string;
  schemaName?: string;
  driver?: string;
  constraintName: string;
  existingColumns?: ExistingColumnDef[];
  remainingForeignKeys?: ExistingForeignKeyDef[];
  originalDdl?: string;
  existingIndexes?: TableIndexStructure[];
  existingTriggers?: TableTriggerDef[];
}

function findMatchingParen(sql: string, openIndex: number): number {
  if (openIndex < 0) return -1;
  let depth = 0;
  let quote: string | null = null;
  for (let i = openIndex; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      if (ch === quote) {
        if (sql[i + 1] === quote) {
          i++;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '[') {
      quote = ']';
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevelDefinitions(body: string): string[] {
  const defs: string[] = [];
  let current = '';
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      current += ch;
      if (ch === quote) {
        if (body[i + 1] === quote) {
          current += body[i + 1];
          i++;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '[') {
      quote = ']';
      current += ch;
      continue;
    }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      defs.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) defs.push(current.trim());
  return defs;
}

function stripConstraintPrefix(definition: string): string {
  const trimmed = definition.trim();
  const match = trimmed.match(
    /^CONSTRAINT\s+("(?:[^"]|"")*"|`(?:[^`]|``)*`|\[[^\]]*\]|\S+)\s+/i
  );
  return match ? trimmed.slice(match[0].length) : trimmed;
}

function isForeignKeyDefinition(definition: string): boolean {
  return /^FOREIGN\s+KEY\b/i.test(stripConstraintPrefix(definition));
}

function ensureSemicolon(sql: string): string {
  const trimmed = sql.trim();
  return trimmed.endsWith(';') ? trimmed : `${trimmed};`;
}

function renameCreatedTable(ddl: string, newTableName: string, driver?: string): string {
  const quotedNew = quoteIdentifier(newTableName, driver);
  const pattern =
    /^(\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?)(?:"(?:[^"]|"")*"|`(?:[^`]|``)*`|\[[^\]]*\]|[^\s(]+)/i;
  if (!pattern.test(ddl)) return ddl;
  return ddl.replace(pattern, (_m, prefix: string) => `${prefix}${quotedNew}`);
}

function appendTableDefinition(ddl: string, clause: string): string {
  if (!clause.trim()) return ddl;
  const open = ddl.indexOf('(');
  const close = findMatchingParen(ddl, open);
  if (open < 0 || close < 0) return ddl;
  const before = ddl.slice(0, close).replace(/[\s,]+$/, '');
  return `${before},\n  ${clause}\n${ddl.slice(close)}`;
}

function removeForeignKeyDefinitions(ddl: string): string {
  const open = ddl.indexOf('(');
  const close = findMatchingParen(ddl, open);
  if (open < 0 || close < 0) return ddl;
  const defs = splitTopLevelDefinitions(ddl.slice(open + 1, close)).filter(
    (def) => !isForeignKeyDefinition(def)
  );
  return `${ddl.slice(0, open + 1)}\n  ${defs.join(',\n  ')}\n${ddl.slice(close)}`;
}

function buildSqliteRebuildScript(params: {
  tableName: string;
  driver?: string;
  createTableSql: string;
  columns: ExistingColumnDef[];
  indexes?: TableIndexStructure[];
  triggers?: TableTriggerDef[];
}): string {
  const { tableName, driver, createTableSql, columns, indexes, triggers } = params;
  const quotedTemp = quoteIdentifier(`${tableName}_datacore_rebuild`, driver);
  const quotedOrig = quoteIdentifier(tableName, driver);
  const colNames = columns.map((c) => quoteIdentifier(c.name, driver)).join(', ');

  const steps: string[] = [
    'PRAGMA foreign_keys = OFF;',
    'BEGIN TRANSACTION;',
    ensureSemicolon(createTableSql.trim()),
    `INSERT INTO ${quotedTemp} (${colNames}) SELECT ${colNames} FROM ${quotedOrig};`,
    `DROP TABLE ${quotedOrig};`,
    `ALTER TABLE ${quotedTemp} RENAME TO ${quotedOrig};`,
  ];

  for (const index of indexes || []) {
    if (!index.sql || index.name.startsWith('sqlite_autoindex_')) continue;
    steps.push(ensureSemicolon(index.sql));
  }
  for (const trigger of triggers || []) {
    if (!trigger.sql) continue;
    steps.push(ensureSemicolon(trigger.sql));
  }

  steps.push('COMMIT;', 'PRAGMA foreign_keys = ON;');
  return steps.join('\n');
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

    let createTableSql: string;
    if (params.originalDdl && params.originalDdl.trim()) {
      createTableSql = appendTableDefinition(
        renameCreatedTable(params.originalDdl, tempTable, driver),
        fkClause
      );
    } else {
      const pkCols = existingColumns.filter((c) => c.isPrimaryKey);
      const colDefs = existingColumns.map((col) => {
        let def = `${quoteIdentifier(col.name, driver)} ${col.type || 'TEXT'}`;
        if (col.isPrimaryKey && pkCols.length === 1) {
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

      if (pkCols.length > 1) {
        colDefs.push(
          `PRIMARY KEY (${pkCols.map((c) => quoteIdentifier(c.name, driver)).join(', ')})`
        );
      }
      colDefs.push(fkClause);
      createTableSql = `CREATE TABLE ${quotedTemp} (\n  ${colDefs.join(',\n  ')}\n)`;
    }

    return buildSqliteRebuildScript({
      tableName,
      driver,
      createTableSql,
      columns: existingColumns,
      indexes: params.existingIndexes,
      triggers: params.existingTriggers,
    });
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
  const {
    tableName,
    schemaName,
    driver,
    constraintName,
    existingColumns,
    remainingForeignKeys,
    originalDdl,
  } = params;
  const d = (driver || '').toLowerCase();

  if (d.includes('sqlite')) {
    if (!existingColumns || existingColumns.length === 0) {
      throw new Error(
        'SQLite does not support ALTER TABLE DROP CONSTRAINT. Table rebuild requires existing column definitions.'
      );
    }

    const tempTable = `${tableName}_datacore_rebuild`;
    const quotedTemp = quoteIdentifier(tempTable, driver);

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

    let createTableSql: string;
    if (originalDdl && originalDdl.trim()) {
      const renamed = renameCreatedTable(originalDdl, tempTable, driver);
      const stripped = removeForeignKeyDefinitions(renamed);
      createTableSql = appendTableDefinition(stripped, fkClauses.join(',\n  '));
    } else {
      const pkCols = existingColumns.filter((c) => c.isPrimaryKey);
      const colDefs = existingColumns.map((col) => {
        let def = `${quoteIdentifier(col.name, driver)} ${col.type || 'TEXT'}`;
        if (col.isPrimaryKey && pkCols.length === 1) {
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

      if (pkCols.length > 1) {
        colDefs.push(
          `PRIMARY KEY (${pkCols.map((c) => quoteIdentifier(c.name, driver)).join(', ')})`
        );
      }
      const allDefs = [...colDefs, ...fkClauses].join(',\n  ');
      createTableSql = `CREATE TABLE ${quotedTemp} (\n  ${allDefs}\n)`;
    }

    return buildSqliteRebuildScript({
      tableName,
      driver,
      createTableSql,
      columns: existingColumns,
      indexes: params.existingIndexes,
      triggers: params.existingTriggers,
    });
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

export type QueryJoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';

export type QueryFilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'less_than'
  | 'greater_or_equal'
  | 'less_or_equal'
  | 'between'
  | 'is_null'
  | 'is_not_null';

export interface SelectedColumn {
  id?: string;
  table?: string;
  column: string;
  alias?: string;
  aggregate?: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX' | '';
  distinct?: boolean;
}

export interface QueryJoin {
  id: string;
  type: QueryJoinType;
  table: string;
  schema?: string;
  alias?: string;
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
}

export interface QueryFilter {
  id: string;
  table?: string;
  column: string;
  operator: QueryFilterOperator;
  value?: string;
  valueTo?: string;
}

export interface QueryOrderBy {
  id: string;
  table?: string;
  column: string;
  direction: 'ASC' | 'DESC';
}

export interface SelectQueryConfig {
  driver?: DatabaseDriver | string;
  baseTable: string;
  baseTableAlias?: string;
  schemaName?: string;
  distinct?: boolean;
  columns?: SelectedColumn[];
  joins?: QueryJoin[];
  filters?: QueryFilter[];
  filterConjunction?: 'AND' | 'OR';
  groupBy?: string[];
  orderBy?: QueryOrderBy[];
  limit?: number;
  offset?: number;
}

function formatFilterValue(val: unknown, driver?: string): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return isNaN(val) ? 'NULL' : String(val);
  if (typeof val === 'boolean') {
    const isPostgres = !driver || driver.toLowerCase().includes('postgres');
    return isPostgres ? (val ? 'TRUE' : 'FALSE') : (val ? '1' : '0');
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.toUpperCase() === 'NULL') return 'NULL';
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return trimmed;
    }
    return `'${val.replace(/'/g, "''")}'`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

/**
 * Builds a formatted SQL SELECT query from visual query configuration.
 */
export function buildSelectQuery(config: SelectQueryConfig): string {
  const driver = config.driver;
  const cleanBaseTable = (config.baseTable || '').trim();
  if (!cleanBaseTable) {
    return '';
  }

  const baseTableQuoted = qualifyTable(cleanBaseTable, config.schemaName, driver);
  const baseTableRef = config.baseTableAlias && config.baseTableAlias.trim()
    ? `${baseTableQuoted} AS ${quoteIdentifier(config.baseTableAlias.trim(), driver)}`
    : baseTableQuoted;

  // 1. SELECT Columns
  const validCols = (config.columns || []).filter(
    (c) => c && c.column && c.column.trim().length > 0
  );

  let selectClause = 'SELECT';
  if (config.distinct) {
    selectClause += ' DISTINCT';
  }

  let colParts: string[] = [];
  if (validCols.length === 0) {
    colParts.push('*');
  } else {
    colParts = validCols.map((c) => {
      const colName = c.column.trim();
      let expr: string;

      if (colName === '*') {
        if (c.table && c.table.trim()) {
          expr = `${quoteIdentifier(c.table.trim(), driver)}.*`;
        } else {
          expr = '*';
        }
      } else {
        const quotedCol = quoteIdentifier(colName, driver);
        if (c.table && c.table.trim()) {
          expr = `${quoteIdentifier(c.table.trim(), driver)}.${quotedCol}`;
        } else {
          expr = quotedCol;
        }
      }

      if (c.aggregate && c.aggregate.trim()) {
        const agg = c.aggregate.trim().toUpperCase();
        if (c.distinct) {
          expr = `${agg}(DISTINCT ${expr})`;
        } else {
          expr = `${agg}(${expr})`;
        }
      }

      if (c.alias && c.alias.trim()) {
        expr += ` AS ${quoteIdentifier(c.alias.trim(), driver)}`;
      }

      return expr;
    });
  }

  const lines: string[] = [];
  lines.push(`${selectClause} ${colParts.join(', ')}`);
  lines.push(`FROM ${baseTableRef}`);

  // 2. JOINs
  if (config.joins && config.joins.length > 0) {
    for (const join of config.joins) {
      if (!join.table || !join.table.trim()) continue;
      const joinType = (join.type || 'INNER').toUpperCase();
      const joinTableQuoted = qualifyTable(join.table.trim(), join.schema, driver);
      const joinTableTarget = join.alias && join.alias.trim()
        ? `${joinTableQuoted} AS ${quoteIdentifier(join.alias.trim(), driver)}`
        : joinTableQuoted;

      const leftTable = (join.leftTable || config.baseTableAlias || cleanBaseTable).trim();
      const leftCol = (join.leftColumn || '').trim();
      const rightTable = (join.alias || join.rightTable || join.table).trim();
      const rightCol = (join.rightColumn || '').trim();

      if (leftCol && rightCol) {
        const leftRef = `${quoteIdentifier(leftTable, driver)}.${quoteIdentifier(leftCol, driver)}`;
        const rightRef = `${quoteIdentifier(rightTable, driver)}.${quoteIdentifier(rightCol, driver)}`;
        lines.push(`${joinType} JOIN ${joinTableTarget} ON ${leftRef} = ${rightRef}`);
      } else {
        lines.push(`${joinType} JOIN ${joinTableTarget}`);
      }
    }
  }

  // 3. WHERE filters
  if (config.filters && config.filters.length > 0) {
    const filterClauses: string[] = [];
    for (const filter of config.filters) {
      if (!filter.column || !filter.column.trim()) continue;
      const colName = filter.column.trim();
      const colRef = filter.table && filter.table.trim()
        ? `${quoteIdentifier(filter.table.trim(), driver)}.${quoteIdentifier(colName, driver)}`
        : quoteIdentifier(colName, driver);

      const val = filter.value !== undefined ? filter.value : '';
      const valTo = filter.valueTo !== undefined ? filter.valueTo : '';

      switch (filter.operator) {
        case 'equals':
          filterClauses.push(`${colRef} = ${formatFilterValue(val, driver)}`);
          break;
        case 'not_equals':
          filterClauses.push(`${colRef} != ${formatFilterValue(val, driver)}`);
          break;
        case 'contains':
          filterClauses.push(`${colRef} LIKE '%${val.replace(/'/g, "''")}%'`);
          break;
        case 'starts_with':
          filterClauses.push(`${colRef} LIKE '${val.replace(/'/g, "''")}%'`);
          break;
        case 'ends_with':
          filterClauses.push(`${colRef} LIKE '%${val.replace(/'/g, "''")}'`);
          break;
        case 'greater_than':
          filterClauses.push(`${colRef} > ${formatFilterValue(val, driver)}`);
          break;
        case 'less_than':
          filterClauses.push(`${colRef} < ${formatFilterValue(val, driver)}`);
          break;
        case 'greater_or_equal':
          filterClauses.push(`${colRef} >= ${formatFilterValue(val, driver)}`);
          break;
        case 'less_or_equal':
          filterClauses.push(`${colRef} <= ${formatFilterValue(val, driver)}`);
          break;
        case 'between':
          filterClauses.push(
            `${colRef} BETWEEN ${formatFilterValue(val, driver)} AND ${formatFilterValue(valTo, driver)}`
          );
          break;
        case 'is_null':
          filterClauses.push(`${colRef} IS NULL`);
          break;
        case 'is_not_null':
          filterClauses.push(`${colRef} IS NOT NULL`);
          break;
        default:
          filterClauses.push(`${colRef} = ${formatFilterValue(val, driver)}`);
          break;
      }
    }

    if (filterClauses.length > 0) {
      const conjunction = config.filterConjunction === 'OR' ? ' OR ' : ' AND ';
      lines.push(`WHERE ${filterClauses.join(conjunction)}`);
    }
  }

  // 4. GROUP BY
  if (config.groupBy && config.groupBy.length > 0) {
    const groupCols = config.groupBy
      .map((g) => g.trim())
      .filter(Boolean)
      .map((g) => {
        if (g.includes('.')) {
          const [t, c] = g.split('.');
          return `${quoteIdentifier(t, driver)}.${quoteIdentifier(c, driver)}`;
        }
        return quoteIdentifier(g, driver);
      });
    if (groupCols.length > 0) {
      lines.push(`GROUP BY ${groupCols.join(', ')}`);
    }
  }

  // 5. ORDER BY
  if (config.orderBy && config.orderBy.length > 0) {
    const orderClauses: string[] = [];
    for (const ord of config.orderBy) {
      if (!ord.column || !ord.column.trim()) continue;
      const colName = ord.column.trim();
      const colRef = ord.table && ord.table.trim()
        ? `${quoteIdentifier(ord.table.trim(), driver)}.${quoteIdentifier(colName, driver)}`
        : quoteIdentifier(colName, driver);
      const dir = (ord.direction || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      orderClauses.push(`${colRef} ${dir}`);
    }
    if (orderClauses.length > 0) {
      lines.push(`ORDER BY ${orderClauses.join(', ')}`);
    }
  }

  // 6. LIMIT & OFFSET
  if (typeof config.limit === 'number' && config.limit >= 0) {
    lines.push(`LIMIT ${config.limit}`);
  }
  if (typeof config.offset === 'number' && config.offset > 0) {
    lines.push(`OFFSET ${config.offset}`);
  }

  return `${lines.join('\n')};`;
}
