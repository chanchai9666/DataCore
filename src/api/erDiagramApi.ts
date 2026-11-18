import type {
  ERDiagramData,
  ERTable,
  ERColumn,
  ERRelationship,
  QueryResult,
  CellValue,
} from '../types/db';
import { formatCellValue } from '../utils/cellFormatter';
import { formatSqlLiteral } from './queryBuilder';
import { dbApi } from './db';
import { quoteIdentifier } from './queryBuilder';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
import {
  parseForeignKeysFromQueryResult,
  type TableForeignKeyStructure,
} from '../components/structure/tableManagementHelpers';

export interface LayoutOptions {
  columns?: number;
  cardWidth?: number;
  cardHeightEstimated?: number;
  gapX?: number;
  gapY?: number;
  padding?: number;
}

/**
 * Computes topological or grid positions for ER tables.
 */
export function computeAutoLayout(
  tables: ERTable[],
  relationships: ERRelationship[],
  options?: LayoutOptions
): ERTable[] {
  const cardWidth = options?.cardWidth ?? 260;
  const gapX = options?.gapX ?? 80;
  const gapY = options?.gapY ?? 50;
  const padding = options?.padding ?? 40;

  // If there are no relationships, arrange in a neat grid
  if (relationships.length === 0) {
    const numCols = options?.columns ?? Math.min(3, Math.max(1, Math.ceil(Math.sqrt(tables.length))));
    const colHeights = new Array(numCols).fill(padding);
    return tables.map((t, idx) => {
      const col = idx % numCols;
      const x = padding + col * (cardWidth + gapX);
      const y = colHeights[col];
      const estHeight = 44 + (t.columns?.length || 1) * 26 + 16;
      colHeights[col] += estHeight + gapY;
      return {
        ...t,
        x,
        y,
      };
    });
  }

  // Build dependency graph: toTable -> fromTable (parent -> children)
  const incoming = new Map<string, string[]>(); // parent -> list of child table ids
  const outgoing = new Map<string, string[]>(); // child -> list of parent table ids

  tables.forEach((t) => {
    incoming.set(t.id, []);
    outgoing.set(t.id, []);
  });

  relationships.forEach((rel) => {
    if (incoming.has(rel.toTable)) {
      incoming.get(rel.toTable)!.push(rel.fromTable);
    }
    if (outgoing.has(rel.fromTable)) {
      outgoing.get(rel.fromTable)!.push(rel.toTable);
    }
  });

  // Calculate layer / depth for each table
  // Root tables have 0 outgoing FKs (they are purely referenced)
  const layerMap = new Map<string, number>();
  tables.forEach((t) => {
    // If table has no foreign keys referencing other tables, it starts at layer 0
    const out = outgoing.get(t.id) || [];
    if (out.length === 0) {
      layerMap.set(t.id, 0);
    }
  });

  // Iteratively assign layers to child tables
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 10) {
    changed = false;
    iterations++;
    tables.forEach((t) => {
      const out = outgoing.get(t.id) || [];
      if (out.length > 0) {
        const maxParentLayer = Math.max(
          ...out.map((parentId) => layerMap.get(parentId) ?? 0)
        );
        const myLayer = maxParentLayer + 1;
        if ((layerMap.get(t.id) ?? -1) !== myLayer) {
          layerMap.set(t.id, myLayer);
          changed = true;
        }
      } else if (!layerMap.has(t.id)) {
        layerMap.set(t.id, 0);
      }
    });
  }

  // Ensure all tables have a layer
  tables.forEach((t) => {
    if (!layerMap.has(t.id)) layerMap.set(t.id, 0);
  });

  // Group tables by layer
  const layers = new Map<number, ERTable[]>();
  tables.forEach((t) => {
    const l = layerMap.get(t.id) ?? 0;
    if (!layers.has(l)) layers.set(l, []);
    layers.get(l)!.push(t);
  });

  const sortedLayerKeys = Array.from(layers.keys()).sort((a, b) => a - b);

  const updatedTables: ERTable[] = [];

  sortedLayerKeys.forEach((layerIndex) => {
    const layerTables = layers.get(layerIndex)!;
    let currentY = padding;
    const x = padding + layerIndex * (cardWidth + gapX);

    layerTables.forEach((table) => {
      const estHeight = 44 + (table.columns?.length || 1) * 26 + 16;
      updatedTables.push({
        ...table,
        x,
        y: currentY,
      });
      currentY += estHeight + gapY;
    });
  });

  return updatedTables;
}

