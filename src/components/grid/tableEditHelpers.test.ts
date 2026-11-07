import { describe, it, expect } from 'vitest';
import {
  escapeIdentifier,
  formatTableName,
  formatSqlLiteral,
  buildUpdateSql,
  buildDeleteSql,
  buildInsertSql,
} from './tableEditHelpers';
import type { ColumnMeta, CellValue } from '../../types/db';

describe('tableEditHelpers', () => {
  const columns: ColumnMeta[] = [
    { name: 'id', data_type: 'uuid', nullable: false },
    { name: 'code', data_type: 'varchar', nullable: true },
    { name: 'name', data_type: 'text', nullable: false },
    { name: 'price', data_type: 'numeric', nullable: false },
    { name: 'is_active', data_type: 'bool', nullable: false },
  ];

  const row: CellValue[] = [
    { Text: '8f02d215-5203-4a9c-9d18-8e83f893ad2a' },
    { Text: 'PRD-905672' },
    { Text: "Pepsi's Can" },
    { Integer: 1800 },
    { Boolean: true },
  ];

  describe('escapeIdentifier', () => {
    it('escapes with double quotes for postgres and sqlite', () => {
      expect(escapeIdentifier('users', 'postgres')).toBe('"users"');
      expect(escapeIdentifier('users', 'sqlite')).toBe('"users"');
      expect(escapeIdentifier('user"name', 'postgres')).toBe('"user""name"');
    });

    it('escapes with backticks for mysql', () => {
      expect(escapeIdentifier('orders', 'mysql')).toBe('`orders`');
      expect(escapeIdentifier('my`order', 'mysql')).toBe('`my``order`');
    });
  });

  describe('formatTableName', () => {
    it('formats schema and table name', () => {
      expect(formatTableName('products', 'public', 'postgres')).toBe('"public"."products"');
      expect(formatTableName('products', undefined, 'sqlite')).toBe('"products"');
      expect(formatTableName('products', 'pos_db', 'mysql')).toBe('`pos_db`.`products`');
    });
  });

  describe('formatSqlLiteral', () => {
    it('handles null, numbers, booleans, and escaped strings', () => {
      expect(formatSqlLiteral(null, 'postgres')).toBe('NULL');
      expect(formatSqlLiteral('NULL', 'postgres')).toBe('NULL');
      expect(formatSqlLiteral(150.5, 'postgres')).toBe('150.5');
      expect(formatSqlLiteral(true, 'postgres')).toBe('TRUE');
      expect(formatSqlLiteral(false, 'postgres')).toBe('FALSE');
      expect(formatSqlLiteral(true, 'mysql')).toBe('1');
      expect(formatSqlLiteral(false, 'sqlite')).toBe('0');
      expect(formatSqlLiteral("O'Reilly", 'postgres')).toBe("'O''Reilly'");
    });
  });

  describe('buildUpdateSql', () => {
    it('generates UPDATE statement targeting primary key for postgres', () => {
      const sql = buildUpdateSql({
        driver: 'postgres',
        tableName: 'products',
        schemaName: 'public',
        columns,
        row,
        colIndex: 3, // price
        newValue: 2000,
      });

      expect(sql).toBe(
        `UPDATE "public"."products" SET "price" = 2000 WHERE "id" = '8f02d215-5203-4a9c-9d18-8e83f893ad2a';`
      );
    });

    it('handles text updates with single quotes and special characters', () => {
      const sql = buildUpdateSql({
        driver: 'postgres',
        tableName: 'products',
        schemaName: 'public',
        columns,
        row,
        colIndex: 2, // name
        newValue: "Pepsi's Zero Sugar",
      });

      expect(sql).toBe(
        `UPDATE "public"."products" SET "name" = 'Pepsi''s Zero Sugar' WHERE "id" = '8f02d215-5203-4a9c-9d18-8e83f893ad2a';`
      );
    });

    it('falls back to composite WHERE if no id column exists', () => {
      const noPkCols: ColumnMeta[] = [
        { name: 'tag', data_type: 'text', nullable: true },
        { name: 'weight', data_type: 'integer', nullable: false },
      ];
      const noPkRow: CellValue[] = [{ Text: 'beverage' }, { Integer: 10 }];

      const sql = buildUpdateSql({
        driver: 'postgres',
        tableName: 'tags',
        schemaName: 'public',
        columns: noPkCols,
        row: noPkRow,
        colIndex: 1,
        newValue: 25,
      });

      expect(sql).toBe(
        `UPDATE "public"."tags" SET "weight" = 25 WHERE "tag" = 'beverage' AND "weight" = 10;`
      );
    });
  });

  describe('buildDeleteSql', () => {
    it('generates DELETE statement targeting primary key', () => {
      const sql = buildDeleteSql({
        driver: 'postgres',
        tableName: 'products',
        schemaName: 'public',
        columns,
        row,
      });

      expect(sql).toBe(
        `DELETE FROM "public"."products" WHERE "id" = '8f02d215-5203-4a9c-9d18-8e83f893ad2a';`
      );
    });
  });

  describe('buildInsertSql', () => {
    it('generates INSERT statement with specified values', () => {
      const sql = buildInsertSql({
        driver: 'postgres',
        tableName: 'products',
        schemaName: 'public',
        columns,
        values: {
          code: 'PRD-123456',
          name: 'Iced Latte',
          price: 65,
          is_active: true,
        },
      });

      expect(sql).toBe(
        `INSERT INTO "public"."products" ("code", "name", "price", "is_active") VALUES ('PRD-123456', 'Iced Latte', 65, TRUE);`
      );
    });

    it('omits id / serial columns when value is null or empty so DB generates it', () => {
      const sql = buildInsertSql({
        driver: 'postgres',
        tableName: 'test_data',
        schemaName: 'public',
        columns: [
          { name: 'id', data_type: 'serial', nullable: false },
          { name: 'name', data_type: 'varchar', nullable: false },
        ],
        values: {
          id: null,
          name: 'Sample Item',
        },
      });

      expect(sql).toBe(
        `INSERT INTO "public"."test_data" ("name") VALUES ('Sample Item');`
      );
    });
  });
});
