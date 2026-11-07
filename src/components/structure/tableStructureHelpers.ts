import { QueryResult, CellValue, ColumnMeta, formatCellValue } from '../../types/db';

export interface TableColumnStructure {
  name: string;
  dataType: string;
  udtName?: string;
  isNullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  ordinalPosition: number;
}

export interface AddColumnParams {
  driver: string;
  tableName: string;
  schemaName?: string;
  columnName: string;
  dataType: string;
  isNullable: boolean;
  defaultValue?: string;
}

export interface DropColumnParams {
  driver: string;
  tableName: string;
  schemaName?: string;
  columnName: string;
}

export interface RenameColumnParams {
  driver: string;
  tableName: string;
  schemaName?: string;
  oldColumnName: string;
  newColumnName: string;
}

export interface ModifyColumnParams {
  driver: string;
  tableName: string;
  schemaName?: string;
  columnName: string;
  newDataType?: string;
  oldDataType?: string;
  isNullable?: boolean;
  oldIsNullable?: boolean;
  defaultValue?: string;
  oldDefaultValue?: string | null;
}

export function quoteIdentifier(name: string, driver: string): string {
  if (driver === 'mysql') {
    return `\`${name.replace(/`/g, '``')}\``;
  }
  return `"${name.replace(/"/g, '""')}"`;
}

export function getTableRef(tableName: string, schemaName?: string, driver = 'postgres'): string {
  const q = (s: string) => quoteIdentifier(s, driver);
  if (schemaName && driver !== 'sqlite') {
    return `${q(schemaName)}.${q(tableName)}`;
  }
  return q(tableName);
}

/**
 * Returns SQL query to fetch detailed column metadata for a given table and driver.
 */
