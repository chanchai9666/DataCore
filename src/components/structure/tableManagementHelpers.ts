import type { QueryResult, CellValue } from '../../types/db';
import { formatCellValue } from '../../types/db';
import type {
  TableIndexStructure,
  TableForeignKeyStructure,
  TableConstraintStructure,
} from '../../api/queryBuilder';

export * from '../../api/queryBuilder';

/**
 * Returns SQL to fetch foreign keys for a given table.
 */
export function getFetchForeignKeysSql(
  driver: string,
  tableName: string,
  schemaName?: string
): string {
  const escapedTable = tableName.replace(/'/g, "''");
  const escapedSchema = (schemaName || 'public').replace(/'/g, "''");
  const d = (driver || '').toLowerCase();

  if (d.includes('sqlite')) {
    return `PRAGMA foreign_key_list('${escapedTable}');`;
  }

  if (d.includes('mysql')) {
    return `SELECT 
  k.CONSTRAINT_NAME as constraint_name,
  k.COLUMN_NAME as column_name,
  k.REFERENCED_TABLE_NAME as foreign_table_name,
  k.REFERENCED_COLUMN_NAME as foreign_column_name,
  COALESCE(r.UPDATE_RULE, 'NO ACTION') as on_update,
  COALESCE(r.DELETE_RULE, 'NO ACTION') as on_delete
FROM information_schema.KEY_COLUMN_USAGE k
LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS r
  ON k.CONSTRAINT_NAME = r.CONSTRAINT_NAME AND k.CONSTRAINT_SCHEMA = r.CONSTRAINT_SCHEMA
WHERE k.TABLE_NAME = '${escapedTable}' ${schemaName ? `AND k.TABLE_SCHEMA = '${escapedSchema}'` : 'AND k.TABLE_SCHEMA = DATABASE()'}
  AND k.REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY k.CONSTRAINT_NAME, k.ORDINAL_POSITION;`;
  }

  // PostgreSQL
  return `SELECT 
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.update_rule AS on_update,
  rc.delete_rule AS on_delete
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = '${escapedTable}' AND tc.table_schema = '${escapedSchema}'
ORDER BY tc.constraint_name, kcu.ordinal_position;`;
}

/**
 * Parses query result into a typed TableForeignKeyStructure list.
 */
export function parseForeignKeysFromQueryResult(
  result: QueryResult,
  driver: string
): TableForeignKeyStructure[] {
  if (!result || !result.rows || result.rows.length === 0) {
    return [];
  }

  const getStr = (val: CellValue): string | null => {
    const s = formatCellValue(val);
    return s === 'NULL' ? null : s;
  };

  const d = (driver || '').toLowerCase();

  if (d.includes('sqlite')) {
    // PRAGMA foreign_key_list returns:
    // [id, seq, table, from, to, on_update, on_delete, match]
    const fkMap = new Map<string, TableForeignKeyStructure>();
    for (const row of result.rows) {
      const id = getStr(row[0]) || '0';
      const foreignTable = getStr(row[2]) || '';
      const fromCol = getStr(row[3]) || '';
      const toCol = getStr(row[4]) || '';
      const onUpdate = getStr(row[5]) || 'NO ACTION';
      const onDelete = getStr(row[6]) || 'NO ACTION';

      const key = `fk_${id}_${foreignTable}`;
      if (!fkMap.has(key)) {
        fkMap.set(key, {
          name: key,
          columnNames: [fromCol],
          foreignTableName: foreignTable,
          foreignColumnNames: [toCol],
          onUpdate,
          onDelete,
        });
      } else {
        const item = fkMap.get(key)!;
        item.columnNames.push(fromCol);
        item.foreignColumnNames.push(toCol);
      }
    }
    return Array.from(fkMap.values());
  }

  // PostgreSQL & MySQL
  const fkMap = new Map<string, TableForeignKeyStructure>();
  for (const row of result.rows) {
    const name = getStr(row[0]) || '';
    const colName = getStr(row[1]) || '';
    const foreignTable = getStr(row[2]) || '';
    const foreignCol = getStr(row[3]) || '';
    const onUpdate = getStr(row[4]) || 'NO ACTION';
    const onDelete = getStr(row[5]) || 'NO ACTION';

    if (!fkMap.has(name)) {
      fkMap.set(name, {
        name,
        columnNames: colName ? [colName] : [],
        foreignTableName: foreignTable,
        foreignColumnNames: foreignCol ? [foreignCol] : [],
        onUpdate,
        onDelete,
      });
    } else {
      const item = fkMap.get(name)!;
      if (colName && !item.columnNames.includes(colName)) {
        item.columnNames.push(colName);
      }
      if (foreignCol && !item.foreignColumnNames.includes(foreignCol)) {
        item.foreignColumnNames.push(foreignCol);
      }
    }
  }

  return Array.from(fkMap.values());
}

/**
 * Returns SQL to fetch constraints for a given table.
 */
export function getFetchConstraintsSql(
  driver: string,
  tableName: string,
  schemaName?: string
): string {
  const escapedTable = tableName.replace(/'/g, "''");
  const escapedSchema = (schemaName || 'public').replace(/'/g, "''");
  const d = (driver || '').toLowerCase();

  if (d.includes('sqlite')) {
    return `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = '${escapedTable}';`;
  }

  if (d.includes('mysql')) {
    return `SELECT 
  tc.CONSTRAINT_NAME as constraint_name,
  tc.CONSTRAINT_TYPE as constraint_type,
  cc.CHECK_CLAUSE as check_clause
FROM information_schema.TABLE_CONSTRAINTS tc
LEFT JOIN information_schema.CHECK_CONSTRAINTS cc
  ON tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME AND tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA
WHERE tc.TABLE_NAME = '${escapedTable}' ${schemaName ? `AND tc.TABLE_SCHEMA = '${escapedSchema}'` : 'AND tc.TABLE_SCHEMA = DATABASE()'}
  AND tc.CONSTRAINT_TYPE IN ('CHECK', 'UNIQUE')
ORDER BY tc.CONSTRAINT_NAME;`;
  }

  // PostgreSQL
  return `SELECT 
  tc.constraint_name,
  tc.constraint_type,
  cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name AND tc.table_schema = cc.constraint_schema
WHERE tc.table_name = '${escapedTable}' AND tc.table_schema = '${escapedSchema}'
  AND tc.constraint_type IN ('CHECK', 'UNIQUE')
ORDER BY tc.constraint_name;`;
}

/**
 * Parses query result into TableConstraintStructure list.
 */
export function parseConstraintsFromQueryResult(
  result: QueryResult,
  driver: string
): TableConstraintStructure[] {
  if (!result || !result.rows || result.rows.length === 0) {
    return [];
  }

  const getStr = (val: CellValue): string | null => {
    const s = formatCellValue(val);
    return s === 'NULL' ? null : s;
  };

  const d = (driver || '').toLowerCase();

  if (d.includes('sqlite')) {
    const ddl = getStr(result.rows[0]?.[0]) || '';
    const constraints: TableConstraintStructure[] = [];

    // Parse CHECK constraints: CONSTRAINT <name> CHECK (<expr>) or CHECK (<expr>)
    const checkRegex = /(?:CONSTRAINT\s+["`]?(\w+)["`]?\s+)?CHECK\s*\(([^)]+)\)/gi;
    let match: RegExpExecArray | null;
    let count = 1;
    while ((match = checkRegex.exec(ddl)) !== null) {
      constraints.push({
        name: match[1] || `check_${count++}`,
        type: 'CHECK',
        definition: match[2]?.trim(),
      });
    }

    return constraints;
  }

  // PostgreSQL & MySQL
  return result.rows.map((row) => {
    const name = getStr(row[0]) || '';
    const rawType = (getStr(row[1]) || '').toUpperCase();
    const checkClause = getStr(row[2]) || undefined;

    const type: 'CHECK' | 'UNIQUE' = rawType.includes('CHECK') ? 'CHECK' : 'UNIQUE';

    return {
      name,
      type,
      definition: checkClause,
    };
  });
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
