export interface ParsedSqlError {
  originalMessage: string;
  cleanMessage: string;
  driver?: 'postgres' | 'mysql' | 'sqlite' | 'unknown';
  line?: number;       // 1-based line number
  column?: number;     // 1-based column number
  offset?: number;     // 0-based character index in sql text
  errorCode?: string;  // e.g. "42601", "1064", "SQLITE_ERROR"
  errorType: string;   // e.g. "Syntax Error", "Undefined Table", etc.
}

/**
 * Converts a 0-based character offset into 1-based line and column numbers.
 */
export function offsetToLineCol(sql: string, offset: number): { line: number; column: number } {
  if (!sql) return { line: 1, column: 1 };
  const safeOffset = Math.max(0, Math.min(offset, sql.length));
  const before = sql.slice(0, safeOffset);
  const lines = before.split('\n');
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;
  return { line, column };
}

/**
 * Converts 1-based line and column numbers into a 0-based character offset.
 */
export function lineColToOffset(sql: string, line: number, column: number): number {
  if (!sql) return 0;
  const lines = sql.split('\n');
  const safeLine = Math.max(1, Math.min(line, lines.length));
  let offset = 0;
  for (let i = 0; i < safeLine - 1; i++) {
    offset += lines[i].length + 1; // +1 for newline '\n'
  }
  const safeCol = Math.max(1, column);
  offset += Math.min(safeCol - 1, lines[safeLine - 1]?.length ?? 0);
  return Math.min(offset, sql.length);
}

/**
 * Cleans raw error messages by stripping common redundant database driver wrappers.
 */
export function cleanErrorMessage(raw: string): string {
  let cleaned = raw.trim();

  // Strip common nested wrappers repeatedly
  let prev = '';
  while (prev !== cleaned) {
    prev = cleaned;
    cleaned = cleaned
      .replace(/^Database error:\s*/i, '')
      .replace(/^error returned from database:\s*/i, '')
      .replace(/^db error:\s*/i, '')
      .replace(/^AppError::[A-Za-z]+:\s*/i, '')
      .replace(/^AppError:\s*/i, '')
      .replace(/^Error:\s*/i, '')
      .trim();
  }

  // Remove leading "ERROR: " prefix often produced by Postgres
  if (/^ERROR:\s+/i.test(cleaned)) {
    cleaned = cleaned.replace(/^ERROR:\s+/i, '');
  }

  // Remove leading Postgres 5-char SQLSTATE code e.g. "42601: syntax error"
  if (/^[0-9A-Z]{5}:\s*/i.test(cleaned)) {
    cleaned = cleaned.replace(/^[0-9A-Z]{5}:\s*/i, '');
  }

  // Remove leading MySQL "ERROR 1064 (42000): " prefix
  if (/^ERROR \d{4}(?: \([0-9A-Z]{5}\))?:\s*/i.test(cleaned)) {
    cleaned = cleaned.replace(/^ERROR \d{4}(?: \([0-9A-Z]{5}\))?:\s*/i, '');
  }

  return cleaned;
}

/**
 * Categorizes the error into a high-level error type.
 */
export function detectErrorType(message: string, errorCode?: string): string {
  const lower = message.toLowerCase();

  if (
    lower.includes('syntax error') ||
    lower.includes('you have an error in your sql syntax') ||
    errorCode === '42601' ||
    errorCode === '1064'
  ) {
    return 'Syntax Error';
  }

  if (
    lower.includes('does not exist') && (lower.includes('relation') || lower.includes('table')) ||
    lower.includes("doesn't exist") && lower.includes('table') ||
    lower.includes('no such table') ||
    errorCode === '42P01' ||
    errorCode === '1146'
  ) {
    return 'Undefined Table';
  }

  if (
    (lower.includes('does not exist') && lower.includes('column')) ||
    lower.includes('unknown column') ||
    lower.includes('no such column') ||
    lower.includes('has no column named') ||
    errorCode === '42703' ||
    errorCode === '1054'
  ) {
    return 'Undefined Column';
  }

  if (
    lower.includes('unique constraint') ||
    lower.includes('foreign key constraint') ||
    lower.includes('duplicate entry') ||
    lower.includes('constraint failed') ||
    errorCode === '23505' ||
    errorCode === '1062'
  ) {
    return 'Constraint Violation';
  }

  if (
    lower.includes('permission denied') ||
    lower.includes('access denied') ||
    errorCode === '42501' ||
    errorCode === '1045'
  ) {
    return 'Permission Denied';
  }

  if (
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('connection reset') ||
    lower.includes('connection closed')
  ) {
    return 'Connection Error';
  }

  if (lower.includes('incomplete input') || lower.includes('unexpected end')) {
    return 'Incomplete Input';
  }

  if (errorCode) {
    return `Database Error (${errorCode})`;
  }

  return 'Database Error';
}

/**
 * Parses database error messages across PostgreSQL, MySQL, and SQLite.
 *
 * @param rawError - The raw error message string or Error object
 * @param sqlText - The SQL query text that produced the error (optional, enables exact line/col calculation)
 * @param driverHint - The database driver name ('postgres' | 'mysql' | 'sqlite' | 'unknown')
 */
