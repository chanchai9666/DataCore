import type { QueryResult, CellValue } from '../../types/db';
import { formatCellValue } from '../../types/db';

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

function quoteIdentifier(name: string, driver?: string): string {
  if (driver?.toLowerCase() === 'mysql') {
    return `\`${name}\``;
  }
  return `"${name}"`;
}

function getQualifiedTableName(tableName: string, schemaName?: string, driver?: string): string {
  const isPostgres = !driver || driver.toLowerCase() === 'postgres' || driver.toLowerCase() === 'postgresql';
  const qTable = quoteIdentifier(tableName, driver);

  if (schemaName && schemaName.trim() && isPostgres) {
    const qSchema = quoteIdentifier(schemaName.trim(), driver);
    return `${qSchema}.${qTable}`;
  }

  return qTable;
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
  const fullTable = getQualifiedTableName(tableName, schemaName, driver);
  const cascadePart = cascade && (!driver || driver.toLowerCase().includes('postgres')) ? ' CASCADE' : '';
  return `DROP TABLE ${fullTable}${cascadePart};`;
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

  const fullTable = getQualifiedTableName(cleanTable, schemaName, driver);
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
 * Builds a CREATE TABLE statement according to database driver and column specifications,
 * along with any additional custom indexes.
 */
export function buildCreateTableSql(config: CreateTableConfig): string {
  const { tableName, schemaName, driver, columns, indexes } = config;
  const cleanTableName = tableName.trim();

  if (!cleanTableName || !columns || columns.length === 0) {
    return '';
  }

  const fullTable = getQualifiedTableName(cleanTableName, schemaName, driver);
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
    }

    columnDefs.push(def);
  }

  if (columnDefs.length === 0) {
    return '';
  }

  // Composite PK or MySQL table-level PK definition
  if (hasCompositePk || (isMysql && hasSinglePk)) {
    const pkList = pkColumns.map((c) => quoteIdentifier(c.name.trim(), driver)).join(', ');
    columnDefs.push(`PRIMARY KEY (${pkList})`);
  }

  const formattedDefs = columnDefs.map((d) => `  ${d}`).join(',\n');
  const tableSql = `CREATE TABLE ${fullTable} (\n${formattedDefs}\n);`;

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
      .filter((sql) => sql.length > 0);

    if (indexSqls.length > 0) {
      return `${tableSql}\n\n${indexSqls.join('\n')}`;
    }
  }

  return tableSql;
}

/**
 * Returns SQL to fetch index definitions for a given table.
 */
export function getFetchIndexesSql(
  driver: string,
  tableName: string,
  schemaName?: string
): string {
  const escapedTable = tableName.replace(/'/g, "''");
  const escapedSchema = (schemaName || 'public').replace(/'/g, "''");

  if (driver?.toLowerCase() === 'sqlite') {
    return `SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = '${escapedTable}' AND sql IS NOT NULL ORDER BY name;`;
  }

  if (driver?.toLowerCase() === 'mysql') {
    return `SELECT 
  INDEX_NAME as index_name,
  CASE WHEN NON_UNIQUE = 0 THEN 1 ELSE 0 END AS is_unique,
  CASE WHEN INDEX_NAME = 'PRIMARY' THEN 1 ELSE 0 END AS is_primary,
  COLUMN_NAME as column_name,
  INDEX_TYPE as index_type
FROM information_schema.STATISTICS
WHERE TABLE_NAME = '${escapedTable}' ${schemaName ? `AND TABLE_SCHEMA = '${escapedSchema}'` : 'AND TABLE_SCHEMA = DATABASE()'}
ORDER BY is_primary DESC, INDEX_NAME, SEQ_IN_INDEX;`;
  }

  // PostgreSQL
  return `SELECT 
  i.relname AS index_name,
  CASE WHEN ix.indisunique THEN 1 ELSE 0 END AS is_unique,
  CASE WHEN ix.indisprimary THEN 1 ELSE 0 END AS is_primary,
  ARRAY_TO_STRING(ARRAY_AGG(a.attname ORDER BY array_position(ix.indkey, a.attnum)), ', ') AS column_names,
  am.amname AS index_type
FROM pg_class t
JOIN pg_namespace n ON n.oid = t.relnamespace
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_am am ON i.relam = am.oid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
WHERE t.relname = '${escapedTable}' AND n.nspname = '${escapedSchema}'
GROUP BY i.relname, ix.indisunique, ix.indisprimary, am.amname
ORDER BY ix.indisprimary DESC, i.relname;`;
}

/**
 * Parses query result into a typed TableIndexStructure list.
 */
export function parseIndexesFromQueryResult(
  result: QueryResult,
  driver: string
): TableIndexStructure[] {
  if (!result || !result.rows || result.rows.length === 0) {
    return [];
  }

  const getStr = (val: CellValue): string | null => {
    const s = formatCellValue(val);
    return s === 'NULL' ? null : s;
  };

  if (driver?.toLowerCase() === 'sqlite') {
    return result.rows.map((row) => {
      const name = getStr(row[0]) || '';
      const sql = getStr(row[1]) || '';
      const isUnique = /create\s+unique\s+index/i.test(sql);
      const match = sql.match(/\(([^)]+)\)/);
      const columns = match
        ? match[1].split(',').map((c) => c.trim().replace(/^["`[]|["`\]]$/g, ''))
        : [];
      return {
        name,
        columns,
        isUnique,
        isPrimary: false,
        indexType: 'INDEX',
      };
    });
  }

  if (driver?.toLowerCase() === 'mysql') {
    const indexMap = new Map<string, TableIndexStructure>();
    for (const row of result.rows) {
      const name = getStr(row[0]) || '';
      const isUnique = getStr(row[1]) === '1';
      const isPrimary = getStr(row[2]) === '1';
      const colName = getStr(row[3]) || '';
      const indexType = getStr(row[4]) || 'BTREE';

      if (!indexMap.has(name)) {
        indexMap.set(name, {
          name,
          columns: colName ? [colName] : [],
          isUnique,
          isPrimary,
          indexType,
        });
      } else if (colName) {
        indexMap.get(name)!.columns.push(colName);
      }
    }
    return Array.from(indexMap.values());
  }

  // PostgreSQL
  return result.rows.map((row) => {
    const name = getStr(row[0]) || '';
    const isUnique = getStr(row[1]) === '1' || getStr(row[1]) === 'true';
    const isPrimary = getStr(row[2]) === '1' || getStr(row[2]) === 'true';
    const colsStr = getStr(row[3]) || '';
    const columns = colsStr
      ? colsStr.split(',').map((c) => c.trim())
      : [];
    const indexType = getStr(row[4]) || 'btree';

    return {
      name,
      columns,
      isUnique,
      isPrimary,
      indexType,
    };
  });
}
