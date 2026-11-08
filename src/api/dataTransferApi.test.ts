import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as core from '@tauri-apps/api/core';
import * as event from '@tauri-apps/api/event';
import * as dialog from '@tauri-apps/plugin-dialog';
import {
  previewImportFile,
  exportData,
  importData,
  pickImportFile,
  pickExportFile,
  onTransferProgress,
} from './dataTransferApi';
import type { ExportOptions, ImportOptions } from '../types/dataTransfer';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

describe('dataTransferApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls invoke for previewImportFile', async () => {
    const mockPreview = {
      detected_delimiter: ',',
      headers: ['id', 'name'],
      preview_rows: [['1', 'Alice']],
      total_preview_rows: 1,
    };
    vi.mocked(core.invoke).mockResolvedValueOnce(mockPreview);

    const result = await previewImportFile('/path/to/data.csv', ',');
    expect(core.invoke).toHaveBeenCalledWith('preview_import_file', {
      filePath: '/path/to/data.csv',
      file_path: '/path/to/data.csv',
      delimiter: ',',
    });
    expect(result).toEqual(mockPreview);
  });

  it('calls invoke for exportData', async () => {
    const mockExportResult = {
      total_rows: 100,
      file_size_bytes: 2048,
      elapsed_ms: 45,
    };
    vi.mocked(core.invoke).mockResolvedValueOnce(mockExportResult);

    const options: ExportOptions = {
      format: 'csv',
      delimiter: ',',
      include_headers: true,
    };

    const result = await exportData('conn-1', 'SELECT * FROM users', '/path/to/export.csv', options);
    expect(core.invoke).toHaveBeenCalledWith('export_data', {
      connectionId: 'conn-1',
      connection_id: 'conn-1',
      sql: 'SELECT * FROM users',
      filePath: '/path/to/export.csv',
      file_path: '/path/to/export.csv',
      options,
    });
    expect(result).toEqual(mockExportResult);
  });

  it('calls invoke for importData', async () => {
    const mockImportResult = {
      total_rows: 50,
      imported_rows: 48,
      skipped_rows: 2,
      elapsed_ms: 120,
    };
    vi.mocked(core.invoke).mockResolvedValueOnce(mockImportResult);

    const options: ImportOptions = {
      file_path: '/path/to/data.csv',
      format: 'csv',
      has_headers: true,
      column_mappings: [{ source_column: 'name', target_column: 'full_name' }],
      error_policy: 'skip',
    };

    const result = await importData('conn-1', 'users', options);
    expect(core.invoke).toHaveBeenCalledWith('import_data', {
      connectionId: 'conn-1',
      connection_id: 'conn-1',
      table: 'users',
      options,
    });
    expect(result).toEqual(mockImportResult);
  });

  it('pickImportFile handles dialog selection', async () => {
    vi.mocked(dialog.open).mockResolvedValueOnce('/selected/file.csv');
    const path = await pickImportFile();
    expect(path).toBe('/selected/file.csv');

    vi.mocked(dialog.open).mockResolvedValueOnce(['/selected/file.csv']);
    const arrPath = await pickImportFile();
    expect(arrPath).toBe('/selected/file.csv');

    vi.mocked(dialog.open).mockResolvedValueOnce(null);
    const cancelPath = await pickImportFile();
    expect(cancelPath).toBeNull();
  });

  it('pickExportFile appends extension when missing', async () => {
    vi.mocked(dialog.save).mockResolvedValueOnce('/saved/users.csv');
    const res = await pickExportFile('users', 'csv');
    expect(dialog.save).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: 'users.csv',
      })
    );
    expect(res).toBe('/saved/users.csv');
  });

  it('onTransferProgress subscribes to transfer://progress event', async () => {
    const unlisten = vi.fn();
    vi.mocked(event.listen).mockResolvedValueOnce(unlisten as any);

    const cb = vi.fn();
    const resultUnlisten = await onTransferProgress(cb);
    expect(event.listen).toHaveBeenCalledWith('transfer://progress', expect.any(Function));
    expect(resultUnlisten).toBe(unlisten);
  });
});
