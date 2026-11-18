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
  job_id?: string;
  jobId?: string;
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
  jobId?: string;
}

export interface ImportResult {
  total_rows: number;
  imported_rows: number;
  skipped_rows: number;
  elapsed_ms: number;
}

export interface TransferProgress {
  job_id?: string;
  current_row: number;
  rows_processed?: number;
  total_rows?: number;
  bytes_written?: number;
  elapsed_ms?: number;
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
  job_id?: string;
  jobId?: string;
}

export interface SqlImportOptions {
  connectionId: string;
  schema?: string;
  filePath: string;
  errorPolicy: 'abort' | 'continue';
  job_id?: string;
  jobId?: string;
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
  job_id?: string;
  jobId?: string;
}

export interface CrossDbCopyResult {
  rowsTransferred: number;
  elapsedMs: number;
}

export interface NativeCliStatus {
  cli_name: string;
  available: boolean;
  path?: string;
  version?: string;
}

export interface NativeBackupOptions {
  connection_id: string;
  output_file: string;
  format?: 'plain' | 'custom' | 'tar' | 'directory' | string;
  schema_only?: boolean;
  data_only?: boolean;
  clean?: boolean;
  tables?: string[];
  schemas?: string[];
  compression_level?: number;
}

export interface NativeRestoreOptions {
  connection_id: string;
  input_file: string;
  clean?: boolean;
  single_transaction?: boolean;
  schema_only?: boolean;
  data_only?: boolean;
}

export interface NativeProgressEvent {
  task_id: string;
  line: string;
  is_stderr: boolean;
}
