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
}

export interface ImportOptions {
  file_path: string;
  format: TransferFormat;
  delimiter?: string;
  has_headers: boolean;
  column_mappings: ColumnMapping[];
  error_policy: ImportErrorPolicy;
  batch_size?: number;
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
