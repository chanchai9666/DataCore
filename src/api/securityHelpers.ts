import { quoteIdentifier, qualifyTable, formatSqlLiteral } from './queryBuilder';

export type PolicyCommand = 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

export interface RlsPolicy {
  name: string;
  command: PolicyCommand;
  roles: string[];
  permissive: boolean;
  usingExpr?: string;
  checkExpr?: string;
}

export interface CreatePolicyParams {
  policyName: string;
  tableName: string;
  schemaName?: string;
  driver?: string;
  command: PolicyCommand;
  roles?: string[];
  permissive?: boolean;
  usingExpr?: string;
  checkExpr?: string;
}

export interface TlsStatusInfo {
  isEncrypted: boolean;
  protocol?: string; // e.g. TLSv1.3
  cipherSuite?: string;
  keyBits?: number;
}

export interface AtRestStatusInfo {
  isEncrypted: boolean;
  technology: string;
  details: string;
}

/**
 * Builds SQL to enable or disable Row-Level Security on a table.
 */
export function buildToggleRlsSql(
  tableName: string,
  schemaName?: string,
  enable: boolean = true,
  driver: string = 'postgres'
): string {
  const d = driver?.toLowerCase() || 'postgres';
  const full = qualifyTable(tableName, schemaName, d);

  if (d === 'postgres') {
    const action = enable ? 'ENABLE' : 'DISABLE';
    return `ALTER TABLE ${full} ${action} ROW LEVEL SECURITY;`;
  }

  return `-- RLS is natively supported in PostgreSQL. For ${d}, simulate via VIEWs with WHERE filters.`;
}

/**
 * Builds SQL to create a new Row-Level Security Policy.
 */
export function buildCreatePolicySql(params: CreatePolicyParams): string {
  const {
    policyName,
    tableName,
    schemaName,
    driver = 'postgres',
    command,
    roles = ['PUBLIC'],
    permissive = true,
    usingExpr,
    checkExpr,
  } = params;

  const d = driver?.toLowerCase() || 'postgres';
  const cleanName = policyName.trim();
  const qPolicy = quoteIdentifier(cleanName, d);
  const fullTable = qualifyTable(tableName, schemaName, d);

  const permClause = permissive ? 'AS PERMISSIVE' : 'AS RESTRICTIVE';
  const cmdClause = `FOR ${command.toUpperCase()}`;

  const formattedRoles = roles
    .map((r) => (r.toUpperCase() === 'PUBLIC' ? 'PUBLIC' : quoteIdentifier(r.trim(), d)))
    .join(', ');
  const rolesClause = `TO ${formattedRoles || 'PUBLIC'}`;

  const clauses = [`CREATE POLICY ${qPolicy} ON ${fullTable} ${permClause} ${cmdClause} ${rolesClause}`];

  if (usingExpr && usingExpr.trim()) {
    clauses.push(`USING (${usingExpr.trim()})`);
  }

  if (checkExpr && checkExpr.trim()) {
    clauses.push(`WITH CHECK (${checkExpr.trim()})`);
  }

  return `${clauses.join(' ')};`;
}

/**
 * Builds SQL to drop an existing Row-Level Security Policy.
 */
export function buildDropPolicySql(
  policyName: string,
  tableName: string,
  schemaName?: string,
  driver: string = 'postgres'
): string {
  const d = driver?.toLowerCase() || 'postgres';
  const cleanName = policyName.trim();
  const qPolicy = quoteIdentifier(cleanName, d);
  const fullTable = qualifyTable(tableName, schemaName, d);

  return `DROP POLICY ${qPolicy} ON ${fullTable};`;
}

/**
 * Builds query to inspect whether Row-Level Security is enabled on a table.
 */
export function buildGetRlsStatusSql(
  tableName: string,
  schemaName?: string,
  driver: string = 'postgres'
): string {
  const d = driver?.toLowerCase() || 'postgres';
  if (d === 'postgres') {
    const s = schemaName || 'public';
    const sSql = formatSqlLiteral(s, 'postgres');
    const tSql = formatSqlLiteral(tableName, 'postgres');
    return `SELECT rowsecurity FROM pg_tables WHERE schemaname = ${sSql} AND tablename = ${tSql};`;
  }
  return `-- SQLite / MySQL native RLS status not applicable`;
}

/**
 * Builds query to list all active RLS policies for a table.
 */
export function buildGetRlsPoliciesSql(
  tableName: string,
  schemaName?: string,
  driver: string = 'postgres'
): string {
  const d = driver?.toLowerCase() || 'postgres';
  if (d === 'postgres') {
    const s = schemaName || 'public';
    const sSql = formatSqlLiteral(s, 'postgres');
    const tSql = formatSqlLiteral(tableName, 'postgres');
    return `
SELECT
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expression,
  with_check AS check_expression
FROM pg_policies
WHERE schemaname = ${sSql} AND tablename = ${tSql}
ORDER BY policyname ASC;
    `.trim();
  }
  return `-- SQLite / MySQL RLS policies not applicable`;
}