/**
 * Parses SQLite PRAGMA table_info result
 */
export function parseSQLiteColumns(result: QueryResult): ERColumn[] {
  if (!result || !result.rows) return [];
  const getStr = (val: CellValue) => {
    const s = formatCellValue(val);
    return s === 'NULL' ? '' : s;
  };

  return result.rows.map((row) => {
    const name = getStr(row[1]);
    const dataType = getStr(row[2]) || 'TEXT';
    const notNull = getStr(row[3]) === '1';
    const isPk = getStr(row[5]) === '1' || Number(getStr(row[5])) > 0;

    return {
      name,
      dataType,
      isPrimaryKey: isPk,
      isNullable: !notNull,
    };
  });
}

/**
 * Parses MySQL information_schema columns result
 */
export function parseMySQLColumns(result: QueryResult): ERColumn[] {
  if (!result || !result.rows) return [];
  const getStr = (val: CellValue) => {
    const s = formatCellValue(val);
    return s === 'NULL' ? '' : s;
  };

  return result.rows.map((row) => {
    const name = getStr(row[0]);
    const dataType = getStr(row[1]);
    const isNullable = getStr(row[2]).toUpperCase() === 'YES';
    const isPk = getStr(row[3]).toUpperCase() === 'PRI';

    return {
      name,
      dataType,
      isPrimaryKey: isPk,
      isNullable,
    };
  });
}

/**
 * Parses PostgreSQL information_schema columns result
 */
export function parsePostgresColumns(result: QueryResult): ERColumn[] {
  if (!result || !result.rows) return [];
  const getStr = (val: CellValue) => {
    const s = formatCellValue(val);
    return s === 'NULL' ? '' : s;
  };

  const seen = new Set<string>();
  const cols: ERColumn[] = [];

  for (const row of result.rows) {
    const name = getStr(row[0]);
    if (!name) continue;
    const lower = name.toLowerCase();
    const dataType = getStr(row[1]);
    const isNullable = getStr(row[2]).toUpperCase() === 'YES';
    const isPk = getStr(row[3]) === '1' || Number(getStr(row[3])) > 0;

    if (seen.has(lower)) {
      if (isPk) {
        const existing = cols.find((c) => c.name.toLowerCase() === lower);
        if (existing) existing.isPrimaryKey = true;
      }
      continue;
    }

    seen.add(lower);
    cols.push({
      name,
      dataType,
      isPrimaryKey: isPk,
      isNullable,
    });
  }

  return cols;
}

/**
 * Converts parsed foreign keys into ERRelationship models
 */
export function buildERRelationships(
  tableName: string,
  fks: TableForeignKeyStructure[]
): ERRelationship[] {
  const rels: ERRelationship[] = [];

  fks.forEach((fk) => {
    fk.columnNames.forEach((fromCol, idx) => {
      const toCol = fk.foreignColumnNames[idx] || fk.foreignColumnNames[0] || 'id';
      rels.push({
        id: `${tableName}_${fk.name}_${fromCol}`,
        fromTable: tableName,
        fromColumn: fromCol,
        toTable: fk.foreignTableName,
        toColumn: toCol,
        constraintName: fk.name,
        onUpdate: fk.onUpdate,
        onDelete: fk.onDelete,
      });
    });
  });

  return rels;
}

/**
 * Fetches PostgreSQL schema tables, columns, PKs and FKs in 2 parallel bulk queries
 */
