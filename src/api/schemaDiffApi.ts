import type {
  SchemaDiffTarget,
  SchemaDiffResult,
  TableDiff,
  ColumnDiff,
  ColumnDiffStatus,
  TableDiffStatus,
  MigrationScript,
} from '../types/schemaDiff';
import type { ERTable } from '../types/db';
import { fetchERDiagramData } from './erDiagramApi';

export async function fetchSchemaForDiff(
  connectionId: string,
  driver: string,
  schemaName?: string
): Promise<SchemaDiffTarget> {
  const diagram = await fetchERDiagramData(connectionId, driver, schemaName);
  return {
    connectionId,
    schemaName,
    driver,
    tables: diagram.tables,
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

export function generateMigrationSql(
  diff: SchemaDiffResult,
  driver: string = 'postgres'
): MigrationScript {
  const upLines: string[] = [];
  const downLines: string[] = [];

  const isMySql = driver.toLowerCase().includes('mysql');
  const quote = (name: string) => (isMySql ? `\`${name}\`` : `"${name}"`);

  // 1. Process table additions and modifications
  for (const table of diff.tables) {
    if (table.status === 'only_in_source') {
      // Create table in target
      const colDefs = table.columnDiffs.map((c) => {
        const nullability = c.sourceNullable ? '' : ' NOT NULL';
        const pk = c.sourcePk ? ' PRIMARY KEY' : '';
        return `  ${quote(c.name)} ${c.sourceType || 'TEXT'}${nullability}${pk}`;
      });
      upLines.push(`CREATE TABLE ${quote(table.tableName)} (\n${colDefs.join(',\n')}\n);`);
      downLines.push(`DROP TABLE IF EXISTS ${quote(table.tableName)};`);
    } else if (table.status === 'only_in_target') {
      // Drop table in target
      upLines.push(`DROP TABLE IF EXISTS ${quote(table.tableName)};`);
      const colDefs = table.columnDiffs.map((c) => {
        const nullability = c.targetNullable ? '' : ' NOT NULL';
        const pk = c.targetPk ? ' PRIMARY KEY' : '';
        return `  ${quote(c.name)} ${c.targetType || 'TEXT'}${nullability}${pk}`;
      });
      downLines.push(`CREATE TABLE ${quote(table.tableName)} (\n${colDefs.join(',\n')}\n);`);
    } else if (table.status === 'different') {
      // Alter table
      for (const col of table.columnDiffs) {
        if (col.status === 'added') {
          const nullability = col.sourceNullable ? '' : ' NOT NULL';
          upLines.push(
            `ALTER TABLE ${quote(table.tableName)} ADD COLUMN ${quote(col.name)} ${col.sourceType || 'TEXT'}${nullability};`
          );
          downLines.push(
            `ALTER TABLE ${quote(table.tableName)} DROP COLUMN ${quote(col.name)};`
          );
        } else if (col.status === 'removed') {
          upLines.push(
            `ALTER TABLE ${quote(table.tableName)} DROP COLUMN ${quote(col.name)};`
          );
          const nullability = col.targetNullable ? '' : ' NOT NULL';
          downLines.push(
            `ALTER TABLE ${quote(table.tableName)} ADD COLUMN ${quote(col.name)} ${col.targetType || 'TEXT'}${nullability};`
          );
        } else if (col.status === 'type_mismatch') {
          if (isMySql) {
            upLines.push(
              `ALTER TABLE ${quote(table.tableName)} MODIFY COLUMN ${quote(col.name)} ${col.sourceType};`
            );
            downLines.push(
              `ALTER TABLE ${quote(table.tableName)} MODIFY COLUMN ${quote(col.name)} ${col.targetType};`
            );
          } else {
            upLines.push(
              `ALTER TABLE ${quote(table.tableName)} ALTER COLUMN ${quote(col.name)} TYPE ${col.sourceType};`
            );
            downLines.push(
              `ALTER TABLE ${quote(table.tableName)} ALTER COLUMN ${quote(col.name)} TYPE ${col.targetType};`
            );
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
