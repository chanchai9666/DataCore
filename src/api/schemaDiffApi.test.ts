import { describe, it, expect } from 'vitest';
import {
  compareSchemas,
  generateMigrationSql,
} from './schemaDiffApi';
import type { ERTable } from '../types/db';

describe('schemaDiffApi', () => {
  const sourceTables: ERTable[] = [
    {
      id: 'users',
      name: 'users',
      x: 0,
      y: 0,
      columns: [
        { name: 'id', dataType: 'INTEGER', isPrimaryKey: true, isNullable: false },
        { name: 'email', dataType: 'VARCHAR(255)', isPrimaryKey: false, isNullable: false },
        { name: 'created_at', dataType: 'TIMESTAMP', isPrimaryKey: false, isNullable: true },
      ],
    },
    {
      id: 'products',
      name: 'products',
      x: 0,
      y: 0,
      columns: [
        { name: 'id', dataType: 'INTEGER', isPrimaryKey: true, isNullable: false },
        { name: 'price', dataType: 'DECIMAL(10,2)', isPrimaryKey: false, isNullable: false },
      ],
    },
    {
      id: 'orders',
      name: 'orders',
      x: 0,
      y: 0,
      columns: [
        { name: 'id', dataType: 'INTEGER', isPrimaryKey: true, isNullable: false },
      ],
    },
  ];

  const targetTables: ERTable[] = [
    {
      id: 'users',
      name: 'users',
      x: 0,
      y: 0,
      columns: [
        { name: 'id', dataType: 'INTEGER', isPrimaryKey: true, isNullable: false },
        { name: 'email', dataType: 'VARCHAR(100)', isPrimaryKey: false, isNullable: true }, // type and nullability mismatch
        // missing created_at
        { name: 'old_field', dataType: 'TEXT', isPrimaryKey: false, isNullable: true }, // removed in source
      ],
    },
    {
      id: 'products',
      name: 'products',
      x: 0,
      y: 0,
      columns: [
        { name: 'id', dataType: 'INTEGER', isPrimaryKey: true, isNullable: false },
        { name: 'price', dataType: 'DECIMAL(10,2)', isPrimaryKey: false, isNullable: false },
      ],
    },
    {
      id: 'legacy_logs',
      name: 'legacy_logs',
      x: 0,
      y: 0,
      columns: [
        { name: 'id', dataType: 'INTEGER', isPrimaryKey: true, isNullable: false },
      ],
    },
  ];

  it('accurately detects table-level additions, deletions, and modifications', () => {
    const diff = compareSchemas(
      { connectionId: 'c1', tables: sourceTables, driver: 'postgres' },
      { connectionId: 'c2', tables: targetTables, driver: 'postgres' }
    );

    expect(diff.summary.identicalCount).toBe(1); // products
    expect(diff.summary.differentCount).toBe(1); // users
    expect(diff.summary.onlyInSourceCount).toBe(1); // orders
    expect(diff.summary.onlyInTargetCount).toBe(1); // legacy_logs

    const usersDiff = diff.tables.find((t) => t.tableName === 'users');
    expect(usersDiff).toBeDefined();
    expect(usersDiff?.status).toBe('different');

    // Column diffs in users:
    // id -> identical
    // email -> type_mismatch
    // created_at -> added (in source, missing in target)
    // old_field -> removed (missing in source, present in target)
    const emailDiff = usersDiff?.columnDiffs.find((c) => c.name === 'email');
    expect(emailDiff?.status).toBe('type_mismatch');

    const createdDiff = usersDiff?.columnDiffs.find((c) => c.name === 'created_at');
    expect(createdDiff?.status).toBe('added');

    const oldDiff = usersDiff?.columnDiffs.find((c) => c.name === 'old_field');
    expect(oldDiff?.status).toBe('removed');
  });

  it('generates synchronized DDL migration SQL script for postgres/mysql with safeguards', () => {
    const diff = compareSchemas(
      { connectionId: 'c1', tables: sourceTables, driver: 'postgres' },
      { connectionId: 'c2', tables: targetTables, driver: 'postgres' }
    );

    // Default safe mode: DROP TABLE and DROP COLUMN are commented out with safeguards
    const safeMigration = generateMigrationSql(diff, 'postgres');
    expect(safeMigration.up).toContain('CREATE TABLE "orders"');
    expect(safeMigration.up).toContain('ALTER TABLE "users" ADD COLUMN "created_at"');
    expect(safeMigration.up).toContain('-- [SAFEGUARD]');
    expect(safeMigration.up).toContain('-- DROP TABLE IF EXISTS "legacy_logs";');
    expect(safeMigration.down).toContain('DROP TABLE IF EXISTS "orders"');

    // Destructive mode enabled
    const destructiveMigration = generateMigrationSql(diff, 'postgres', {
      allowDestructiveDrop: true,
    });
    expect(destructiveMigration.up).toContain('DROP TABLE IF EXISTS "legacy_logs";');
    expect(destructiveMigration.up).toContain('ALTER TABLE "users" DROP COLUMN "old_field";');
  });

  it('generates nullability mismatch migration across PostgreSQL, MySQL, and SQLite', () => {
    const sourceWithNull: ERTable[] = [
      {
        id: 'accounts',
        name: 'accounts',
        x: 0,
        y: 0,
        columns: [
          { name: 'id', dataType: 'INTEGER', isPrimaryKey: true, isNullable: false },
          { name: 'phone', dataType: 'VARCHAR(20)', isPrimaryKey: false, isNullable: true }, // Changed to nullable
          { name: 'nickname', dataType: 'VARCHAR(50)', isPrimaryKey: false, isNullable: false }, // Changed to NOT NULL
        ],
      },
    ];

    const targetWithNull: ERTable[] = [
      {
        id: 'accounts',
        name: 'accounts',
        x: 0,
        y: 0,
        columns: [
          { name: 'id', dataType: 'INTEGER', isPrimaryKey: true, isNullable: false },
          { name: 'phone', dataType: 'VARCHAR(20)', isPrimaryKey: false, isNullable: false }, // Was NOT NULL
          { name: 'nickname', dataType: 'VARCHAR(50)', isPrimaryKey: false, isNullable: true }, // Was nullable
        ],
      },
    ];

    const diff = compareSchemas(
      { connectionId: 'c1', tables: sourceWithNull, driver: 'postgres' },
      { connectionId: 'c2', tables: targetWithNull, driver: 'postgres' }
    );

    // PostgreSQL
    const pgSql = generateMigrationSql(diff, 'postgres');
    expect(pgSql.up).toContain('ALTER TABLE "accounts" ALTER COLUMN "phone" DROP NOT NULL;');
    expect(pgSql.up).toContain('ALTER TABLE "accounts" ALTER COLUMN "nickname" SET NOT NULL;');

    // MySQL
    const mySql = generateMigrationSql(diff, 'mysql');
    expect(mySql.up).toContain('ALTER TABLE `accounts` MODIFY COLUMN `phone` VARCHAR(20) NULL;');
    expect(mySql.up).toContain('ALTER TABLE `accounts` MODIFY COLUMN `nickname` VARCHAR(50) NOT NULL;');

    // SQLite
    const sqliteSql = generateMigrationSql(diff, 'sqlite');
    expect(sqliteSql.up).toContain('-- [SQLITE REBUILD REQUIRED]');
  });

  it('handles type mismatch gracefully for SQLite with table rebuild note', () => {
    const source: ERTable[] = [
      {
        id: 'items',
        name: 'items',
        x: 0,
        y: 0,
        columns: [{ name: 'val', dataType: 'BIGINT', isPrimaryKey: false, isNullable: true }],
      },
    ];
    const target: ERTable[] = [
      {
        id: 'items',
        name: 'items',
        x: 0,
        y: 0,
        columns: [{ name: 'val', dataType: 'INTEGER', isPrimaryKey: false, isNullable: true }],
      },
    ];

    const diff = compareSchemas(
      { connectionId: 'c1', tables: source, driver: 'sqlite' },
      { connectionId: 'c2', tables: target, driver: 'sqlite' }
    );

    const sqliteSql = generateMigrationSql(diff, 'sqlite');
    expect(sqliteSql.up).toContain('-- [SQLITE REBUILD REQUIRED]');
    expect(sqliteSql.up).not.toContain('ALTER TABLE "items" ALTER COLUMN');
  });

  describe('cross-dialect type mapping', () => {
    it('correctly maps complex Postgres types to SQLite target', () => {
      const sourceWithPgTypes: ERTable[] = [
        {
          id: 'app_configurations',
          name: 'app_configurations',
          x: 0,
          y: 0,
          columns: [
            { name: 'id', dataType: 'uuid', isPrimaryKey: true, isNullable: false },
            { name: 'branch_id', dataType: 'uuid', isPrimaryKey: false, isNullable: true },
            { name: 'key', dataType: 'character varying', isPrimaryKey: false, isNullable: false },
            { name: 'value', dataType: 'jsonb', isPrimaryKey: false, isNullable: false },
            { name: 'created_at', dataType: 'timestamp with time zone', isPrimaryKey: false, isNullable: false },
            { name: 'is_active', dataType: 'boolean', isPrimaryKey: false, isNullable: false },
          ],
        },
      ];

      const diff = compareSchemas(
        { connectionId: 'pg1', tables: sourceWithPgTypes, driver: 'postgres' },
        { connectionId: 'sq1', tables: [], driver: 'sqlite' }
      );

      const migration = generateMigrationSql(diff, 'sqlite');
      // When target is SQLite:
      // uuid -> TEXT
      // character varying -> TEXT
      // jsonb -> TEXT
      // timestamp with time zone -> TEXT
      // boolean -> INTEGER
      expect(migration.up).toContain('"id" TEXT NOT NULL PRIMARY KEY');
      expect(migration.up).toContain('"branch_id" TEXT');
      expect(migration.up).toContain('"key" TEXT NOT NULL');
      expect(migration.up).toContain('"value" TEXT NOT NULL');
      expect(migration.up).toContain('"created_at" TEXT NOT NULL');
      expect(migration.up).toContain('"is_active" INTEGER NOT NULL');
      // Must not contain postgres specific keywords in sqlite DDL
      expect(migration.up).not.toContain('uuid');
      expect(migration.up).not.toContain('jsonb');
      expect(migration.up).not.toContain('character varying');
    });

    it('correctly maps Postgres types to MySQL target', () => {
      const sourceWithPgTypes: ERTable[] = [
        {
          id: 'devices',
          name: 'devices',
          x: 0,
          y: 0,
          columns: [
            { name: 'id', dataType: 'uuid', isPrimaryKey: true, isNullable: false },
            { name: 'config', dataType: 'jsonb', isPrimaryKey: false, isNullable: true },
            { name: 'enabled', dataType: 'boolean', isPrimaryKey: false, isNullable: false },
          ],
        },
      ];

      const diff = compareSchemas(
        { connectionId: 'pg1', tables: sourceWithPgTypes, driver: 'postgres' },
        { connectionId: 'my1', tables: [], driver: 'mysql' }
      );

      const migration = generateMigrationSql(diff, 'mysql');
      expect(migration.up).toContain('`id` VARCHAR(36) NOT NULL PRIMARY KEY');
      expect(migration.up).toContain('`config` JSON');
      expect(migration.up).toContain('`enabled` TINYINT(1) NOT NULL');
    });
  });

  describe('extractRunnableStatements', () => {
    it('filters out pure comments and safeguards from execution list', async () => {
      const { extractRunnableStatements } = await import('./schemaDiffApi');
      const script = `
CREATE TABLE "users" (
  "id" INTEGER PRIMARY KEY,
  "name" TEXT NOT NULL
);

-- [SAFEGUARD] Table only exists in target. Destructive DROP disabled by default:
-- DROP TABLE IF EXISTS "legacy";

-- [SQLITE REBUILD REQUIRED] SQLite does not support ALTER COLUMN TYPE.
      `;

      const runnable = extractRunnableStatements(script);
      expect(runnable).toHaveLength(1);
      expect(runnable[0]).toContain('CREATE TABLE "users"');
      expect(runnable.some((s) => s.includes('[SAFEGUARD]'))).toBe(false);
      expect(runnable.some((s) => s.includes('[SQLITE REBUILD REQUIRED]'))).toBe(false);
    });
  });

  describe('bulk schema column parsing and deduplication', () => {
    it('parses bulk Postgres columns and prevents duplicate column entries for multi-key columns', async () => {
      const { parsePostgresBulkColumns } = await import('./schemaDiffApi');
      // Simulate rows from:
      // SELECT c.table_name, c.column_name, c.data_type, c.is_nullable, is_pk
      const mockRows: any[][] = [
        ['app_config', 'id', 'uuid', 'NO', 1],
        ['app_config', 'branch_id', 'uuid', 'YES', 0],
        ['app_config', 'key', 'character varying', 'NO', 0],
        ['app_config', 'value', 'jsonb', 'NO', 0],
        ['audit_logs', 'id', 'uuid', 'NO', 1],
        ['audit_logs', 'action', 'text', 'NO', 0],
      ];

      const tableMap = parsePostgresBulkColumns(mockRows);
      expect(tableMap.has('app_config')).toBe(true);
      expect(tableMap.has('audit_logs')).toBe(true);

      const appConfigCols = tableMap.get('app_config')!;
      expect(appConfigCols).toHaveLength(4);
      // Ensure branch_id is exactly 1 entry (not duplicated)
      const branchCols = appConfigCols.filter((c) => c.name === 'branch_id');
      expect(branchCols).toHaveLength(1);
      expect(branchCols[0].isPrimaryKey).toBe(false);
      expect(branchCols[0].isNullable).toBe(true);
    });
  });
});