export async function fetchPostgresSchemaER(
  connectionId: string,
  schemaName?: string
): Promise<{ tables: ERTable[]; relationships: ERRelationship[] }> {
  const s = schemaName || 'public';
  const schemaLit = formatSqlLiteral(s, 'postgres');

  // Query 1: All columns with PK indicator across all BASE TABLES in schema
  const colSql = `SELECT 
    c.table_name,
    c.column_name, 
    c.data_type, 
    c.is_nullable, 
    CASE WHEN pk.column_name IS NOT NULL THEN 1 ELSE 0 END AS is_pk 
  FROM information_schema.columns c 
  JOIN information_schema.tables t
    ON c.table_schema = t.table_schema
    AND c.table_name = t.table_name
  LEFT JOIN (
    SELECT kcu.table_schema, kcu.table_name, kcu.column_name 
    FROM information_schema.table_constraints tc 
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name 
      AND tc.table_schema = kcu.table_schema 
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema = ${schemaLit}
  ) pk ON c.table_schema = pk.table_schema 
      AND c.table_name = pk.table_name 
      AND c.column_name = pk.column_name 
  WHERE c.table_schema = ${schemaLit}
    AND t.table_type = 'BASE TABLE'
  ORDER BY c.table_name, c.ordinal_position;`;

  // Query 2: All foreign keys across the schema
  const fkSql = `SELECT
    tc.table_name AS from_table,
    kcu.column_name AS from_column,
    ccu.table_name AS to_table,
    ccu.column_name AS to_column,
    tc.constraint_name,
    rc.update_rule,
    rc.delete_rule
  FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
  LEFT JOIN information_schema.referential_constraints AS rc
    ON rc.constraint_name = tc.constraint_name
    AND rc.constraint_schema = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = ${schemaLit}
  ORDER BY tc.table_name, kcu.ordinal_position;`;

  const [colRes, fkRes] = await Promise.all([
    dbApi.executeDirectQuery(connectionId, colSql),
    dbApi.executeDirectQuery(connectionId, fkSql),
  ]);

  const getStr = (val: CellValue) => {
    const str = formatCellValue(val);
    return str === 'NULL' ? '' : str;
  };

  const tablesMap = new Map<string, ERColumn[]>();
  const seenColsPerTable = new Map<string, Set<string>>();

  for (const row of colRes.rows || []) {
    const tName = getStr(row[0]);
    const colName = getStr(row[1]);
    if (!tName || !colName) continue;

    if (!tablesMap.has(tName)) {
      tablesMap.set(tName, []);
      seenColsPerTable.set(tName, new Set());
    }

    const seenCols = seenColsPerTable.get(tName)!;
    const lowerCol = colName.toLowerCase();
    const dataType = getStr(row[2]);
    const isNullable = getStr(row[3]).toUpperCase() === 'YES';
    const isPk = getStr(row[4]) === '1' || Number(getStr(row[4])) > 0;

    if (seenCols.has(lowerCol)) {
      if (isPk) {
        const existing = tablesMap.get(tName)!.find((c) => c.name.toLowerCase() === lowerCol);
        if (existing) existing.isPrimaryKey = true;
      }
      continue;
    }

    seenCols.add(lowerCol);
    tablesMap.get(tName)!.push({
      name: colName,
      dataType,
      isPrimaryKey: isPk,
      isNullable,
    });
  }

  const relationships: ERRelationship[] = [];
  for (const row of fkRes.rows || []) {
    const fromTable = getStr(row[0]);
    const fromColumn = getStr(row[1]);
    const toTable = getStr(row[2]);
    const toColumn = getStr(row[3]) || 'id';
    const constraintName = getStr(row[4]);
    const onUpdate = getStr(row[5]) || undefined;
    const onDelete = getStr(row[6]) || undefined;

    if (fromTable && toTable) {
      relationships.push({
        id: `${fromTable}_${constraintName || 'fk'}_${fromColumn}`,
        fromTable,
        fromColumn,
        toTable,
        toColumn,
        constraintName: constraintName || undefined,
        onUpdate: onUpdate === 'NO ACTION' ? undefined : (onUpdate as any),
        onDelete: onDelete === 'NO ACTION' ? undefined : (onDelete as any),
      });
    }
  }

  const tables: ERTable[] = Array.from(tablesMap.entries()).map(([tName, cols]) => ({
    id: tName,
    name: tName,
    schema: schemaName,
    columns: cols,
    x: 0,
    y: 0,
    isCollapsed: false,
  }));

  return { tables, relationships };
}

