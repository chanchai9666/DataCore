import { dbApi } from '../api/db';
import type { ImpactSimulationResult } from '../types/db';

/**
 * Checks if the given SQL statement is a mutation (DELETE or UPDATE).
 */
export function isMutationQuery(sql: string): boolean {
  if (!sql) return false;
  const cleaned = stripComments(sql).trim();
  const upper = cleaned.toUpperCase();
  return upper.startsWith('DELETE') || upper.startsWith('UPDATE');
}

/**
 * Strips line comments (--) and block comments (/* *\/) from SQL string.
 */
export function stripComments(sql: string): string {
  let result = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextChar = sql[i + 1];

    if (!inSingleQuote && !inDoubleQuote) {
      if (char === '-' && nextChar === '-') {
        // Skip until newline
        while (i < sql.length && sql[i] !== '\n') {
          i++;
        }
        result += '\n';
        continue;
      }
      if (char === '/' && nextChar === '*') {
        // Skip until */
        i += 2;
        while (i < sql.length - 1 && !(sql[i] === '*' && sql[i + 1] === '/')) {
          i++;
        }
        i++; // skip /
        continue;
      }
      if (char === "'") inSingleQuote = true;
      else if (char === '"') inDoubleQuote = true;
    } else if (inSingleQuote && char === "'") {
      inSingleQuote = false;
    } else if (inDoubleQuote && char === '"') {
      inDoubleQuote = false;
    }

    result += char;
  }

  return result;
}

/**
 * Checks if a WHERE clause exists outside of quoted string literals.
 */
export function hasWhereClause(sql: string): boolean {
  const cleaned = stripComments(sql);
  let inQuote = false;
  let quoteChar = '';
  let currentToken = '';
  const tokens: string[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (inQuote) {
      if (char === quoteChar) {
        inQuote = false;
      }
    } else if (char === "'" || char === '"' || char === '`') {
      inQuote = true;
      quoteChar = char;
      if (currentToken) {
        tokens.push(currentToken);
        currentToken = '';
      }
    } else if (/[a-zA-Z0-9_]/.test(char)) {
      currentToken += char;
    } else {
      if (currentToken) {
        tokens.push(currentToken);
        currentToken = '';
      }
    }
  }
  if (currentToken) {
    tokens.push(currentToken);
  }

  return tokens.some((token) => token.toUpperCase() === 'WHERE');
}

/**
 * Extracts target table name from a DELETE or UPDATE query.
 */
export function extractTableName(sql: string): string | null {
  const cleaned = stripComments(sql).trim();
  const upper = cleaned.toUpperCase();

  let target = '';
  if (upper.startsWith('DELETE')) {
    const afterDelete = cleaned.substring('DELETE'.length).trim();
    const afterUpper = afterDelete.toUpperCase();
    target = afterUpper.startsWith('FROM')
      ? afterDelete.substring('FROM'.length).trim()
      : afterDelete;
  } else if (upper.startsWith('UPDATE')) {
    const afterUpdate = cleaned.substring('UPDATE'.length).trim();
    const afterUpper = afterUpdate.toUpperCase();
    target = afterUpper.startsWith('ONLY')
      ? afterUpdate.substring('ONLY'.length).trim()
      : afterUpdate;
  } else {
    return null;
  }

  const firstToken = target.split(/\s+/)[0]?.replace(/[;,]$/, '') || '';
  const clean = firstToken.replace(/^[`"']+|[`"']+$/g, '');
  return clean || null;
}

export type RiskLevel = 'safe' | 'low' | 'high' | 'critical';

/**
 * Evaluates the risk level of the query impact.
 */
export function calculateRiskLevel(
  affectedRows: number,
  hasWhere: boolean,
  isMutation: boolean
): RiskLevel {
  if (!isMutation) return 'safe';
  if (!hasWhere) return 'critical';
  if (affectedRows > 100) return 'high';
  if (affectedRows > 0) return 'low';
  return 'safe';
}

/**
 * Formats a number with thousands separators (e.g. 1,420).
 */
export function formatAffectedRows(count: number): string {
  return new Intl.NumberFormat().format(count);
}

/**
 * Wrapper to simulate query impact on backend.
 */
export async function simulateImpact(
  connectionId: string,
  sql: string
): Promise<ImpactSimulationResult> {
  return dbApi.simulateQueryImpact(connectionId, sql);
}
