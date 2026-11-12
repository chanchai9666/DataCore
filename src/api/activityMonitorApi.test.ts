import { describe, it, expect } from 'vitest';
import {
  buildActivityQuery,
  parseActivityResults,
  buildCancelQuerySql,
  buildTerminateSessionSql,
} from './activityMonitorApi';
import type { QueryResult } from '../types/db';

describe('activityMonitorApi', () => {
  describe('buildActivityQuery', () => {
    it('returns pg_stat_activity query for postgres', () => {
      const sql = buildActivityQuery('postgres');
      expect(sql).toContain('pg_stat_activity');
      expect(sql).toContain('EXTRACT(EPOCH FROM');
    });

    it('returns information_schema.PROCESSLIST query for mysql', () => {
      const sql = buildActivityQuery('mysql');
      expect(sql).toContain('information_schema.PROCESSLIST');
    });

    it('returns database list for sqlite', () => {
      const sql = buildActivityQuery('sqlite');
      expect(sql).toContain('PRAGMA database_list');
    });
  });

  describe('parseActivityResults', () => {
    it('parses postgres pg_stat_activity query result', () => {
      const queryResult: QueryResult = {
        columns: [
          { name: 'pid', data_type: 'integer', nullable: false },
          { name: 'user', data_type: 'text', nullable: false },
          { name: 'database', data_type: 'text', nullable: true },
          { name: 'client_addr', data_type: 'text', nullable: true },
          { name: 'state', data_type: 'text', nullable: true },
          { name: 'duration_seconds', data_type: 'numeric', nullable: true },
          { name: 'wait_event', data_type: 'text', nullable: true },
          { name: 'query', data_type: 'text', nullable: true },
        ],
        rows: [
          [
            { Integer: 1234 },
            { Text: 'postgres' },
            { Text: 'mydb' },
            { Text: '127.0.0.1' },
            { Text: 'active' },
            { Float: 12.5 },
            { Text: 'Lock:relation' },
            { Text: 'SELECT * FROM huge_table' },
          ],
        ],
        execution_time_ms: 2,
      };

      const processes = parseActivityResults(queryResult, 'postgres');
      expect(processes).toHaveLength(1);
      expect(processes[0]).toEqual({
        id: '1234',
        user: 'postgres',
        database: 'mydb',
        host: '127.0.0.1',
        state: 'active',
        durationSeconds: 12.5,
        waitEvent: 'Lock:relation',
        query: 'SELECT * FROM huge_table',
        isBlocked: true,
      });
    });

    it('parses mysql processlist query result', () => {
      const queryResult: QueryResult = {
        columns: [
          { name: 'id', data_type: 'bigint', nullable: false },
          { name: 'user', data_type: 'varchar', nullable: false },
          { name: 'host', data_type: 'varchar', nullable: true },
          { name: 'db', data_type: 'varchar', nullable: true },
          { name: 'command', data_type: 'varchar', nullable: true },
          { name: 'time', data_type: 'integer', nullable: true },
          { name: 'state', data_type: 'varchar', nullable: true },
          { name: 'info', data_type: 'text', nullable: true },
        ],
        rows: [
          [
            { Integer: 42 },
            { Text: 'root' },
            { Text: 'localhost' },
            { Text: 'shop' },
            { Text: 'Query' },
            { Integer: 5 },
            { Text: 'Sending data' },
            { Text: 'SELECT * FROM orders' },
          ],
        ],
        execution_time_ms: 1,
      };

      const processes = parseActivityResults(queryResult, 'mysql');
      expect(processes).toHaveLength(1);
      expect(processes[0]).toEqual({
        id: '42',
        user: 'root',
        host: 'localhost',
        database: 'shop',
        command: 'Query',
        durationSeconds: 5,
        state: 'Sending data',
        query: 'SELECT * FROM orders',
        waitEvent: undefined,
        isBlocked: false,
      });
    });
  });

  describe('buildCancelQuerySql & buildTerminateSessionSql', () => {
    it('generates cancel query SQL', () => {
      expect(buildCancelQuerySql('1234', 'postgres')).toBe('SELECT pg_cancel_backend(1234);');
      expect(buildCancelQuerySql('1234', 'mysql')).toBe('KILL QUERY 1234;');
    });

    it('generates terminate session SQL', () => {
      expect(buildTerminateSessionSql('1234', 'postgres')).toBe('SELECT pg_terminate_backend(1234);');
      expect(buildTerminateSessionSql('1234', 'mysql')).toBe('KILL 1234;');
    });
  });
});
