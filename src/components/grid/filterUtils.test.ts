import { describe, it, expect } from 'vitest';
import {
  buildSqlWhereClause,
  filterInMemoryRows,
} from './filterUtils';
import type { ColumnMeta, FilterCondition, CellValue } from '../../types/db';

describe('filterUtils', () => {
  describe('buildSqlWhereClause', () => {
    it('returns empty string when conditions are empty', () => {
      expect(buildSqlWhereClause([])).toBe('');
    });

    it('builds equality filter with string value', () => {
      const conditions: FilterCondition[] = [
        { id: '1', column: 'name', operator: '=', value: 'Alice' },
      ];
      expect(buildSqlWhereClause(conditions)).toBe('"name" = \'Alice\'');
    });

    it('builds equality filter with numeric value', () => {
      const conditions: FilterCondition[] = [
        { id: '1', column: 'age', operator: '>=', value: '18' },
      ];
      expect(buildSqlWhereClause(conditions)).toBe('"age" >= 18');
    });

    it('escapes single quotes in values', () => {
      const conditions: FilterCondition[] = [
        { id: '1', column: 'name', operator: '=', value: "O'Connor" },
      ];
      expect(buildSqlWhereClause(conditions)).toBe('"name" = \'O\'\'Connor\'');
    });

    it('wraps LIKE and NOT LIKE values with wildcards automatically', () => {
      const conditions: FilterCondition[] = [
        { id: '1', column: 'name', operator: 'LIKE', value: 'ice' },
      ];
      expect(buildSqlWhereClause(conditions)).toBe('"name" LIKE \'%ice%\'');
    });

    it('preserves existing wildcards in LIKE', () => {
      const conditions: FilterCondition[] = [
        { id: '1', column: 'name', operator: 'LIKE', value: '%ice' },
      ];
      expect(buildSqlWhereClause(conditions)).toBe('"name" LIKE \'%ice\'');
    });

    it('handles IS NULL and IS NOT NULL without value', () => {
      const conditions: FilterCondition[] = [
        { id: '1', column: 'email', operator: 'IS NULL', value: '' },
        { id: '2', column: 'phone', operator: 'IS NOT NULL', value: 'ignored' },
      ];
      expect(buildSqlWhereClause(conditions, 'AND')).toBe(
        '"email" IS NULL AND "phone" IS NOT NULL'
      );
    });

    it('combines multiple conditions with OR', () => {
      const conditions: FilterCondition[] = [
        { id: '1', column: 'status', operator: '=', value: 'active' },
        { id: '2', column: 'status', operator: '=', value: 'pending' },
      ];
      expect(buildSqlWhereClause(conditions, 'OR')).toBe(
        '"status" = \'active\' OR "status" = \'pending\''
      );
    });

    it('uses backticks for MySQL driver identifier escaping', () => {
      const conditions: FilterCondition[] = [
        { id: '1', column: 'user_role', operator: '=', value: 'admin' },
      ];
      expect(buildSqlWhereClause(conditions, 'AND', 'mysql')).toBe(
        '`user_role` = \'admin\''
      );
    });
  });

  describe('filterInMemoryRows', () => {
    const columns: ColumnMeta[] = [
      { name: 'id', data_type: 'INTEGER', nullable: false },
      { name: 'name', data_type: 'TEXT', nullable: true },
      { name: 'score', data_type: 'REAL', nullable: true },
    ];

    const rows: CellValue[][] = [
      [1, 'Alice', 95.5],
      [2, 'Bob', null],
      [3, 'Charlie', 80.0],
      [4, 'David', 65.0],
    ];

    it('returns all rows when conditions are empty', () => {
      expect(filterInMemoryRows(columns, rows, [])).toHaveLength(4);
    });

    it('filters rows with equality operator', () => {
      const conditions: FilterCondition[] = [
        { id: '1', column: 'name', operator: '=', value: 'Bob' },
      ];
      const result = filterInMemoryRows(columns, rows, conditions);
      expect(result).toHaveLength(1);
      expect(result[0][1]).toBe('Bob');
    });

    it('filters rows with numeric comparison', () => {
      const conditions: FilterCondition[] = [
        { id: '1', column: 'score', operator: '>=', value: '80' },
      ];
      const result = filterInMemoryRows(columns, rows, conditions);
      expect(result).toHaveLength(2); // Alice (95.5), Charlie (80.0)
    });

    it('filters rows with LIKE (case-insensitive substring match)', () => {
      const conditions: FilterCondition[] = [
        { id: '1', column: 'name', operator: 'LIKE', value: 'li' },
      ];
      const result = filterInMemoryRows(columns, rows, conditions);
      expect(result).toHaveLength(2); // aLIce, charLIe
    });

    it('filters rows with IS NULL and IS NOT NULL', () => {
      const nullCondition: FilterCondition[] = [
        { id: '1', column: 'score', operator: 'IS NULL', value: '' },
      ];
      expect(filterInMemoryRows(columns, rows, nullCondition)).toHaveLength(1); // Bob

      const notNullCondition: FilterCondition[] = [
        { id: '1', column: 'score', operator: 'IS NOT NULL', value: '' },
      ];
      expect(filterInMemoryRows(columns, rows, notNullCondition)).toHaveLength(3);
    });

    it('evaluates OR conjunction', () => {
      const conditions: FilterCondition[] = [
        { id: '1', column: 'name', operator: '=', value: 'Alice' },
        { id: '2', column: 'name', operator: '=', value: 'David' },
      ];
      const result = filterInMemoryRows(columns, rows, conditions, 'OR');
      expect(result).toHaveLength(2);
    });
  });
});