export function getFetchColumnsSql(driver: string, tableName: string, schemaName?: string): string {
  const escapedTable = tableName.replace(/'/g, "''");
  const escapedSchema = (schemaName || 'public').replace(/'/g, "''");

  if (driver === 'sqlite') {
    return `PRAGMA table_info('${escapedTable}');`;
  }

  if (driver === 'mysql') {
    return `SELECT 
  column_name,
  data_type,
  column_type,
  is_nullable,
  column_default,
  ordinal_position,
  CASE WHEN column_key = 'PRI' THEN 'YES' ELSE 'NO' END as is_pk
FROM information_schema.columns
WHERE table_name = '${escapedTable}'
  ${schemaName ? `AND table_schema = '${escapedSchema}'` : 'AND table_schema = DATABASE()'}
ORDER BY ordinal_position;`;
  }

  // Default to PostgreSQL
  return `SELECT 
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  c.ordinal_position,
  CASE WHEN pk.column_name IS NOT NULL THEN 'YES' ELSE 'NO' END as is_pk
FROM information_schema.columns c
LEFT JOIN (
  SELECT ku.column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage ku
    ON tc.constraint_name = ku.constraint_name
    AND tc.table_schema = ku.table_schema
  WHERE tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_schema = '${escapedSchema}'
    AND tc.table_name = '${escapedTable}'
) pk ON c.column_name = pk.column_name
WHERE c.table_schema = '${escapedSchema}' AND c.table_name = '${escapedTable}'
ORDER BY c.ordinal_position;`;
}

/**
 * Parses query result into a typed TableColumnStructure list.
 */
export function parseColumnsFromQueryResult(
  result: QueryResult,
  driver: string,
  fallbackColumns?: ColumnMeta[]
): TableColumnStructure[] {
  if (!result || !result.rows || result.rows.length === 0) {
    if (fallbackColumns && fallbackColumns.length > 0) {
      return fallbackColumns.map((col, idx) => ({
        name: col.name,
        dataType: col.data_type,
        isNullable: col.nullable,
        defaultValue: null,
        isPrimaryKey: idx === 0 && col.name.toLowerCase() === 'id',
        ordinalPosition: idx + 1,
      }));
    }
    return [];
  }

  const getStr = (val: CellValue): string | null => {
    const s = formatCellValue(val);
    return s === 'NULL' ? null : s;
  };

  if (driver === 'sqlite') {
    // PRAGMA table_info returns: cid (0), name (1), type (2), notnull (3), dflt_value (4), pk (5)
    return result.rows.map((row) => {
      const name = getStr(row[1]) || '';
      const dataType = getStr(row[2]) || 'TEXT';
      const notNullVal = getStr(row[3]);
      const isNullable = notNullVal !== '1';
      const defaultValue = getStr(row[4]);
      const pkVal = getStr(row[5]);
      const isPrimaryKey = pkVal === '1';
      const cid = Number(getStr(row[0]) || 0);

      return {
        name,
        dataType,
        isNullable,
        defaultValue,
        isPrimaryKey,
        ordinalPosition: cid + 1,
      };
    });
  }

  // PostgreSQL / MySQL
  return result.rows.map((row) => {
    const name = getStr(row[0]) || '';
    const dataType = getStr(row[2]) || getStr(row[1]) || 'TEXT';
    const udtName = getStr(row[2]) || undefined;
    const isNullable = getStr(row[3]) === 'YES';
    const defaultValue = getStr(row[4]);
    const ordinal = Number(getStr(row[5]) || 1);
    const isPk = getStr(row[6]) === 'YES';

    return {
      name,
      dataType,
      udtName,
      isNullable,
      defaultValue,
      isPrimaryKey: isPk,
      ordinalPosition: ordinal,
    };
  });
}

/**
 * Builds ALTER TABLE ... ADD COLUMN SQL statement.
 */
export function buildAddColumnSql({
  driver,
  tableName,
  schemaName,
  columnName,
  dataType,
  isNullable,
  defaultValue,
}: AddColumnParams): string {
  const tableRef = getTableRef(tableName, schemaName, driver);
  const qCol = quoteIdentifier(columnName, driver);

  let sql = `ALTER TABLE ${tableRef} ADD COLUMN ${qCol} ${dataType}`;
  if (defaultValue !== undefined && defaultValue !== null && defaultValue.trim() !== '') {
    sql += ` DEFAULT ${defaultValue.trim()}`;
  }
  if (!isNullable) {
    sql += ` NOT NULL`;
  }
  return sql + ';';
}

/**
 * Builds ALTER TABLE ... DROP COLUMN SQL statement.
 */
export function buildDropColumnSql({
  driver,
  tableName,
  schemaName,
  columnName,
}: DropColumnParams): string {
  const tableRef = getTableRef(tableName, schemaName, driver);
  const qCol = quoteIdentifier(columnName, driver);
  return `ALTER TABLE ${tableRef} DROP COLUMN ${qCol};`;
}

/**
 * Builds ALTER TABLE ... RENAME COLUMN SQL statement.
 */
export function buildRenameColumnSql({
  driver,
  tableName,
  schemaName,
  oldColumnName,
  newColumnName,
}: RenameColumnParams): string {
  const tableRef = getTableRef(tableName, schemaName, driver);
  const qOld = quoteIdentifier(oldColumnName, driver);
  const qNew = quoteIdentifier(newColumnName, driver);
  return `ALTER TABLE ${tableRef} RENAME COLUMN ${qOld} TO ${qNew};`;
}

/**
 * Builds ALTER TABLE statements to modify column type, nullable, and default value.
 */
export function buildModifyColumnSql({
  driver,
  tableName,
  schemaName,
  columnName,
  newDataType,
  oldDataType,
  isNullable,
  oldIsNullable,
  defaultValue,
  oldDefaultValue,
}: ModifyColumnParams): string[] {
  const tableRef = getTableRef(tableName, schemaName, driver);
  const qCol = quoteIdentifier(columnName, driver);
  const stmts: string[] = [];

  if (driver === 'sqlite') {
    throw new Error('SQLite does not support altering existing columns in-place. Consider renaming or adding a new column.');
  }

  if (driver === 'mysql') {
    // MySQL uses MODIFY COLUMN
    const type = newDataType || oldDataType || 'VARCHAR(255)';
    let sql = `ALTER TABLE ${tableRef} MODIFY COLUMN ${qCol} ${type}`;
    if (defaultValue !== undefined && defaultValue !== null && defaultValue.trim() !== '') {
      sql += ` DEFAULT ${defaultValue.trim()}`;
    }
    const nullable = isNullable !== undefined ? isNullable : oldIsNullable ?? true;
    if (!nullable) {
      sql += ` NOT NULL`;
    } else {
      sql += ` NULL`;
    }
    stmts.push(sql + ';');
    return stmts;
  }

  // PostgreSQL
  if (newDataType && newDataType !== oldDataType) {
    stmts.push(`ALTER TABLE ${tableRef} ALTER COLUMN ${qCol} TYPE ${newDataType} USING ${qCol}::${newDataType};`);
  }

  if (isNullable !== undefined && isNullable !== oldIsNullable) {
    if (isNullable) {
      stmts.push(`ALTER TABLE ${tableRef} ALTER COLUMN ${qCol} DROP NOT NULL;`);
    } else {
      stmts.push(`ALTER TABLE ${tableRef} ALTER COLUMN ${qCol} SET NOT NULL;`);
    }
  }

  if (defaultValue !== undefined && defaultValue !== oldDefaultValue) {
    if (defaultValue === null || defaultValue.trim() === '') {
      stmts.push(`ALTER TABLE ${tableRef} ALTER COLUMN ${qCol} DROP DEFAULT;`);
    } else {
      stmts.push(`ALTER TABLE ${tableRef} ALTER COLUMN ${qCol} SET DEFAULT ${defaultValue.trim()};`);
    }
  }

  return stmts;
}

/**
 * Generates synthetic CREATE TABLE DDL.
 */
export function generateTableDdl({
  driver,
  tableName,
  schemaName,
  columns,
}: {
  driver: string;
  tableName: string;
  schemaName?: string;
  columns: TableColumnStructure[];
}): string {
  const tableRef = getTableRef(tableName, schemaName, driver);
  const pks = columns.filter((c) => c.isPrimaryKey).map((c) => quoteIdentifier(c.name, driver));

  const colDefs = columns.map((col) => {
    let line = `  ${quoteIdentifier(col.name, driver)} ${col.dataType}`;
    if (!col.isNullable) {
      line += ' NOT NULL';
    }
    if (col.defaultValue !== null && col.defaultValue !== undefined && col.defaultValue !== '') {
      line += ` DEFAULT ${col.defaultValue}`;
    }
    return line;
  });

  if (pks.length > 0) {
    colDefs.push(`  PRIMARY KEY (${pks.join(', ')})`);
  }

  return `CREATE TABLE ${tableRef} (\n${colDefs.join(',\n')}\n);`;
}
