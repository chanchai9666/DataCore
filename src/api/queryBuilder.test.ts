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
  buildSelectQuery,
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

    it('generates UPDATE and DELETE sql with composite primary keys using all PK columns', () => {
      const compositeCols = [
        { name: 'order_id', data_type: 'int', nullable: false, is_primary_key: true },
        { name: 'item_id', data_type: 'int', nullable: false, is_primary_key: true },
        { name: 'quantity', data_type: 'int', nullable: false, is_primary_key: false },
      ];
      const row = [{ Integer: 101 }, { Integer: 502 }, { Integer: 3 }];

      const updateSql = buildUpdateSql({
        driver: 'postgres',
        tableName: 'order_items',
        schemaName: 'sales',
        columns: compositeCols,
        row,
        colIndex: 2,
        newValue: 5,
      });
      expect(updateSql).toBe(
        'UPDATE "sales"."order_items" SET "quantity" = 5 WHERE "order_id" = 101 AND "item_id" = 502;'
      );

      const deleteSql = buildDeleteSql({
        driver: 'mysql',
        tableName: 'order_items',
        columns: compositeCols,
        row,
      });
      expect(deleteSql).toBe(
        'DELETE FROM `order_items` WHERE `order_id` = 101 AND `item_id` = 502;'
      );
    });

    it('guards fallback UPDATE and DELETE without PK using single-row limits (Postgres ctid, SQLite rowid, MySQL LIMIT 1)', () => {
      const noPkCols = [
        { name: 'tag', data_type: 'varchar', nullable: false, is_primary_key: false },
        { name: 'score', data_type: 'int', nullable: false, is_primary_key: false },
      ];
      const row = [{ Text: 'tech' }, { Integer: 100 }];

      // Postgres
      const pgUpdate = buildUpdateSql({
        driver: 'postgres',
        tableName: 'tags',
        schemaName: 'public',
        columns: noPkCols,
        row,
        colIndex: 1,
        newValue: 200,
      });
      expect(pgUpdate).toBe(
        'UPDATE "public"."tags" SET "score" = 200 WHERE ctid = (SELECT ctid FROM "public"."tags" WHERE "tag" = \'tech\' AND "score" = 100 LIMIT 1);'
      );

      const pgDelete = buildDeleteSql({
        driver: 'postgres',
        tableName: 'tags',
        schemaName: 'public',
        columns: noPkCols,
        row,
      });
      expect(pgDelete).toBe(
        'DELETE FROM "public"."tags" WHERE ctid = (SELECT ctid FROM "public"."tags" WHERE "tag" = \'tech\' AND "score" = 100 LIMIT 1);'
      );

      // SQLite
      const sqliteUpdate = buildUpdateSql({
        driver: 'sqlite',
        tableName: 'tags',
        columns: noPkCols,
        row,
        colIndex: 1,
        newValue: 300,
      });
      expect(sqliteUpdate).toBe(
        'UPDATE "tags" SET "score" = 300 WHERE rowid = (SELECT rowid FROM "tags" WHERE "tag" = \'tech\' AND "score" = 100 LIMIT 1);'
      );

      // MySQL
      const mysqlUpdate = buildUpdateSql({
        driver: 'mysql',
        tableName: 'tags',
        columns: noPkCols,
        row,
        colIndex: 1,
        newValue: 400,
      });
      expect(mysqlUpdate).toBe(
        'UPDATE `tags` SET `score` = 400 WHERE `tag` = \'tech\' AND `score` = 100 LIMIT 1;'
      );

      // Error when no columns
      expect(() =>
        buildUpdateSql({
          driver: 'postgres',
          tableName: 'empty',
          columns: [],
          row: [],
          colIndex: 0,
          newValue: 1,
        })
      ).toThrow();
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

  describe('Select Query Builder', () => {
    it('returns empty string if baseTable is empty', () => {
      expect(buildSelectQuery({ baseTable: '' })).toBe('');
    });

    it('generates basic SELECT * FROM table for SQLite/Postgres', () => {
      const sql = buildSelectQuery({
        baseTable: 'users',
        driver: 'postgres',
      });
      expect(sql).toBe('SELECT *\nFROM "users";');
    });

    it('generates SELECT with specific columns, table prefix and aliases', () => {
      const sql = buildSelectQuery({
        baseTable: 'users',
        driver: 'postgres',
        columns: [
          { column: 'id', table: 'users' },
          { column: 'email', alias: 'user_email' },
          { column: 'name' },
        ],
      });
      expect(sql).toBe('SELECT "users"."id", "email" AS "user_email", "name"\nFROM "users";');
    });

    it('generates SELECT with table aliases and DISTINCT', () => {
      const sql = buildSelectQuery({
        baseTable: 'orders',
        baseTableAlias: 'o',
        distinct: true,
        driver: 'sqlite',
        columns: [{ column: 'status' }],
      });
      expect(sql).toBe('SELECT DISTINCT "status"\nFROM "orders" AS "o";');
    });

    it('generates aggregate functions on columns', () => {
      const sql = buildSelectQuery({
        baseTable: 'orders',
        driver: 'postgres',
        columns: [
          { column: '*', aggregate: 'COUNT', alias: 'total_orders' },
          { column: 'total_price', aggregate: 'SUM', alias: 'revenue' },
          { column: 'customer_id', aggregate: 'COUNT', distinct: true, alias: 'unique_customers' },
        ],
      });
      expect(sql).toBe(
        'SELECT COUNT(*) AS "total_orders", SUM("total_price") AS "revenue", COUNT(DISTINCT "customer_id") AS "unique_customers"\nFROM "orders";'
      );
    });

    it('generates JOIN clauses (INNER, LEFT)', () => {
      const sql = buildSelectQuery({
        baseTable: 'users',
        baseTableAlias: 'u',
        driver: 'postgres',
        columns: [
          { table: 'u', column: 'id' },
          { table: 'u', column: 'name' },
          { table: 'o', column: 'total' },
        ],
        joins: [
          {
            id: 'j1',
            type: 'INNER',
            table: 'orders',
            alias: 'o',
            leftTable: 'u',
            leftColumn: 'id',
            rightTable: 'o',
            rightColumn: 'user_id',
          },
          {
            id: 'j2',
            type: 'LEFT',
            table: 'profiles',
            alias: 'p',
            leftTable: 'u',
            leftColumn: 'id',
            rightTable: 'p',
            rightColumn: 'user_id',
          },
        ],
      });

      expect(sql).toContain('FROM "users" AS "u"');
      expect(sql).toContain('INNER JOIN "orders" AS "o" ON "u"."id" = "o"."user_id"');
      expect(sql).toContain('LEFT JOIN "profiles" AS "p" ON "u"."id" = "p"."user_id"');
    });

    it('generates WHERE filter conditions (equals, contains, between, is_null, etc.)', () => {
      const sql = buildSelectQuery({
        baseTable: 'users',
        driver: 'postgres',
        filters: [
          { id: '1', column: 'status', operator: 'equals', value: 'active' },
          { id: '2', column: 'name', operator: 'contains', value: 'admin' },
          { id: '3', column: 'age', operator: 'between', value: '18', valueTo: '65' },
          { id: '4', column: 'deleted_at', operator: 'is_null' },
        ],
        filterConjunction: 'AND',
      });

      expect(sql).toContain(
        `WHERE "status" = 'active' AND "name" LIKE '%admin%' AND "age" BETWEEN 18 AND 65 AND "deleted_at" IS NULL`
      );
    });

    it('generates WHERE with OR conjunction and starts_with / ends_with', () => {
      const sql = buildSelectQuery({
        baseTable: 'users',
        driver: 'postgres',
        filters: [
          { id: '1', column: 'email', operator: 'starts_with', value: 'test' },
          { id: '2', column: 'email', operator: 'ends_with', value: '.org' },
        ],
        filterConjunction: 'OR',
      });

      expect(sql).toContain(`WHERE "email" LIKE 'test%' OR "email" LIKE '%.org'`);
    });

    it('generates ORDER BY and LIMIT & OFFSET', () => {
      const sql = buildSelectQuery({
        baseTable: 'users',
        driver: 'postgres',
        orderBy: [
          { id: 'o1', column: 'created_at', direction: 'DESC' },
          { id: 'o2', column: 'id', direction: 'ASC' },
        ],
        limit: 50,
        offset: 10,
      });

      expect(sql).toContain('ORDER BY "created_at" DESC, "id" ASC');
      expect(sql).toContain('LIMIT 50');
      expect(sql).toContain('OFFSET 10');
    });

    it('supports MySQL backtick identifier escaping', () => {
      const sql = buildSelectQuery({
        baseTable: 'products',
        schemaName: 'shop',
        driver: 'mysql',
        columns: [{ column: 'name' }, { column: 'price' }],
        filters: [{ id: '1', column: 'price', operator: 'greater_than', value: '100' }],
        limit: 20,
      });

      expect(sql).toBe(
        'SELECT `name`, `price`\nFROM `shop`.`products`\nWHERE `price` > 100\nLIMIT 20;'
      );
    });
  });
});
});
