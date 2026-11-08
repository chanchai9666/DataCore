import { describe, it, expect } from 'vitest';
import {
  quoteIdentifier,
  qualifyTable,
  formatSqlLiteral,
  buildCreateTableSql,
  buildDropTableSql,
  buildCreateIndexSql,
  buildDropIndexSql,
  buildUpdateSql,
  buildDeleteSql,
  buildInsertSql,
} from './queryBuilder';

describe('queryBuilder', () => {
  describe('Identifier & Table Quoting', () => {
    it('quotes identifiers with double quotes for SQLite and Postgres', () => {
      expect(quoteIdentifier('users', 'postgres')).toBe('"users"');
      expect(quoteIdentifier('users', 'sqlite')).toBe('"users"');
    });

    it('quotes identifiers with backticks for MySQL', () => {
      expect(quoteIdentifier('users', 'mysql')).toBe('`users`');
    });

    it('escapes embedded quotes in identifiers', () => {
      expect(quoteIdentifier('user"table', 'postgres')).toBe('"user""table"');
      expect(quoteIdentifier('user`table', 'mysql')).toBe('`user``table`');
    });

    it('prepends schema for MySQL and Postgres, but not for SQLite', () => {
      expect(qualifyTable('users', 'main', 'sqlite')).toBe('"users"');
      expect(qualifyTable('users', 'shop', 'mysql')).toBe('`shop`.`users`');
      expect(qualifyTable('users', 'public', 'postgres')).toBe('"public"."users"');
    });
  });

  describe('Literal Formatting', () => {
    it('formats null and undefined as NULL', () => {
      expect(formatSqlLiteral(null, 'postgres')).toBe('NULL');
      expect(formatSqlLiteral(undefined, 'mysql')).toBe('NULL');
      expect(formatSqlLiteral('NULL', 'postgres')).toBe('NULL');
    });

    it('escapes single quotes in strings', () => {
      expect(formatSqlLiteral("O'Connor", 'postgres')).toBe("'O''Connor'");
    });

    it('formats numbers correctly', () => {
      expect(formatSqlLiteral(42, 'postgres')).toBe('42');
      expect(formatSqlLiteral(NaN, 'postgres')).toBe('NULL');
    });

    it('formats booleans per driver dialect', () => {
      expect(formatSqlLiteral(true, 'postgres')).toBe('TRUE');
      expect(formatSqlLiteral(false, 'postgres')).toBe('FALSE');
      expect(formatSqlLiteral(true, 'mysql')).toBe('1');
      expect(formatSqlLiteral(false, 'sqlite')).toBe('0');
    });

    it('formats objects as json strings', () => {
      expect(formatSqlLiteral({ key: 'val' }, 'postgres')).toBe("'{\"key\":\"val\"}'");
    });
  });

  describe('DDL Generation', () => {
    it('generates CREATE TABLE for SQLite with autoincrement PK', () => {
      const sql = buildCreateTableSql({
        tableName: 'items',
        driver: 'sqlite',
        columns: [
          {
            name: 'id',
            dataType: 'INTEGER',
            isPrimaryKey: true,
            nullable: false,
            autoIncrement: true,
          },
          {
            name: 'title',
            dataType: 'TEXT',
            isPrimaryKey: false,
            nullable: false,
          },
        ],
      });
      expect(sql).toContain('CREATE TABLE "items" (');
      expect(sql).toContain('"id" INTEGER PRIMARY KEY AUTOINCREMENT');
      expect(sql).toContain('"title" TEXT NOT NULL');
    });

    it('generates DROP TABLE with CASCADE for Postgres', () => {
      const sql = buildDropTableSql('orders', 'public', 'postgres', true);
      expect(sql).toBe('DROP TABLE "public"."orders" CASCADE;');
    });

    it('generates CREATE INDEX correctly', () => {
      const sql = buildCreateIndexSql({
        tableName: 'users',
        schemaName: 'public',
        driver: 'postgres',
        indexName: 'idx_users_email',
        columns: ['email'],
        isUnique: true,
      });
      expect(sql).toBe('CREATE UNIQUE INDEX "idx_users_email" ON "public"."users" ("email");');
    });

    it('generates DROP INDEX per driver dialect', () => {
      expect(
        buildDropIndexSql({
          tableName: 'users',
          schemaName: 'public',
          driver: 'postgres',
          indexName: 'idx_users_email',
        })
      ).toBe('DROP INDEX "public"."idx_users_email";');

      expect(
        buildDropIndexSql({
          tableName: 'users',
          driver: 'mysql',
          indexName: 'idx_users_email',
        })
      ).toBe('DROP INDEX `idx_users_email` ON `users`;');
    });
  });

  describe('DML Generation', () => {
    const cols = [
      { name: 'id', data_type: 'int', nullable: false, is_primary_key: true, is_auto_increment: true },
      { name: 'name', data_type: 'varchar', nullable: false, is_primary_key: false, is_auto_increment: false },
    ];

    it('generates UPDATE sql with primary key where condition', () => {
      const sql = buildUpdateSql({
        driver: 'postgres',
        tableName: 'users',
        schemaName: 'public',
        columns: cols,
        row: [{ Integer: 10 }, { Text: 'Alice' }],
        colIndex: 1,
        newValue: 'Bob',
      });
      expect(sql).toBe('UPDATE "public"."users" SET "name" = \'Bob\' WHERE "id" = 10;');
    });

    it('generates DELETE sql', () => {
      const sql = buildDeleteSql({
        driver: 'sqlite',
        tableName: 'users',
        columns: cols,
        row: [{ Integer: 5 }, { Text: 'Charlie' }],
      });
      expect(sql).toBe('DELETE FROM "users" WHERE "id" = 5;');
    });

    it('generates INSERT sql', () => {
      const sql = buildInsertSql({
        driver: 'postgres',
        tableName: 'users',
        schemaName: 'public',
        columns: cols,
        values: { name: 'David' },
      });
      expect(sql).toBe('INSERT INTO "public"."users" ("name") VALUES (\'David\');');
    });
  });
});
