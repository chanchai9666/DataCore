export const REDACTED_PASSWORD_PLACEHOLDER = '***REDACTED***';

/**
 * Redacts sensitive credentials (passwords, encryption keys) from SQL query strings
 * before storing them in query history or audit logs.
 *
 * Handles:
 * - IDENTIFIED BY '...' (MySQL, Oracle, etc.)
 * - PASSWORD '...' / PASSWORD = '...' (Postgres, MySQL, etc.)
 * - PRAGMA key = '...' / PRAGMA rekey = '...' (SQLite / SQLCipher)
 * - Multi-line statements and case-insensitive keywords
 */
export function redactSensitiveSql(sql: string): string {
  if (!sql || typeof sql !== 'string') {
    return (sql as unknown as string) ?? '';
  }

  let sanitized = sql;

  // 1. Redact: IDENTIFIED [WITH <plugin>] BY [PASSWORD] '...'
  // Handles single or double quotes, and multi-line whitespace.
  sanitized = sanitized.replace(
    /\b(IDENTIFIED(?:\s+WITH\s+[a-zA-Z0-9_]+)?\s+BY(?:\s+PASSWORD)?\s+)(['"])((?:\\.|''|""|(?!\2).)*)\2/gi,
    `$1'${REDACTED_PASSWORD_PLACEHOLDER}'`
  );

  // 2. Redact: PASSWORD '...' or PASSWORD = '...' or SET PASSWORD FOR ... = '...'
  // Covers Postgres: CREATE/ALTER USER/ROLE ... [WITH] [ENCRYPTED] PASSWORD '...'
  // Covers MySQL: SET PASSWORD [FOR ...] = '...'
  sanitized = sanitized.replace(
    /\b(PASSWORD(?:\s+FOR\s+(?:'[^']*'|"[^"]*"|[^\s=]+))?\s*(?:=\s*)?)(['"])((?:\\.|''|""|(?!\2).)*)\2/gi,
    `$1'${REDACTED_PASSWORD_PLACEHOLDER}'`
  );

  // 3. Redact: PASSWORD('...') function calls
  sanitized = sanitized.replace(
    /\b(PASSWORD\s*\(\s*)(['"])((?:\\.|''|""|(?!\2).)*)\2(\s*\))/gi,
    `$1'${REDACTED_PASSWORD_PLACEHOLDER}'$4`
  );

  // 4. Redact: PRAGMA key = '...' or PRAGMA rekey = '...' (SQLite SQLCipher)
  // Also normalizes spacing around '=' to ' = '
  sanitized = sanitized.replace(
    /\b(PRAGMA\s+(?:key|rekey|hexkey|hexrekey)\s*=\s*)(['"])((?:\\.|''|""|(?!\2).)*)\2/gi,
    (_match, prefix) => {
      const normalizedPrefix = prefix.replace(/\s*=\s*$/, ' = ');
      return `${normalizedPrefix}'${REDACTED_PASSWORD_PLACEHOLDER}'`;
    }
  );

  // 5. Redact: PRAGMA key('...') or PRAGMA rekey('...') function notation
  sanitized = sanitized.replace(
    /\b(PRAGMA\s+(?:key|rekey|hexkey|hexrekey)\s*\(\s*)(['"])((?:\\.|''|""|(?!\2).)*)\2(\s*\))/gi,
    `$1'${REDACTED_PASSWORD_PLACEHOLDER}'$4`
  );

  return sanitized;
}
