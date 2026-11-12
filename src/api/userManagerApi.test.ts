import { describe, it, expect } from 'vitest';
import {
  buildFetchUsersSql,
  parseUsersResult,
  buildCreateUserSql,
  buildDropUserSql,
  buildAlterUserPasswordSql,
  buildGrantPrivilegeSql,
  buildRevokePrivilegeSql,
  SUPPORTED_PRIVILEGES,
} from './userManagerApi';
import type { QueryResult } from '../types/db';

describe('userManagerApi', () => {
  describe('SUPPORTED_PRIVILEGES', () => {
    it('includes all necessary DDL and DML privileges', () => {
      expect(SUPPORTED_PRIVILEGES).toContain('SELECT');
      expect(SUPPORTED_PRIVILEGES).toContain('INSERT');
      expect(SUPPORTED_PRIVILEGES).toContain('UPDATE');
      expect(SUPPORTED_PRIVILEGES).toContain('DELETE');
      expect(SUPPORTED_PRIVILEGES).toContain('CREATE');
      expect(SUPPORTED_PRIVILEGES).toContain('DROP');
      expect(SUPPORTED_PRIVILEGES).toContain('ALTER');
      expect(SUPPORTED_PRIVILEGES).toContain('REFERENCES');
      expect(SUPPORTED_PRIVILEGES).toContain('INDEX');
      expect(SUPPORTED_PRIVILEGES).toContain('TRIGGER');
      expect(SUPPORTED_PRIVILEGES).toContain('ALL PRIVILEGES');
    });
  });

  describe('buildFetchUsersSql', () => {
    it('returns pg_roles query with role memberships for postgres', () => {
      const sql = buildFetchUsersSql('postgres');
      expect(sql).toContain('pg_roles');
      expect(sql).toContain('rolname');
      expect(sql).toContain('rolsuper');
      expect(sql).toContain('pg_auth_members');
      expect(sql).toContain('roles');
    });

    it('returns mysql.user query with default_roles for mysql', () => {
      const sql = buildFetchUsersSql('mysql');
      expect(sql).toContain('mysql.user');
      expect(sql).toContain('User');
      expect(sql).toContain('default_roles');
      expect(sql).toContain('roles');
    });
  });

  describe('parseUsersResult', () => {
    it('parses postgres pg_roles result with roles list', () => {
      const queryResult: QueryResult = {
        columns: [
          { name: 'name', data_type: 'name', nullable: false },
          { name: 'is_superuser', data_type: 'boolean', nullable: false },
          { name: 'can_login', data_type: 'boolean', nullable: false },
          { name: 'can_create_db', data_type: 'boolean', nullable: false },
          { name: 'can_create_role', data_type: 'boolean', nullable: false },
          { name: 'valid_until', data_type: 'text', nullable: true },
          { name: 'roles', data_type: 'text', nullable: true },
        ],
        rows: [
          [
            { Text: 'alice' },
            { Boolean: true },
            { Boolean: true },
            { Boolean: true },
            { Boolean: false },
            null,
            { Text: 'analyst, developer' },
          ],
        ],
        execution_time_ms: 2,
      };

      const users = parseUsersResult(queryResult, 'postgres');
      expect(users).toHaveLength(1);
      expect(users[0]).toEqual({
        name: 'alice',
        host: undefined,
        isSuperuser: true,
        canLogin: true,
        canCreateDb: true,
        canCreateRole: false,
        validUntil: undefined,
        roles: ['analyst', 'developer'],
      });
    });

    it('parses mysql user table result with roles list', () => {
      const queryResult: QueryResult = {
        columns: [
          { name: 'name', data_type: 'char', nullable: false },
          { name: 'host', data_type: 'char', nullable: false },
          { name: 'is_superuser', data_type: 'char', nullable: false },
          { name: 'roles', data_type: 'text', nullable: true },
        ],
        rows: [
          [{ Text: 'bob' }, { Text: '%' }, { Text: 'Y' }, { Text: 'app_admin, reporting' }],
        ],
        execution_time_ms: 1,
      };

      const users = parseUsersResult(queryResult, 'mysql');
      expect(users).toHaveLength(1);
      expect(users[0]).toEqual({
        name: 'bob',
        host: '%',
        isSuperuser: true,
        canLogin: true,
        canCreateDb: true,
        canCreateRole: true,
        validUntil: undefined,
        roles: ['app_admin', 'reporting'],
      });
    });
  });

  describe('buildCreateUserSql', () => {
    it('generates CREATE ROLE SQL for postgres', () => {
      const sql = buildCreateUserSql(
        {
          name: 'app_user',
          password: 'secret_password',
          isSuperuser: false,
          canLogin: true,
          canCreateDb: true,
        },
        'postgres'
      );
      expect(sql).toContain('CREATE ROLE "app_user"');
      expect(sql).toContain("PASSWORD 'secret_password'");
      expect(sql).toContain('LOGIN');
      expect(sql).toContain('CREATEDB');
    });

    it('generates CREATE USER SQL for mysql', () => {
      const sql = buildCreateUserSql(
        {
          name: 'app_user',
          host: '%',
          password: 'secret_password',
        },
        'mysql'
      );
      expect(sql).toContain("CREATE USER 'app_user'@'%'");
      expect(sql).toContain("IDENTIFIED BY 'secret_password'");
    });
  });

  describe('buildDropUserSql & buildAlterUserPasswordSql', () => {
    it('generates DROP and ALTER password SQL for postgres', () => {
      expect(buildDropUserSql('app_user', undefined, 'postgres')).toBe('DROP ROLE "app_user";');
      expect(buildAlterUserPasswordSql('app_user', 'new_pass', undefined, 'postgres')).toBe(
        'ALTER ROLE "app_user" WITH PASSWORD \'new_pass\';'
      );
    });

    it('generates DROP and ALTER password SQL for mysql', () => {
      expect(buildDropUserSql('app_user', '%', 'mysql')).toBe("DROP USER 'app_user'@'%';");
      expect(buildAlterUserPasswordSql('app_user', 'new_pass', '%', 'mysql')).toBe(
        "ALTER USER 'app_user'@'%' IDENTIFIED BY 'new_pass';"
      );
    });
  });

  describe('buildGrantPrivilegeSql & buildRevokePrivilegeSql', () => {
    it('generates GRANT and REVOKE SQL for postgres', () => {
      const grantSql = buildGrantPrivilegeSql('SELECT, INSERT', 'customers', 'app_user', undefined, 'postgres');
      expect(grantSql).toBe('GRANT SELECT, INSERT ON TABLE "customers" TO "app_user";');

      const revokeSql = buildRevokePrivilegeSql('DELETE', 'customers', 'app_user', undefined, 'postgres');
      expect(revokeSql).toBe('REVOKE DELETE ON TABLE "customers" FROM "app_user";');
    });
  });
});
