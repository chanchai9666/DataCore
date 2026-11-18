import type { DatabaseDriver } from '../types/db';

export type SafeLimitOption = 1000 | 5000 | 10000 | 'none';

interface ScanResult {
  firstKeyword: string | null;
  hasOuterLimit: boolean;
  lastSemicolonIdx: number | null;
  endsWithLineComment: boolean;
}

/**
 * Scans SQL outside of string literals, quoted identifiers, comments, and parenthesized subqueries
 * to inspect top-level keywords, LIMIT presence, trailing semicolons, and trailing line comments.
 */
function scanTopLevelSql(sql: string): ScanResult {
  let depth = 0;
  let i = 0;
  const len = sql.length;
  let firstKeyword: string | null = null;
  const outerTokens: string[] = [];
  let lastSemicolonIdx: number | null = null;
  let lastSignificantKind: 'code' | 'line_comment' | 'block_comment' | null = null;

  while (i < len) {
    const ch = sql[i];
    const next = i + 1 < len ? sql[i + 1] : '';

    // Whitespace
    if (/\s/.test(ch)) {
      if (ch === '\n' && lastSignificantKind === 'line_comment') {
        lastSignificantKind = 'code';
      }
      i++;
      continue;
    }

    // Single-line comment: -- ...
    if (ch === '-' && next === '-') {
      i += 2;
      while (i < len && sql[i] !== '\n') {
        i++;
      }
      lastSignificantKind = i < len && sql[i] === '\n' ? 'code' : 'line_comment';
      if (i < len && sql[i] === '\n') i++;
      continue;
    }

    // Block comment: /* ... */
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < len && !(sql[i] === '*' && sql[i + 1] === '/')) {
        i++;
      }
      i = Math.min(i + 2, len);
      lastSignificantKind = 'block_comment';
      continue;
    }

    // Single-quoted string literal
    if (ch === "'") {
      lastSignificantKind = 'code';
      i++;
      while (i < len) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (sql[i] === '\\' && i + 1 < len) {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Double-quoted or backtick-quoted identifier
    if (ch === '"' || ch === '`') {
      lastSignificantKind = 'code';
      const quote = ch;
      i++;
      while (i < len) {
        if (sql[i] === quote && sql[i + 1] === quote) {
          i += 2;
          continue;
        }
        if (sql[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Parentheses
    if (ch === '(') {
      lastSignificantKind = 'code';
      depth++;
      i++;
      continue;
    }
    if (ch === ')') {
      lastSignificantKind = 'code';
      if (depth > 0) depth--;
      i++;
      continue;
    }

    // Semicolon at top level
    if (ch === ';' && depth === 0) {
      lastSignificantKind = 'code';
      lastSemicolonIdx = i;
      i++;
      continue;
    }

    // Identifier / keyword / number token
    if (/[A-Za-z0-9_$]/.test(ch)) {
      lastSignificantKind = 'code';
      const start = i;
      while (i < len && /[A-Za-z0-9_$]/.test(sql[i])) {
        i++;
      }
      if (depth === 0) {
        const token = sql.slice(start, i);
        if (firstKeyword === null) {
          firstKeyword = token.toUpperCase();
        }
        outerTokens.push(token.toUpperCase());
      }
      continue;
    }

    lastSignificantKind = 'code';
    i++;
  }

  let hasOuterLimit = false;
  for (let t = 0; t < outerTokens.length - 1; t++) {
    if (outerTokens[t] === 'LIMIT' && /^\d+$/.test(outerTokens[t + 1])) {
      hasOuterLimit = true;
      break;
    }
  }

  return {
    firstKeyword,
    hasOuterLimit,
    lastSemicolonIdx,
    endsWithLineComment: lastSignificantKind === 'line_comment',
  };
}

/**
 * Checks if the SQL statement is a SELECT query that doesn't already specify a LIMIT clause.
 * If so, appends a LIMIT clause to prevent memory exhaustion.
 * Driver-aware: skips LIMIT injection on MSSQL (which uses TOP / backend hard cap instead).
 */
export function applySafeLimit(
  sql: string,
  limit: SafeLimitOption,
  driver?: DatabaseDriver
): { modifiedSql: string; isLimited: boolean } {
  if (limit === 'none' || driver === 'mssql') {
    return { modifiedSql: sql, isLimited: false };
  }

  const trimmed = sql.trim();
  if (!trimmed) {
    return { modifiedSql: sql, isLimited: false };
  }

  const scan = scanTopLevelSql(trimmed);

  if (scan.firstKeyword !== 'SELECT' && scan.firstKeyword !== 'WITH') {
    return { modifiedSql: sql, isLimited: false };
  }

  if (scan.hasOuterLimit) {
    return { modifiedSql: sql, isLimited: false };
  }

  if (scan.lastSemicolonIdx !== null) {
    const before = trimmed.slice(0, scan.lastSemicolonIdx).replace(/\s+$/, '');
    const after = trimmed.slice(scan.lastSemicolonIdx);
    return {
      modifiedSql: `${before} LIMIT ${limit}${after}`,
      isLimited: true,
    };
  }

  if (scan.endsWithLineComment) {
    return {
      modifiedSql: `${trimmed}\nLIMIT ${limit};`,
      isLimited: true,
    };
  }

  return {
    modifiedSql: `${trimmed} LIMIT ${limit};`,
    isLimited: true,
  };
}
