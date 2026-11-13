export interface DangerousQueryAnalysis {
  isDangerous: boolean;
  reason?: string;
  riskLevel?: 'HIGH' | 'CRITICAL';
}

/**
 * Inspects a SQL string to identify destructive commands that may cause irreversible data loss:
 * 1. DROP (DATABASE, SCHEMA, TABLE, VIEW)
 * 2. TRUNCATE (TABLE)
 * 3. DELETE without WHERE clause
 * 4. UPDATE without WHERE clause
 */
export function analyzeDangerousQuery(sql: string): DangerousQueryAnalysis {
  if (!sql || !sql.trim()) {
    return { isDangerous: false };
  }

  // Strip single-line (-- ...) and multi-line (/* ... */) comments
  const strippedSql = sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*\n/g, ' ')
    .replace(/--[^\n]*$/g, ' ')
    .trim();

  if (!strippedSql) {
    return { isDangerous: false };
  }

  // 1. Check for DROP commands
  const dropMatch = strippedSql.match(/\bDROP\s+(DATABASE|SCHEMA|TABLE|VIEW)\b/i);
  if (dropMatch) {
    return {
      isDangerous: true,
      reason: `Destructive DROP command detected (${dropMatch[0].toUpperCase()}). This will permanently remove database structures.`,
      riskLevel: 'CRITICAL',
    };
  }

  // 2. Check for TRUNCATE commands
  const truncateMatch = strippedSql.match(/\bTRUNCATE(?:\s+TABLE)?\s+([`"'\w.]+)/i);
  if (truncateMatch) {
    return {
      isDangerous: true,
      reason: 'TRUNCATE command detected. This will delete all rows from the table without row-by-row triggers.',
      riskLevel: 'CRITICAL',
    };
  }

  // 3. Check for DELETE without WHERE
  if (/\bDELETE\s+(?:FROM\s+)?([`"'\w.]+)/i.test(strippedSql)) {
    const hasWhere = /\bWHERE\b/i.test(strippedSql);
    if (!hasWhere) {
      return {
        isDangerous: true,
        reason: 'DELETE statement without WHERE clause detected. This will delete ALL rows in the table.',
        riskLevel: 'HIGH',
      };
    }
  }

  // 4. Check for UPDATE without WHERE
  if (/\bUPDATE\s+([`"'\w.]+)\s+SET\b/i.test(strippedSql)) {
    const hasWhere = /\bWHERE\b/i.test(strippedSql);
    if (!hasWhere) {
      return {
        isDangerous: true,
        reason: 'UPDATE statement without WHERE clause detected. This will modify ALL rows in the table.',
        riskLevel: 'HIGH',
      };
    }
  }

  return { isDangerous: false };
}
