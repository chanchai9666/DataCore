import { describe, it, expect } from 'vitest';
import {
  parseSqlError,
  offsetToLineCol,
  lineColToOffset,
  cleanErrorMessage,
  detectErrorType,
} from './sqlErrorParser';

describe('sqlErrorParser', () => {
  describe('offsetToLineCol and lineColToOffset', () => {
    const query = 'SELECT *\nFROM users\nWHERE id = 1;';

    it('converts 0-based offset to 1-based line and col', () => {
      // Offset 0: 'S' on line 1, col 1
      expect(offsetToLineCol(query, 0)).toEqual({ line: 1, column: 1 });
      // Offset 7: '*' on line 1, col 8
      expect(offsetToLineCol(query, 7)).toEqual({ line: 1, column: 8 });
      // Offset 9: 'F' of 'FROM' (line 2, col 1)
      expect(offsetToLineCol(query, 9)).toEqual({ line: 2, column: 1 });
      // Offset 10: 'R' of 'FROM' (line 2, col 2)
      expect(offsetToLineCol(query, 10)).toEqual({ line: 2, column: 2 });
    });

    it('converts line and col back to offset', () => {
      expect(lineColToOffset(query, 1, 1)).toBe(0);
      expect(lineColToOffset(query, 2, 1)).toBe(9); // "SELECT *\n" is 9 chars (0..8)
      expect(lineColToOffset(query, 3, 7)).toBe(26); // "WHERE " has 6 chars
    });

    it('handles out of bounds offsets safely', () => {
      expect(offsetToLineCol('', 10)).toEqual({ line: 1, column: 1 });
      expect(offsetToLineCol(query, 9999)).toEqual({ line: 3, column: 14 });
      expect(lineColToOffset('', 1, 1)).toBe(0);
      expect(lineColToOffset(query, 99, 99)).toBe(query.length);
    });
  });

  describe('cleanErrorMessage', () => {
    it('strips nested database error wrappers', () => {
      const raw =
        'Database error: error returned from database: ERROR: syntax error at or near "FROMM"';
      expect(cleanErrorMessage(raw)).toBe('syntax error at or near "FROMM"');
    });

    it('handles AppError and generic Error prefixes', () => {
      expect(cleanErrorMessage('Error: no such table: users')).toBe('no such table: users');
      expect(cleanErrorMessage('AppError::Database: Connection lost')).toBe('Connection lost');
    });
  });

  describe('detectErrorType', () => {
    it('detects syntax errors', () => {
      expect(detectErrorType('syntax error at or near "SELCT"')).toBe('Syntax Error');
      expect(detectErrorType('You have an error in your SQL syntax', '1064')).toBe('Syntax Error');
      expect(detectErrorType('something bad', '42601')).toBe('Syntax Error');
    });

    it('detects undefined tables', () => {
      expect(detectErrorType('relation "accounts" does not exist', '42P01')).toBe('Undefined Table');
      expect(detectErrorType("Table 'test.users' doesn't exist", '1146')).toBe('Undefined Table');
      expect(detectErrorType('no such table: orders')).toBe('Undefined Table');
    });

    it('detects undefined columns', () => {
      expect(detectErrorType('column "salary" does not exist', '42703')).toBe('Undefined Column');
      expect(detectErrorType("Unknown column 'age' in 'field list'", '1054')).toBe('Undefined Column');
      expect(detectErrorType('table users has no column named note')).toBe('Undefined Column');
    });

    it('detects constraint violations', () => {
      expect(detectErrorType('duplicate key value violates unique constraint', '23505')).toBe('Constraint Violation');
      expect(detectErrorType('UNIQUE constraint failed: users.email')).toBe('Constraint Violation');
      expect(detectErrorType("Duplicate entry 'admin' for key 'PRIMARY'", '1062')).toBe('Constraint Violation');
    });

    it('detects permission errors', () => {
      expect(detectErrorType('permission denied for table secret_data', '42501')).toBe('Permission Denied');
      expect(detectErrorType("Access denied for user 'guest'@'localhost'", '1045')).toBe('Permission Denied');
    });

    it('detects timeouts and connection issues', () => {
      expect(detectErrorType('Connection timed out after 30 seconds')).toBe('Connection Error');
      expect(detectErrorType('connection reset by peer')).toBe('Connection Error');
    });
  });

  describe('parseSqlError - PostgreSQL', () => {
    const sql = 'SELECT * \nFROMM users\nWHERE id = 1;';

    it('extracts character position and converts to line/col', () => {
      const errorStr =
        'Database error: ERROR: syntax error at or near "FROMM" at character 11';
      const parsed = parseSqlError(errorStr, sql, 'postgres');

      expect(parsed.driver).toBe('postgres');
      expect(parsed.offset).toBe(10); // 11 - 1
      expect(parsed.line).toBe(2);
      expect(parsed.column).toBe(1);
      expect(parsed.errorType).toBe('Syntax Error');
      expect(parsed.cleanMessage).toBe('syntax error at or near "FROMM" at character 11');
      expect(parsed.originalMessage).toBe(errorStr);
    });

    it('extracts LINE and caret position', () => {
      const errorStr =
        'ERROR: 42601: syntax error at or near "FROMM"\nLINE 2: FROMM users\n        ^';
      const parsed = parseSqlError(errorStr, sql, 'postgres');

      expect(parsed.driver).toBe('postgres');
      expect(parsed.errorCode).toBe('42601');
      expect(parsed.line).toBe(2);
      expect(parsed.errorType).toBe('Syntax Error');
    });

    it('handles undefined relation error with code 42P01', () => {
      const errorStr =
        'ERROR: 42P01: relation "not_found" does not exist at character 15';
      const parsed = parseSqlError(errorStr, 'SELECT * FROM not_found;');

      expect(parsed.driver).toBe('postgres');
      expect(parsed.errorCode).toBe('42P01');
      expect(parsed.errorType).toBe('Undefined Table');
      expect(parsed.offset).toBe(14);
    });
  });

  describe('parseSqlError - MySQL', () => {
    const sql = 'SELECT *\nFORM users\nWHERE id = 10;';

    it('extracts line number, error code, and near token location', () => {
      const errorStr =
        "ERROR 1064 (42000): You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near 'FORM users' at line 2";
      const parsed = parseSqlError(errorStr, sql, 'mysql');

      expect(parsed.driver).toBe('mysql');
      expect(parsed.errorCode).toBe('1064');
      expect(parsed.line).toBe(2);
      expect(parsed.column).toBe(1); // 'FORM' starts at col 1 of line 2
      expect(parsed.errorType).toBe('Syntax Error');
    });

    it('extracts line number for unknown column', () => {
      const errorStr = "ERROR 1054 (42S22): Unknown column 'foo' in 'field list' at line 1";
      const parsed = parseSqlError(errorStr, 'SELECT foo FROM users;', 'mysql');

      expect(parsed.driver).toBe('mysql');
      expect(parsed.errorCode).toBe('1054');
      expect(parsed.line).toBe(1);
      expect(parsed.errorType).toBe('Undefined Column');
    });
  });

  describe('parseSqlError - SQLite', () => {
    const sql = 'SELECT * FROMM users;';

    it('extracts offset and calculates line/col', () => {
      const errorStr = 'Database error: near "FROMM": syntax error at offset 9';
      const parsed = parseSqlError(errorStr, sql, 'sqlite');

      expect(parsed.driver).toBe('sqlite');
      expect(parsed.offset).toBe(9);
      expect(parsed.line).toBe(1);
      expect(parsed.column).toBe(10);
      expect(parsed.errorType).toBe('Syntax Error');
      expect(parsed.cleanMessage).toBe('near "FROMM": syntax error at offset 9');
    });

    it('falls back to locating near token when no offset is provided', () => {
      const multiLineSql = 'SELECT *\nFROM users\nWHERE AND id = 1;';
      const errorStr = 'near "AND": syntax error';
      const parsed = parseSqlError(errorStr, multiLineSql, 'sqlite');

      expect(parsed.driver).toBe('sqlite');
      expect(parsed.line).toBe(3);
      expect(parsed.column).toBe(7); // 'WHERE AND' -> 'AND' is at column 7
      expect(parsed.errorType).toBe('Syntax Error');
    });

    it('handles incomplete input error', () => {
      const errorStr = 'incomplete input at offset 12';
      const parsed = parseSqlError(errorStr, 'SELECT * FRO', 'sqlite');

      expect(parsed.errorType).toBe('Incomplete Input');
      expect(parsed.offset).toBe(12);
    });
  });

  describe('parseSqlError - Generic fallbacks and Error instances', () => {
    it('handles Error objects and generic line:col format', () => {
      const err = new Error('Syntax error on line 4, col 12');
      const parsed = parseSqlError(err, '1\n2\n3\nSELECT 123456789012');

      expect(parsed.line).toBe(4);
      expect(parsed.column).toBe(12);
      expect(parsed.errorType).toBe('Syntax Error');
      expect(parsed.cleanMessage).toBe('Syntax error on line 4, col 12');
    });

    it('handles null, undefined, or empty errors gracefully', () => {
      const parsed = parseSqlError(null);
      expect(parsed.originalMessage).toBe('');
      expect(parsed.cleanMessage).toBe('');
      expect(parsed.errorType).toBe('Database Error');
      expect(parsed.line).toBeUndefined();
    });
  });
});
