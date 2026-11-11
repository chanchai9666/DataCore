import { describe, it, expect } from 'vitest';
import {
  buildSetIsolationLevelSql,
  buildSavepointSql,
  buildRollbackToSavepointSql,
  buildReleaseSavepointSql,
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
    it('builds SAVEPOINT SQL', () => {
      expect(buildSavepointSql('sp_checkout')).toBe('SAVEPOINT sp_checkout;');
    });

    it('builds ROLLBACK TO SAVEPOINT SQL', () => {
      expect(buildRollbackToSavepointSql('sp_checkout')).toBe('ROLLBACK TO SAVEPOINT sp_checkout;');
    });

    it('builds RELEASE SAVEPOINT SQL', () => {
      expect(buildReleaseSavepointSql('sp_checkout', 'postgres')).toBe('RELEASE SAVEPOINT sp_checkout;');
      expect(buildReleaseSavepointSql('sp_checkout', 'mysql')).toBe('RELEASE SAVEPOINT sp_checkout;');
      expect(buildReleaseSavepointSql('sp_checkout', 'sqlite')).toBe('RELEASE sp_checkout;');
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
