import { describe, it, expect } from 'vitest';
import {
  isMutationQuery,
  stripComments,
  hasWhereClause,
  extractTableName,
  calculateRiskLevel,
  formatAffectedRows,
} from './impactSimulator';

describe('impactSimulator utils', () => {
  describe('isMutationQuery', () => {
    it('detects DELETE and UPDATE as mutations', () => {
      expect(isMutationQuery('DELETE FROM users WHERE id = 1')).toBe(true);
      expect(isMutationQuery('update accounts set balance = 0')).toBe(true);
      expect(isMutationQuery('  DELETE FROM orders  ')).toBe(true);
      expect(isMutationQuery('-- comment\nDELETE FROM logs')).toBe(true);
    });

    it('returns false for SELECT, INSERT, CREATE, etc.', () => {
      expect(isMutationQuery('SELECT * FROM users')).toBe(false);
      expect(isMutationQuery('INSERT INTO users VALUES (1)')).toBe(false);
      expect(isMutationQuery('CREATE TABLE foo (id INT)')).toBe(false);
      expect(isMutationQuery('')).toBe(false);
    });
  });

  describe('stripComments', () => {
    it('removes line comments and block comments', () => {
      expect(stripComments('-- single line\nSELECT 1;').trim()).toBe('SELECT 1;');
      expect(stripComments('/* block */ SELECT 1;').trim()).toBe('SELECT 1;');
    });

    it('preserves comment markers inside string literals', () => {
      expect(stripComments("SELECT '--not a comment';").trim()).toBe(
        "SELECT '--not a comment';"
      );
    });
  });

  describe('hasWhereClause', () => {
    it('identifies WHERE clause correctly', () => {
      expect(hasWhereClause('DELETE FROM users WHERE id = 1')).toBe(true);
      expect(hasWhereClause('DELETE FROM users where id = 1')).toBe(true);
      expect(hasWhereClause('DELETE FROM users')).toBe(false);
    });

    it('ignores WHERE inside quotes', () => {
      expect(hasWhereClause("UPDATE logs SET msg = 'WHERE did it go?'")).toBe(false);
      expect(
        hasWhereClause("UPDATE logs SET msg = 'WHERE is it' WHERE id = 1")
      ).toBe(true);
    });
  });

  describe('extractTableName', () => {
    it('extracts table name from DELETE and UPDATE', () => {
      expect(extractTableName('DELETE FROM users WHERE id = 1')).toBe('users');
      expect(extractTableName('DELETE FROM "app_users" WHERE id = 1')).toBe('app_users');
      expect(extractTableName('DELETE FROM `orders` WHERE id = 1')).toBe('orders');
      expect(extractTableName('UPDATE products SET price = 10')).toBe('products');
      expect(extractTableName('UPDATE ONLY employees SET salary = 100')).toBe('employees');
    });

    it('returns null for non-mutation queries', () => {
      expect(extractTableName('SELECT * FROM users')).toBeNull();
    });
  });

  describe('calculateRiskLevel', () => {
    it('returns critical when mutation has no WHERE clause', () => {
      expect(calculateRiskLevel(10, false, true)).toBe('critical');
    });

    it('returns high when affected rows > 100 with WHERE clause', () => {
      expect(calculateRiskLevel(101, true, true)).toBe('high');
      expect(calculateRiskLevel(5000, true, true)).toBe('high');
    });

    it('returns low when affected rows <= 100 with WHERE clause', () => {
      expect(calculateRiskLevel(50, true, true)).toBe('low');
      expect(calculateRiskLevel(1, true, true)).toBe('low');
    });

    it('returns safe when affected rows is 0 or query is non-mutation', () => {
      expect(calculateRiskLevel(0, true, true)).toBe('safe');
      expect(calculateRiskLevel(1000, false, false)).toBe('safe');
    });
  });

  describe('formatAffectedRows', () => {
    it('formats numbers with thousands separators', () => {
      expect(formatAffectedRows(0)).toBe('0');
      expect(formatAffectedRows(42)).toBe('42');
      expect(formatAffectedRows(1420)).toBe('1,420');
      expect(formatAffectedRows(1000000)).toBe('1,000,000');
    });
  });
});
