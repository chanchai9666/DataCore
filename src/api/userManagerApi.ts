import type { DbUser, CreateUserOptions } from '../types/userManager';
import type { QueryResult, CellValue } from '../types/db';
import { formatCellValue } from '../utils/cellFormatter';
import { dbApi } from './db';

export const SUPPORTED_PRIVILEGES = [
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'CREATE',
  'DROP',
  'ALTER',
  'REFERENCES',
  'INDEX',
  'TRIGGER',
  'ALL PRIVILEGES',
] as const;

export type SupportedPrivilege = (typeof SUPPORTED_PRIVILEGES)[number];

/**
 * Returns SQL to fetch database users and roles.
 */
export function buildFetchUsersSql(driver: string): string {
  const d = (driver || '').toLowerCase();

  if (d.includes('mysql')) {
    return `
SELECT
  u.User as name,
  u.Host as host,
  u.Super_priv as is_superuser,
  COALESCE(GROUP_CONCAT(r.DEFAULT_ROLE_USER SEPARATOR ', '), '') as roles
FROM mysql.user u
LEFT JOIN mysql.default_roles r ON u.User = r.USER AND u.Host = r.HOST
GROUP BY u.User, u.Host, u.Super_priv
ORDER BY u.User, u.Host;
    `.trim();
  }

  if (d.includes('sqlite')) {
    return `SELECT 'main' as name, 1 as is_superuser, 1 as can_login, '' as roles;`;
  }

  // PostgreSQL pg_roles
  return `
SELECT
  r.rolname AS name,
  r.rolsuper AS is_superuser,
  r.rolcanlogin AS can_login,
  r.rolcreatedb AS can_create_db,
  r.rolcreaterole AS can_create_role,
  r.rolvaliduntil::text AS valid_until,
  COALESCE(string_agg(m.rolname, ', '), '') AS roles
FROM pg_roles r
LEFT JOIN pg_auth_members am ON r.oid = am.member
LEFT JOIN pg_roles m ON am.roleid = m.oid
GROUP BY r.rolname, r.rolsuper, r.rolcanlogin, r.rolcreatedb, r.rolcreaterole, r.rolvaliduntil
ORDER BY r.rolname;
  `.trim();
}

/**
 * Parses query results into typed DbUser models.
 */
export function parseUsersResult(
  result: QueryResult,
  driver: string
): DbUser[] {
  if (!result || !result.rows) return [];
  const d = (driver || '').toLowerCase();

  const getStr = (val: CellValue): string | null => {
    const s = formatCellValue(val);
    return s === 'NULL' ? null : s;
  };

  const getBool = (val: CellValue): boolean => {
    if (val === null || val === undefined) return false;
    if (typeof val === 'object' && 'Boolean' in val) return Boolean(val.Boolean);
    const s = formatCellValue(val).toUpperCase();
    return s === 'TRUE' || s === '1' || s === 'Y';
  };

  const parseRolesList = (val: CellValue | undefined): string[] => {
    if (!val) return [];
    const str = getStr(val);
    if (!str) return [];
    return str
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  };

  if (d.includes('mysql')) {
    return result.rows.map((row) => {
      const name = getStr(row[0]) || '';
      const host = getStr(row[1]) || '%';
      const isSuper = getBool(row[2]);
      const roles = parseRolesList(row[3]);

      return {
        name,
        host,
        isSuperuser: isSuper,
        canLogin: true,
        canCreateDb: isSuper,
        canCreateRole: isSuper,
        validUntil: undefined,
        roles,
      };
    });
  }

  if (d.includes('sqlite')) {
    return [
      {
        name: 'default',
        host: 'localhost',
        isSuperuser: true,
        canLogin: true,
        canCreateDb: true,
        canCreateRole: true,
        roles: [],
      },
    ];
  }

  // PostgreSQL
  return result.rows.map((row) => {
    const name = getStr(row[0]) || '';
    const isSuperuser = getBool(row[1]);
    const canLogin = getBool(row[2]);
    const canCreateDb = getBool(row[3]);
    const canCreateRole = getBool(row[4]);
    const validUntil = getStr(row[5]) || undefined;
    const roles = parseRolesList(row[6]);

    return {
      name,
      isSuperuser,
      canLogin,
      canCreateDb,
      canCreateRole,
      validUntil,
      roles,
    };
  });
}

