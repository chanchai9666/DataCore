import { describe, it, expect } from 'vitest';
import {
  quoteIdentifier,
  getTableRef,
  getFetchColumnsSql,
  parseColumnsFromQueryResult,
  buildAddColumnSql,
  buildDropColumnSql,
  buildRenameColumnSql,
  buildModifyColumnSql,
  generateTableDdl,
  composeDataType,
  parseDataType,
  type TableColumnStructure,
} from './tableStructureHelpers';
import type { QueryResult } from '../../types/db';

describe('tableStructureHelpers', () => {
  describe('composeDataType & parseDataType', () => {
    it('composes base type with length/values such as varchar(30) and int(5)', () => {
      expect(composeDataType('VARCHAR', '30')).toBe('VARCHAR(30)');
      expect(composeDataType('int', '5')).toBe('int(5)');
      expect(composeDataType('INTEGER', '(5)')).toBe('INTEGER(5)');
      expect(composeDataType('VARCHAR(255)', '30')).toBe('VARCHAR(30)');
      expect(composeDataType('NUMERIC', '10,2')).toBe('NUMERIC(10,2)');
      expect(composeDataType('TEXT', '')).toBe('TEXT');
      expect(composeDataType('TEXT', undefined)).toBe('TEXT');
    });

    it('parses full type into base type and length/values', () => {
      expect(parseDataType('VARCHAR(30)')).toEqual({ baseType: 'VARCHAR', lengthOrValues: '30' });
      expect(parseDataType('int(5)')).toEqual({ baseType: 'int', lengthOrValues: '5' });
      expect(parseDataType('NUMERIC(10, 2)')).toEqual({ baseType: 'NUMERIC', lengthOrValues: '10, 2' });
      expect(parseDataType('TEXT')).toEqual({ baseType: 'TEXT', lengthOrValues: '' });
    });
  });

  describe('quoteIdentifier & getTableRef', () => {
    it('quotes identifiers properly for Postgres and SQLite', () => {
      expect(quoteIdentifier('users', 'postgres')).toBe('"users"');
      expect(quoteIdentifier('users', 'sqlite')).toBe('"users"');
      expect(getTableRef('users', 'public', 'postgres')).toBe('"public"."users"');
      expect(getTableRef('users', undefined, 'sqlite')).toBe('"users"');
    });

    it('quotes identifiers properly for MySQL', () => {
      expect(quoteIdentifier('users', 'mysql')).toBe('`users`');
      expect(getTableRef('users', 'mydb', 'mysql')).toBe('`mydb`.`users`');
    });
  });

  describe('getFetchColumnsSql', () => {
    it('generates PRAGMA for SQLite', () => {
      const sql = getFetchColumnsSql('sqlite', 'categories');
      expect(sql).toContain("PRAGMA table_info('categories');");
    });

    it('generates information_schema query for MySQL', () => {
      const sql = getFetchColumnsSql('mysql', 'categories', 'mydb');
      expect(sql).toContain("information_schema.columns");
      expect(sql).toContain("table_name = 'categories'");
      expect(sql).toContain("table_schema = 'mydb'");
    });

    it('generates information_schema with PK join for Postgres', () => {
      const sql = getFetchColumnsSql('postgres', 'categories', 'public');
      expect(sql).toContain("information_schema.columns");
      expect(sql).toContain("table_constraints");
      expect(sql).toContain("PRIMARY KEY");
      expect(sql).toContain("table_name = 'categories'");
      expect(sql).toContain("table_schema = 'public'");
    });
  });

  describe('parseColumnsFromQueryResult', () => {
    it('parses SQLite PRAGMA table_info rows', () => {
      const mockResult: QueryResult = {
        columns: [
          { name: 'cid', data_type: 'integer', nullable: false },
          { name: 'name', data_type: 'text', nullable: false },
          { name: 'type', data_type: 'text', nullable: false },
          { name: 'notnull', data_type: 'integer', nullable: false },
          { name: 'dflt_value', data_type: 'text', nullable: true },
          { name: 'pk', data_type: 'integer', nullable: false },
        ],
        rows: [
          ['0', 'id', 'INTEGER', '1', null, '1'],
          ['1', 'title', 'TEXT', '0', "'untitled'", '0'],
        ],
        execution_time_ms: 2,
      };

      const columns = parseColumnsFromQueryResult(mockResult, 'sqlite');
      expect(columns).toHaveLength(2);
      expect(columns[0]).toEqual({
        name: 'id',
        dataType: 'INTEGER',
        isNullable: false,
        defaultValue: null,
        isPrimaryKey: true,
        ordinalPosition: 1,
      });
      expect(columns[1]).toEqual({
        name: 'title',
        dataType: 'TEXT',
        isNullable: true,
        defaultValue: "'untitled'",
        isPrimaryKey: false,
        ordinalPosition: 2,
      });
    });

    it('parses Postgres columns with primary key', () => {
      const mockResult: QueryResult = {
        columns: [],
        rows: [
          ['id', 'uuid', 'uuid', 'NO', 'gen_random_uuid()', '1', 'YES'],
          ['name', 'text', 'text', 'NO', null, '2', 'NO'],
          ['sort_order', 'integer', 'int4', 'YES', '0', '3', 'NO'],
        ],
        execution_time_ms: 5,
      };

      const columns = parseColumnsFromQueryResult(mockResult, 'postgres');
      expect(columns).toHaveLength(3);
      expect(columns[0].name).toBe('id');
      expect(columns[0].isPrimaryKey).toBe(true);
      expect(columns[0].isNullable).toBe(false);
      expect(columns[0].defaultValue).toBe('gen_random_uuid()');

      expect(columns[2].name).toBe('sort_order');
      expect(columns[2].isPrimaryKey).toBe(false);
      expect(columns[2].isNullable).toBe(true);
      expect(columns[2].defaultValue).toBe('0');
    });

    it('falls back to fallbackColumns when query result is empty', () => {
      const mockResult: QueryResult = { columns: [], rows: [], execution_time_ms: 1 };
      const fallback = [
        { name: 'id', data_type: 'uuid', nullable: false },
        { name: 'name', data_type: 'varchar', nullable: true },
      ];
      const columns = parseColumnsFromQueryResult(mockResult, 'postgres', fallback);
      expect(columns).toHaveLength(2);
      expect(columns[0].name).toBe('id');
      expect(columns[0].isPrimaryKey).toBe(true);
      expect(columns[1].name).toBe('name');
      expect(columns[1].isPrimaryKey).toBe(false);
    });
  });

  describe('buildAddColumnSql', () => {
    it('generates Postgres ALTER TABLE ADD COLUMN', () => {
      const sql = buildAddColumnSql({
        driver: 'postgres',
        tableName: 'categories',
        schemaName: 'public',
        columnName: 'description',
        dataType: 'TEXT',
        isNullable: true,
        defaultValue: "''",
      });
      expect(sql).toBe('ALTER TABLE "public"."categories" ADD COLUMN "description" TEXT DEFAULT \'\';');
    });

    it('generates Postgres ALTER TABLE ADD COLUMN NOT NULL', () => {
      const sql = buildAddColumnSql({
        driver: 'postgres',
        tableName: 'categories',
        schemaName: 'public',
        columnName: 'status',
        dataType: 'VARCHAR(50)',
        isNullable: false,
      });
      expect(sql).toBe('ALTER TABLE "public"."categories" ADD COLUMN "status" VARCHAR(50) NOT NULL;');
    });

    it('generates MySQL ALTER TABLE ADD COLUMN', () => {
      const sql = buildAddColumnSql({
        driver: 'mysql',
        tableName: 'categories',
        schemaName: 'mydb',
        columnName: 'is_active',
        dataType: 'TINYINT(1)',
        isNullable: false,
        defaultValue: '1',
      });
      expect(sql).toBe('ALTER TABLE `mydb`.`categories` ADD COLUMN `is_active` TINYINT(1) DEFAULT 1 NOT NULL;');
    });
  });

  describe('buildDropColumnSql', () => {
    it('generates Postgres DROP COLUMN statement', () => {
      const sql = buildDropColumnSql({
        driver: 'postgres',
        tableName: 'categories',
        schemaName: 'public',
        columnName: 'sort_order',
      });
      expect(sql).toBe('ALTER TABLE "public"."categories" DROP COLUMN "sort_order";');
    });

    it('generates MySQL DROP COLUMN statement', () => {
      const sql = buildDropColumnSql({
        driver: 'mysql',
        tableName: 'categories',
        columnName: 'sort_order',
      });
      expect(sql).toBe('ALTER TABLE `categories` DROP COLUMN `sort_order`;');
    });
  });

  describe('buildRenameColumnSql', () => {
    it('generates Postgres RENAME COLUMN statement', () => {
      const sql = buildRenameColumnSql({
        driver: 'postgres',
        tableName: 'categories',
        schemaName: 'public',
        oldColumnName: 'name',
        newColumnName: 'title',
      });
      expect(sql).toBe('ALTER TABLE "public"."categories" RENAME COLUMN "name" TO "title";');
    });

    it('generates SQLite RENAME COLUMN statement', () => {
      const sql = buildRenameColumnSql({
        driver: 'sqlite',
        tableName: 'categories',
        oldColumnName: 'name',
        newColumnName: 'title',
      });
      expect(sql).toBe('ALTER TABLE "categories" RENAME COLUMN "name" TO "title";');
    });
  });

  describe('buildModifyColumnSql', () => {
    it('generates Postgres ALTER COLUMN statements for type, nullable, and default', () => {
      const stmts = buildModifyColumnSql({
        driver: 'postgres',
        tableName: 'categories',
        schemaName: 'public',
        columnName: 'name',
        oldDataType: 'varchar(50)',
        newDataType: 'varchar(255)',
        oldIsNullable: true,
        isNullable: false,
        oldDefaultValue: null,
        defaultValue: "'General'",
      });

      expect(stmts).toEqual([
        'ALTER TABLE "public"."categories" ALTER COLUMN "name" TYPE varchar(255) USING "name"::varchar(255);',
        'ALTER TABLE "public"."categories" ALTER COLUMN "name" SET NOT NULL;',
        'ALTER TABLE "public"."categories" ALTER COLUMN "name" SET DEFAULT \'General\';',
      ]);
    });

    it('generates MySQL MODIFY COLUMN statement', () => {
      const stmts = buildModifyColumnSql({
        driver: 'mysql',
        tableName: 'categories',
        columnName: 'name',
        newDataType: 'VARCHAR(255)',
        isNullable: false,
        defaultValue: "'General'",
      });

      expect(stmts).toEqual([
        'ALTER TABLE `categories` MODIFY COLUMN `name` VARCHAR(255) DEFAULT \'General\' NOT NULL;',
      ]);
    });

    it('throws when attempting modify in SQLite', () => {
      expect(() =>
        buildModifyColumnSql({
          driver: 'sqlite',
          tableName: 'categories',
          columnName: 'name',
          newDataType: 'TEXT',
        })
      ).toThrow(/SQLite does not support altering existing columns/i);
    });
  });

  describe('generateTableDdl', () => {
    it('generates a CREATE TABLE DDL', () => {
      const columns: TableColumnStructure[] = [
        {
          name: 'id',
          dataType: 'uuid',
          isNullable: false,
          defaultValue: 'gen_random_uuid()',
          isPrimaryKey: true,
          ordinalPosition: 1,
        },
        {
          name: 'name',
          dataType: 'text',
          isNullable: false,
          defaultValue: null,
          isPrimaryKey: false,
          ordinalPosition: 2,
        },
        {
          name: 'sort_order',
          dataType: 'integer',
          isNullable: true,
          defaultValue: '0',
          isPrimaryKey: false,
          ordinalPosition: 3,
        },
      ];

      const ddl = generateTableDdl({
        driver: 'postgres',
        tableName: 'categories',
        schemaName: 'public',
        columns,
      });

      expect(ddl).toContain('CREATE TABLE "public"."categories" (');
      expect(ddl).toContain('"id" uuid NOT NULL DEFAULT gen_random_uuid()');
      expect(ddl).toContain('"name" text NOT NULL');
      expect(ddl).toContain('"sort_order" integer DEFAULT 0');
      expect(ddl).toContain('PRIMARY KEY ("id")');
    });
  });
});
