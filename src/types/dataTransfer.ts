export type TransferFormat = 'csv' | 'json';

export type JsonStructure = 'array' | 'ndjson';

export type ImportErrorPolicy = 'abort' | 'skip';

export interface ImportPreview {
  detected_delimiter: string;
  headers: string[];
  preview_rows: string[][];
  total_preview_rows: number;
}

export interface ExportOptions {
  format: TransferFormat;
  delimiter?: string;
  include_headers: boolean;
  json_structure?: JsonStructure;
}

export interface ExportResult {
  total_rows: number;
  file_size_bytes: number;
  elapsed_ms: number;
}

export interface ColumnMapping {
  source_column: string;
  target_column: string;
  target_type?: string;
}

export interface ImportOptions {
  file_path: string;
  format: TransferFormat;
  delimiter?: string;
  has_headers: boolean;
  column_mappings: ColumnMapping[];
  error_policy: ImportErrorPolicy;
  batch_size?: number;
  treat_empty_as_null?: boolean;
  job_id?: string;
}

export interface ImportResult {
  total_rows: number;
  imported_rows: number;
  skipped_rows: number;
  elapsed_ms: number;
}

export interface TransferProgress {
  current_row: number;
  total_rows?: number;
  status: string;
}

export interface TableMetadata {
  name: string;
  approxRowCount: number;
  dataSizeBytes: number;
  indexSizeBytes: number;
  totalSizeBytes: number;
  engine?: string;
  collation?: string;
  comment?: string;
  createdAt?: string;
}

export interface DuplicateTableOptions {
  connectionId: string;
  schema?: string;
  sourceTable: string;
  newTableName: string;
  copyData: boolean;
}

export interface SqlExportOptions {
  connectionId: string;
  schema?: string;
  tables: string[];
  filePath: string;
  includeDropTable: boolean;
  includeStructure: boolean;
  includeData: boolean;
  batchSize?: number;
}

export interface SqlImportOptions {
  connectionId: string;
  schema?: string;
  filePath: string;
  errorPolicy: 'abort' | 'continue';
  job_id?: string;
}

export interface SqlExportResult {
  totalTables: number;
  totalRows: number;
  fileSizeBytes: number;
}

export interface SqlImportResult {
  totalStatements: number;
  successfulStatements: number;
  failedStatements: number;
}

export interface CrossDbCopyTableOptions {
  sourceConnectionId: string;
  sourceSchema?: string;
  sourceTable: string;
  targetConnectionId: string;
  targetSchema?: string;
  targetTable: string;
  copyStructure: boolean;
  dropTargetIfExists: boolean;
  copyData: boolean;
  batchSize?: number;
}

export interface CrossDbCopyResult {
  rowsTransferred: number;
  elapsedMs: number;
}