/**
 * Returns SQL to create a new database user / role.
 */
export function buildCreateUserSql(
  options: CreateUserOptions,
  driver: string
): string {
  const d = (driver || '').toLowerCase();
  const escapedName = options.name.replace(/["']/g, '');

  if (d.includes('mysql')) {
    const host = options.host || '%';
    const pwd = options.password ? ` IDENTIFIED BY '${options.password.replace(/'/g, "''")}'` : '';
    let sql = `CREATE USER '${escapedName}'@'${host}'${pwd};`;
    if (options.isSuperuser) {
      sql += `\nGRANT ALL PRIVILEGES ON *.* TO '${escapedName}'@'${host}';`;
    }
    return sql;
  }

  // PostgreSQL
  const flags: string[] = [];
  if (options.canLogin !== false) flags.push('LOGIN');
  if (options.isSuperuser) flags.push('SUPERUSER');
  if (options.canCreateDb) flags.push('CREATEDB');
  if (options.canCreateRole) flags.push('CREATEROLE');
  if (options.password) {
    flags.push(`PASSWORD '${options.password.replace(/'/g, "''")}'`);
  }

  return `CREATE ROLE "${escapedName}" WITH ${flags.join(' ')};`;
}

/**
 * Returns SQL to drop a database user / role.
 */
export function buildDropUserSql(
  name: string,
  host: string | undefined,
  driver: string
): string {
  const d = (driver || '').toLowerCase();
  const cleanName = name.replace(/["']/g, '');

  if (d.includes('mysql')) {
    return `DROP USER '${cleanName}'@'${host || '%'}';`;
  }

  return `DROP ROLE "${cleanName}";`;
}

/**
 * Returns SQL to update / alter a user's password.
 */
export function buildAlterUserPasswordSql(
  name: string,
  newPassword: string,
  host: string | undefined,
  driver: string
): string {
  const d = (driver || '').toLowerCase();
  const cleanName = name.replace(/["']/g, '');
  const cleanPass = newPassword.replace(/'/g, "''");

  if (d.includes('mysql')) {
    return `ALTER USER '${cleanName}'@'${host || '%'}' IDENTIFIED BY '${cleanPass}';`;
  }

  return `ALTER ROLE "${cleanName}" WITH PASSWORD '${cleanPass}';`;
}

/**
 * Returns SQL to GRANT privileges to a user.
 */
export function buildGrantPrivilegeSql(
  privilege: string,
  objectName: string,
  userName: string,
  host: string | undefined,
  driver: string
): string {
  const d = (driver || '').toLowerCase();
  const cleanUser = userName.replace(/["']/g, '');
  const cleanObj = objectName.replace(/["']/g, '');

  if (d.includes('mysql')) {
    return `GRANT ${privilege} ON ${cleanObj} TO '${cleanUser}'@'${host || '%'}';`;
  }

  return `GRANT ${privilege} ON TABLE "${cleanObj}" TO "${cleanUser}";`;
}

/**
 * Returns SQL to REVOKE privileges from a user.
 */
export function buildRevokePrivilegeSql(
  privilege: string,
  objectName: string,
  userName: string,
  host: string | undefined,
  driver: string
): string {
  const d = (driver || '').toLowerCase();
  const cleanUser = userName.replace(/["']/g, '');
  const cleanObj = objectName.replace(/["']/g, '');

  if (d.includes('mysql')) {
    return `REVOKE ${privilege} ON ${cleanObj} FROM '${cleanUser}'@'${host || '%'}';`;
  }

  return `REVOKE ${privilege} ON TABLE "${cleanObj}" FROM "${cleanUser}";`;
}

/**
 * Fetches users from the database.
 */
export async function fetchDatabaseUsers(
  connectionId: string,
  driver: string
): Promise<DbUser[]> {
  const sql = buildFetchUsersSql(driver);
  const result = await dbApi.executeDirectQuery(connectionId, sql);
  return parseUsersResult(result, driver);
}
