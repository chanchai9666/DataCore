import type {
  SchemaDiffTarget,
  SchemaDiffResult,
  TableDiff,
  ColumnDiff,
  ColumnDiffStatus,
  TableDiffStatus,
  MigrationScript,
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
      // If already added, but current row has isPk = true, update it
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
 * Avoids slow per-table roundtrips, foreign key loading, and unnecessary ER auto-layout.
 */
export async function fetchSchemaForDiff(
  connectionId: string,
  driver: string,
  schemaName?: string
): Promise<SchemaDiffTarget> {
  const d = (driver || '').toLowerCase();

  if (d.includes('sqlite')) {
    const tableRes = await dbApi.executeDirectQuery(
      connectionId,
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
    );
    const tableNames: string[] = tableRes.rows.map((r: CellValue[]) => formatCellValue(r[0]));

    // Fetch table_info in parallel using Promise.all
    const tablePromises = tableNames.map(async (tName) => {
      const colRes = await dbApi.executeDirectQuery(
        connectionId,
        `PRAGMA table_info(${formatSqlLiteral(tName, 'sqlite')});`
      );
      const cols = parseSQLiteColumns(colRes);
      return {
        id: tName,
        name: tName,
        schema: undefined,
        columns: cols,
        x: 0,
        y: 0,
        isCollapsed: false,
      } as ERTable;
    });

    const tables = await Promise.all(tablePromises);

    return {
      connectionId,
      schemaName,
      driver,
      tables,
    };
  }

  if (d.includes('mysql')) {
    const schemaSql = schemaName ? formatSqlLiteral(schemaName, 'mysql') : 'DATABASE()';
    const [tableRes, colRes] = await Promise.all([
      dbApi.executeDirectQuery(
        connectionId,
        `SELECT table_name FROM information_schema.tables WHERE table_schema = ${schemaSql} AND table_type = 'BASE TABLE' ORDER BY table_name;`
      ),
      dbApi.executeDirectQuery(
        connectionId,
        `SELECT table_name, column_name, data_type, is_nullable, column_key FROM information_schema.columns WHERE table_schema = ${schemaSql} ORDER BY table_name, ordinal_position;`
      ),
    ]);

    const tableNames: string[] = tableRes.rows.map((r: CellValue[]) => formatCellValue(r[0]));
    const colMap = parseMySQLBulkColumns(colRes.rows);

    const tables: ERTable[] = tableNames.map((tName) => ({
      id: tName,
      name: tName,
      schema: schemaName,
      columns: colMap.get(tName) || [],
      x: 0,
      y: 0,
      isCollapsed: false,
    }));

    return {
      connectionId,
      schemaName,
      driver,
      tables,
    };
  }

  // PostgreSQL: Single bulk query for all tables and columns with strictly filtered primary keys
  const s = schemaName || 'public';
  const [tableRes, colRes] = await Promise.all([
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
  ]);

  const tableNames: string[] = tableRes.rows.map((r: CellValue[]) => formatCellValue(r[0]));
  const colMap = parsePostgresBulkColumns(colRes.rows);

  const tables: ERTable[] = tableNames.map((tName) => ({
    id: tName,
    name: tName,
    schema: schemaName,
    columns: colMap.get(tName) || [],
    x: 0,
    y: 0,
    isCollapsed: false,
  }));

  return {
    connectionId,
    schemaName,
    driver,
    tables,
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

  const allTableNames = Array.from(
    new Set([...sourceTableMap.keys(), ...targetTableMap.keys()])
  ).sort();

  const tables: TableDiff[] = [];
  let identicalCount = 0;
  let differentCount = 0;
  let onlyInSourceCount = 0;
  let onlyInTargetCount = 0;

  for (const tKey of allTableNames) {
    const sTable = sourceTableMap.get(tKey);
    const tTable = targetTableMap.get(tKey);

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

    // Both exist: compare columns
    if (sTable && tTable) {
      const sColMap = new Map(sTable.columns.map((c) => [c.name.toLowerCase(), c]));
      const tColMap = new Map(tTable.columns.map((c) => [c.name.toLowerCase(), c]));
      const allCols = Array.from(
        new Set([...sColMap.keys(), ...tColMap.keys()])
      ).sort();

      const columnDiffs: ColumnDiff[] = [];
      let hasColumnDiff = false;

      for (const cKey of allCols) {
        const sCol = sColMap.get(cKey);
        const tCol = tColMap.get(cKey);

        if (sCol && !tCol) {
          hasColumnDiff = true;
          columnDiffs.push({
            name: sCol.name,
            status: 'added',
            sourceType: sCol.dataType,
            sourceNullable: sCol.isNullable,
            sourcePk: sCol.isPrimaryKey,
          });
        } else if (!sCol && tCol) {
          hasColumnDiff = true;
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
            hasColumnDiff = true;
          } else if (!nullMatch) {
            status = 'nullability_mismatch';
            hasColumnDiff = true;
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

      const tableStatus: TableDiffStatus = hasColumnDiff ? 'different' : 'identical';
      if (hasColumnDiff) {
        differentCount++;
      } else {
        identicalCount++;
      }

      tables.push({
        tableName: sTable.name,
        status: tableStatus,
        columnDiffs,
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

  // 1. Process table additions and modifications
  for (const table of diff.tables) {
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
    } else if (table.status === 'only_in_target') {
      // Drop table in target (protected by safeguard guard)
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
      // Alter table
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
          const mappedUpType = mapColumnTypeToTarget(col.sourceType || 'TEXT', driver);
          const mappedDownType = mapColumnTypeToTarget(col.targetType || 'TEXT', diff.source.driver || 'postgres');

          if (isMySql) {
            upLines.push(
              `ALTER TABLE ${quote(table.tableName)} MODIFY COLUMN ${quote(col.name)} ${mappedUpType};`
            );
            downLines.push(
              `ALTER TABLE ${quote(table.tableName)} MODIFY COLUMN ${quote(col.name)} ${mappedDownType};`
            );
          } else if (isSqlite) {
            upLines.push(
              `-- [SQLITE REBUILD REQUIRED] SQLite does not support ALTER COLUMN TYPE. Table rebuild required for column ${quote(col.name)} (${col.targetType} -> ${col.sourceType}).`
            );
            downLines.push(
              `-- [SQLITE REBUILD REQUIRED] SQLite does not support ALTER COLUMN TYPE. Table rebuild required for column ${quote(col.name)} (${col.sourceType} -> ${col.targetType}).`
            );
          } else {
            upLines.push(
              `ALTER TABLE ${quote(table.tableName)} ALTER COLUMN ${quote(col.name)} TYPE ${mappedUpType};`
            );
            downLines.push(
              `ALTER TABLE ${quote(table.tableName)} ALTER COLUMN ${quote(col.name)} TYPE ${mappedDownType};`
            );
          }
        } else if (col.status === 'nullability_mismatch') {
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
          } else if (isSqlite) {
            upLines.push(
              `-- [SQLITE REBUILD REQUIRED] SQLite does not support altering column nullability. Table rebuild required for column ${quote(col.name)}.`
            );
            downLines.push(
              `-- [SQLITE REBUILD REQUIRED] SQLite does not support altering column nullability. Table rebuild required for column ${quote(col.name)}.`
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
  }

  return {
    up: upLines.length > 0 ? upLines.join('\n\n') : '-- Schemas are identical. No UP changes needed.',
    down: downLines.length > 0 ? downLines.join('\n\n') : '-- No DOWN changes needed.',
  };
}
