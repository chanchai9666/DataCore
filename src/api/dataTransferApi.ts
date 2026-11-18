import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
import type {
  ExportOptions,
  ExportResult,
  ImportOptions,
  ImportPreview,
  ImportResult,
  TransferFormat,
  TransferProgress,
} from '../types/dataTransfer';

export const previewImportFile = async (
  filePath: string,
  delimiter?: string
): Promise<ImportPreview> => {
  return invoke<ImportPreview>('preview_import_file', {
    filePath,
    file_path: filePath,
    delimiter: delimiter || null,
  });
};

export const saveTextFile = async (
  filePath: string,
  content: string
): Promise<void> => {
  return invoke<void>('save_text_file', {
    filePath,
    file_path: filePath,
    content,
  });
};

export const exportData = async (
  connectionId: string,
  sql: string,
  filePath: string,
  options: ExportOptions
): Promise<ExportResult> => {
  return invoke<ExportResult>('export_data', {
    connectionId,
    connection_id: connectionId,
    sql,
    filePath,
    file_path: filePath,
    options,
  });
};

export const importData = async (
  connectionId: string,
  table: string,
  options: ImportOptions
): Promise<ImportResult> => {
  return invoke<ImportResult>('import_data', {
    connectionId,
    connection_id: connectionId,
    table,
    options,
  });
};

export const pickImportFile = async (): Promise<string | null> => {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [
      {
        name: 'Supported Data Files (*.csv, *.json, *.ndjson, *.gz, *.zst)',
        extensions: ['csv', 'json', 'ndjson', 'jsonl', 'txt', 'gz', 'gzip', 'zst', 'zstd'],
      },
      {
        name: 'CSV Files (*.csv)',
        extensions: ['csv', 'txt'],
      },
      {
        name: 'JSON Files (*.json, *.ndjson)',
        extensions: ['json', 'ndjson', 'jsonl'],
      },
      {
        name: 'All Files (*.*)',
        extensions: ['*'],
      },
    ],
  });

  if (!selected) return null;
  return Array.isArray(selected) ? selected[0] : selected;
};

export type ExportCompression = 'none' | 'gzip' | 'zstd';

export const pickExportFile = async (
  defaultName: string,
  format: TransferFormat,
  compression: ExportCompression = 'none'
): Promise<string | null> => {
  const baseExt = format === 'csv' ? 'csv' : 'json';
  const compExt = compression === 'gzip' ? '.gz' : compression === 'zstd' ? '.zst' : '';
  const fullExt = `${baseExt}${compExt}`;
  const finalDefaultName = defaultName.endsWith(`.${fullExt}`) ? defaultName : `${defaultName}.${fullExt}`;

  const filters =
    compression === 'none'
      ? [
          {
            name: format === 'csv' ? 'CSV Document (*.csv)' : 'JSON Document (*.json)',
            extensions: [baseExt],
          },
          {
            name: 'All Files (*.*)',
            extensions: ['*'],
          },
        ]
      : [
          {
            name:
              compression === 'gzip'
                ? `Gzip Compressed ${format.toUpperCase()} (*.${baseExt}.gz)`
                : `Zstandard Compressed ${format.toUpperCase()} (*.${baseExt}.zst)`,
            extensions: [compression === 'gzip' ? 'gz' : 'zst'],
          },
          {
            name: 'All Files (*.*)',
            extensions: ['*'],
          },
        ];

  const selected = await save({
    defaultPath: finalDefaultName,
    filters,
  });

  return selected || null;
};

export const pickSqlImportFile = async (): Promise<string | null> => {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [
      {
        name: 'SQL Script Files (*.sql)',
        extensions: ['sql', 'txt'],
      },
      {
        name: 'All Files (*.*)',
        extensions: ['*'],
      },
    ],
  });
  if (!selected) return null;
  return Array.isArray(selected) ? selected[0] : selected;
};

export const pickSqlExportFile = async (
  defaultName: string
): Promise<string | null> => {
  const finalDefaultName = defaultName.endsWith('.sql') ? defaultName : `${defaultName}.sql`;
  const selected = await save({
    defaultPath: finalDefaultName,
    filters: [
      {
        name: 'SQL Dump File (*.sql)',
        extensions: ['sql'],
      },
      {
        name: 'All Files (*.*)',
        extensions: ['*'],
      },
    ],
  });
  return selected || null;
};

export const onTransferProgress = async (
  callback: (progress: TransferProgress) => void
): Promise<UnlistenFn> => {
  return listen<TransferProgress>('transfer://progress', (event) => {
    callback(event.payload);
  });
};

export const cancelTransfer = async (jobId: string): Promise<boolean> => {
  return invoke<boolean>('cancel_transfer', {
    jobId,
  });
};
