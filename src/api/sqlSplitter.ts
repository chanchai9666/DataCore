/**
 * Splits multiple SQL statements while respecting:
 * - Single quotes ('...') with '' and \' escaping
 * - Double quotes ("...") with "" and \" escaping
 * - Backtick quotes (`...`) with `` escaping
 * - PostgreSQL dollar-quoted strings ($$ ... $$ and $tag$ ... $tag$)
 * - Single-line comments (-- ...)
 * - Nested block comments (/* ... /* ... *\/ ... *\/)
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let dollarTag: string | null = null;
  let inLineComment = false;
  let blockCommentDepth = 0;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const next = sql[i + 1];

    // 1. Single-line comment (-- ...)
    if (inLineComment) {
      current += char;
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    // 2. Block comment (/* ... */, supporting nested depth)
    if (blockCommentDepth > 0) {
      if (char === '/' && next === '*') {
        blockCommentDepth++;
        current += '/*';
        i++;
        continue;
      }
      if (char === '*' && next === '/') {
        blockCommentDepth--;
        current += '*/';
        i++;
        continue;
      }
      current += char;
      continue;
    }

    // 3. PostgreSQL dollar-quoted strings ($$ ... $$ or $tag$ ... $tag$)
    if (dollarTag !== null) {
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length - 1;
        dollarTag = null;
        continue;
      }
      current += char;
      continue;
    }

    // 4. Single-quoted string ('...')
    if (inSingleQuote) {
      current += char;
      if (char === '\\' && next !== undefined) {
        current += next;
        i++;
        continue;
      }
      if (char === "'") {
        if (next === "'") {
          current += "'";
          i++;
        } else {
          inSingleQuote = false;
        }
      }
      continue;
    }

    // 5. Double-quoted identifier ("...")
    if (inDoubleQuote) {
      current += char;
      if (char === '\\' && next !== undefined) {
        current += next;
        i++;
        continue;
      }
      if (char === '"') {
        if (next === '"') {
          current += '"';
          i++;
        } else {
          inDoubleQuote = false;
        }
      }
      continue;
    }

    // 6. Backtick identifier (`...`)
    if (inBacktick) {
      current += char;
      if (char === '\\' && next !== undefined) {
        current += next;
        i++;
        continue;
      }
      if (char === '`') {
        if (next === '`') {
          current += '`';
          i++;
        } else {
          inBacktick = false;
        }
      }
      continue;
    }

    // 7. Check for start of comments
    if (char === '-' && next === '-') {
      inLineComment = true;
      current += '--';
      i++;
      continue;
    }

    if (char === '/' && next === '*') {
      blockCommentDepth = 1;
      current += '/*';
      i++;
      continue;
    }

    // 8. Check for start of PostgreSQL dollar-quoted strings
    if (char === '$') {
      const match = sql.slice(i).match(/^\$([A-Za-z0-9_]*)\$/);
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        i += dollarTag.length - 1;
        continue;
      }
    }

    // 9. Check for start of quotes
    if (char === "'") {
      inSingleQuote = true;
      current += char;
      continue;
    }
    if (char === '"') {
      inDoubleQuote = true;
      current += char;
      continue;
    }
    if (char === '`') {
      inBacktick = true;
      current += char;
      continue;
    }

    // 10. Statement delimiter
    if (char === ';') {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      current = '';
      continue;
    }

    current += char;
  }

  const trimmed = current.trim();
  if (trimmed.length > 0) {
    statements.push(trimmed);
  }

  return statements;
}
