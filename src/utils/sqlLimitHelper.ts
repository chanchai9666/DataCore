export type SafeLimitOption = 1000 | 5000 | 10000 | 'none';

/**
 * Checks if the SQL statement is a SELECT query that doesn't already specify a LIMIT clause.
 * If so, appends LIMIT clause to prevent memory exhaustion.
 */
export function applySafeLimit(
  sql: string,
  limit: SafeLimitOption
): { modifiedSql: string; isLimited: boolean } {
  if (limit === 'none') {
    return { modifiedSql: sql, isLimited: false };
  }

  const trimmed = sql.trim();
  if (!trimmed) {
    return { modifiedSql: sql, isLimited: false };
  }

  // Strip trailing semicolons
  const withoutSemicolon = trimmed.replace(/;+\s*$/, '');

  // Check if it's a SELECT or WITH ... SELECT query (ignoring comments)
  const isSelect = /^(?:(?:\/\*[\s\S]*?\*\/|--[^\n]*\n|\s*)*)(?:SELECT|WITH)\b/i.test(withoutSemicolon);

  if (!isSelect) {
    return { modifiedSql: sql, isLimited: false };
  }

  // Check if there is already a LIMIT clause
  const hasLimit = /\bLIMIT\s+\d+/i.test(withoutSemicolon);

  if (hasLimit) {
    return { modifiedSql: sql, isLimited: false };
  }

  return {
    modifiedSql: `${withoutSemicolon} LIMIT ${limit};`,
    isLimited: true,
  };
}
