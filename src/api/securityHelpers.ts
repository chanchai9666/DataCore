import { quoteIdentifier, qualifyTable } from './queryBuilder';

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
    return `SELECT rowsecurity FROM pg_tables WHERE schemaname = '${s}' AND tablename = '${tableName}';`;
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
    return `
SELECT
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expression,
  with_check AS check_expression
FROM pg_policies
WHERE schemaname = '${s}' AND tablename = '${tableName}'
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
