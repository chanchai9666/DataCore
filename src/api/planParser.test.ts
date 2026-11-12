import { describe, it, expect } from 'vitest';
import { parseExecutionPlan } from './planParser';
import type { QueryResult } from '../types/db';

describe('planParser', () => {
  it('parses postgres text plan and extracts total cost, estimated rows, and execution time', () => {
    const planResult: QueryResult = {
      columns: [{ name: 'QUERY PLAN', data_type: 'TEXT', nullable: true }],
      rows: [
        [{ Text: 'Seq Scan on users  (cost=0.00..1.05 rows=5 width=68) (actual time=0.011..0.013 rows=5 loops=1)' }],
        [{ Text: '  Filter: (active = true)' }],
        [{ Text: 'Planning Time: 0.045 ms' }],
        [{ Text: 'Execution Time: 0.032 ms' }],
      ],
      execution_time_ms: 12,
    };

    const parsed = parseExecutionPlan(planResult, 'postgres');

    expect(parsed.totalCost).toBe('1.05');
    expect(parsed.estimatedRows).toBe(5);
    expect(parsed.actualRows).toBe(5);
    expect(parsed.planningTime).toBe('0.045 ms');
    expect(parsed.executionTime).toBe('0.032 ms');
    expect(parsed.hasSeqScan).toBe(true);
    expect(parsed.hasIndexScan).toBe(false);
    expect(parsed.nodes.length).toBe(2);
    expect(parsed.nodes[0].cost?.total).toBe(1.05);
    expect(parsed.nodes[0].estimatedRows).toBe(5);
  });

  it('parses sqlite explain query plan with parent-child levels', () => {
    const planResult: QueryResult = {
      columns: [
        { name: 'id', data_type: 'INTEGER', nullable: false },
        { name: 'parent', data_type: 'INTEGER', nullable: false },
        { name: 'notused', data_type: 'INTEGER', nullable: false },
        { name: 'detail', data_type: 'TEXT', nullable: false },
      ],
      rows: [
        [{ Integer: 2 }, { Integer: 0 }, { Integer: 0 }, { Text: 'SCAN orders' }],
        [{ Integer: 4 }, { Integer: 2 }, { Integer: 0 }, { Text: 'SEARCH users USING INDEX idx_users_id (id=?)' }],
      ],
      execution_time_ms: 4,
    };

    const parsed = parseExecutionPlan(planResult, 'sqlite');

    expect(parsed.nodes.length).toBe(2);
    expect(parsed.nodes[0].level).toBe(0);
    expect(parsed.nodes[0].isSeqScan).toBe(true);
    expect(parsed.nodes[1].level).toBe(1);
    expect(parsed.nodes[1].isIndex).toBe(true);
    expect(parsed.hasIndexScan).toBe(true);
    expect(parsed.hasSeqScan).toBe(true);
  });

  it('parses postgres JSON formatted plan', () => {
    const jsonStr = JSON.stringify([
      {
        Plan: {
          'Node Type': 'Index Scan',
          'Relation Name': 'users',
          'Startup Cost': 0.28,
          'Total Cost': 8.30,
          'Plan Rows': 1,
          'Actual Rows': 1,
          'Actual Total Time': 0.015,
          Filter: '(id = 42)',
        },
        'Planning Time': 0.12,
        'Execution Time': 0.08,
      },
    ]);

    const planResult: QueryResult = {
      columns: [{ name: 'QUERY PLAN', data_type: 'json', nullable: false }],
      rows: [[{ Text: jsonStr }]],
      execution_time_ms: 5,
    };

    const parsed = parseExecutionPlan(planResult, 'postgres');

    expect(parsed.totalCost).toBe('8.3');
    expect(parsed.estimatedRows).toBe(1);
    expect(parsed.actualRows).toBe(1);
    expect(parsed.hasIndexScan).toBe(true);
    expect(parsed.nodes.length).toBe(1);
    expect(parsed.nodes[0].nodeType).toBe('Index Scan');
    expect(parsed.nodes[0].relation).toBe('users');
    expect(parsed.nodes[0].cost?.total).toBe(8.3);
  });
});
