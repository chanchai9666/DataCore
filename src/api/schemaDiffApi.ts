import type {
  SchemaDiffTarget,
  SchemaDiffResult,
  TableDiff,
  ColumnDiff,
  ColumnDiffStatus,
  TableDiffStatus,
  MigrationScript,
  IndexDiff,
  ForeignKeyDiff,
  PrimaryKeyDiff,
  SkippedItem,
  SchemaTableMetadata,
} from '../types/schemaDiff';
import type { ERTable, ERColumn, CellValue } from '../types/db';
import { dbApi } from './db';
import { formatCellValue } from '../utils/cellFormatter';
import { formatSqlLiteral } from './queryBuilder';
import { parseSQLiteColumns } from './erDiagramApi';
import { splitSqlStatements } from './sqlSplitter';

/**
 * Maps a column data type from a source database type to a target driver dialect.
 */
export function mapColumnTypeToTarget(
  sourceType: string,
  targetDriver: string
): string {
  const d = (targetDriver || '').toLowerCase();
  const raw = (sourceType || 'TEXT').trim();
  const upper = raw.toUpperCase();

  if (d.includes('sqlite')) {
    if (upper.includes('INT') || upper.includes('SERIAL')) {
      return 'INTEGER';
    }
    if (
      upper.includes('FLOAT') ||
      upper.includes('DOUBLE') ||
      upper.includes('REAL') ||
      upper.includes('DECIMAL') ||
      upper.includes('NUMERIC')
    ) {
      return 'REAL';
    }
    if (
      upper.includes('BLOB') ||
      upper.includes('BYTEA') ||
      upper.includes('BINARY')
    ) {
      return 'BLOB';
    }
    if (upper.includes('BOOL')) {
      return 'INTEGER';
    }
    // uuid, json, jsonb, character varying, timestamp, etc. map to TEXT in SQLite
    return 'TEXT';
  }

  if (d.includes('mysql')) {
    if (upper.includes('UUID')) {
      return 'VARCHAR(36)';
    }
    if (upper.includes('SERIAL')) {
      return 'BIGINT AUTO_INCREMENT';
    }
    if (upper.includes('BOOL') || upper === 'TINYINT(1)') {
      return 'TINYINT(1)';
    }
    if (upper.includes('BIGINT')) {
      return 'BIGINT';
    }
    if (upper.includes('INT')) {
      return 'INT';
    }
    if (upper.includes('DOUBLE') || upper.includes('REAL')) {
      return 'DOUBLE';
    }
    if (upper.includes('FLOAT')) {
      return 'FLOAT';
    }
    if (upper.includes('DECIMAL') || upper.includes('NUMERIC')) {
      return 'DECIMAL(12,2)';
    }
    if (upper.includes('BLOB') || upper.includes('BYTEA')) {
      return 'LONGBLOB';
    }
    if (upper.includes('TIME') || upper.includes('DATE')) {
      return 'DATETIME';
    }
    if (upper.includes('JSON')) {
      return 'JSON';
    }
    if (upper.includes('CHARACTER VARYING') && !upper.includes('(')) {
      return 'VARCHAR(255)';
    }
    if (upper.includes('VARCHAR') && !upper.includes('(')) {
      return 'VARCHAR(255)';
    }
    if (upper.includes('VARCHAR') || upper.includes('CHAR')) {
      return raw;
    }
    return 'TEXT';
  }

  if (d.includes('postgres')) {
    if (upper.includes('AUTO_INCREMENT') || upper.includes('SERIAL')) {
      return 'BIGSERIAL';
    }
    if (upper.includes('BOOL') || upper === 'TINYINT(1)') {
      return 'BOOLEAN';
    }
    if (upper.includes('BIGINT')) {
      return 'BIGINT';
    }
    if (upper.includes('INT')) {
      return 'INTEGER';
    }
    if (upper.includes('DOUBLE') || upper.includes('REAL')) {
      return 'DOUBLE PRECISION';
    }
    if (upper.includes('FLOAT')) {
      return 'REAL';
    }
    if (upper.includes('DECIMAL') || upper.includes('NUMERIC')) {
      return 'NUMERIC(12,2)';
    }
    if (upper.includes('BLOB') || upper.includes('BYTEA')) {
      return 'BYTEA';
    }
    if (upper.includes('TIME') || upper.includes('DATE')) {
      return 'TIMESTAMPTZ';
    }
    if (upper.includes('JSON')) {
      return 'JSONB';
    }
    return raw;
  }

  return raw;
}

/**
 * Filters out pure comments or blank statements from SQL scripts
 * so that only runnable executable statements remain.
 */
export function extractRunnableStatements(sql: string, dialect?: string): string[] {
  const allStmts = splitSqlStatements(sql, dialect);
  return allStmts.filter((stmt) => {
    // Remove single line comments (-- ...) and block comments (/* ... */)
    const stripped = stmt
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();
    return stripped.length > 0;
  });
}

/**
 * Parses PostgreSQL bulk columns query result and deduplicates columns per table.
 */
