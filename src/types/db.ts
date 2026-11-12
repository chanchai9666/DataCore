export type DatabaseDriver = 'sqlite' | 'postgres' | 'mysql';

export interface SshTunnelConfig {
  enabled: boolean;
  host?: string;
  port?: number;
  user?: string;
  auth_type?: 'password' | 'key';
  authType?: 'password' | 'key';
  private_key_path?: string;
  privateKeyPath?: string;
  passphrase?: string;
}

export interface SslCertConfig {
  ca_cert_path?: string;
  caCertPath?: string;
  client_cert_path?: string;
  clientCertPath?: string;
  client_key_path?: string;
  clientKeyPath?: string;
}

export interface ConnectionConfig {
  id: string;
  name: string;
  driver: DatabaseDriver;
  host?: string;
  port?: number;
  database: string;
  user?: string;
  folder?: string;
  ssl_mode?: string;
  sslMode?: string;
  ssl_certs?: SslCertConfig;
  sslCerts?: SslCertConfig;
  ssh_tunnel?: SshTunnelConfig;
  sshTunnel?: SshTunnelConfig;
  timeout_seconds?: number;
  timeoutSeconds?: number;
  auto_reconnect?: boolean;
  autoReconnect?: boolean;
}

export type SchemaNodeType = 'database' | 'schema' | 'table' | 'view';

export interface SchemaNode {
  id?: string;
  name: string;
  node_type: SchemaNodeType;
  schema_name?: string;
  schema?: string;
  children?: SchemaNode[];
  metadata?: Record<string, string>;
}

export type CellValueRust =
  | 'Null'
  | { Text: string }
  | { Integer: number }
  | { Float: number }
  | { Boolean: boolean }
  | { Json: unknown }
  | { Bytes: string };

export type CellValue =
  | null
  | string
  | number
  | boolean
  | Record<string, unknown>
  | unknown[]
  | CellValueRust;

export interface ColumnMeta {
  name: string;
  data_type: string;
  nullable: boolean;
  is_primary_key?: boolean;
  is_auto_increment?: boolean;
}

export interface QueryResult {
  columns: ColumnMeta[];
  rows: CellValue[][];
  execution_time_ms: number;
  rows_affected?: number | null;
}

export interface TableSortState {
  column: string;
  direction: 'ASC' | 'DESC';
}

export interface Tab {
  id: string;
  connectionId: string;
  type: 'query' | 'table' | 'table-list' | 'er-diagram';
  title: string;
  autoCommit: boolean;
  queryContent: string;
  schemaName?: string;
  tableName?: string;
  viewMode?: 'data' | 'structure';
  filterState?: TableFilterState;
  sortState?: TableSortState;
  columnWidths?: Record<string, number>;
}

export interface ERColumn {
  name: string;
  dataType: string;
  isPrimaryKey: boolean;
  isNullable: boolean;
}

export interface ERTable {
  id: string;
  name: string;
  schema?: string;
  columns: ERColumn[];
  x: number;
  y: number;
  isCollapsed?: boolean;
}

export interface ERRelationship {
  id: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  constraintName?: string;
  onUpdate?: string;
  onDelete?: string;
}

export interface ERDiagramData {
  tables: ERTable[];
  relationships: ERRelationship[];
}

export type FilterOperator =
  | '='
  | '!='
  | '>'
  | '<'
  | '>='
  | '<='
  | 'LIKE'
  | 'NOT LIKE'
  | 'IS NULL'
  | 'IS NOT NULL';

export interface FilterCondition {
  id: string;
  column: string;
  operator: FilterOperator;
  value: string;
}

export interface TableFilterState {
  enabled: boolean;
  conjunction: 'AND' | 'OR';
  conditions: FilterCondition[];
}

export function formatCellValue(val: CellValue): string {
  if (val === null || val === undefined || val === 'Null') {
    return 'NULL';
  }
  if (typeof val === 'object') {
    if (Array.isArray(val)) {
      return JSON.stringify(val);
    }
    const record = val as Record<string, unknown>;
    if (typeof record.Text === 'string') return record.Text;
    if (typeof record.Integer === 'number') return String(record.Integer);
    if (typeof record.Float === 'number') return String(record.Float);
    if (typeof record.Real === 'number') return String(record.Real);
    if (typeof record.Boolean === 'boolean') return String(record.Boolean);
    if ('Json' in record) return JSON.stringify(record.Json);
    if (typeof record.Bytes === 'string') return `[Binary: ${record.Bytes.length} bytes]`;
    return JSON.stringify(val);
  }
  return String(val);
}
