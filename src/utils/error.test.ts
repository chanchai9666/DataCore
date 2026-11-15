import { describe, it, expect } from 'vitest';
import { formatTauriError } from './error';

describe('formatTauriError', () => {
  it('extracts raw string errors correctly and trims whitespace', () => {
    expect(formatTauriError('  connection refused  ')).toBe('connection refused');
  });

  it('extracts message from standard Error instances', () => {
    expect(formatTauriError(new Error('Syntax error at line 1'))).toBe('Syntax error at line 1');
  });

  it('extracts message from structured Tauri IPC error objects', () => {
    expect(formatTauriError({ code: 'AUTH_FAILED', message: 'FATAL: password authentication failed' })).toBe(
      'FATAL: password authentication failed'
    );
  });

  it('handles arbitrary objects without message property via JSON.stringify', () => {
    expect(formatTauriError({ code: 500 })).toBe('{"code":500}');
  });

  it('handles primitive values like numbers or null/undefined gracefully', () => {
    expect(formatTauriError(404)).toBe('404');
    expect(formatTauriError(null)).toBe('null');
    expect(formatTauriError(undefined)).toBe('undefined');
  });
});
