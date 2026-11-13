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
});
