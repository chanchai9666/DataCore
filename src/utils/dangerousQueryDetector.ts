export interface DangerousQueryAnalysis {
  isDangerous: boolean;
  reason?: string;
  riskLevel?: 'HIGH' | 'CRITICAL';
}

function cleanWhereClause(raw: string): string {
  return raw
    .replace(/\b(RETURNING|ORDER\s+BY|LIMIT)\b[\s\S]*/i, '')
    .trim();
}

function stripOuterParens(text: string): string {
  let s = text.trim();
  while (s.startsWith('(') && s.endsWith(')')) {
    let depth = 0;
    let matchedOuter = false;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '(') depth++;
      else if (s[i] === ')') {
        depth--;
        if (depth === 0) {
          if (i === s.length - 1) {
            matchedOuter = true;
          }
          break;
        }
      }
    }
    if (matchedOuter) {
      s = s.slice(1, -1).trim();
    } else {
      break;
    }
  }
  return s;
}

function isClauseTautology(clause: string): boolean {
  const s = stripOuterParens(clause);

  // 1. Boolean true
  if (/^true$/i.test(s)) {
    return true;
  }

  // 2. Single truthy number 1 (e.g. WHERE 1 in MySQL/SQLite)
  if (/^1$/.test(s)) {
    return true;
  }

  // 3. Equality comparison: left = right
  const eqMatch = s.match(/^([\s\S]+?)\s*(?:=|==|<=>)\s*([\s\S]+?)$/);
  if (eqMatch) {
    const left = eqMatch[1].trim();
    const right = eqMatch[2].trim();

    // Literal equality (e.g. 'a' = 'a', '' = '', id = id)
    if (left === right) {
      return true;
    }

    // Number equality (e.g. 1 = 1, 0 = 0)
    const numLeft = Number(left);
    const numRight = Number(right);
    if (!isNaN(numLeft) && !isNaN(numRight) && numLeft === numRight) {
      return true;
    }
  }

  return false;
}

function splitTopLevel(str: string, op: 'AND' | 'OR'): string[] {
  const parts: string[] = [];
  let current = '';
  let parenDepth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (char === "'" && !inDoubleQuote) {
      if (inSingleQuote && str[i + 1] === "'") {
        current += "''";
        i++;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      current += char;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += char;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (char === '(') parenDepth++;
      else if (char === ')') parenDepth = Math.max(0, parenDepth - 1);

      if (parenDepth === 0 && current.trim().length > 0) {
        const sub = str.slice(i);
        const match = sub.match(new RegExp(`^\\s*\\b${op}\\b\\s*`, 'i'));
        if (match) {
          parts.push(current);
          current = '';
          i += match[0].length - 1;
          continue;
        }
      }
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current);
  }

  return parts;
}

function isTautologicalWhere(whereClause: string): boolean {
  const cleaned = cleanWhereClause(whereClause);
  if (!cleaned) {
    return true;
  }

  // If there are top-level ORs: if ANY top-level branch is a tautology, the whole expression is true
  const orParts = splitTopLevel(cleaned, 'OR');
  if (orParts.length > 1) {
    return orParts.some((part) => isTautologicalWhere(part));
  }

  // If there are top-level ANDs: ALL branches must be tautologies for the whole expression to be true
  const andParts = splitTopLevel(cleaned, 'AND');
  if (andParts.length > 1) {
    return andParts.every((part) => isTautologicalWhere(part));
  }

  // Single clause
  return isClauseTautology(cleaned);
}

/**
 * Inspects a SQL string to identify destructive commands that may cause irreversible data loss:
 * 1. DROP (DATABASE, SCHEMA, TABLE, VIEW)
 * 2. TRUNCATE (TABLE)
 * 3. DELETE without WHERE clause or with tautological WHERE (e.g. WHERE 1=1)
 * 4. UPDATE without WHERE clause or with tautological WHERE (e.g. WHERE 1=1)
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

  // Strip single-quoted string literals ('(?:''|[^'])*') to avoid keywords inside literals tricking detector
  let strIndex = 0;
  const stringLiterals: string[] = [];
  const sqlWithoutStrings = strippedSql.replace(/'(?:''|[^'])*'/g, (match) => {
    const token = `__STR_LITERAL_${strIndex}__`;
    stringLiterals.push(match);
    strIndex++;
    return token;
  });

  const restoreStrings = (text: string) =>
    text.replace(/__STR_LITERAL_(\d+)__/g, (_, idx) => stringLiterals[Number(idx)]);

  // 1. Check for DROP commands
  const dropMatch = sqlWithoutStrings.match(/\bDROP\s+(DATABASE|SCHEMA|TABLE|VIEW)\b/i);
  if (dropMatch) {
    return {
      isDangerous: true,
      reason: `Destructive DROP command detected (${dropMatch[0].toUpperCase()}). This will permanently remove database structures.`,
      riskLevel: 'CRITICAL',
    };
  }

  // 2. Check for TRUNCATE commands
  const truncateMatch = sqlWithoutStrings.match(/\bTRUNCATE(?:\s+TABLE)?\s+([`"'\w.]+)/i);
  if (truncateMatch) {
    return {
      isDangerous: true,
      reason: 'TRUNCATE command detected. This will delete all rows from the table without row-by-row triggers.',
      riskLevel: 'CRITICAL',
    };
  }

  // 3. Check for DELETE without WHERE or with tautological WHERE
  if (/\bDELETE\s+(?:FROM\s+)?([`"'\w.]+)/i.test(sqlWithoutStrings)) {
    const whereMatch = sqlWithoutStrings.match(/\bWHERE\b([\s\S]*)$/i);
    if (!whereMatch) {
      return {
        isDangerous: true,
        reason: 'DELETE statement without WHERE clause detected. This will delete ALL rows in the table.',
        riskLevel: 'HIGH',
      };
    }

    const whereBody = whereMatch[1];
    const stmtEnd = whereBody.indexOf(';');
    const wherePart = stmtEnd !== -1 ? whereBody.slice(0, stmtEnd) : whereBody;
    const rawWhere = restoreStrings(wherePart);

    if (isTautologicalWhere(rawWhere)) {
      return {
        isDangerous: true,
        reason: 'DELETE statement with tautological WHERE clause detected (affects all rows). This will delete ALL rows in the table.',
        riskLevel: 'HIGH',
      };
    }
  }

  // 4. Check for UPDATE without WHERE or with tautological WHERE
  if (/\bUPDATE\s+([`"'\w.]+)\s+SET\b/i.test(sqlWithoutStrings)) {
    const whereMatch = sqlWithoutStrings.match(/\bWHERE\b([\s\S]*)$/i);
    if (!whereMatch) {
      return {
        isDangerous: true,
        reason: 'UPDATE statement without WHERE clause detected. This will modify ALL rows in the table.',
        riskLevel: 'HIGH',
      };
    }

    const whereBody = whereMatch[1];
    const stmtEnd = whereBody.indexOf(';');
    const wherePart = stmtEnd !== -1 ? whereBody.slice(0, stmtEnd) : whereBody;
    const rawWhere = restoreStrings(wherePart);

    if (isTautologicalWhere(rawWhere)) {
      return {
        isDangerous: true,
        reason: 'UPDATE statement with tautological WHERE clause detected (affects all rows). This will modify ALL rows in the table.',
        riskLevel: 'HIGH',
      };
    }
  }

  return { isDangerous: false };
}