/**
 * Fetches MySQL schema tables, columns, PKs and FKs in 3 parallel bulk queries
 */
export async function fetchMysqlSchemaER(
  connectionId: string,
  schemaName?: string
): Promise<{ tables: ERTable[]; relationships: ERRelationship[] }> {
  const schemaSql = schemaName ? formatSqlLiteral(schemaName, 'mysql') : 'DATABASE()';

  const tableSql = `SELECT table_name FROM information_schema.tables WHERE table_schema = ${schemaSql} AND table_type = 'BASE TABLE' ORDER BY table_name;`;
  const colSql = `SELECT table_name, column_name, data_type, is_nullable, column_key FROM information_schema.columns WHERE table_schema = ${schemaSql} ORDER BY table_name, ordinal_position;`;
  const fkSql = `SELECT 
    table_name AS from_table,
    column_name AS from_column,
    referenced_table_name AS to_table,
    referenced_column_name AS to_column,
    constraint_name
  FROM information_schema.key_column_usage
  WHERE table_schema = ${schemaSql}
    AND referenced_table_name IS NOT NULL
  ORDER BY table_name, ordinal_position;`;

  const [tableRes, colRes, fkRes] = await Promise.all([
    dbApi.executeDirectQuery(connectionId, tableSql),
    dbApi.executeDirectQuery(connectionId, colSql),
    dbApi.executeDirectQuery(connectionId, fkSql),
  ]);

  const getStr = (val: CellValue) => {
    const str = formatCellValue(val);
    return str === 'NULL' ? '' : str;
  };

  const tablesMap = new Map<string, ERColumn[]>();
  for (const row of tableRes.rows || []) {
    const tName = getStr(row[0]);
    if (tName) tablesMap.set(tName, []);
  }

  for (const row of colRes.rows || []) {
    const tName = getStr(row[0]);
    const colName = getStr(row[1]);
    if (!tName || !colName) continue;
    if (!tablesMap.has(tName)) tablesMap.set(tName, []);

    const dataType = getStr(row[2]);
    const isNullable = getStr(row[3]).toUpperCase() === 'YES';
    const isPk = getStr(row[4]).toUpperCase() === 'PRI';

    tablesMap.get(tName)!.push({
      name: colName,
      dataType,
      isPrimaryKey: isPk,
      isNullable,
    });
  }

  const relationships: ERRelationship[] = [];
  for (const row of fkRes.rows || []) {
    const fromTable = getStr(row[0]);
    const fromColumn = getStr(row[1]);
    const toTable = getStr(row[2]);
    const toColumn = getStr(row[3]) || 'id';
    const constraintName = getStr(row[4]);

    if (fromTable && toTable) {
      relationships.push({
        id: `${fromTable}_${constraintName || 'fk'}_${fromColumn}`,
        fromTable,
        fromColumn,
        toTable,
        toColumn,
        constraintName: constraintName || undefined,
      });
    }
  }

  const tables: ERTable[] = Array.from(tablesMap.entries()).map(([tName, cols]) => ({
    id: tName,
    name: tName,
    schema: schemaName,
    columns: cols,
    x: 0,
    y: 0,
    isCollapsed: false,
  }));

  return { tables, relationships };
}

/**
 * Fetches SQLite schema tables, columns, and foreign keys concurrently using Promise.all
 */
