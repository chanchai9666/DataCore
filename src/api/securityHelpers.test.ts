import { describe, it, expect } from 'vitest';
import {
  buildToggleRlsSql,
  buildCreatePolicySql,
  buildDropPolicySql,
  buildGetRlsStatusSql,
  buildGetRlsPoliciesSql,
  buildGetTlsStatusSql,
  buildGetAtRestEncryptionSql,
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

    it('builds queries to fetch RLS status and policies', () => {
      const statusSql = buildGetRlsStatusSql('documents', 'public', 'postgres');
      expect(statusSql).toContain('pg_tables');
      expect(statusSql).toContain('rowsecurity');

      const policiesSql = buildGetRlsPoliciesSql('documents', 'public', 'postgres');
      expect(policiesSql).toContain('pg_policies');
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
  });
});
