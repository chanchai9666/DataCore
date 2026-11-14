import { describe, it, expect } from 'vitest';
import { formatCellValue } from './cellFormatter';

describe('cellFormatter', () => {
  it('formats null, undefined and "Null" as "NULL"', () => {
    expect(formatCellValue(null)).toBe('NULL');
    expect(formatCellValue(undefined as any)).toBe('NULL');
    expect(formatCellValue('Null')).toBe('NULL');
  });

  it('formats primitive values', () => {
    expect(formatCellValue('hello')).toBe('hello');
    expect(formatCellValue(123)).toBe('123');
    expect(formatCellValue(true)).toBe('true');
    expect(formatCellValue(false)).toBe('false');
  });

  it('formats CellValueRust objects', () => {
    expect(formatCellValue({ Text: 'sample text' })).toBe('sample text');
    expect(formatCellValue({ Integer: 42 })).toBe('42');
    expect(formatCellValue({ Float: 3.14 })).toBe('3.14');
    expect(formatCellValue({ Real: 2.718 } as any)).toBe('2.718');
    expect(formatCellValue({ Boolean: true })).toBe('true');
    expect(formatCellValue({ Json: { a: 1 } })).toBe('{"a":1}');
    expect(formatCellValue({ Bytes: 'abcd' })).toBe('[Binary: 4 bytes]');
  });

  it('formats arrays and generic records', () => {
    expect(formatCellValue([1, 2, 3])).toBe('[1,2,3]');
    expect(formatCellValue({ foo: 'bar' })).toBe('{"foo":"bar"}');
  });
});
