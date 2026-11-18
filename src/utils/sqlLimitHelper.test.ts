import { describe, it, expect } from 'vitest';
import { applySafeLimit } from './sqlLimitHelper';

describe('sqlLimitHelper', () => {
  it('applies default limit of 1000 to SELECT queries without limit', () => {
    const sql = 'SELECT * FROM users;';
    const result = applySafeLimit(sql, 1000);
    expect(result.isLimited).toBe(true);
    expect(result.modifiedSql).toBe('SELECT * FROM users LIMIT 1000;');
  });

  it('handles query without trailing semicolon', () => {
    const sql = 'SELECT id, name FROM customers';
    const result = applySafeLimit(sql, 5000);
    expect(result.isLimited).toBe(true);
    expect(result.modifiedSql).toBe('SELECT id, name FROM customers LIMIT 5000;');
  });

  it('does not modify query if it already has a LIMIT clause', () => {
    const sql = 'SELECT * FROM orders LIMIT 50;';
    const result = applySafeLimit(sql, 1000);
    expect(result.isLimited).toBe(false);
    expect(result.modifiedSql).toBe(sql);
  });

  it('does not modify DDL, INSERT, UPDATE, or DELETE queries', () => {
    expect(applySafeLimit('INSERT INTO users VALUES (1);', 1000).isLimited).toBe(false);
    expect(applySafeLimit('UPDATE users SET name = "test";', 1000).isLimited).toBe(false);
    expect(applySafeLimit('DELETE FROM users WHERE id = 1;', 1000).isLimited).toBe(false);
    expect(applySafeLimit('DROP TABLE users;', 1000).isLimited).toBe(false);
    expect(applySafeLimit('CREATE TABLE t (id INT);', 1000).isLimited).toBe(false);
  });

  it('applies limit to WITH CTE queries ending in SELECT', () => {
    const sql = 'WITH active AS (SELECT * FROM users) SELECT * FROM active;';
    const result = applySafeLimit(sql, 1000);
    expect(result.isLimited).toBe(true);
    expect(result.modifiedSql).toBe('WITH active AS (SELECT * FROM users) SELECT * FROM active LIMIT 1000;');
  });

  it('returns original query when limit is set to "none"', () => {
    const sql = 'SELECT * FROM very_large_table;';
    const result = applySafeLimit(sql, 'none');
    expect(result.isLimited).toBe(false);
    expect(result.modifiedSql).toBe(sql);
  });

  it('does not append LIMIT for mssql driver', () => {
    const sql = 'SELECT * FROM users;';
    const result = applySafeLimit(sql, 1000, 'mssql');
    expect(result.isLimited).toBe(false);
    expect(result.modifiedSql).toBe(sql);
  });

  it('appends LIMIT for postgres, mysql, sqlite, and duckdb drivers', () => {
    const sql = 'SELECT * FROM users;';
    for (const driver of ['postgres', 'mysql', 'sqlite', 'duckdb'] as const) {
      const result = applySafeLimit(sql, 1000, driver);
      expect(result.isLimited).toBe(true);
      expect(result.modifiedSql).toBe('SELECT * FROM users LIMIT 1000;');
    }
  });

  it('handles trailing single-line comment without semicolon by inserting newline before LIMIT', () => {
    const sql = 'SELECT * FROM users -- fetch all users';
    const result = applySafeLimit(sql, 1000, 'postgres');
    expect(result.isLimited).toBe(true);
    expect(result.modifiedSql).toBe('SELECT * FROM users -- fetch all users\nLIMIT 1000;');
  });

  it('handles trailing single-line comment after semicolon by placing LIMIT before semicolon', () => {
    const sql = 'SELECT * FROM users; -- fetch all users';
    const result = applySafeLimit(sql, 1000, 'postgres');
    expect(result.isLimited).toBe(true);
    expect(result.modifiedSql).toBe('SELECT * FROM users LIMIT 1000; -- fetch all users');
  });

  it('handles trailing block comment', () => {
    const sql = 'SELECT * FROM users /* all users */';
    const result = applySafeLimit(sql, 1000, 'postgres');
    expect(result.isLimited).toBe(true);
    expect(result.modifiedSql).toBe('SELECT * FROM users /* all users */ LIMIT 1000;');
  });

  it('applies outer LIMIT even when a subquery contains LIMIT', () => {
    const sql = 'SELECT * FROM (SELECT * FROM orders LIMIT 10) AS sub;';
    const result = applySafeLimit(sql, 1000, 'postgres');
    expect(result.isLimited).toBe(true);
    expect(result.modifiedSql).toBe('SELECT * FROM (SELECT * FROM orders LIMIT 10) AS sub LIMIT 1000;');
  });

  it('applies LIMIT even when string literal or comment contains LIMIT', () => {
    const sql1 = "SELECT * FROM logs WHERE message = 'LIMIT 10';";
    const res1 = applySafeLimit(sql1, 1000);
    expect(res1.isLimited).toBe(true);
    expect(res1.modifiedSql).toBe("SELECT * FROM logs WHERE message = 'LIMIT 10' LIMIT 1000;");

    const sql2 = 'SELECT * FROM logs -- LIMIT 10';
    const res2 = applySafeLimit(sql2, 1000);
    expect(res2.isLimited).toBe(true);
    expect(res2.modifiedSql).toBe('SELECT * FROM logs -- LIMIT 10\nLIMIT 1000;');
  });
});
