import { describe, it, expect } from 'vitest';
import {
  quoteIdentifier,
  qualifyTable,
  formatSqlLiteral,
  buildCreateTableSql,
  buildDropTableSql,
  buildRenameTableSql,
  buildTableMaintenanceSql,
  buildCreateIndexSql,
  buildDropIndexSql,
  buildUpdateSql,
  buildDeleteSql,
  buildInsertSql,
  buildExplainSql,
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

    it('formats date/time types safely: "0", empty string coerce to NULL', () => {
      expect(formatSqlLiteral('0', 'postgres', 'timestamptz')).toBe('NULL');
      expect(formatSqlLiteral(0, 'postgres', 'timestamp with time zone')).toBe('NULL');
      expect(formatSqlLiteral('', 'postgres', 'timestamp')).toBe('NULL');
      expect(formatSqlLiteral('   ', 'postgres', 'date')).toBe('NULL');
    });

    it('formats date/time keywords like NOW, NOW(), CURRENT_TIMESTAMP without quotes', () => {
      expect(formatSqlLiteral('now', 'postgres', 'timestamptz')).toBe('NOW()');
      expect(formatSqlLiteral('NOW()', 'postgres', 'timestamp')).toBe('NOW()');
      expect(formatSqlLiteral('CURRENT_TIMESTAMP', 'postgres', 'timestamp')).toBe('NOW()');
      expect(formatSqlLiteral('now', 'sqlite', 'datetime')).toBe("datetime('now')");
    });

    it('formats numeric types safely: empty string coerces to NULL and numeric strings unquoted', () => {
      expect(formatSqlLiteral('', 'postgres', 'integer')).toBe('NULL');
      expect(formatSqlLiteral('  ', 'postgres', 'numeric')).toBe('NULL');
      expect(formatSqlLiteral('42', 'postgres', 'integer')).toBe('42');
      expect(formatSqlLiteral('3.14', 'postgres', 'float8')).toBe('3.14');
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

    it('generates ALTER TABLE RENAME TO for various drivers', () => {
      // Postgres with schema
      expect(buildRenameTableSql('users', 'customers', 'public', 'postgres')).toBe(
        'ALTER TABLE "public"."users" RENAME TO "customers";'
      );
      // SQLite
      expect(buildRenameTableSql('old_table', 'new_table', undefined, 'sqlite')).toBe(
        'ALTER TABLE "old_table" RENAME TO "new_table";'
      );
      // MySQL
      expect(buildRenameTableSql('old_table', 'new_table', 'mydb', 'mysql')).toBe(
        'ALTER TABLE `mydb`.`old_table` RENAME TO `new_table`;'
      );
    });

    it('generates table maintenance SQL for various drivers and operations', () => {
      // PostgreSQL
      expect(buildTableMaintenanceSql('analyze', 'users', 'public', 'postgres')).toBe(
        'ANALYZE "public"."users";'
      );
      expect(buildTableMaintenanceSql('check', 'users', 'public', 'postgres')).toBe(
        'SELECT count(*) AS checked_rows FROM "public"."users";'
      );
      expect(buildTableMaintenanceSql('optimize', 'users', 'public', 'postgres')).toBe(
        'VACUUM (ANALYZE) "public"."users";'
      );
      expect(buildTableMaintenanceSql('reindex', 'users', 'public', 'postgres')).toBe(
        'REINDEX TABLE "public"."users";'
      );

      // MySQL
      expect(buildTableMaintenanceSql('analyze', 'orders', 'mydb', 'mysql')).toBe(
        'ANALYZE TABLE `mydb`.`orders`;'
      );
      expect(buildTableMaintenanceSql('check', 'orders', 'mydb', 'mysql')).toBe(
        'CHECK TABLE `mydb`.`orders`;'
      );
      expect(buildTableMaintenanceSql('optimize', 'orders', 'mydb', 'mysql')).toBe(
        'OPTIMIZE TABLE `mydb`.`orders`;'
      );
      expect(buildTableMaintenanceSql('reindex', 'orders', 'mydb', 'mysql')).toBe(
        'REPAIR TABLE `mydb`.`orders`;'
      );

      // SQLite
      expect(buildTableMaintenanceSql('analyze', 'items', undefined, 'sqlite')).toBe(
        'ANALYZE "items";'
      );
      expect(buildTableMaintenanceSql('check', 'items', undefined, 'sqlite')).toBe(
        'PRAGMA integrity_check;'
      );
      expect(buildTableMaintenanceSql('optimize', 'items', undefined, 'sqlite')).toBe(
        'VACUUM;'
      );
      expect(buildTableMaintenanceSql('reindex', 'items', undefined, 'sqlite')).toBe(
        'REINDEX "items";'
      );
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

    it('generates UPDATE sql for timestamp column with "0" safely converting to NULL', () => {
      const dateCols = [
        { name: 'id', data_type: 'uuid', nullable: false, is_primary_key: true },
        { name: 'created_at', data_type: 'timestamptz', nullable: true },
      ];
      const sql = buildUpdateSql({
        driver: 'postgres',
        tableName: 'categories',
        schemaName: 'public',
        columns: dateCols,
        row: [{ Text: '8bbaac59-7488-429e-b8c2-3e284a14197c' }, null],
        colIndex: 1,
        newValue: '0',
      });
      expect(sql).toBe('UPDATE "public"."categories" SET "created_at" = NULL WHERE "id" = \'8bbaac59-7488-429e-b8c2-3e284a14197c\';');
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
  describe('Explain Query Builder', () => {
    it('builds SQLite EXPLAIN QUERY PLAN', () => {
      const sql = buildExplainSql({
        sql: 'SELECT * FROM users WHERE id = 1;',
        driver: 'sqlite',
      });
      expect(sql).toBe('EXPLAIN QUERY PLAN SELECT * FROM users WHERE id = 1;');
    });

    it('builds PostgreSQL EXPLAIN and EXPLAIN ANALYZE', () => {
      const plain = buildExplainSql({
        sql: 'SELECT * FROM users;',
        driver: 'postgres',
      });
      expect(plain).toBe('EXPLAIN SELECT * FROM users;');

      const analyze = buildExplainSql({
        sql: 'SELECT * FROM users;',
        driver: 'postgres',
        analyze: true,
      });
      expect(analyze).toBe('EXPLAIN (ANALYZE, COSTS, VERBOSE, BUFFERS) SELECT * FROM users;');

      const jsonFormat = buildExplainSql({
        sql: 'SELECT * FROM users;',
        driver: 'postgres',
        format: 'json',
      });
      expect(jsonFormat).toBe('EXPLAIN (COSTS, VERBOSE, FORMAT JSON) SELECT * FROM users;');
    });

    it('builds MySQL EXPLAIN and EXPLAIN ANALYZE', () => {
      const plain = buildExplainSql({
        sql: 'SELECT * FROM users;',
        driver: 'mysql',
      });
      expect(plain).toBe('EXPLAIN SELECT * FROM users;');

      const jsonFormat = buildExplainSql({
        sql: 'SELECT * FROM users;',
        driver: 'mysql',
        format: 'json',
      });
      expect(jsonFormat).toBe('EXPLAIN FORMAT=JSON SELECT * FROM users;');

      const analyze = buildExplainSql({
        sql: 'SELECT * FROM users;',
        driver: 'mysql',
        analyze: true,
      });
      expect(analyze).toBe('EXPLAIN ANALYZE SELECT * FROM users;');
    });
  });
});
});
