import type { QueryResult, CellValue } from '../../types/db';
import { formatCellValue } from '../../types/db';
import type { TableIndexStructure } from '../../api/queryBuilder';

export * from '../../api/queryBuilder';

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