export function parseSqlError(
  rawError: unknown,
  sqlText: string = '',
  driverHint?: string
): ParsedSqlError {
  const originalMessage = rawError instanceof Error
    ? rawError.message
    : typeof rawError === 'string'
      ? rawError
      : String(rawError ?? '');

  const cleanMessage = cleanErrorMessage(originalMessage);

  // Normalize driver
  let driver: 'postgres' | 'mysql' | 'sqlite' | 'unknown' = 'unknown';
  const hintLower = driverHint?.toLowerCase() ?? '';
  if (hintLower.includes('postgres') || hintLower.includes('pg')) {
    driver = 'postgres';
  } else if (hintLower.includes('mysql') || hintLower.includes('mariadb')) {
    driver = 'mysql';
  } else if (hintLower.includes('sqlite')) {
    driver = 'sqlite';
  }

  let line: number | undefined;
  let column: number | undefined;
  let offset: number | undefined;
  let errorCode: string | undefined;

  // 1. PostgreSQL Pattern Detection
  // Example: "ERROR: syntax error at or near "FROMM" at character 19"
  // Example: "ERROR: 42601: syntax error at or near..."
  // Example: "LINE 2: SELECT * FROMM users\n               ^"
  const pgCharMatch = originalMessage.match(/at character (\d+)/i);
  const pgLineMatch = originalMessage.match(/LINE (\d+):/i);
  const pgCodeMatch = originalMessage.match(/(?:ERROR|code):\s*(?!ERROR\b)([0-9A-Z]{5})\b/i);

  if (pgCodeMatch) {
    errorCode = pgCodeMatch[1];
    if (driver === 'unknown') driver = 'postgres';
  }

  if (pgCharMatch) {
    if (driver === 'unknown') driver = 'postgres';
    const charPos = parseInt(pgCharMatch[1], 10);
    // PostgreSQL character is 1-based index
    offset = Math.max(0, charPos - 1);
    if (sqlText) {
      const loc = offsetToLineCol(sqlText, offset);
      line = loc.line;
      column = loc.column;
    }
  }

  if (pgLineMatch) {
    if (driver === 'unknown') driver = 'postgres';
    const parsedLine = parseInt(pgLineMatch[1], 10);
    if (!line) line = parsedLine;

    // Check for caret line: "\n LINE 2: ...\n           ^"
    const caretMatch = originalMessage.match(/LINE \d+:[^\n]*\n([ \t]*)\^/);
    if (caretMatch && !column) {
      const spaces = caretMatch[1];
      // Caret position relative to start of line content
      const col = spaces.length + 1;
      column = Math.max(1, col);
      if (sqlText && line) {
        offset = lineColToOffset(sqlText, line, column);
      }
    }
  }

  // 2. MySQL Pattern Detection
  // Example: "ERROR 1064 (42000): You have an error in your SQL syntax... near 'FORM users' at line 2"
  // Example: "Unknown column 'col' in 'field list' at line 1"
  const mysqlCodeMatch = originalMessage.match(/ERROR (\d{4})(?: \(([0-9A-Z]{5})\))?/i);
  const mysqlLineMatch = originalMessage.match(/at line (\d+)/i);
  const mysqlNearMatch = originalMessage.match(/near '([^']*)'/i);

  if (mysqlCodeMatch) {
    errorCode = mysqlCodeMatch[1];
    if (driver === 'unknown') driver = 'mysql';
  }

  if (mysqlLineMatch) {
    if (driver === 'unknown') driver = 'mysql';
    line = parseInt(mysqlLineMatch[1], 10);

    // If we have near token and sqlText, try to pinpoint column & offset
    if (sqlText && line) {
      const lines = sqlText.split('\n');
      const targetLine = lines[line - 1] ?? '';
      if (mysqlNearMatch && mysqlNearMatch[1]) {
        const token = mysqlNearMatch[1];
        const tokenIndex = targetLine.indexOf(token);
        if (tokenIndex !== -1) {
          column = tokenIndex + 1;
          offset = lineColToOffset(sqlText, line, column);
        }
      }
      if (!offset) {
        offset = lineColToOffset(sqlText, line, column ?? 1);
      }
    }
  }

  // 3. SQLite Pattern Detection
  // Example: "near "FROMM": syntax error at offset 15"
  // Example: "incomplete input at offset 10"
  // Example: "near "xyz": syntax error"
  const sqliteOffsetMatch = originalMessage.match(/at offset (\d+)/i);
  const sqliteNearMatch = originalMessage.match(/near ["']([^"']+)["']:\s*syntax error/i);

  if (sqliteOffsetMatch) {
    if (driver === 'unknown') driver = 'sqlite';
    offset = parseInt(sqliteOffsetMatch[1], 10);
    if (sqlText) {
      const loc = offsetToLineCol(sqlText, offset);
      line = loc.line;
      column = loc.column;
    }
  } else if (sqliteNearMatch) {
    if (driver === 'unknown') driver = 'sqlite';
    if (!errorCode) errorCode = 'SQLITE_ERROR';
    const token = sqliteNearMatch[1];
    if (sqlText) {
      const tokenIdx = sqlText.indexOf(token);
      if (tokenIdx !== -1) {
        offset = tokenIdx;
        const loc = offsetToLineCol(sqlText, offset);
        line = loc.line;
        column = loc.column;
      }
    }
  }

  // 4. Generic Fallback Parsing
  if (line === undefined) {
    const genericLineMatch = originalMessage.match(/\bline\s*[:#]?\s*(\d+)\b/i);
    if (genericLineMatch) {
      line = parseInt(genericLineMatch[1], 10);
    }
  }

  if (column === undefined) {
    const genericColMatch = originalMessage.match(/\bcol(?:umn)?\s*[:#]?\s*(\d+)\b/i);
    if (genericColMatch) {
      column = parseInt(genericColMatch[1], 10);
    }
  }

  if (line !== undefined && offset === undefined && sqlText) {
    offset = lineColToOffset(sqlText, line, column ?? 1);
  }

  // Detect high-level error type
  const errorType = detectErrorType(cleanMessage, errorCode);

  return {
    originalMessage,
    cleanMessage,
    driver,
    line,
    column,
    offset,
    errorCode,
    errorType,
  };
}
