import { describe, it, expect } from 'vitest';
import {
  buildToggleRlsSql,
  buildCreatePolicySql,
  buildDropPolicySql,
  buildGetRlsStatusSql,
  buildGetRlsPoliciesSql,
  buildGetTlsStatusSql,
  buildGetAtRestEncryptionSql,
  parseAtRestEncryptionResult,
} from './securityHelpers';

describe('securityHelpers', () => {
  describe('Row-Level Security (RLS)', () => {
    it('builds ENABLE / DISABLE ROW LEVEL SECURITY SQL', () => {
      expect(buildToggleRlsSql('orders', 'public', true, 'postgres')).toBe(
        'ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;'
      );
      expect(buildToggleRlsSql('orders', 'public', false, 'postgres')).toBe(
        'ALTER TABLE "public"."orders" DISABLE ROW LEVEL SECURITY;'
      );
    });

    it('builds CREATE POLICY SQL with USING and WITH CHECK', () => {
      const sql = buildCreatePolicySql({
        policyName: 'user_isolation_policy',
        tableName: 'documents',
        schemaName: 'public',
        driver: 'postgres',
        command: 'SELECT',
        roles: ['authenticated'],
        permissive: true,
        usingExpr: 'author_id = current_user_id()',
      });

      expect(sql).toContain('CREATE POLICY "user_isolation_policy" ON "public"."documents"');
      expect(sql).toContain('AS PERMISSIVE');
      expect(sql).toContain('FOR SELECT');
      expect(sql).toContain('TO "authenticated"');
      expect(sql).toContain('USING (author_id = current_user_id())');
    });

    it('builds CREATE POLICY SQL with both USING and WITH CHECK for ALL/UPDATE', () => {
      const sql = buildCreatePolicySql({
        policyName: 'tenant_policy',
        tableName: 'accounts',
        driver: 'postgres',
        command: 'ALL',
        roles: ['PUBLIC'],
        permissive: true,
        usingExpr: 'tenant_id = current_setting(\'app.tenant_id\')',
        checkExpr: 'tenant_id = current_setting(\'app.tenant_id\')',
      });

      expect(sql).toContain('FOR ALL');
      expect(sql).toContain('USING (tenant_id = current_setting(\'app.tenant_id\'))');
      expect(sql).toContain('WITH CHECK (tenant_id = current_setting(\'app.tenant_id\'))');
    });

    it('builds DROP POLICY SQL', () => {
      expect(buildDropPolicySql('user_policy', 'documents', 'public', 'postgres')).toBe(
        'DROP POLICY "user_policy" ON "public"."documents";'
      );
    });

    it('builds queries to fetch RLS status and policies with escaped schema and table literals', () => {
      const statusSql = buildGetRlsStatusSql("user's_data", "tenant's_schema", 'postgres');
      expect(statusSql).toContain("schemaname = 'tenant''s_schema'");
      expect(statusSql).toContain("tablename = 'user''s_data'");

      const policiesSql = buildGetRlsPoliciesSql("user's_data", "tenant's_schema", 'postgres');
      expect(policiesSql).toContain("schemaname = 'tenant''s_schema'");
      expect(policiesSql).toContain("tablename = 'user''s_data'");
    });
  });

  describe('Encryption in Transit (TLS) and At Rest', () => {
    it('builds TLS status queries for PostgreSQL and MySQL', () => {
      expect(buildGetTlsStatusSql('postgres')).toContain('pg_stat_ssl');
      expect(buildGetTlsStatusSql('mysql')).toContain('Ssl_cipher');
    });

    it('builds At-Rest encryption queries', () => {
      expect(buildGetAtRestEncryptionSql('mysql')).toContain('innodb_encrypt_tables');
      expect(buildGetAtRestEncryptionSql('postgres')).toContain('pg_settings');
    });

    it('correctly parses MySQL TDE status without false positives from row count', () => {
      // innodb_encrypt_tables is OFF
      const offResult = {
        rows: [['innodb_encrypt_tables', 'OFF']],
      };
      const offInfo = parseAtRestEncryptionResult('mysql', offResult);
      expect(offInfo.isEncrypted).toBe(false);
      expect(offInfo.status).toBe('disabled');
      expect(offInfo.details).toContain('disabled');

      // innodb_encrypt_tables is ON
      const onResult = {
        rows: [['innodb_encrypt_tables', 'ON']],
      };
      const onInfo = parseAtRestEncryptionResult('mysql', onResult);
      expect(onInfo.isEncrypted).toBe(true);
      expect(onInfo.status).toBe('enabled');
      expect(onInfo.details).toContain('enabled');
    });

    it('correctly parses PostgreSQL at-rest encryption status', () => {
      const offResult = {
        rows: [
          ['data_encryption', 'off'],
          ['ssl', 'on'],
        ],
      };
      const offInfo = parseAtRestEncryptionResult('postgres', offResult);
      expect(offInfo.isEncrypted).toBe(false);
      expect(offInfo.status).toBe('disabled');

      const onResult = {
        rows: [
          ['data_encryption', 'on'],
          ['ssl', 'on'],
        ],
      };
      const onInfo = parseAtRestEncryptionResult('postgres', onResult);
      expect(onInfo.isEncrypted).toBe(true);
      expect(onInfo.status).toBe('enabled');
    });

    it('correctly parses SQLite database file encryption vs standard unencrypted', () => {
      // Standard SQLite has empty rows for PRAGMA cipher_version
      const standardSqlite = { rows: [] };
      const standardInfo = parseAtRestEncryptionResult('sqlite', standardSqlite);
      expect(standardInfo.isEncrypted).toBe(false);
      expect(standardInfo.status).toBe('disabled');
      expect(standardInfo.technology).toContain('Standard SQLite');

      // SQLCipher returns version
      const cipherSqlite = { rows: [['4.5.5']] };
      const cipherInfo = parseAtRestEncryptionResult('sqlite', cipherSqlite);
      expect(cipherInfo.isEncrypted).toBe(true);
      expect(cipherInfo.status).toBe('enabled');
      expect(cipherInfo.technology).toContain('SQLCipher');
    });
  });
});