export function parsePostgresBulkColumns(rows: CellValue[][]): Map<string, ERColumn[]> {
  const result = new Map<string, ERColumn[]>();
  const seenColumns = new Map<string, Set<string>>();

  const getStr = (val: CellValue) => {
    const s = formatCellValue(val);
    return s === 'NULL' ? '' : s;
  };

  for (const row of rows) {
    if (!row || row.length < 5) continue;
    const tableName = getStr(row[0]);
    const colName = getStr(row[1]);
    const dataType = getStr(row[2]) || 'TEXT';
    const isNullable = getStr(row[3]).toUpperCase() === 'YES';
    const isPk = getStr(row[4]) === '1' || Number(getStr(row[4])) > 0;

    if (!tableName || !colName) continue;

    if (!result.has(tableName)) {
      result.set(tableName, []);
      seenColumns.set(tableName, new Set());
    }

    const seen = seenColumns.get(tableName)!;
    const colKey = colName.toLowerCase();
    if (seen.has(colKey)) {
      if (isPk) {
        const existing = result.get(tableName)!.find((c) => c.name.toLowerCase() === colKey);
        if (existing) existing.isPrimaryKey = true;
      }
      continue;
    }

    seen.add(colKey);
    result.get(tableName)!.push({
      name: colName,
      dataType,
      isPrimaryKey: isPk,
      isNullable,
    });
  }

  return result;
}

/**
 * Parses MySQL bulk columns query result and deduplicates columns per table.
 */
export function parseMySQLBulkColumns(rows: CellValue[][]): Map<string, ERColumn[]> {
  const result = new Map<string, ERColumn[]>();
  const seenColumns = new Map<string, Set<string>>();

  const getStr = (val: CellValue) => {
    const s = formatCellValue(val);
    return s === 'NULL' ? '' : s;
  };

  for (const row of rows) {
    if (!row || row.length < 5) continue;
    const tableName = getStr(row[0]);
    const colName = getStr(row[1]);
    const dataType = getStr(row[2]) || 'TEXT';
    const isNullable = getStr(row[3]).toUpperCase() === 'YES';
    const isPk = getStr(row[4]).toUpperCase() === 'PRI';

    if (!tableName || !colName) continue;

    if (!result.has(tableName)) {
      result.set(tableName, []);
      seenColumns.set(tableName, new Set());
    }

    const seen = seenColumns.get(tableName)!;
    const colKey = colName.toLowerCase();
    if (seen.has(colKey)) continue;

    seen.add(colKey);
    result.get(tableName)!.push({
      name: colName,
      dataType,
      isPrimaryKey: isPk,
      isNullable,
    });
  }

  return result;
}

/**
 * High-performance bulk schema extractor specifically optimized for schema diffing.
 * Extracts tables, columns, indexes, foreign keys, and primary keys.
 */