/**
 * Builds query to inspect in-transit TLS encryption status on the active connection.
 */
export function buildGetTlsStatusSql(driver: string): string {
  const d = driver?.toLowerCase() || 'postgres';

  if (d === 'mysql') {
    return `
SHOW STATUS WHERE Variable_name IN (
  'Ssl_cipher',
  'Ssl_version',
  'Ssl_cipher_list'
);
    `.trim();
  }

  if (d === 'sqlite') {
    return `-- SQLite embedded memory communication`;
  }

  // PostgreSQL
  return `
SELECT 
  ssl,
  version,
  cipher,
  bits
FROM pg_stat_ssl 
WHERE pid = pg_backend_pid();
  `.trim();
}

/**
 * Builds query to inspect server at-rest encryption configuration.
 */
export function buildGetAtRestEncryptionSql(driver: string): string {
  const d = driver?.toLowerCase() || 'postgres';

  if (d === 'mysql') {
    return `SHOW VARIABLES LIKE 'innodb_encrypt_tables';`;
  }

  if (d === 'sqlite') {
    return `PRAGMA cipher_version;`;
  }

  // PostgreSQL
  return `
SELECT name, setting 
FROM pg_settings 
WHERE name IN ('data_encryption', 'ssl');
  `.trim();
}

export interface AtRestEncryptionInfo {
  isEncrypted: boolean;
  status: 'enabled' | 'disabled' | 'unknown';
  technology: string;
  details: string;
}

function extractCellString(cell: unknown): string {
  if (cell == null) return '';
  if (typeof cell === 'object') {
    const obj = cell as Record<string, unknown>;
    if ('Text' in obj) return String(obj.Text ?? '');
    if ('Integer' in obj) return String(obj.Integer ?? '');
    if ('Boolean' in obj) return String(obj.Boolean ?? '');
    if ('Float' in obj) return String(obj.Float ?? '');
  }
  return String(cell);
}

/**
 * Parses the raw query result of at-rest encryption check without guessing or false positives.
 */
export function parseAtRestEncryptionResult(
  driver: string,
  result: { rows?: unknown[][] } | null | undefined
): AtRestEncryptionInfo {
  const d = driver?.toLowerCase() || 'postgres';

  if (!result || !result.rows || result.rows.length === 0) {
    if (d === 'sqlite') {
      return {
        isEncrypted: false,
        status: 'disabled',
        technology: 'Standard SQLite (Unencrypted Database File)',
        details: 'SQLite database file is unencrypted on the local file system (DataCore vault secures client credentials separately).',
      };
    }
    return {
      isEncrypted: false,
      status: 'unknown',
      technology: 'Unknown / Unsupported',
      details: 'Unable to inspect at-rest encryption status from database server.',
    };
  }

  if (d === 'mysql') {
    let encryptTables = 'OFF';
    for (const row of result.rows) {
      const varName = extractCellString(row[0]).toLowerCase();
      const val = extractCellString(row[1]).toUpperCase();
      if (varName === 'innodb_encrypt_tables') {
        encryptTables = val;
      }
    }

    const isEncrypted = encryptTables === 'ON' || encryptTables === 'FORCE';
    return {
      isEncrypted,
      status: isEncrypted ? 'enabled' : 'disabled',
      technology: 'InnoDB Tablespace Encryption (TDE)',
      details: isEncrypted
        ? `InnoDB tablespace encryption is enabled (${encryptTables}).`
        : `InnoDB tablespace encryption is disabled (${encryptTables}). Storage is unencrypted.`,
    };
  }

  if (d === 'sqlite') {
    const firstCell = extractCellString(result.rows[0]?.[0]);
    const hasCipher = firstCell.trim().length > 0;
    if (hasCipher) {
      return {
        isEncrypted: true,
        status: 'enabled',
        technology: `SQLCipher (${firstCell})`,
        details: 'SQLite database file is encrypted at-rest with SQLCipher.',
      };
    }
    return {
      isEncrypted: false,
      status: 'disabled',
      technology: 'Standard SQLite (Unencrypted Database File)',
      details: 'SQLite database file is unencrypted on the local file system (DataCore vault secures client credentials separately).',
    };
  }

  // PostgreSQL
  let dataEncryption = 'off';
  for (const row of result.rows) {
    const name = extractCellString(row[0]).toLowerCase();
    const val = extractCellString(row[1]).toLowerCase();
    if (name === 'data_encryption') {
      dataEncryption = val;
    }
  }

  const isEncrypted = dataEncryption === 'on';
  return {
    isEncrypted,
    status: isEncrypted ? 'enabled' : 'disabled',
    technology: 'PostgreSQL Transparent Data Encryption (TDE)',
    details: isEncrypted
      ? 'Cluster data blocks are encrypted at rest (data_encryption = on).'
      : 'Cluster data blocks are unencrypted (data_encryption = off). Client credentials secured via DataCore Encrypted Vault.',
  };
}
