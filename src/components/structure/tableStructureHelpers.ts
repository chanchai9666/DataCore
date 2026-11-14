import { QueryResult, CellValue, ColumnMeta } from '../../types/db';
import { formatCellValue } from '../../utils/cellFormatter';
import type { TableForeignKeyStructure } from '../../api/queryBuilder';

export interface TableColumnStructure {
  name: string;
  dataType: string;
  udtName?: string;
  isNullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  ordinalPosition: number;
  isUnique?: boolean;
  checkConstraint?: string;
  isAutoIncrement?: boolean;
  collation?: string;
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

export interface DataTypeSpec {
  hasLength: boolean;
  defaultLength?: string;
  lengthPlaceholder?: string;
  defaultPlaceholder?: string;
  defaultSuggestions?: string[];
}

export const NO_LENGTH_TYPES = new Set([
  'DATE',
  'TIME',
  'TIMESTAMP',
  'TIMESTAMPTZ',
  'BOOLEAN',
  'UUID',
  'JSON',
  'JSONB',
  'TEXT',
  'BIGINT',
  'SMALLINT',
  'FLOAT',
  'REAL',
  'DOUBLE PRECISION',
  'BYTEA',
  'BLOB',
]);

export function getDataTypeSpec(typeName: string): DataTypeSpec {
  const upper = typeName.toUpperCase().trim();
  if (NO_LENGTH_TYPES.has(upper)) {
    let defaultSuggestions: string[] = [];
    let defaultPlaceholder = 'Optional default';

    if (upper === 'BOOLEAN') {
      defaultSuggestions = ['true', 'false'];
      defaultPlaceholder = 'e.g. true, false';
    } else if (upper.includes('TIMESTAMP') || upper === 'DATE' || upper === 'TIME') {
      defaultSuggestions = ['now()', 'CURRENT_TIMESTAMP'];
      defaultPlaceholder = 'e.g. now(), CURRENT_TIMESTAMP';
    } else if (upper === 'UUID') {
      defaultSuggestions = ['gen_random_uuid()'];
      defaultPlaceholder = 'e.g. gen_random_uuid()';
    } else if (upper.includes('JSON')) {
      defaultSuggestions = ["'{}'", "'[]'"];
      defaultPlaceholder = "e.g. '{}', '[]'";
    } else if (upper === 'BIGINT' || upper === 'SMALLINT') {
      defaultSuggestions = ['0'];
      defaultPlaceholder = 'e.g. 0';
    } else if (upper === 'TEXT') {
      defaultSuggestions = ["''"];
      defaultPlaceholder = "e.g. ''";
    }

    return {
      hasLength: false,
      defaultLength: '',
      lengthPlaceholder: 'N/A (ไม่ระบุ)',
      defaultPlaceholder,
      defaultSuggestions,
    };
  }

  if (upper === 'DECIMAL' || upper === 'NUMERIC') {
    return {
      hasLength: true,
      defaultLength: '10,2',
      lengthPlaceholder: 'e.g. 10,2',
      defaultPlaceholder: 'e.g. 0.00',
      defaultSuggestions: ['0.00', '0'],
    };
  }

  if (upper === 'VARCHAR') {
    return {
      hasLength: true,
      defaultLength: '255',
      lengthPlaceholder: 'e.g. 30, 255',
      defaultPlaceholder: "e.g. 'active', 'pending'",
      defaultSuggestions: ["''", "'active'"],
    };
  }

  if (upper === 'CHAR') {
    return {
      hasLength: true,
      defaultLength: '1',
      lengthPlaceholder: 'e.g. 1, 10',
      defaultPlaceholder: "e.g. 'Y', 'N'",
      defaultSuggestions: ["'Y'", "'N'"],
    };
  }

  if (upper === 'INT' || upper === 'INTEGER') {
    return {
      hasLength: true,
      defaultLength: '',
      lengthPlaceholder: 'e.g. 5, 11 (optional)',
      defaultPlaceholder: 'e.g. 0, 1',
      defaultSuggestions: ['0', '1'],
    };
  }

  return {
    hasLength: true,
    defaultLength: '',
    lengthPlaceholder: 'e.g. 30, 10,2',
    defaultPlaceholder: 'Optional default',
    defaultSuggestions: [],
  };
}

/**
 * Combines base type and length/precision/values (e.g. 'VARCHAR', '30' => 'VARCHAR(30)', 'INT', '5' => 'INT(5)').
 * If type does not support length (like DATE, JSON, UUID, BOOLEAN, TEXT), it omits parentheses even if passed.
 */
export function composeDataType(baseType: string, lengthOrValues?: string): string {
  const trimmedBase = baseType.trim();
  const trimmedLen = lengthOrValues?.trim();

  // If baseType already contains parentheses like VARCHAR(255), extract base name
  const match = trimmedBase.match(/^([a-zA-Z0-9_\s]+)(?:\(.*\))?$/);
  const cleanBase = match ? match[1].trim() : trimmedBase;

  // Never append length to types that do not take lengths (e.g. DATE, JSON, UUID, etc.)
  if (NO_LENGTH_TYPES.has(cleanBase.toUpperCase())) {
    return cleanBase;
  }

  if (!trimmedLen) {
    return cleanBase;
  }

  // Clean parentheses from lengthOrValues if user typed them
  const cleanLen = trimmedLen.replace(/^\(/, '').replace(/\)$/, '').trim();

  if (!cleanLen) {
    return cleanBase;
  }

  return `${cleanBase}(${cleanLen})`;
}

/**
 * Parses full type into base type and length/precision (e.g. 'VARCHAR(30)' => { baseType: 'VARCHAR', lengthOrValues: '30' }).
 */
export function parseDataType(fullType: string): { baseType: string; lengthOrValues: string } {
  const match = fullType.trim().match(/^([a-zA-Z0-9_\s]+)(?:\((.*)\))?$/);
  if (match) {
    return {
      baseType: match[1].trim(),
      lengthOrValues: match[2]?.trim() || '',
    };
  }
  return { baseType: fullType.trim(), lengthOrValues: '' };
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
 * Returns SQL to fetch the raw CREATE TABLE statement (SQLite only).
 */
export function getFetchTableDdlSql(
  driver: string,
  tableName: string,
  _schemaName?: string
): string | null {
  const d = (driver || '').toLowerCase();
  if (!d.includes('sqlite')) return null;
  const escapedTable = tableName.replace(/'/g, "''");
  return `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = '${escapedTable}';`;
}

/**
 * Extracts the raw CREATE TABLE statement from a query result.
 */
export function parseTableDdlFromQueryResult(result: QueryResult): string | null {
  if (!result || !result.rows || result.rows.length === 0) return null;
  const value = formatCellValue(result.rows[0]?.[0]);
  return value === 'NULL' || !value ? null : value;
}

function findMatchingParen(sql: string, openIndex: number): number {
  if (openIndex < 0) return -1;
  let depth = 0;
  let quote: string | null = null;
  for (let i = openIndex; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      if (ch === quote) {
        if (sql[i + 1] === quote) i++;
        else quote = null;
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

function splitSqliteDefinitions(body: string): string[] {
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

function unquoteIdentifier(identifier: string): string {
  if (identifier.startsWith('"') && identifier.endsWith('"')) {
    return identifier.slice(1, -1).replace(/""/g, '"');
  }
  if (identifier.startsWith('`') && identifier.endsWith('`')) {
    return identifier.slice(1, -1).replace(/``/g, '`');
  }
  if (identifier.startsWith('[') && identifier.endsWith(']')) {
    return identifier.slice(1, -1);
  }
  return identifier;
}

function extractBalancedExpression(text: string, keyword: string): string | undefined {
  const regex = new RegExp(`\\b${keyword}\\s*\\(`, 'i');
  const match = regex.exec(text);
  if (!match) return undefined;
  const open = text.indexOf('(', match.index);
  const close = findMatchingParen(text, open);
  if (close < 0) return undefined;
  return text.slice(open + 1, close).trim();
}

/**
 * Enriches SQLite columns parsed from PRAGMA table_info with attributes that are
 * only present in the original CREATE TABLE DDL (AUTOINCREMENT/UNIQUE/CHECK/COLLATE).
 */
export function enrichColumnsFromSqliteDdl(
  columns: TableColumnStructure[],
  ddl: string | null | undefined
): TableColumnStructure[] {
  if (!ddl || columns.length === 0) return columns;
  const open = ddl.indexOf('(');
  const close = findMatchingParen(ddl, open);
  if (open < 0 || close < 0) return columns;

  const definitions = splitSqliteDefinitions(ddl.slice(open + 1, close));
  const byName = new Map<string, Partial<TableColumnStructure>>();

  for (const definition of definitions) {
    const withoutConstraint = definition
      .trim()
      .replace(/^CONSTRAINT\s+("(?:[^"]|"")*"|`(?:[^`]|``)*`|\[[^\]]*\]|\S+)\s+/i, '');
    if (/^(PRIMARY\s+KEY|UNIQUE|CHECK|FOREIGN\s+KEY)\b/i.test(withoutConstraint)) {
      continue;
    }

    const nameMatch = withoutConstraint.match(
      /^("(?:[^"]|"")*"|`(?:[^`]|``)*`|\[[^\]]*\]|\S+)/
    );
    if (!nameMatch) continue;
    const name = unquoteIdentifier(nameMatch[1]);
    const attrs = withoutConstraint.slice(nameMatch[0].length);

    const collationMatch = attrs.match(
      /\bCOLLATE\s+("(?:[^"]|"")*"|`(?:[^`]|``)*`|\[[^\]]*\]|[A-Za-z0-9_]+)/i
    );

    byName.set(name.toLowerCase(), {
      isAutoIncrement: /\bAUTOINCREMENT\b/i.test(attrs) || undefined,
      isUnique: /\bUNIQUE\b/i.test(attrs) || undefined,
      checkConstraint: extractBalancedExpression(attrs, 'CHECK'),
      collation: collationMatch ? unquoteIdentifier(collationMatch[1]) : undefined,
    });
  }

  return columns.map((column) => {
    const extra = byName.get(column.name.toLowerCase());
    if (!extra) return column;
    return {
      ...column,
      isAutoIncrement: extra.isAutoIncrement,
      isUnique: extra.isUnique,
      checkConstraint: extra.checkConstraint,
      collation: extra.collation,
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
  const pkColumns = columns.filter((c) => c.isPrimaryKey);
  const pks = pkColumns.map((c) => quoteIdentifier(c.name, driver));
  const inlinePk =
    pkColumns.length === 1 && pkColumns[0].isAutoIncrement ? pkColumns[0] : null;

  const colDefs = columns.map((col) => {
    let line = `  ${quoteIdentifier(col.name, driver)} ${col.dataType}`;
    if (inlinePk && col.name === inlinePk.name) {
      line += ' PRIMARY KEY AUTOINCREMENT';
    }
    if (col.isUnique && !col.isPrimaryKey) {
      line += ' UNIQUE';
    }
    if (!col.isNullable) {
      line += ' NOT NULL';
    }
    if (col.defaultValue !== null && col.defaultValue !== undefined && col.defaultValue !== '') {
      line += ` DEFAULT ${col.defaultValue}`;
    }
    if (col.checkConstraint) {
      line += ` CHECK (${col.checkConstraint})`;
    }
    if (col.collation) {
      line += ` COLLATE ${col.collation}`;
    }
    return line;
  });

  if (pks.length > 0 && !inlinePk) {
    colDefs.push(`  PRIMARY KEY (${pks.join(', ')})`);
  }

  return `CREATE TABLE ${tableRef} (\n${colDefs.join(',\n')}\n);`;
}

/**
 * Enriches SQLite foreign key structures parsed from PRAGMA foreign_key_list with
 * the actual constraint names from the original CREATE TABLE DDL.
 *
 * PRAGMA foreign_key_list does not expose constraint names — it only returns a
 * numeric `id`. This function parses CONSTRAINT ... FOREIGN KEY clauses from the
 * DDL and matches them to PRAGMA rows by comparing (fromColumns, foreignTable,
 * foreignColumns). When a match is found the synthetic `fk_<id>_<table>` name is
 * replaced with the real constraint name so that DROP FK table-rebuild migrations
 * can correctly exclude the targeted constraint.
 */
export function enrichForeignKeysFromSqliteDdl(
  foreignKeys: TableForeignKeyStructure[],
  ddl: string | null | undefined
): TableForeignKeyStructure[] {
  if (!ddl || foreignKeys.length === 0) return foreignKeys;

  const open = ddl.indexOf('(');
  const close = findMatchingParen(ddl, open);
  if (open < 0 || close < 0) return foreignKeys;

  const definitions = splitSqliteDefinitions(ddl.slice(open + 1, close));

  interface ParsedFkDef {
    name: string | null;
    columns: string[];
    foreignTable: string;
    foreignColumns: string[];
  }

  const ddlFks: ParsedFkDef[] = [];

  for (const def of definitions) {
    const stripped = def.trim();

    // Match: [CONSTRAINT <name>] FOREIGN KEY (<cols>) REFERENCES <table> (<cols>)
    const constraintMatch = stripped.match(
      /^CONSTRAINT\s+(\"(?:[^\"]|\"\")*\"|`(?:[^`]|``)*`|\[[^\]]*\]|\S+)\s+FOREIGN\s+KEY\b/i
    );
    const fkMatch = /\bFOREIGN\s+KEY\b/i.test(
      constraintMatch ? stripped.slice(constraintMatch[0].length - 'FOREIGN KEY'.length) : stripped
    );
    if (!fkMatch) continue;

    const constraintName = constraintMatch ? unquoteIdentifier(constraintMatch[1]) : null;

    // Extract FOREIGN KEY (cols)
    const fkColsStart = stripped.search(/\bFOREIGN\s+KEY\s*\(/i);
    if (fkColsStart < 0) continue;
    const fkParenOpen = stripped.indexOf('(', fkColsStart);
    const fkParenClose = findMatchingParen(stripped, fkParenOpen);
    if (fkParenOpen < 0 || fkParenClose < 0) continue;
    const fromColsRaw = stripped.slice(fkParenOpen + 1, fkParenClose);
    const fromCols = fromColsRaw
      .split(',')
      .map((c) => unquoteIdentifier(c.trim().replace(/^[\"`\[]|[\"`\]]$/g, '')));

    // Extract REFERENCES <table> (cols)
    const refPart = stripped.slice(fkParenClose + 1);
    const refMatch = refPart.match(
      /\bREFERENCES\s+(\"(?:[^\"]|\"\")*\"|`(?:[^`]|``)*`|\[[^\]]*\]|\S+)\s*\(/i
    );
    if (!refMatch) continue;
    const foreignTable = unquoteIdentifier(refMatch[1]);
    const refParenOpen = refPart.indexOf('(', refMatch.index!);
    const refParenClose = findMatchingParen(refPart, refParenOpen);
    if (refParenOpen < 0 || refParenClose < 0) continue;
    const foreignColsRaw = refPart.slice(refParenOpen + 1, refParenClose);
    const foreignCols = foreignColsRaw
      .split(',')
      .map((c) => unquoteIdentifier(c.trim().replace(/^[\"`\[]|[\"`\]]$/g, '')));

    ddlFks.push({ name: constraintName, columns: fromCols, foreignTable, foreignColumns: foreignCols });
  }

  if (ddlFks.length === 0) return foreignKeys;

  return foreignKeys.map((fk) => {
    const match = ddlFks.find(
      (d) =>
        d.name !== null &&
        d.foreignTable.toLowerCase() === fk.foreignTableName.toLowerCase() &&
        d.columns.length === fk.columnNames.length &&
        d.columns.every((c, i) => c.toLowerCase() === (fk.columnNames[i] ?? '').toLowerCase()) &&
        d.foreignColumns.length === fk.foreignColumnNames.length &&
        d.foreignColumns.every(
          (c, i) => c.toLowerCase() === (fk.foreignColumnNames[i] ?? '').toLowerCase()
        )
    );
    return match ? { ...fk, name: match.name! } : fk;
  });
}
