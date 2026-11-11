import { confirm as tauriConfirm, open as tauriOpen } from '@tauri-apps/plugin-dialog';

export interface ConfirmDialogOptions {
  title?: string;
  kind?: 'info' | 'warning' | 'error';
  okLabel?: string;
  cancelLabel?: string;
}

/**
 * Shows a native file picker dialog to select a SQLite database file (.db, .sqlite, etc.).
 * Returns the selected absolute file path, or null if cancelled.
 */
export async function pickSqliteDatabaseFile(): Promise<string | null> {
  try {
    const selected = await tauriOpen({
      multiple: false,
      directory: false,
      title: 'Select SQLite Database',
      filters: [
        {
          name: 'SQLite Database (*.db, *.sqlite, *.sqlite3)',
          extensions: ['db', 'sqlite', 'sqlite3', 'db3', 's3db', 'sl3'],
        },
        {
          name: 'All Files (*.*)',
          extensions: ['*'],
        },
      ],
    });
    if (!selected) return null;
    return Array.isArray(selected) ? selected[0] : selected;
  } catch (err) {
    console.error('Failed to open SQLite file picker', err);
    return null;
  }
}

/**
 * Shows a native confirmation dialog in Tauri desktop app.
 * Awaits user input and returns true for OK, false for Cancel.
 * Falls back to window.confirm for web/test environments.
 */
export async function showConfirmDialog(
  message: string,
  options?: ConfirmDialogOptions
): Promise<boolean> {
  try {
    return await tauriConfirm(message, {
      title: options?.title || 'DataCore',
      kind: options?.kind || 'warning',
      okLabel: options?.okLabel,
      cancelLabel: options?.cancelLabel,
    });
  } catch {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const res: unknown = window.confirm(message);
      return res instanceof Promise ? await res : Boolean(res);
    }
    return false;
  }
}
