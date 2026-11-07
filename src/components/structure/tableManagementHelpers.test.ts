import { describe, it, expect } from 'vitest';
import {
  buildCreateTableSql,
  buildDropTableSql,
  type NewTableColumnConfig,
  type CreateTableConfig,
} from './tableManagementHelpers';

describe('tableManagementHelpers', () => {
  describe('buildDropTableSql', () => {
    it('generates DROP TABLE for PostgreSQL with schema and optional CASCADE', () => {
      const sqlNoCascade = buildDropTableSql('customers', 'public', 'postgres', false);
      expect(sqlNoCascade).toBe('DROP TABLE "public"."customers";');

      const sqlCascade = buildDropTableSql('customers', 'public', 'postgres', true);
      expect(sqlCascade).toBe('DROP TABLE "public"."customers" CASCADE;');
    });

    it('generates DROP TABLE for MySQL with backticks', () => {
      const sql = buildDropTableSql('orders', undefined, 'mysql', false);
      expect(sql).toBe('DROP TABLE `orders`;');
    });

    it('generates DROP TABLE for SQLite with double quotes', () => {
      const sql = buildDropTableSql('items', undefined, 'sqlite', false);
      expect(sql).toBe('DROP TABLE "items";');
    });

    it('handles table without schema in postgres', () => {
      const sql = buildDropTableSql('users', undefined, 'postgres', false);
      expect(sql).toBe('DROP TABLE "users";');
    });
  });

  describe('buildCreateTableSql', () => {
    it('generates CREATE TABLE for PostgreSQL with PK and various types', () => {
      const columns: NewTableColumnConfig[] = [
        {
          name: 'id',
          dataType: 'SERIAL',
          isPrimaryKey: true,
          nullable: false,
        },
        {
          name: 'username',
          dataType: 'VARCHAR(50)',
          isPrimaryKey: false,
          nullable: false,
        },
        {
          name: 'email',
          dataType: 'VARCHAR(255)',
          isPrimaryKey: false,
          nullable: true,
        },
        {
          name: 'is_active',
          dataType: 'BOOLEAN',
          isPrimaryKey: false,
          nullable: false,
          defaultValue: 'true',
        },
        {
          name: 'created_at',
          dataType: 'TIMESTAMP',
          isPrimaryKey: false,
          nullable: false,
          defaultValue: 'now()',
        },
      ];

      const config: CreateTableConfig = {
        tableName: 'users',
        schemaName: 'public',
        driver: 'postgres',
        columns,
      };

      const sql = buildCreateTableSql(config);
      expect(sql).toContain('CREATE TABLE "public"."users" (');
      expect(sql).toContain('"id" SERIAL PRIMARY KEY');
      expect(sql).toContain('"username" VARCHAR(50) NOT NULL');
      expect(sql).toContain('"email" VARCHAR(255)');
      expect(sql).toContain('"is_active" BOOLEAN NOT NULL DEFAULT true');
      expect(sql).toContain('"created_at" TIMESTAMP NOT NULL DEFAULT now()');
      expect(sql.trim().endsWith(');')).toBe(true);
    });

    it('generates CREATE TABLE for MySQL with backticks and composite PK', () => {
      const columns: NewTableColumnConfig[] = [
        {
          name: 'order_id',
          dataType: 'INT',
          isPrimaryKey: true,
          nullable: false,
        },
        {
          name: 'item_id',
          dataType: 'INT',
          isPrimaryKey: true,
          nullable: false,
        },
        {
          name: 'quantity',
          dataType: 'INT',
          isPrimaryKey: false,
          nullable: false,
          defaultValue: '1',
        },
      ];

      const config: CreateTableConfig = {
        tableName: 'order_items',
        driver: 'mysql',
        columns,
      };

      const sql = buildCreateTableSql(config);
      expect(sql).toContain('CREATE TABLE `order_items` (');
      expect(sql).toContain('`order_id` INT NOT NULL');
      expect(sql).toContain('`item_id` INT NOT NULL');
      expect(sql).toContain('`quantity` INT NOT NULL DEFAULT 1');
      expect(sql).toContain('PRIMARY KEY (`order_id`, `item_id`)');
    });

    it('generates CREATE TABLE for SQLite with autoincrement PK', () => {
      const columns: NewTableColumnConfig[] = [
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
      ];

      const config: CreateTableConfig = {
        tableName: 'notes',
        driver: 'sqlite',
        columns,
      };

      const sql = buildCreateTableSql(config);
      expect(sql).toContain('CREATE TABLE "notes" (');
      expect(sql).toContain('"id" INTEGER PRIMARY KEY AUTOINCREMENT');
      expect(sql).toContain('"title" TEXT NOT NULL');
    });

    it('returns empty string when tableName is blank or columns are empty', () => {
      expect(
        buildCreateTableSql({
          tableName: '',
          columns: [{ name: 'id', dataType: 'INT', isPrimaryKey: true, nullable: false }],
        })
      ).toBe('');

      expect(
        buildCreateTableSql({
          tableName: 'empty_table',
          columns: [],
        })
      ).toBe('');
    });
  });
});
