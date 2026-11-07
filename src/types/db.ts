export type DatabaseDriver = 'sqlite' | 'postgres' | 'mysql';

export interface ConnectionConfig {
  id: string;
  name: string;
  driver: DatabaseDriver;
  host?: string;
  port?: number;
  database: string;
  user?: string;
  folder?: string;
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

export interface Tab {
  id: string;
  connectionId: string;
  type: 'query' | 'table';
  title: string;
  autoCommit: boolean;
  queryContent: string;
  schemaName?: string;
  tableName?: string;
  viewMode?: 'data' | 'structure';
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
    if (typeof record.Boolean === 'boolean') return String(record.Boolean);
    if ('Json' in record) return JSON.stringify(record.Json);
    if (typeof record.Bytes === 'string') return `[Binary: ${record.Bytes.length} bytes]`;
    return JSON.stringify(val);
  }
  return String(val);
}
