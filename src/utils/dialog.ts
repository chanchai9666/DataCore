import { confirm as tauriConfirm } from '@tauri-apps/plugin-dialog';

export interface ConfirmDialogOptions {
  title?: string;
  kind?: 'info' | 'warning' | 'error';
  okLabel?: string;
  cancelLabel?: string;
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
