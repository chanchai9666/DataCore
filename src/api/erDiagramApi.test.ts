import { describe, it, expect } from 'vitest';
import {
  computeAutoLayout,
  exportERDiagramAsSvg,
  generateERDiagramSql,
  parseSQLiteColumns,
  parseMySQLColumns,
  parsePostgresColumns,
  buildERRelationships,
} from './erDiagramApi';
import type { ERTable, ERRelationship, ERDiagramData } from '../types/db';
import type { QueryResult } from '../types/db';

describe('erDiagramApi', () => {
  describe('computeAutoLayout', () => {
    it('arranges tables in a grid when there are no relationships', () => {
      const tables: ERTable[] = [
        { id: 'users', name: 'users', columns: [], x: 0, y: 0 },
        { id: 'posts', name: 'posts', columns: [], x: 0, y: 0 },
        { id: 'tags', name: 'tags', columns: [], x: 0, y: 0 },
        { id: 'comments', name: 'comments', columns: [], x: 0, y: 0 },
      ];
      const rels: ERRelationship[] = [];

      const laidOut = computeAutoLayout(tables, rels, { columns: 2, cardWidth: 280, gapX: 60, gapY: 60 });
      expect(laidOut.length).toBe(4);
      // First row
      expect(laidOut[0].x).toBe(40);
      expect(laidOut[0].y).toBe(40);
      expect(laidOut[1].x).toBe(40 + 280 + 60);
      expect(laidOut[1].y).toBe(40);
      // Second row
      expect(laidOut[2].x).toBe(40);
      expect(laidOut[2].y).toBeGreaterThan(40);
    });

    it('positions referenced tables before referencing tables in topological layout', () => {
      const tables: ERTable[] = [
        { id: 'orders', name: 'orders', columns: [{ name: 'id', dataType: 'INTEGER', isPrimaryKey: true, isNullable: false }], x: 0, y: 0 },
        { id: 'customers', name: 'customers', columns: [{ name: 'id', dataType: 'INTEGER', isPrimaryKey: true, isNullable: false }], x: 0, y: 0 },
      ];
      const rels: ERRelationship[] = [
        {
          id: 'rel_1',
          fromTable: 'orders',
          fromColumn: 'customer_id',
          toTable: 'customers',
          toColumn: 'id',
        },
      ];

      const laidOut = computeAutoLayout(tables, rels);
      expect(laidOut.length).toBe(2);
      const cust = laidOut.find((t) => t.id === 'customers')!;
      const ord = laidOut.find((t) => t.id === 'orders')!;
      // customers should be placed in an earlier column or left of orders
      expect(cust.x).toBeLessThan(ord.x);
    });
  });

  describe('parseSQLiteColumns', () => {
    it('parses PRAGMA table_info result properly', () => {
      const queryResult: QueryResult = {
        columns: [
          { name: 'cid', data_type: 'INTEGER', nullable: false },
          { name: 'name', data_type: 'TEXT', nullable: false },
          { name: 'type', data_type: 'TEXT', nullable: false },
          { name: 'notnull', data_type: 'INTEGER', nullable: false },
          { name: 'dflt_value', data_type: 'TEXT', nullable: true },
          { name: 'pk', data_type: 'INTEGER', nullable: false },
        ],
        rows: [
          [{ Integer: 0 }, { Text: 'id' }, { Text: 'INTEGER' }, { Integer: 1 }, null, { Integer: 1 }],
          [{ Integer: 1 }, { Text: 'email' }, { Text: 'TEXT' }, { Integer: 1 }, null, { Integer: 0 }],
          [{ Integer: 2 }, { Text: 'bio' }, { Text: 'TEXT' }, { Integer: 0 }, null, { Integer: 0 }],
        ],
        execution_time_ms: 2,
      };

      const columns = parseSQLiteColumns(queryResult);
      expect(columns).toEqual([
        { name: 'id', dataType: 'INTEGER', isPrimaryKey: true, isNullable: false },
        { name: 'email', dataType: 'TEXT', isPrimaryKey: false, isNullable: false },
        { name: 'bio', dataType: 'TEXT', isPrimaryKey: false, isNullable: true },
      ]);
    });
  });

  describe('parseMySQLColumns', () => {
    it('parses MySQL information_schema columns properly', () => {
      const queryResult: QueryResult = {
        columns: [
          { name: 'column_name', data_type: 'varchar', nullable: false },
          { name: 'data_type', data_type: 'varchar', nullable: false },
          { name: 'is_nullable', data_type: 'varchar', nullable: false },
          { name: 'column_key', data_type: 'varchar', nullable: false },
        ],
        rows: [
          [{ Text: 'id' }, { Text: 'int' }, { Text: 'NO' }, { Text: 'PRI' }],
          [{ Text: 'name' }, { Text: 'varchar' }, { Text: 'YES' }, { Text: '' }],
        ],
        execution_time_ms: 1,
      };

      const columns = parseMySQLColumns(queryResult);
      expect(columns).toEqual([
        { name: 'id', dataType: 'int', isPrimaryKey: true, isNullable: false },
        { name: 'name', dataType: 'varchar', isPrimaryKey: false, isNullable: true },
      ]);
    });
  });

  describe('parsePostgresColumns', () => {
    it('parses Postgres information_schema columns properly', () => {
      const queryResult: QueryResult = {
        columns: [
          { name: 'column_name', data_type: 'varchar', nullable: false },
          { name: 'data_type', data_type: 'varchar', nullable: false },
          { name: 'is_nullable', data_type: 'varchar', nullable: false },
          { name: 'is_pk', data_type: 'integer', nullable: false },
        ],
        rows: [
          [{ Text: 'id' }, { Text: 'integer' }, { Text: 'NO' }, { Integer: 1 }],
          [{ Text: 'description' }, { Text: 'text' }, { Text: 'YES' }, { Integer: 0 }],
        ],
        execution_time_ms: 1,
      };

      const columns = parsePostgresColumns(queryResult);
      expect(columns).toEqual([
        { name: 'id', dataType: 'integer', isPrimaryKey: true, isNullable: false },
        { name: 'description', dataType: 'text', isPrimaryKey: false, isNullable: true },
      ]);
    });
  });

  describe('buildERRelationships', () => {
    it('converts parsed foreign keys into ERRelationship models', () => {
      const rels = buildERRelationships('orders', [
        {
          name: 'fk_orders_customer',
          columnNames: ['customer_id'],
          foreignTableName: 'customers',
          foreignColumnNames: ['id'],
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
      ]);

      expect(rels).toHaveLength(1);
      expect(rels[0]).toEqual({
        id: 'orders_fk_orders_customer_customer_id',
        fromTable: 'orders',
        fromColumn: 'customer_id',
        toTable: 'customers',
        toColumn: 'id',
        constraintName: 'fk_orders_customer',
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    });
  });

  describe('exportERDiagramAsSvg', () => {
    it('generates valid SVG string containing table names and connectors', () => {
      const data: ERDiagramData = {
        tables: [
          {
            id: 'users',
            name: 'users',
            x: 50,
            y: 50,
            columns: [{ name: 'id', dataType: 'INT', isPrimaryKey: true, isNullable: false }],
          },
          {
            id: 'orders',
            name: 'orders',
            x: 400,
            y: 50,
            columns: [
              { name: 'id', dataType: 'INT', isPrimaryKey: true, isNullable: false },
              { name: 'user_id', dataType: 'INT', isPrimaryKey: false, isNullable: false },
            ],
          },
        ],
        relationships: [
          {
            id: 'rel_1',
            fromTable: 'orders',
            fromColumn: 'user_id',
            toTable: 'users',
            toColumn: 'id',
          },
        ],
      };

      const svg = exportERDiagramAsSvg(data, 'dark');
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
      expect(svg).toContain('users');
      expect(svg).toContain('orders');
      expect(svg).toContain('user_id');
      expect(svg).toContain('<path'); // relationship connector
    });
  });

  describe('generateERDiagramSql', () => {
    it('generates CREATE TABLE DDL including columns and foreign keys', () => {
      const data: ERDiagramData = {
        tables: [
          {
            id: 'users',
            name: 'users',
            x: 0,
            y: 0,
            columns: [
              { name: 'id', dataType: 'INTEGER', isPrimaryKey: true, isNullable: false },
              { name: 'username', dataType: 'VARCHAR(100)', isPrimaryKey: false, isNullable: false },
            ],
          },
          {
            id: 'orders',
            name: 'orders',
            x: 0,
            y: 0,
            columns: [
              { name: 'id', dataType: 'INTEGER', isPrimaryKey: true, isNullable: false },
              { name: 'user_id', dataType: 'INTEGER', isPrimaryKey: false, isNullable: false },
            ],
          },
        ],
        relationships: [
          {
            id: 'rel_1',
            fromTable: 'orders',
            fromColumn: 'user_id',
            toTable: 'users',
            toColumn: 'id',
            onDelete: 'CASCADE',
          },
        ],
      };

      const sql = generateERDiagramSql(data, 'sqlite');
      expect(sql).toContain('CREATE TABLE "users"');
      expect(sql).toContain('CREATE TABLE "orders"');
      expect(sql).toContain('FOREIGN KEY ("user_id") REFERENCES "users" ("id")');
      expect(sql).toContain('ON DELETE CASCADE');
    });
  });
});
