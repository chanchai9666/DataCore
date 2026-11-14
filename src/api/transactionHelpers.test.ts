import { describe, it, expect } from 'vitest';
import {
  buildSetIsolationLevelSql,
  buildSavepointSql,
  buildRollbackToSavepointSql,
  buildReleaseSavepointSql,
  sanitizeSavepointName,
  buildLocksQuery,
  buildKillSessionSql,
} from './transactionHelpers';

describe('transactionHelpers', () => {
  describe('buildSetIsolationLevelSql', () => {
    it('generates Postgres isolation level SQL', () => {
      expect(buildSetIsolationLevelSql('READ COMMITTED', 'postgres')).toBe(
        'SET TRANSACTION ISOLATION LEVEL READ COMMITTED;'
      );
      expect(buildSetIsolationLevelSql('SERIALIZABLE', 'postgres')).toBe(
        'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;'
      );
    });

    it('generates MySQL isolation level SQL', () => {
      expect(buildSetIsolationLevelSql('REPEATABLE READ', 'mysql')).toBe(
        'SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;'
      );
      expect(buildSetIsolationLevelSql('READ UNCOMMITTED', 'mysql')).toBe(
        'SET SESSION TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;'
      );
    });

    it('generates SQLite isolation pragma', () => {
      expect(buildSetIsolationLevelSql('READ UNCOMMITTED', 'sqlite')).toBe(
        'PRAGMA read_uncommitted = ON;'
      );
      expect(buildSetIsolationLevelSql('SERIALIZABLE', 'sqlite')).toBe(
        'PRAGMA read_uncommitted = OFF;'
      );
    });
  });

  describe('Savepoint helpers', () => {
    it('sanitizes savepoint names properly', () => {
      expect(sanitizeSavepointName('my_savepoint')).toBe('my_savepoint');
      expect(sanitizeSavepointName('จุดบันทึก1')).toBe('_________1'); // thai chars replaced with _
      expect(sanitizeSavepointName('123')).toBe('sp_123'); // digits prefixed with sp_
      expect(sanitizeSavepointName('   ')).toBe('sp_default'); // empty fallback
      expect(sanitizeSavepointName('!@#$')).toBe('____');
      expect(sanitizeSavepointName('')).toBe('sp_default');
    });

    it('builds SAVEPOINT SQL', () => {
      expect(buildSavepointSql('sp_checkout')).toBe('SAVEPOINT sp_checkout;');
      expect(buildSavepointSql('123')).toBe('SAVEPOINT sp_123;');
    });

    it('builds ROLLBACK TO SAVEPOINT SQL', () => {
      expect(buildRollbackToSavepointSql('sp_checkout')).toBe('ROLLBACK TO SAVEPOINT sp_checkout;');
      expect(buildRollbackToSavepointSql('123')).toBe('ROLLBACK TO SAVEPOINT sp_123;');
    });

    it('builds RELEASE SAVEPOINT SQL', () => {
      expect(buildReleaseSavepointSql('sp_checkout', 'postgres')).toBe('RELEASE SAVEPOINT sp_checkout;');
      expect(buildReleaseSavepointSql('sp_checkout', 'mysql')).toBe('RELEASE SAVEPOINT sp_checkout;');
      expect(buildReleaseSavepointSql('sp_checkout', 'sqlite')).toBe('RELEASE sp_checkout;');
      expect(buildReleaseSavepointSql('123', 'sqlite')).toBe('RELEASE sp_123;');
    });
  });

  describe('Locks and Concurrency query', () => {
    it('builds lock detection query for Postgres', () => {
      const q = buildLocksQuery('postgres');
      expect(q).toContain('pg_locks');
      expect(q).toContain('pg_stat_activity');
    });

    it('builds lock detection query for MySQL', () => {
      const q = buildLocksQuery('mysql');
      expect(q).toContain('information_schema.innodb_trx');
    });

    it('builds lock query for SQLite', () => {
      const q = buildLocksQuery('sqlite');
      expect(q).toContain('PRAGMA lock_status');
    });
  });

  describe('Kill Session / Cancel blocking query', () => {
    it('builds terminate SQL for Postgres', () => {
      expect(buildKillSessionSql('12345', 'postgres')).toBe('SELECT pg_terminate_backend(12345);');
    });

    it('builds kill SQL for MySQL', () => {
      expect(buildKillSessionSql('42', 'mysql')).toBe('KILL 42;');
    });
  });
});
