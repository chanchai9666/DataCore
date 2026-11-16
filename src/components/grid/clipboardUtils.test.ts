import { describe, it, expect } from 'vitest';
import { CompactSelection, GridSelection } from '@glideapps/glide-data-grid';
import { formatSelectionAsText } from './clipboardUtils';
import { QueryResult } from '../../types/db';

const mockData: QueryResult = {
  columns: [
    { name: 'id', data_type: 'INTEGER', nullable: false, is_primary_key: true, is_auto_increment: true },
    { name: 'name', data_type: 'VARCHAR', nullable: true, is_primary_key: false, is_auto_increment: false },
    { name: 'age', data_type: 'INTEGER', nullable: true, is_primary_key: false, is_auto_increment: false },
  ],
  rows: [
    [1, 'Alice', 25],
    [2, 'Bob', null],
    [3, 'Charlie', 30],
  ],
  execution_time_ms: 10,
};

describe('formatSelectionAsText', () => {
  it('formats single cell selection without headers', () => {
    const selection: GridSelection = {
      columns: CompactSelection.empty(),
      rows: CompactSelection.empty(),
      current: { cell: [1, 0], range: { x: 1, y: 0, width: 1, height: 1 }, rangeStack: [] },
    };
    expect(formatSelectionAsText(selection, mockData, false)).toBe('Alice');
  });

  it('formats single column vertical selection with newline delimiters', () => {
    const selection: GridSelection = {
      columns: CompactSelection.fromSingleSelection(1),
      rows: CompactSelection.empty(),
      current: undefined,
    };
    expect(formatSelectionAsText(selection, mockData, false)).toBe('Alice\nBob\nCharlie');
  });

  it('formats single column vertical selection with header', () => {
    const selection: GridSelection = {
      columns: CompactSelection.fromSingleSelection(1),
      rows: CompactSelection.empty(),
      current: undefined,
    };
    expect(formatSelectionAsText(selection, mockData, true)).toBe('name\nAlice\nBob\nCharlie');
  });

  it('formats multi-row selection as TSV', () => {
    const selection: GridSelection = {
      columns: CompactSelection.empty(),
      rows: CompactSelection.fromSingleSelection(0).add(2),
      current: undefined,
    };
    expect(formatSelectionAsText(selection, mockData, false)).toBe('1\tAlice\t25\n3\tCharlie\t30');
  });

  it('formats multi-row selection with headers as TSV', () => {
    const selection: GridSelection = {
      columns: CompactSelection.empty(),
      rows: CompactSelection.fromSingleSelection(0).add(1),
      current: undefined,
    };
    expect(formatSelectionAsText(selection, mockData, true)).toBe('id\tname\tage\n1\tAlice\t25\n2\tBob\tNULL');
  });

  it('formats rectangular range selection as TSV', () => {
    const selection: GridSelection = {
      columns: CompactSelection.empty(),
      rows: CompactSelection.empty(),
      current: { cell: [0, 0], range: { x: 0, y: 0, width: 2, height: 2 }, rangeStack: [] },
    };
    expect(formatSelectionAsText(selection, mockData, false)).toBe('1\tAlice\n2\tBob');
  });

  it('formats full selection (Select All)', () => {
    const selection: GridSelection = {
      columns: CompactSelection.fromSingleSelection(0).add(1).add(2),
      rows: CompactSelection.fromSingleSelection(0).add(1).add(2),
      current: undefined,
    };
    expect(formatSelectionAsText(selection, mockData, true)).toBe(
      'id\tname\tage\n1\tAlice\t25\n2\tBob\tNULL\n3\tCharlie\t30'
    );
  });

  it('masks sensitive columns when isMasked is true', () => {
    const piiData: QueryResult = {
      columns: [
        { name: 'id', data_type: 'integer', nullable: false },
        { name: 'password', data_type: 'text', nullable: false },
        { name: 'email', data_type: 'text', nullable: false },
      ],
      rows: [
        [1, 'secret123', 'admin@example.com'],
      ],
      rows_affected: 1,
      execution_time_ms: 1,
    };

    const selection: GridSelection = {
      columns: CompactSelection.fromSingleSelection(0).add(1).add(2),
      rows: CompactSelection.fromSingleSelection(0),
      current: undefined,
    };

    const unmasked = formatSelectionAsText(selection, piiData, false, false);
    expect(unmasked).toBe('1\tsecret123\tadmin@example.com');

    const masked = formatSelectionAsText(selection, piiData, false, true);
    expect(masked).toBe('1\t••••••••\ta•••n@example.com');
  });
});
