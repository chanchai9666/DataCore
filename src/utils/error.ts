/**
 * Safely extracts a clean, human-readable error message from arbitrary error objects,
 * including raw strings, Error instances, and structured Tauri IPC backend rejection objects ({ code, message }).
 */
export function formatTauriError(error: unknown): string {
  if (typeof error === 'string') {
    return error.trim();
  }
  if (error instanceof Error) {
    return error.message.trim();
  }
  if (typeof error === 'object' && error !== null) {
    if ('message' in error && typeof (error as { message: unknown }).message === 'string') {
      return (error as { message: string }).message.trim();
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error).trim();
}
