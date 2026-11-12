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

  it('generates synchronized DDL migration SQL script for postgres/mysql', () => {
    const diff = compareSchemas(
      { connectionId: 'c1', tables: sourceTables, driver: 'postgres' },
      { connectionId: 'c2', tables: targetTables, driver: 'postgres' }
    );

    const migration = generateMigrationSql(diff, 'postgres');
    expect(migration.up).toContain('CREATE TABLE "orders"');
    expect(migration.up).toContain('ALTER TABLE "users" ADD COLUMN "created_at"');
    expect(migration.up).toContain('ALTER TABLE "users" DROP COLUMN "old_field"');
    expect(migration.down).toContain('DROP TABLE IF EXISTS "orders"');
  });
});
