import { describe, it, expect } from 'vitest';
import { formatSql, mapDriverToSqlLanguage } from './sqlFormatterHelper';

describe('sqlFormatterHelper', () => {
  it('maps drivers correctly', () => {
    expect(mapDriverToSqlLanguage('sqlite')).toBe('sqlite');
    expect(mapDriverToSqlLanguage('postgres')).toBe('postgresql');
    expect(mapDriverToSqlLanguage('mysql')).toBe('mysql');
    expect(mapDriverToSqlLanguage('unknown')).toBe('sql');
    expect(mapDriverToSqlLanguage(undefined)).toBe('sql');
  });

  it('formats SQL with uppercase keywords and indentation', () => {
    const raw = 'select id, name from users where id = 1 and status = "active";';
    const formatted = formatSql(raw, 'sqlite');
    expect(formatted).toContain('SELECT');
    expect(formatted).toContain('FROM');
    expect(formatted).toContain('WHERE');
    expect(formatted).toContain('  id,');
  });

  it('handles multi-statement queries gracefully', () => {
    const raw = 'select * from users; select * from orders;';
    const formatted = formatSql(raw, 'postgres');
    expect(formatted).toContain('SELECT\n  *\nFROM\n  users;');
    expect(formatted).toContain('SELECT\n  *\nFROM\n  orders;');
  });

  it('returns empty or whitespace string without error', () => {
    expect(formatSql('')).toBe('');
    expect(formatSql('   ')).toBe('   ');
  });
});
