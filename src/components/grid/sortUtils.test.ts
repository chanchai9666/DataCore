import { describe, it, expect } from 'vitest';
import { sortInMemoryRows, isNullCellValue, comparePrimitives } from './sortUtils';
import { ColumnMeta, CellValue } from '../../types/db';

describe('sortUtils', () => {
  const columns: ColumnMeta[] = [
    { name: 'id', data_type: 'INTEGER', nullable: false },
    { name: 'username', data_type: 'TEXT', nullable: false },
    { name: 'score', data_type: 'FLOAT', nullable: true },
    { name: 'is_active', data_type: 'BOOLEAN', nullable: true },
  ];

  const rows: CellValue[][] = [
    [{ Integer: 3 }, { Text: 'Charlie' }, { Float: 88.5 }, { Boolean: true }],
    [{ Integer: 1 }, { Text: 'Alice' }, null, { Boolean: false }],
    [{ Integer: 2 }, { Text: 'Bob' }, { Float: 95.0 }, { Boolean: true }],
    [{ Integer: 4 }, { Text: 'David' }, 'Null', null],
  ];

  it('checks isNullCellValue correctly', () => {
    expect(isNullCellValue(null)).toBe(true);
    expect(isNullCellValue(undefined as any)).toBe(true);
    expect(isNullCellValue('Null')).toBe(true);
    expect(isNullCellValue({ Integer: 0 })).toBe(false);
    expect(isNullCellValue(0)).toBe(false);
    expect(isNullCellValue('')).toBe(false);
  });

  it('compares primitives correctly', () => {
    expect(comparePrimitives(10, 20)).toBeLessThan(0);
    expect(comparePrimitives(20, 10)).toBeGreaterThan(0);
    expect(comparePrimitives(10, 10)).toBe(0);

    expect(comparePrimitives('Alice', 'Bob')).toBeLessThan(0);
    expect(comparePrimitives('Bob', 'Alice')).toBeGreaterThan(0);
    expect(comparePrimitives('Alice', 'Alice')).toBe(0);

    expect(comparePrimitives(false, true)).toBeLessThan(0);
    expect(comparePrimitives(true, false)).toBeGreaterThan(0);
  });

  it('sorts numeric column in ASC and DESC order with NULLs last', () => {
    // Sort by id ASC
    const asc = sortInMemoryRows(columns, rows, 'id', 'ASC');
    expect(asc.map((r) => (r[0] as any).Integer)).toEqual([1, 2, 3, 4]);

    // Sort by id DESC
    const desc = sortInMemoryRows(columns, rows, 'id', 'DESC');
    expect(desc.map((r) => (r[0] as any).Integer)).toEqual([4, 3, 2, 1]);
  });

  it('sorts text column in ASC and DESC order', () => {
    const asc = sortInMemoryRows(columns, rows, 'username', 'ASC');
    expect(asc.map((r) => (r[1] as any).Text)).toEqual(['Alice', 'Bob', 'Charlie', 'David']);

    const desc = sortInMemoryRows(columns, rows, 'username', 'DESC');
    expect(desc.map((r) => (r[1] as any).Text)).toEqual(['David', 'Charlie', 'Bob', 'Alice']);
  });

  it('places NULL values at the bottom in both ASC and DESC orders', () => {
    // Column 'score' has nulls at index 1 and 3
    const asc = sortInMemoryRows(columns, rows, 'score', 'ASC');
    expect((asc[0][2] as any)?.Float).toBe(88.5);
    expect((asc[1][2] as any)?.Float).toBe(95.0);
    expect(isNullCellValue(asc[2][2])).toBe(true);
    expect(isNullCellValue(asc[3][2])).toBe(true);

    const desc = sortInMemoryRows(columns, rows, 'score', 'DESC');
    expect((desc[0][2] as any)?.Float).toBe(95.0);
    expect((desc[1][2] as any)?.Float).toBe(88.5);
    expect(isNullCellValue(desc[2][2])).toBe(true);
    expect(isNullCellValue(desc[3][2])).toBe(true);
  });

  it('returns untouched rows when column is not found', () => {
    const res = sortInMemoryRows(columns, rows, 'non_existent', 'ASC');
    expect(res).toEqual(rows);
  });
});
