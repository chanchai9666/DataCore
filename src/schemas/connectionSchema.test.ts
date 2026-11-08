import { describe, it, expect } from 'vitest';
import { validateConnectionForm } from './connectionSchema';

describe('connectionSchema validation', () => {
  describe('SQLite validation', () => {
    it('fails when connection name is empty for save', () => {
      const res = validateConnectionForm({
        name: '',
        driver: 'sqlite',
        database: ':memory:',
      });
      expect(res.success).toBe(false);
      expect(res.errors.name).toMatch(/connection name is required/i);
    });

    it('fails when database path is empty', () => {
      const res = validateConnectionForm({
        name: 'My SQLite',
        driver: 'sqlite',
        database: '   ',
      });
      expect(res.success).toBe(false);
      expect(res.errors.database).toMatch(/database path is required/i);
    });

    it('passes for valid SQLite config', () => {
      const res = validateConnectionForm({
        name: 'My SQLite',
        driver: 'sqlite',
        database: ':memory:',
      });
      expect(res.success).toBe(true);
      expect(res.errors).toEqual({});
    });

    it('allows empty name when isTesting is true', () => {
      const res = validateConnectionForm(
        {
          name: '',
          driver: 'sqlite',
          database: ':memory:',
        },
        true
      );
      expect(res.success).toBe(true);
      expect(res.errors).toEqual({});
    });
  });

  describe('PostgreSQL / MySQL validation', () => {
    it('fails when host, database, or user is empty', () => {
      const res = validateConnectionForm({
        name: 'Prod DB',
        driver: 'postgres',
        host: '',
        port: 5432,
        database: '',
        user: '',
      });
      expect(res.success).toBe(false);
      expect(res.errors.host).toMatch(/host is required/i);
      expect(res.errors.database).toMatch(/database name is required/i);
      expect(res.errors.user).toMatch(/user is required/i);
    });

    it('fails when port is invalid (negative, zero, or non-numeric)', () => {
      const invalidPorts = ['-1', '0', 'abc', '', -5, 3.14];
      for (const p of invalidPorts) {
        const res = validateConnectionForm({
          name: 'Prod DB',
          driver: 'postgres',
          host: '127.0.0.1',
          port: p,
          database: 'mydb',
          user: 'postgres',
        });
        expect(res.success).toBe(false);
        expect(res.errors.port).toMatch(/port must be a valid positive integer/i);
      }
    });

    it('passes for valid postgres config', () => {
      const res = validateConnectionForm({
        name: 'Prod DB',
        driver: 'postgres',
        host: '127.0.0.1',
        port: 5432,
        database: 'mydb',
        user: 'postgres',
      });
      expect(res.success).toBe(true);
      expect(res.errors).toEqual({});
    });

    it('passes for valid mysql config with string port', () => {
      const res = validateConnectionForm({
        name: 'Prod MySQL',
        driver: 'mysql',
        host: '127.0.0.1',
        port: '3306',
        database: 'shop',
        user: 'root',
      });
      expect(res.success).toBe(true);
      expect(res.errors).toEqual({});
    });
  });
});
