import { describe, it, expect } from 'vitest';
import type { ColumnMeta } from '../../types/db';
import {
  validateCellValueForColumn,
  parseClipboardTsv,
  computePasteOperations,
} from './fastEditUtils';

const cols: ColumnMeta[] = [
  { name: 'id', data_type: 'INTEGER', nullable: false, is_primary_key: true },
  { name: 'name', data_type: 'TEXT', nullable: true, is_primary_key: false },
  { name: 'amount', data_type: 'NUMERIC', nullable: true, is_primary_key: false },
  { name: 'is_active', data_type: 'BOOLEAN', nullable: true, is_primary_key: false },
  { name: 'email', data_type: 'TEXT', nullable: true, is_primary_key: false },
];

describe('validateCellValueForColumn', () => {
  it('accepts valid numbers and rejects non-numeric text or timestamps in numeric columns', () => {
    expect(validateCellValueForColumn('42', cols[0])).toEqual({ valid: true, value: 42 });
    expect(validateCellValueForColumn('-3.14', cols[2])).toEqual({ valid: true, value: -3.14 });
    expect(validateCellValueForColumn('NULL', cols[2])).toEqual({ valid: true, value: null });

    const textRes = validateCellValueForColumn('abc', cols[2]);
    expect(textRes.valid).toBe(false);

    const dateRes = validateCellValueForColumn('2026-01-01 10:00:00', cols[2]);
    expect(dateRes.valid).toBe(false);

    const floatInIntRes = validateCellValueForColumn('12.5', cols[0]);
    expect(floatInIntRes.valid).toBe(false);
  });

  it('validates boolean columns strictly', () => {
    expect(validateCellValueForColumn('true', cols[3])).toEqual({ valid: true, value: true });
    expect(validateCellValueForColumn('FALSE', cols[3])).toEqual({ valid: true, value: false });
    expect(validateCellValueForColumn('1', cols[3])).toEqual({ valid: true, value: true });
    expect(validateCellValueForColumn('0', cols[3])).toEqual({ valid: true, value: false });
    expect(validateCellValueForColumn('maybe', cols[3]).valid).toBe(false);
  });

  it('validates json and datetime columns', () => {
    const jsonCol: ColumnMeta = { name: 'meta', data_type: 'JSONB', nullable: true, is_primary_key: false };
    expect(validateCellValueForColumn('{"a": 1}', jsonCol)).toEqual({ valid: true, value: '{"a": 1}' });
    expect(validateCellValueForColumn('{bad json', jsonCol).valid).toBe(false);

    const dtCol: ColumnMeta = { name: 'created_at', data_type: 'TIMESTAMP', nullable: true, is_primary_key: false };
    expect(validateCellValueForColumn('2026-11-19T10:00:00Z', dtCol)).toEqual({ valid: true, value: '2026-11-19T10:00:00Z' });
    expect(validateCellValueForColumn('NOW()', dtCol)).toEqual({ valid: true, value: 'NOW()' });
    expect(validateCellValueForColumn('hello world', dtCol).valid).toBe(false);
  });
});

describe('parseClipboardTsv', () => {
  it('parses CRLF/LF TSV and strips single trailing newline from Excel', () => {
    expect(parseClipboardTsv('a\tb\r\n1\t2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseClipboardTsv('single')).toEqual([['single']]);
  });
});

describe('computePasteOperations', () => {
  it('stages cell edits, truncates extra columns, and auto-appends new rows with undefined unpasted cols', () => {
    const res = computePasteOperations({
      startCol: 1,
      startRow: 0,
      matrix: [
        ['Alice', '100', 'true', 'alice@example.com', 'EXTRA_IGNORED'],
        ['Bob', '200', 'false', 'bob@example.com', 'EXTRA_IGNORED_2'],
      ],
      columns: cols,
      baseRowsCount: 1,
      existingAddedRowsCount: 0,
      deletedRowIndices: [],
      isMasked: false,
      getOriginalValue: () => 'old',
    });

    expect(res.cellEdits).toHaveLength(4);
    expect(res.cellEdits[0]).toMatchObject({ rowIndex: 0, colIndex: 1, colName: 'name', newValue: 'Alice' });
    expect(res.newRows).toHaveLength(1);
    expect(res.newRows[0]).toEqual({
      name: 'Bob',
      amount: 200,
      is_active: false,
      email: 'bob@example.com',
    });
    expect('id' in res.newRows[0]).toBe(false);
    expect(res.invalidCells).toHaveLength(0);
  });

  it('skips masked PII columns and rejects invalid types without corrupting data', () => {
    const res = computePasteOperations({
      startCol: 1,
      startRow: 0,
      matrix: [['Alice', 'not_a_number', 'true', 'secret@example.com']],
      columns: cols,
      baseRowsCount: 1,
      existingAddedRowsCount: 0,
      deletedRowIndices: [],
      isMasked: true,
      getOriginalValue: () => 'old',
    });

    expect(res.skippedMaskedCount).toBe(1);
    expect(res.invalidCells).toHaveLength(1);
    expect(res.invalidCells[0].colName).toBe('amount');
    expect(res.cellEdits.map((c) => c.colName)).toEqual(['name', 'is_active']);
  });

  it('supports pasting into an empty 0-row table at [0, 0]', () => {
    const res = computePasteOperations({
      startCol: 1,
      startRow: 0,
      matrix: [['NewItem', '50']],
      columns: cols,
      baseRowsCount: 0,
      existingAddedRowsCount: 0,
      deletedRowIndices: [],
      isMasked: false,
      getOriginalValue: () => null,
    });

    expect(res.newRows).toEqual([{ name: 'NewItem', amount: 50 }]);
  });
});