export async function fetchSchemaForDiff(
  connectionId: string,
  driver: string,
  schemaName?: string
): Promise<SchemaDiffTarget> {
  const d = (driver || '').toLowerCase();
  const getStr = (val: CellValue) => {
    const s = formatCellValue(val);
    return s === 'NULL' ? '' : s;
  };

  if (d.includes('sqlite')) {
    const [tableRes, indexRes] = await Promise.all([
      dbApi.executeDirectQuery(
        connectionId,
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
      ),
      dbApi.executeDirectQuery(
        connectionId,
        "SELECT name, sql, tbl_name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name;"
      ).catch(() => ({ columns: [], rows: [], execution_time_ms: 0 })),
    ]);

    const tableNames: string[] = tableRes.rows.map((r: CellValue[]) => formatCellValue(r[0]));

    // Group indexes by table name
    const indexesByTable = new Map<string, { name: string; columns: string[]; isUnique: boolean }[]>();
    for (const row of indexRes.rows) {
      const idxName = getStr(row[0]);
      const sql = getStr(row[1]);
      const tblName = getStr(row[2]);
      if (!idxName || !tblName) continue;
      const isUnique = /create\s+unique\s+index/i.test(sql);
      const match = sql.match(/\(([^)]+)\)/);
      const columns = match
        ? match[1].split(',').map((c) => c.trim().replace(/^["`[]|["`\]]$/g, ''))
        : [];
      if (!indexesByTable.has(tblName)) indexesByTable.set(tblName, []);
      indexesByTable.get(tblName)!.push({ name: idxName, columns, isUnique });
    }

    // Fetch table_info and foreign keys in parallel
    const tablePromises = tableNames.map(async (tName) => {
      const [colRes, fkRes] = await Promise.all([
        dbApi.executeDirectQuery(
          connectionId,
          `PRAGMA table_info(${formatSqlLiteral(tName, 'sqlite')});`
        ),
        dbApi.executeDirectQuery(
          connectionId,
          `PRAGMA foreign_key_list(${formatSqlLiteral(tName, 'sqlite')});`
        ).catch(() => ({ columns: [], rows: [], execution_time_ms: 0 })),
      ]);

      const cols = parseSQLiteColumns(colRes);

      // Parse SQLite foreign keys
      const foreignKeys: { name: string; columnNames: string[]; foreignTableName: string; foreignColumnNames: string[] }[] = [];
      const fkGroups = new Map<string, { foreignTable: string; fromCols: string[]; toCols: string[] }>();
      for (const row of fkRes.rows) {
        const id = getStr(row[0]);
        const foreignTable = getStr(row[2]);
        const fromCol = getStr(row[3]);
        const toCol = getStr(row[4]) || 'id';
        if (!fkGroups.has(id)) {
          fkGroups.set(id, { foreignTable, fromCols: [], toCols: [] });
        }
        const g = fkGroups.get(id)!;
        if (fromCol) g.fromCols.push(fromCol);
        if (toCol) g.toCols.push(toCol);
      }
      for (const [id, g] of fkGroups) {
        foreignKeys.push({
          name: `fk_${tName}_${id}`,
          columnNames: g.fromCols,
          foreignTableName: g.foreignTable,
          foreignColumnNames: g.toCols,
        });
      }

      const tableMeta: SchemaTableMetadata = {
        tableName: tName,
        columns: cols.map((c) => ({
          name: c.name,
          dataType: c.dataType,
          isNullable: c.isNullable,
          isPrimaryKey: c.isPrimaryKey,
        })),
        indexes: indexesByTable.get(tName) || [],
        foreignKeys,
      };

      const erTable: ERTable = {
        id: tName,
        name: tName,
        schema: undefined,
        columns: cols,
        x: 0,
        y: 0,
        isCollapsed: false,
      };

      return { erTable, tableMeta };
    });

    const results = await Promise.all(tablePromises);
    const tables = results.map((r) => r.erTable);
    const metadata = results.map((r) => r.tableMeta);

    return {
      connectionId,
      schemaName,
      driver,
      tables,
      metadata,
    };
  }

  if (d.includes('mysql')) {
    const schemaSql = schemaName ? formatSqlLiteral(schemaName, 'mysql') : 'DATABASE()';
    const [tableRes, colRes, indexRes, fkRes] = await Promise.all([
      dbApi.executeDirectQuery(
        connectionId,
        `SELECT table_name FROM information_schema.tables WHERE table_schema = ${schemaSql} AND table_type = 'BASE TABLE' ORDER BY table_name;`
      ),
      dbApi.executeDirectQuery(
        connectionId,
        `SELECT table_name, column_name, data_type, is_nullable, column_key FROM information_schema.columns WHERE table_schema = ${schemaSql} ORDER BY table_name, ordinal_position;`
      ),
      dbApi.executeDirectQuery(
        connectionId,
        `SELECT TABLE_NAME, INDEX_NAME, CASE WHEN NON_UNIQUE = 0 THEN 1 ELSE 0 END AS is_unique, COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ${schemaSql} AND INDEX_NAME != 'PRIMARY' ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;`
      ).catch(() => ({ columns: [], rows: [], execution_time_ms: 0 })),
      dbApi.executeDirectQuery(
        connectionId,
        `SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ${schemaSql} AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION;`
      ).catch(() => ({ columns: [], rows: [], execution_time_ms: 0 })),
    ]);

    const tableNames: string[] = tableRes.rows.map((r: CellValue[]) => formatCellValue(r[0]));
    const colMap = parseMySQLBulkColumns(colRes.rows);

    const indexesByTable = new Map<string, Map<string, { name: string; columns: string[]; isUnique: boolean }>>();
    for (const row of indexRes.rows) {
      const tbl = getStr(row[0]);
      const idx = getStr(row[1]);
      const isUnique = getStr(row[2]) === '1';
      const col = getStr(row[3]);
      if (!indexesByTable.has(tbl)) indexesByTable.set(tbl, new Map());
      const tblMap = indexesByTable.get(tbl)!;
      if (!tblMap.has(idx)) {
        tblMap.set(idx, { name: idx, columns: [], isUnique });
      }
      if (col) tblMap.get(idx)!.columns.push(col);
    }

    const fksByTable = new Map<string, Map<string, { name: string; columnNames: string[]; foreignTableName: string; foreignColumnNames: string[] }>>();
    for (const row of fkRes.rows) {
      const tbl = getStr(row[0]);
      const cName = getStr(row[1]);
      const col = getStr(row[2]);
      const refTbl = getStr(row[3]);
      const refCol = getStr(row[4]);
      if (!fksByTable.has(tbl)) fksByTable.set(tbl, new Map());
      const tblFks = fksByTable.get(tbl)!;
      if (!tblFks.has(cName)) {
        tblFks.set(cName, { name: cName, columnNames: [], foreignTableName: refTbl, foreignColumnNames: [] });
      }
      const g = tblFks.get(cName)!;
      if (col) g.columnNames.push(col);
      if (refCol) g.foreignColumnNames.push(refCol);
    }

    const tables: ERTable[] = [];
    const metadata: SchemaTableMetadata[] = [];

    for (const tName of tableNames) {
      const cols = colMap.get(tName) || [];
      tables.push({
        id: tName,
        name: tName,
        schema: schemaName,
        columns: cols,
        x: 0,
        y: 0,
        isCollapsed: false,
      });

      const idxList = indexesByTable.has(tName) ? Array.from(indexesByTable.get(tName)!.values()) : [];
      const fkList = fksByTable.has(tName) ? Array.from(fksByTable.get(tName)!.values()) : [];

      metadata.push({
        tableName: tName,
        columns: cols.map((c) => ({
          name: c.name,
          dataType: c.dataType,
          isNullable: c.isNullable,
          isPrimaryKey: c.isPrimaryKey,
        })),
        indexes: idxList,
        foreignKeys: fkList,
      });
    }

    return {
      connectionId,
      schemaName,
      driver,
      tables,
      metadata,
    };
  }

  // PostgreSQL
  const s = schemaName || 'public';
  const [tableRes, colRes, indexRes, fkRes] = await Promise.all([
    dbApi.executeDirectQuery(
      connectionId,
      `SELECT table_name FROM information_schema.tables WHERE table_schema = ${formatSqlLiteral(s, 'postgres')} AND table_type = 'BASE TABLE' ORDER BY table_name;`
    ),
    dbApi.executeDirectQuery(
      connectionId,
      `SELECT 
        c.table_name, 
        c.column_name, 
        c.data_type, 
        c.is_nullable, 
        CASE WHEN pk.column_name IS NOT NULL THEN 1 ELSE 0 END AS is_pk 
      FROM information_schema.columns c 
      LEFT JOIN (
        SELECT kcu.table_schema, kcu.table_name, kcu.column_name 
        FROM information_schema.table_constraints tc 
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name 
          AND tc.table_schema = kcu.table_schema 
        WHERE tc.constraint_type = 'PRIMARY KEY'
      ) pk ON c.table_schema = pk.table_schema 
          AND c.table_name = pk.table_name 
          AND c.column_name = pk.column_name 
      WHERE c.table_schema = ${formatSqlLiteral(s, 'postgres')} 
      ORDER BY c.table_name, c.ordinal_position;`
    ),
    dbApi.executeDirectQuery(
      connectionId,
      `SELECT 
        t.relname AS table_name,
        i.relname AS index_name,
        CASE WHEN ix.indisunique THEN 1 ELSE 0 END AS is_unique,
        CASE WHEN ix.indisprimary THEN 1 ELSE 0 END AS is_primary,
        ARRAY_TO_STRING(ARRAY_AGG(a.attname ORDER BY array_position(ix.indkey, a.attnum)), ', ') AS column_names
      FROM pg_class t
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      WHERE n.nspname = ${formatSqlLiteral(s, 'postgres')} AND t.relkind = 'r' AND NOT ix.indisprimary
      GROUP BY t.relname, i.relname, ix.indisunique, ix.indisprimary
      ORDER BY t.relname, i.relname;`
    ).catch(() => ({ columns: [], rows: [], execution_time_ms: 0 })),
    dbApi.executeDirectQuery(
      connectionId,
      `SELECT
        tc.table_name,
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = ${formatSqlLiteral(s, 'postgres')};`
    ).catch(() => ({ columns: [], rows: [], execution_time_ms: 0 })),
  ]);

  const tableNames: string[] = tableRes.rows.map((r: CellValue[]) => formatCellValue(r[0]));
  const colMap = parsePostgresBulkColumns(colRes.rows);

  const indexesByTable = new Map<string, { name: string; columns: string[]; isUnique: boolean }[]>();
  for (const row of indexRes.rows) {
    const tbl = getStr(row[0]);
    const idx = getStr(row[1]);
    const isUnique = getStr(row[2]) === '1';
    const colsStr = getStr(row[4]);
    const cols = colsStr ? colsStr.split(',').map((c) => c.trim()) : [];
    if (!indexesByTable.has(tbl)) indexesByTable.set(tbl, []);
    indexesByTable.get(tbl)!.push({ name: idx, columns: cols, isUnique });
  }

  const fksByTable = new Map<string, Map<string, { name: string; columnNames: string[]; foreignTableName: string; foreignColumnNames: string[] }>>();
  for (const row of fkRes.rows) {
    const tbl = getStr(row[0]);
    const cName = getStr(row[1]);
    const col = getStr(row[2]);
    const refTbl = getStr(row[3]);
    const refCol = getStr(row[4]);
    if (!fksByTable.has(tbl)) fksByTable.set(tbl, new Map());
    const tblFks = fksByTable.get(tbl)!;
    if (!tblFks.has(cName)) {
      tblFks.set(cName, { name: cName, columnNames: [], foreignTableName: refTbl, foreignColumnNames: [] });
    }
    const g = tblFks.get(cName)!;
    if (col && !g.columnNames.includes(col)) g.columnNames.push(col);
    if (refCol && !g.foreignColumnNames.includes(refCol)) g.foreignColumnNames.push(refCol);
  }

  const tables: ERTable[] = [];
  const metadata: SchemaTableMetadata[] = [];

  for (const tName of tableNames) {
    const cols = colMap.get(tName) || [];
    tables.push({
      id: tName,
      name: tName,
      schema: schemaName,
      columns: cols,
      x: 0,
      y: 0,
      isCollapsed: false,
    });

    const idxList = indexesByTable.get(tName) || [];
    const fkList = fksByTable.has(tName) ? Array.from(fksByTable.get(tName)!.values()) : [];

    metadata.push({
      tableName: tName,
      columns: cols.map((c) => ({
        name: c.name,
        dataType: c.dataType,
        isNullable: c.isNullable,
        isPrimaryKey: c.isPrimaryKey,
      })),
      indexes: idxList,
      foreignKeys: fkList,
    });
  }

  return {
    connectionId,
    schemaName,
    driver,
    tables,
    metadata,
  };
}

export function compareSchemas(
  source: SchemaDiffTarget,
  target: SchemaDiffTarget
): SchemaDiffResult {
  const sourceTableMap = new Map<string, ERTable>(
    source.tables.map((t) => [t.name.toLowerCase(), t])
  );
  const targetTableMap = new Map<string, ERTable>(
    target.tables.map((t) => [t.name.toLowerCase(), t])
  );

  const sourceMetaMap = new Map<string, SchemaTableMetadata>(
    (source.metadata || []).map((m) => [m.tableName.toLowerCase(), m])
  );
  const targetMetaMap = new Map<string, SchemaTableMetadata>(
    (target.metadata || []).map((m) => [m.tableName.toLowerCase(), m])
  );

  const targetDriver = (target.driver || '').toLowerCase();
  const isTargetSqlite = targetDriver.includes('sqlite');

  const allTableNames = Array.from(
    new Set([...sourceTableMap.keys(), ...targetTableMap.keys()])
  ).sort();

  const tables: TableDiff[] = [];
  let identicalCount = 0;
  let differentCount = 0;
  let onlyInSourceCount = 0;
  let onlyInTargetCount = 0;
  let totalSkippedCount = 0;

  for (const tKey of allTableNames) {
    const sTable = sourceTableMap.get(tKey);
    const tTable = targetTableMap.get(tKey);
    const sMeta = sourceMetaMap.get(tKey);
    const tMeta = targetMetaMap.get(tKey);

    if (sTable && !tTable) {
      onlyInSourceCount++;
      tables.push({
        tableName: sTable.name,
        status: 'only_in_source',
        columnDiffs: sTable.columns.map((c) => ({
          name: c.name,
          status: 'added',
          sourceType: c.dataType,
          sourceNullable: c.isNullable,
          sourcePk: c.isPrimaryKey,
        })),
      });
      continue;
    }

    if (!sTable && tTable) {
      onlyInTargetCount++;
      tables.push({
        tableName: tTable.name,
        status: 'only_in_target',
        columnDiffs: tTable.columns.map((c) => ({
          name: c.name,
          status: 'removed',
          targetType: c.dataType,
          targetNullable: c.isNullable,
          targetPk: c.isPrimaryKey,
        })),
      });
      continue;
    }

    // Both exist: compare columns, primary keys, indexes, and foreign keys
    if (sTable && tTable) {
      const sColMap = new Map(sTable.columns.map((c) => [c.name.toLowerCase(), c]));
      const tColMap = new Map(tTable.columns.map((c) => [c.name.toLowerCase(), c]));
      const allCols = Array.from(
        new Set([...sColMap.keys(), ...tColMap.keys()])
      ).sort();

      const columnDiffs: ColumnDiff[] = [];
      let hasDifference = false;
      const tableSkippedItems: SkippedItem[] = [];

      for (const cKey of allCols) {
        const sCol = sColMap.get(cKey);
        const tCol = tColMap.get(cKey);

        if (sCol && !tCol) {
          hasDifference = true;
          columnDiffs.push({
            name: sCol.name,
            status: 'added',
            sourceType: sCol.dataType,
            sourceNullable: sCol.isNullable,
            sourcePk: sCol.isPrimaryKey,
          });
        } else if (!sCol && tCol) {
          hasDifference = true;
          columnDiffs.push({
            name: tCol.name,
            status: 'removed',
            targetType: tCol.dataType,
            targetNullable: tCol.isNullable,
            targetPk: tCol.isPrimaryKey,
          });
        } else if (sCol && tCol) {
          const sType = sCol.dataType.toUpperCase().replace(/\s+/g, '');
          const tType = tCol.dataType.toUpperCase().replace(/\s+/g, '');
          const typeMatch = sType === tType;
          const nullMatch = sCol.isNullable === tCol.isNullable;

          let status: ColumnDiffStatus = 'identical';
          if (!typeMatch) {
            status = 'type_mismatch';
            hasDifference = true;
            if (isTargetSqlite) {
              tableSkippedItems.push({
                tableName: sTable.name,
                itemType: 'column_type',
                description: `Column "${sCol.name}" type mismatch (${tCol.dataType} -> ${sCol.dataType})`,
                reason: 'SQLite does not support ALTER COLUMN TYPE on existing tables (Table rebuild required).',
              });
            }
          } else if (!nullMatch) {
            status = 'nullability_mismatch';
            hasDifference = true;
            if (isTargetSqlite) {
              tableSkippedItems.push({
                tableName: sTable.name,
                itemType: 'nullability',
                description: `Column "${sCol.name}" nullability mismatch (${tCol.isNullable ? 'NULL' : 'NOT NULL'} -> ${sCol.isNullable ? 'NULL' : 'NOT NULL'})`,
                reason: 'SQLite does not support altering column nullability on existing tables (Table rebuild required).',
              });
            }
          }

          columnDiffs.push({
            name: sCol.name,
            status,
            sourceType: sCol.dataType,
            targetType: tCol.dataType,
            sourceNullable: sCol.isNullable,
            targetNullable: tCol.isNullable,
            sourcePk: sCol.isPrimaryKey,
            targetPk: tCol.isPrimaryKey,
          });
        }
      }

      // Primary Key Diff
      const sPkCols = sTable.columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
      const tPkCols = tTable.columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
      const pkMatch =
        sPkCols.length === tPkCols.length &&
        sPkCols.every((col) => tPkCols.some((tc) => tc.toLowerCase() === col.toLowerCase()));

      let primaryKeyDiff: PrimaryKeyDiff | undefined;
      if (!pkMatch) {
        hasDifference = true;
        const pkStatus: PrimaryKeyDiff['status'] = 'mismatch';

        const canApply = !isTargetSqlite;
        const skipReason = isTargetSqlite
          ? 'SQLite does not support ALTER TABLE ADD PRIMARY KEY on existing tables (Table rebuild required).'
          : undefined;

        primaryKeyDiff = {
          tableName: sTable.name,
          sourceColumns: sPkCols,
          targetColumns: tPkCols,
          status: pkStatus,
          canApplyToTarget: canApply,
          skipReason,
        };

        if (!canApply) {
          tableSkippedItems.push({
            tableName: sTable.name,
            itemType: 'primary_key',
            description: `Primary Key mismatch (Source: [${sPkCols.join(', ')}], Target: [${tPkCols.join(', ')}])`,
            reason: skipReason!,
          });
        }
      }

      // Indexes Diff
      const sIndexes = sMeta?.indexes || [];
      const tIndexes = tMeta?.indexes || [];
      const tIndexMap = new Map(tIndexes.map((i) => [i.name.toLowerCase(), i]));
      const sIndexMap = new Map(sIndexes.map((i) => [i.name.toLowerCase(), i]));

      const indexDiffs: IndexDiff[] = [];
      for (const sIdx of sIndexes) {
        const tIdx = tIndexMap.get(sIdx.name.toLowerCase());
        if (!tIdx) {
          hasDifference = true;
          indexDiffs.push({
            name: sIdx.name,
            tableName: sTable.name,
            columns: sIdx.columns,
            isUnique: sIdx.isUnique,
            status: 'added',
            canApplyToTarget: true, // Both SQLite and Postgres/MySQL support CREATE INDEX!
          });
        }
      }
      for (const tIdx of tIndexes) {
        if (!sIndexMap.has(tIdx.name.toLowerCase())) {
          hasDifference = true;
          indexDiffs.push({
            name: tIdx.name,
            tableName: sTable.name,
            columns: tIdx.columns,
            isUnique: tIdx.isUnique,
            status: 'removed',
            canApplyToTarget: true,
          });
        }
      }

      // Foreign Keys Diff
      const sFks = sMeta?.foreignKeys || [];
      const tFks = tMeta?.foreignKeys || [];
      const tFkMap = new Map(tFks.map((f) => [f.name.toLowerCase(), f]));
      const sFkMap = new Map(sFks.map((f) => [f.name.toLowerCase(), f]));

      const foreignKeyDiffs: ForeignKeyDiff[] = [];
      for (const sFk of sFks) {
        const tFk = tFkMap.get(sFk.name.toLowerCase());
        if (!tFk) {
          hasDifference = true;
          const canApply = !isTargetSqlite;
          const skipReason = isTargetSqlite
            ? 'SQLite does not support ALTER TABLE ADD CONSTRAINT FOREIGN KEY on existing tables (Table rebuild required).'
            : undefined;

          foreignKeyDiffs.push({
            name: sFk.name,
            tableName: sTable.name,
            columnNames: sFk.columnNames,
            foreignTableName: sFk.foreignTableName,
            foreignColumnNames: sFk.foreignColumnNames,
            status: 'added',
            canApplyToTarget: canApply,
            skipReason,
          });

          if (!canApply) {
            tableSkippedItems.push({
              tableName: sTable.name,
              itemType: 'foreign_key',
              description: `Foreign Key "${sFk.name}" ([${sFk.columnNames.join(', ')}] -> ${sFk.foreignTableName})`,
              reason: skipReason!,
            });
          }
        }
      }
      for (const tFk of tFks) {
        if (!sFkMap.has(tFk.name.toLowerCase())) {
          hasDifference = true;
          foreignKeyDiffs.push({
            name: tFk.name,
            tableName: sTable.name,
            columnNames: tFk.columnNames,
            foreignTableName: tFk.foreignTableName,
            foreignColumnNames: tFk.foreignColumnNames,
            status: 'removed',
            canApplyToTarget: !isTargetSqlite,
            skipReason: isTargetSqlite
              ? 'SQLite does not support dropping foreign keys on existing tables.'
              : undefined,
          });
        }
      }

      const tableStatus: TableDiffStatus = hasDifference ? 'different' : 'identical';
      if (hasDifference) {
        differentCount++;
      } else {
        identicalCount++;
      }

      totalSkippedCount += tableSkippedItems.length;

      tables.push({
        tableName: sTable.name,
        status: tableStatus,
        columnDiffs,
        indexDiffs: indexDiffs.length > 0 ? indexDiffs : undefined,
        foreignKeyDiffs: foreignKeyDiffs.length > 0 ? foreignKeyDiffs : undefined,
        primaryKeyDiff,
        skippedItems: tableSkippedItems.length > 0 ? tableSkippedItems : undefined,
      });
    }
  }

  return {
    source: {
      connectionId: source.connectionId,
      schemaName: source.schemaName,
      driver: source.driver,
    },
    target: {
      connectionId: target.connectionId,
      schemaName: target.schemaName,
      driver: target.driver,
    },
    tables,
    summary: {
      identicalCount,
      differentCount,
      onlyInSourceCount,
      onlyInTargetCount,
      skippedCount: totalSkippedCount,
    },
  };
}

export interface GenerateMigrationOptions {
  allowDestructiveDrop?: boolean;
}

export function generateMigrationSql(
  diff: SchemaDiffResult,
  driver: string = 'postgres',
  options?: GenerateMigrationOptions
): MigrationScript {
  const upLines: string[] = [];
  const downLines: string[] = [];

  const d = driver.toLowerCase();
  const isMySql = d.includes('mysql');
  const isSqlite = d.includes('sqlite');
  const allowDestructiveDrop = options?.allowDestructiveDrop ?? false;
  const quote = (name: string) => (isMySql ? `\`${name}\`` : `"${name}"`);

  const allSkippedItems: SkippedItem[] = [];

  // 1. Process table additions and modifications
  for (const table of diff.tables) {
    if (table.skippedItems && table.skippedItems.length > 0) {
      for (const item of table.skippedItems) {
        if (!allSkippedItems.some((s) => s.tableName === item.tableName && s.description === item.description)) {
          allSkippedItems.push(item);
        }
      }
    }

    if (table.status === 'only_in_source') {
      // Deduplicate column definitions by name
      const seenColNames = new Set<string>();
      const colDefs: string[] = [];

      for (const c of table.columnDiffs) {
        const colKey = c.name.toLowerCase();
        if (seenColNames.has(colKey)) continue;
        seenColNames.add(colKey);

        const mappedType = mapColumnTypeToTarget(c.sourceType || 'TEXT', driver);
        const nullability = c.sourceNullable ? '' : ' NOT NULL';
        const pk = c.sourcePk ? ' PRIMARY KEY' : '';
        colDefs.push(`  ${quote(c.name)} ${mappedType}${nullability}${pk}`);
      }

      upLines.push(`CREATE TABLE ${quote(table.tableName)} (\n${colDefs.join(',\n')}\n);`);
      downLines.push(`DROP TABLE IF EXISTS ${quote(table.tableName)};`);

      // Add indexes for new table if any
      if (table.indexDiffs) {
        for (const idx of table.indexDiffs) {
          if (idx.status === 'added') {
            const uniqueStr = idx.isUnique ? 'UNIQUE ' : '';
            upLines.push(
              `CREATE ${uniqueStr}INDEX IF NOT EXISTS ${quote(idx.name)} ON ${quote(table.tableName)} (${idx.columns.map(quote).join(', ')});`
            );
          }
        }
      }
    } else if (table.status === 'only_in_target') {
      if (allowDestructiveDrop) {
        upLines.push(`DROP TABLE IF EXISTS ${quote(table.tableName)};`);
      } else {
        upLines.push(
          `-- [SAFEGUARD] Table only exists in target. Destructive DROP disabled by default:\n-- DROP TABLE IF EXISTS ${quote(table.tableName)};`
        );
      }

      const seenColNames = new Set<string>();
      const colDefs: string[] = [];
      for (const c of table.columnDiffs) {
        const colKey = c.name.toLowerCase();
        if (seenColNames.has(colKey)) continue;
        seenColNames.add(colKey);

        const mappedType = mapColumnTypeToTarget(c.targetType || 'TEXT', diff.source.driver || 'postgres');
        const nullability = c.targetNullable ? '' : ' NOT NULL';
        const pk = c.targetPk ? ' PRIMARY KEY' : '';
        colDefs.push(`  ${quote(c.name)} ${mappedType}${nullability}${pk}`);
      }

      downLines.push(`CREATE TABLE ${quote(table.tableName)} (\n${colDefs.join(',\n')}\n);`);
    } else if (table.status === 'different') {
      // 1. Column additions and removals
      for (const col of table.columnDiffs) {
        if (col.status === 'added') {
          const mappedType = mapColumnTypeToTarget(col.sourceType || 'TEXT', driver);
          const nullability = col.sourceNullable ? '' : ' NOT NULL';
          upLines.push(
            `ALTER TABLE ${quote(table.tableName)} ADD COLUMN ${quote(col.name)} ${mappedType}${nullability};`
          );
          downLines.push(
            `ALTER TABLE ${quote(table.tableName)} DROP COLUMN ${quote(col.name)};`
          );
        } else if (col.status === 'removed') {
          if (allowDestructiveDrop) {
            upLines.push(
              `ALTER TABLE ${quote(table.tableName)} DROP COLUMN ${quote(col.name)};`
            );
          } else {
            upLines.push(
              `-- [SAFEGUARD] Column removed in source. Destructive DROP COLUMN disabled by default:\n-- ALTER TABLE ${quote(table.tableName)} DROP COLUMN ${quote(col.name)};`
            );
          }
          const mappedTargetType = mapColumnTypeToTarget(col.targetType || 'TEXT', diff.source.driver || 'postgres');
          const nullability = col.targetNullable ? '' : ' NOT NULL';
          downLines.push(
            `ALTER TABLE ${quote(table.tableName)} ADD COLUMN ${quote(col.name)} ${mappedTargetType}${nullability};`
          );
        } else if (col.status === 'type_mismatch') {
          if (isSqlite) {
            allSkippedItems.push({
              tableName: table.tableName,
              itemType: 'column_type',
              description: `[SQLITE REBUILD REQUIRED] Column "${col.name}" type mismatch (${col.targetType} -> ${col.sourceType})`,
              reason: 'SQLite does not support ALTER COLUMN TYPE on existing tables (Table rebuild required).',
            });
          } else {
            const mappedUpType = mapColumnTypeToTarget(col.sourceType || 'TEXT', driver);
            const mappedDownType = mapColumnTypeToTarget(col.targetType || 'TEXT', diff.source.driver || 'postgres');
            if (isMySql) {
              upLines.push(
                `ALTER TABLE ${quote(table.tableName)} MODIFY COLUMN ${quote(col.name)} ${mappedUpType};`
              );
              downLines.push(
                `ALTER TABLE ${quote(table.tableName)} MODIFY COLUMN ${quote(col.name)} ${mappedDownType};`
              );
            } else {
              upLines.push(
                `ALTER TABLE ${quote(table.tableName)} ALTER COLUMN ${quote(col.name)} TYPE ${mappedUpType};`
              );
              downLines.push(
                `ALTER TABLE ${quote(table.tableName)} ALTER COLUMN ${quote(col.name)} TYPE ${mappedDownType};`
              );
            }
          }
        } else if (col.status === 'nullability_mismatch') {
          if (isSqlite) {
            allSkippedItems.push({
              tableName: table.tableName,
              itemType: 'nullability',
              description: `[SQLITE REBUILD REQUIRED] Column "${col.name}" nullability mismatch`,
              reason: 'SQLite does not support altering column nullability on existing tables (Table rebuild required).',
            });
          } else {
            if (isMySql) {
              const mappedType = mapColumnTypeToTarget(col.sourceType || 'TEXT', driver);
              const nullClause = col.sourceNullable ? 'NULL' : 'NOT NULL';
              upLines.push(
                `ALTER TABLE ${quote(table.tableName)} MODIFY COLUMN ${quote(col.name)} ${mappedType} ${nullClause};`
              );
              const mappedDownType = mapColumnTypeToTarget(col.targetType || 'TEXT', diff.source.driver || 'postgres');
              const downNullClause = col.targetNullable ? 'NULL' : 'NOT NULL';
              downLines.push(
                `ALTER TABLE ${quote(table.tableName)} MODIFY COLUMN ${quote(col.name)} ${mappedDownType} ${downNullClause};`
              );
            } else {
              if (col.sourceNullable) {
                upLines.push(
                  `ALTER TABLE ${quote(table.tableName)} ALTER COLUMN ${quote(col.name)} DROP NOT NULL;`
                );
              } else {
                upLines.push(
                  `ALTER TABLE ${quote(table.tableName)} ALTER COLUMN ${quote(col.name)} SET NOT NULL;`
                );
              }
              if (col.targetNullable) {
                downLines.push(
                  `ALTER TABLE ${quote(table.tableName)} ALTER COLUMN ${quote(col.name)} DROP NOT NULL;`
                );
              } else {
                downLines.push(
                  `ALTER TABLE ${quote(table.tableName)} ALTER COLUMN ${quote(col.name)} SET NOT NULL;`
                );
              }
            }
          }
        }
      }

      // 2. Primary Key Changes on Existing Table
      if (table.primaryKeyDiff && table.primaryKeyDiff.canApplyToTarget) {
        if (
          table.primaryKeyDiff.status === 'added' ||
          table.primaryKeyDiff.status === 'mismatch'
        ) {
          const pkCols = table.primaryKeyDiff.sourceColumns.map(quote).join(', ');
          if (pkCols) {
            upLines.push(`ALTER TABLE ${quote(table.tableName)} ADD PRIMARY KEY (${pkCols});`);
          }
        }
      }

      // 3. Foreign Key Changes on Existing Table
      if (table.foreignKeyDiffs) {
        for (const fk of table.foreignKeyDiffs) {
          if (fk.status === 'added' && fk.canApplyToTarget) {
            const cols = fk.columnNames.map(quote).join(', ');
            const refCols = fk.foreignColumnNames.map(quote).join(', ');
            upLines.push(
              `ALTER TABLE ${quote(table.tableName)} ADD CONSTRAINT ${quote(fk.name)} FOREIGN KEY (${cols}) REFERENCES ${quote(fk.foreignTableName)} (${refCols});`
            );
            downLines.push(
              `ALTER TABLE ${quote(table.tableName)} DROP CONSTRAINT IF EXISTS ${quote(fk.name)};`
            );
          }
        }
      }

      // 4. Index Changes on Existing Table (Supported in SQLite, Postgres, and MySQL!)
      if (table.indexDiffs) {
        for (const idx of table.indexDiffs) {
          if (idx.status === 'added') {
            const uniqueStr = idx.isUnique ? 'UNIQUE ' : '';
            const cols = idx.columns.map(quote).join(', ');
            upLines.push(
              `CREATE ${uniqueStr}INDEX IF NOT EXISTS ${quote(idx.name)} ON ${quote(table.tableName)} (${cols});`
            );
            downLines.push(`DROP INDEX IF EXISTS ${quote(idx.name)};`);
          } else if (idx.status === 'removed' && allowDestructiveDrop) {
            upLines.push(`DROP INDEX IF EXISTS ${quote(idx.name)};`);
          }
        }
      }
    }
  }

  // Prepend Skipped Changes Report if any
  let upHeader = '';
  if (allSkippedItems.length > 0) {
    const reportLines = [
      '-- ============================================================================',
      '-- SKIPPED CHANGES REPORT (Driver Limitations)',
      '-- [SQLITE REBUILD REQUIRED] The target database cannot apply the following changes to existing tables:',
      '--',
    ];
    allSkippedItems.forEach((item, idx) => {
      reportLines.push(`-- [SQLITE REBUILD REQUIRED] ${idx + 1}. [${item.tableName}] ${item.description}`);
      reportLines.push(`--    Reason: ${item.reason}`);
    });
    reportLines.push('--');
    reportLines.push('-- ============================================================================');
    reportLines.push('-- EXECUTABLE MIGRATION (Ready to Apply)');
    reportLines.push('-- ============================================================================');
    reportLines.push('');
    upHeader = reportLines.join('\n');
  }

  const finalUpScript = upLines.length > 0
    ? (upHeader ? `${upHeader}\n${upLines.join('\n\n')}` : upLines.join('\n\n'))
    : (upHeader ? `${upHeader}\n-- No executable UP changes needed.` : '-- Schemas are identical. No UP changes needed.');

  const finalDownScript = downLines.length > 0
    ? downLines.join('\n\n')
    : '-- No DOWN changes needed.';

  const executableCount = extractRunnableStatements(finalUpScript, driver).length;

  return {
    up: finalUpScript,
    down: finalDownScript,
    executableStatementCount: executableCount,
    skippedItems: allSkippedItems,
  };
}