export async function fetchSqliteSchemaER(
  connectionId: string
): Promise<{ tables: ERTable[]; relationships: ERRelationship[] }> {
  const tableRes = await dbApi.executeDirectQuery(
    connectionId,
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
  );
  const tableNames = (tableRes.rows || []).map((r) => formatCellValue(r[0]));

  const results = await Promise.all(
    tableNames.map(async (tName) => {
      const [colRes, fkRes] = await Promise.all([
        dbApi.executeDirectQuery(connectionId, `PRAGMA table_info(${formatSqlLiteral(tName, 'sqlite')});`),
        dbApi.executeDirectQuery(connectionId, `PRAGMA foreign_key_list(${formatSqlLiteral(tName, 'sqlite')});`),
      ]);
      const columns = parseSQLiteColumns(colRes);
      const fks = parseForeignKeysFromQueryResult(fkRes, 'sqlite');
      const relationships = buildERRelationships(tName, fks);
      return {
        table: {
          id: tName,
          name: tName,
          columns,
          x: 0,
          y: 0,
          isCollapsed: false,
        },
        relationships,
      };
    })
  );

  const tables: ERTable[] = results.map((r) => r.table);
  const relationships: ERRelationship[] = results.flatMap((r) => r.relationships);

  return { tables, relationships };
}

/**
 * Fetches tables, columns, and foreign keys for an entire schema/database to build ERDiagramData
 */
export async function fetchERDiagramData(
  connectionId: string,
  driver: string,
  schemaName?: string
): Promise<ERDiagramData> {
  const d = (driver || '').toLowerCase();
  let tables: ERTable[] = [];
  let allRelationships: ERRelationship[] = [];

  if (d.includes('sqlite')) {
    const res = await fetchSqliteSchemaER(connectionId);
    tables = res.tables;
    allRelationships = res.relationships;
  } else if (d.includes('mysql')) {
    const res = await fetchMysqlSchemaER(connectionId, schemaName);
    tables = res.tables;
    allRelationships = res.relationships;
  } else {
    // PostgreSQL / default
    const res = await fetchPostgresSchemaER(connectionId, schemaName);
    tables = res.tables;
    allRelationships = res.relationships;
  }

  // Compute Auto Layout
  const laidOutTables = computeAutoLayout(tables, allRelationships);

  return {
    tables: laidOutTables,
    relationships: allRelationships,
  };
}

/**
 * Exports ER diagram into standalone SVG format
 */
