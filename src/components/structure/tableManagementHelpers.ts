export interface NewTableColumnConfig {
  name: string;
  dataType: string;
  isPrimaryKey: boolean;
  nullable: boolean;
  defaultValue?: string;
  autoIncrement?: boolean;
}

export interface CreateTableConfig {
  tableName: string;
  schemaName?: string;
  driver?: string;
  columns: NewTableColumnConfig[];
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
 * Builds a CREATE TABLE statement according to database driver and column specifications.
 */
export function buildCreateTableSql(config: CreateTableConfig): string {
  const { tableName, schemaName, driver, columns } = config;
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
  return `CREATE TABLE ${fullTable} (\n${formattedDefs}\n);`;
}
