import { describe, it, expect } from 'vitest';
import { analyzeDangerousQuery } from './dangerousQueryDetector';

describe('dangerousQueryDetector', () => {
  it('detects DROP TABLE / DATABASE / SCHEMA / VIEW commands', () => {
    expect(analyzeDangerousQuery('DROP TABLE users;').isDangerous).toBe(true);
    expect(analyzeDangerousQuery('DROP DATABASE production;').isDangerous).toBe(true);
    expect(analyzeDangerousQuery('DROP SCHEMA public CASCADE;').isDangerous).toBe(true);
    expect(analyzeDangerousQuery('DROP VIEW user_summary;').isDangerous).toBe(true);
    expect(analyzeDangerousQuery('/* comment */ DROP TABLE users;').isDangerous).toBe(true);
  });

  it('detects TRUNCATE commands', () => {
    expect(analyzeDangerousQuery('TRUNCATE users;').isDangerous).toBe(true);
    expect(analyzeDangerousQuery('TRUNCATE TABLE orders;').isDangerous).toBe(true);
  });

  it('detects DELETE without WHERE', () => {
    const res = analyzeDangerousQuery('DELETE FROM users;');
    expect(res.isDangerous).toBe(true);
    expect(res.riskLevel).toBe('HIGH');
    expect(res.reason).toContain('DELETE statement without WHERE');
  });

  it('allows DELETE with WHERE clause', () => {
    const res = analyzeDangerousQuery('DELETE FROM users WHERE id = 10;');
    expect(res.isDangerous).toBe(false);
  });

  it('detects UPDATE without WHERE', () => {
    const res = analyzeDangerousQuery('UPDATE users SET role = "admin";');
    expect(res.isDangerous).toBe(true);
    expect(res.riskLevel).toBe('HIGH');
    expect(res.reason).toContain('UPDATE statement without WHERE');
  });

  it('allows UPDATE with WHERE clause', () => {
    const res = analyzeDangerousQuery('UPDATE users SET role = "admin" WHERE id = 1;');
    expect(res.isDangerous).toBe(false);
  });

  it('allows harmless SELECT, INSERT, CREATE, and EXPLAIN queries', () => {
    expect(analyzeDangerousQuery('SELECT * FROM users;').isDangerous).toBe(false);
    expect(analyzeDangerousQuery('INSERT INTO users (name) VALUES ("Alice");').isDangerous).toBe(false);
    expect(analyzeDangerousQuery('CREATE TABLE test (id INT);').isDangerous).toBe(false);
    expect(analyzeDangerousQuery('EXPLAIN SELECT * FROM users;').isDangerous).toBe(false);
  });

  it('correctly handles string literals containing SQL keywords like "where"', () => {
    // UPDATE where string literal contains "where" and there is NO actual WHERE clause
    const updateNoWhere = analyzeDangerousQuery("UPDATE users SET note = 'where is it';");
    expect(updateNoWhere.isDangerous).toBe(true);
    expect(updateNoWhere.riskLevel).toBe('HIGH');
    expect(updateNoWhere.reason).toContain('UPDATE statement without WHERE clause');

    // UPDATE with string literal containing "where" AND an actual valid WHERE clause
    const updateWithRealWhere = analyzeDangerousQuery("UPDATE users SET note = 'where is it' WHERE id = 1;");
    expect(updateWithRealWhere.isDangerous).toBe(false);

    // DELETE where note column equals 'where is it'
    const deleteWithWhereKeywordInString = analyzeDangerousQuery("DELETE FROM users WHERE note = 'where is it';");
    expect(deleteWithWhereKeywordInString.isDangerous).toBe(false);
  });

  it('does not flag destructive commands inside string literals', () => {
    expect(analyzeDangerousQuery("SELECT * FROM audit_logs WHERE query = 'DROP TABLE users';").isDangerous).toBe(false);
    expect(analyzeDangerousQuery("INSERT INTO query_logs (sql) VALUES ('TRUNCATE TABLE orders');").isDangerous).toBe(false);
  });

  it('detects tautological WHERE in DELETE and UPDATE statements', () => {
    // WHERE 1=1
    const del1 = analyzeDangerousQuery('DELETE FROM users WHERE 1=1;');
    expect(del1.isDangerous).toBe(true);
    expect(del1.riskLevel).toBe('HIGH');
    expect(del1.reason).toContain('tautological WHERE clause');

    const upd1 = analyzeDangerousQuery("UPDATE users SET role = 'admin' WHERE 1=1;");
    expect(upd1.isDangerous).toBe(true);
    expect(upd1.riskLevel).toBe('HIGH');
    expect(upd1.reason).toContain('tautological WHERE clause');

    // WHERE 1 = 1 with spaces
    expect(analyzeDangerousQuery('DELETE FROM users WHERE 1 = 1;').isDangerous).toBe(true);

    // WHERE true
    const delTrue = analyzeDangerousQuery('DELETE FROM users WHERE true;');
    expect(delTrue.isDangerous).toBe(true);
    expect(delTrue.reason).toContain('tautological WHERE clause');

    const updTrue = analyzeDangerousQuery("UPDATE users SET status = 'active' WHERE TRUE;");
    expect(updTrue.isDangerous).toBe(true);
    expect(updTrue.reason).toContain('tautological WHERE clause');

    // WHERE 'a' = 'a'
    const delStrTautology = analyzeDangerousQuery("DELETE FROM users WHERE 'a'='a';");
    expect(delStrTautology.isDangerous).toBe(true);
    expect(delStrTautology.reason).toContain('tautological WHERE clause');

    const delStrTautologySpaces = analyzeDangerousQuery("DELETE FROM users WHERE 'a' = 'a';");
    expect(delStrTautologySpaces.isDangerous).toBe(true);

    // Parentheses e.g. (1=1) or (true)
    expect(analyzeDangerousQuery('DELETE FROM users WHERE (1=1);').isDangerous).toBe(true);
    expect(analyzeDangerousQuery('DELETE FROM users WHERE (true);').isDangerous).toBe(true);
    expect(analyzeDangerousQuery("DELETE FROM users WHERE ('a' = 'a');").isDangerous).toBe(true);

    // Compound tautology e.g. 1=1 AND 2=2 or id = 10 OR 1=1
    expect(analyzeDangerousQuery('DELETE FROM users WHERE 1=1 AND 2=2;').isDangerous).toBe(true);
    expect(analyzeDangerousQuery('DELETE FROM users WHERE id = 10 OR 1=1;').isDangerous).toBe(true);
  });

  it('allows legitimate queries with valid filtering WHERE clauses', () => {
    // Valid column filters
    expect(analyzeDangerousQuery('DELETE FROM users WHERE id = 10;').isDangerous).toBe(false);
    expect(analyzeDangerousQuery("UPDATE users SET status = 'inactive' WHERE email = 'test@example.com';").isDangerous).toBe(false);

    // WHERE 1=1 combined with actual filter via AND
    expect(analyzeDangerousQuery('DELETE FROM users WHERE 1=1 AND id = 10;').isDangerous).toBe(false);
    expect(analyzeDangerousQuery("UPDATE users SET role = 'admin' WHERE 1=1 AND status = 'pending';").isDangerous).toBe(false);

    // Strings comparing different values
    expect(analyzeDangerousQuery("DELETE FROM users WHERE 'a' = 'b';").isDangerous).toBe(false);

    // String containing '1=1' as a filter value
    expect(analyzeDangerousQuery("DELETE FROM users WHERE note = '1=1';").isDangerous).toBe(false);
  });
});