export function exportERDiagramAsSvg(
  diagramData: ERDiagramData,
  theme: 'dark' | 'light' = 'dark'
): string {
  const isDark = theme === 'dark';
  const bgColor = isDark ? '#111827' : '#F9FAFB';
  const cardBg = isDark ? '#1F2937' : '#FFFFFF';
  const cardBorder = isDark ? '#374151' : '#E5E7EB';
  const headerBg = isDark ? '#374151' : '#F3F4F6';
  const textColor = isDark ? '#F3F4F6' : '#111827';
  const mutedText = isDark ? '#9CA3AF' : '#6B7280';
  const lineColor = isDark ? '#60A5FA' : '#2563EB';

  const cardWidth = 260;
  const colHeight = 26;
  const headerHeight = 36;

  let maxX = 800;
  let maxY = 600;

  diagramData.tables.forEach((t) => {
    const tableHeight = headerHeight + (t.columns?.length || 1) * colHeight + 8;
    if (t.x + cardWidth + 100 > maxX) maxX = t.x + cardWidth + 100;
    if (t.y + tableHeight + 100 > maxY) maxY = t.y + tableHeight + 100;
  });

  const tablePosMap = new Map<string, { x: number; y: number; height: number }>();
  diagramData.tables.forEach((t) => {
    const height = headerHeight + (t.columns?.length || 1) * colHeight + 8;
    tablePosMap.set(t.id, { x: t.x, y: t.y, height });
  });

  // Render Relationship Connectors
  let pathsSvg = '';
  diagramData.relationships.forEach((rel) => {
    const source = tablePosMap.get(rel.fromTable);
    const target = tablePosMap.get(rel.toTable);
    if (!source || !target) return;

    // Connect from right of source to left of target (or vice versa)
    const isSourceLeft = source.x < target.x;
    const startX = isSourceLeft ? source.x + cardWidth : source.x;
    const startY = source.y + 20;
    const endX = isSourceLeft ? target.x : target.x + cardWidth;
    const endY = target.y + 20;

    const dx = Math.abs(endX - startX) * 0.5;
    const cp1x = isSourceLeft ? startX + dx : startX - dx;
    const cp2x = isSourceLeft ? endX - dx : endX + dx;

    pathsSvg += `  <path d="M ${startX} ${startY} C ${cp1x} ${startY}, ${cp2x} ${endY}, ${endX} ${endY}" fill="none" stroke="${lineColor}" stroke-width="2" opacity="0.8" />\n`;
    pathsSvg += `  <circle cx="${startX}" cy="${startY}" r="4" fill="${lineColor}" />\n`;
    pathsSvg += `  <circle cx="${endX}" cy="${endY}" r="4" fill="${lineColor}" />\n`;
  });

  // Render Table Cards
  let tablesSvg = '';
  diagramData.tables.forEach((table) => {
    const cardH = headerHeight + (table.columns?.length || 1) * colHeight + 8;
    tablesSvg += `  <g transform="translate(${table.x}, ${table.y})">\n`;
    tablesSvg += `    <rect width="${cardWidth}" height="${cardH}" rx="6" fill="${cardBg}" stroke="${cardBorder}" stroke-width="1.5" />\n`;
    tablesSvg += `    <rect width="${cardWidth}" height="${headerHeight}" rx="6" fill="${headerBg}" />\n`;
    tablesSvg += `    <text x="14" y="23" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="600" font-size="13" fill="${textColor}">${escapeXml(table.name)}</text>\n`;

    table.columns.forEach((col, idx) => {
      const cy = headerHeight + 18 + idx * colHeight;
      const pkMarker = col.isPrimaryKey ? '🔑 ' : '   ';
      const colColor = col.isPrimaryKey ? '#F59E0B' : textColor;
      tablesSvg += `    <text x="14" y="${cy}" font-family="monospace" font-size="11" fill="${colColor}">${pkMarker}${escapeXml(col.name)}</text>\n`;
      tablesSvg += `    <text x="${cardWidth - 14}" y="${cy}" text-anchor="end" font-family="monospace" font-size="11" fill="${mutedText}">${escapeXml(col.dataType)}</text>\n`;
    });

    tablesSvg += `  </g>\n`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${maxX}" height="${maxY}" viewBox="0 0 ${maxX} ${maxY}">
  <rect width="100%" height="100%" fill="${bgColor}" />
  <g id="connectors">
${pathsSvg}  </g>
  <g id="tables">
${tablesSvg}  </g>
</svg>`;
}

/**
 * Generates SQL DDL script from ERDiagramData
 */
export function generateERDiagramSql(
  diagramData: ERDiagramData,
  _driver: string = 'sqlite'
): string {
  const statements: string[] = [];

  diagramData.tables.forEach((table) => {
    const colDefs = table.columns.map((col) => {
      const nullability = col.isNullable ? '' : ' NOT NULL';
      const pk = col.isPrimaryKey ? ' PRIMARY KEY' : '';
      return `  ${quoteIdentifier(col.name, _driver)} ${col.dataType}${nullability}${pk}`;
    });

    // Add foreign keys originating from this table
    const tableRels = diagramData.relationships.filter(
      (rel) => rel.fromTable === table.name
    );

    tableRels.forEach((rel) => {
      let fkDef = `  FOREIGN KEY (${quoteIdentifier(rel.fromColumn, _driver)}) REFERENCES ${quoteIdentifier(rel.toTable, _driver)} (${quoteIdentifier(rel.toColumn, _driver)})`;
      if (rel.onDelete) fkDef += ` ON DELETE ${rel.onDelete}`;
      if (rel.onUpdate) fkDef += ` ON UPDATE ${rel.onUpdate}`;
      colDefs.push(fkDef);
    });

    statements.push(`CREATE TABLE ${quoteIdentifier(table.name, _driver)} (\n${colDefs.join(',\n')}\n);`);
  });

  return statements.join('\n\n');
}
