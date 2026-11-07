import { describe, it, expect } from 'vitest';
import { splitSqlStatements } from './sqlSplitter';

describe('splitSqlStatements', () => {
  it('splits simple multiple statements by semicolon', () => {
    const sql = 'SELECT 1; SELECT 2; SELECT 3;';
    expect(splitSqlStatements(sql)).toEqual([
      'SELECT 1',
      'SELECT 2',
      'SELECT 3',
    ]);
  });

  it('does not split on semicolon inside single-quoted strings', () => {
    const sql = "INSERT INTO logs (msg) VALUES ('hello;world'); SELECT 1;";
    expect(splitSqlStatements(sql)).toEqual([
      "INSERT INTO logs (msg) VALUES ('hello;world')",
      'SELECT 1',
    ]);
  });

  it('handles escaped quotes within strings', () => {
    const sql = "SELECT 'It''s fine; isn''t it?'; SELECT 'done';";
    expect(splitSqlStatements(sql)).toEqual([
      "SELECT 'It''s fine; isn''t it?'",
      "SELECT 'done'",
    ]);
  });

  it('does not split on semicolon inside double-quoted identifiers or literals', () => {
    const sql = 'SELECT "col;name" FROM "my;table"; SELECT 2;';
    expect(splitSqlStatements(sql)).toEqual([
      'SELECT "col;name" FROM "my;table"',
      'SELECT 2',
    ]);
  });

  it('does not split on semicolon inside backtick identifiers', () => {
    const sql = 'SELECT `col;name` FROM `my;table`; SELECT 3;';
    expect(splitSqlStatements(sql)).toEqual([
      'SELECT `col;name` FROM `my;table`',
      'SELECT 3',
    ]);
  });

  it('ignores semicolons inside single-line comments', () => {
    const sql = '-- Note: this is a test; do not delete\nSELECT * FROM users;';
    expect(splitSqlStatements(sql)).toEqual([
      '-- Note: this is a test; do not delete\nSELECT * FROM users',
    ]);
  });

  it('ignores semicolons inside block comments', () => {
    const sql = '/* Multi-line comment; with semicolons; */ SELECT * FROM orders;';
    expect(splitSqlStatements(sql)).toEqual([
      '/* Multi-line comment; with semicolons; */ SELECT * FROM orders',
    ]);
  });

  it('handles empty strings and trailing semicolons cleanly', () => {
    expect(splitSqlStatements('')).toEqual([]);
    expect(splitSqlStatements('   ')).toEqual([]);
    expect(splitSqlStatements(';;;')).toEqual([]);
    expect(splitSqlStatements('SELECT 1;;;')).toEqual(['SELECT 1']);
  });
});
