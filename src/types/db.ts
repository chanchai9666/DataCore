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
  environment?: 'development' | 'staging' | 'production' | string;
  read_only?: boolean;
  readOnly?: boolean;
}

export type ConnectionEnvironment = 'development' | 'staging' | 'production';

export type SchemaNodeType =
  | 'database'
  | 'schema'
  | 'table'
  | 'view'
  | 'column'
  | 'index'
  | 'foreign_key'
  | 'foreignkey'
  | 'trigger'
  | 'function'
  | 'procedure';

export interface SchemaNode {
  id?: string;
  name: string;
  node_type: SchemaNodeType;
  schema?: string;
  schema_name?: string;
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

export interface ImpactSimulationResult {
  is_mutation: boolean;
  table_name?: string | null;
  affected_rows: number;
  execution_time_ms: number;
  preview_warning?: string | null;
  isMutation?: boolean;
  tableName?: string | null;
  affectedRows?: number;
  executionTimeMs?: number;
  previewWarning?: string | null;
}

export interface TableSortState {
  column: string;
  direction: 'ASC' | 'DESC';
}

export interface Tab {
  id: string;
  connectionId: string;
  type: 'query' | 'table' | 'table-list' | 'er-diagram' | 'query-builder';
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

export { formatCellValue } from '../utils/cellFormatter';
