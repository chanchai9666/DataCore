import { describe, it, expect, beforeEach } from 'vitest';
import { useExplainHistoryStore } from './explainHistoryStore';
import type { QueryResult } from '../types/db';
import type { ParsedPlan } from '../api/planParser';

describe('explainHistoryStore', () => {
  const dummyResult: QueryResult = {
    columns: [{ name: 'plan', data_type: 'text', nullable: true }],
    rows: [[{ Text: 'Seq Scan on users (cost=0.00..35.50 rows=2550 width=80)' }]],
    execution_time_ms: 12,
  };

  const dummyParsedPlan: ParsedPlan = {
    nodes: [
      {
        id: 1,
        nodeType: 'Seq Scan',
        relation: 'users',
        cost: { startup: 0, total: 35.5 },
        detail: 'Seq Scan on users',
        level: 0,
        isIndex: false,
        isSeqScan: true,
      },
    ],
    totalCost: '35.50',
    executionTime: '12.45 ms',
    hasIndexScan: false,
    hasSeqScan: true,
  };

  beforeEach(() => {
    useExplainHistoryStore.getState().clearSnapshots();
  });

  it('adds and persists explain snapshots correctly', () => {
    const store = useExplainHistoryStore.getState();

    const snapshot = store.addSnapshot({
      sql: 'SELECT * FROM users WHERE age > 20;',
      connectionId: 'conn-1',
      driver: 'postgres',
      planResult: dummyResult,
      parsedPlan: dummyParsedPlan,
    });

    expect(snapshot.id).toBeDefined();
    expect(snapshot.sql).toBe('SELECT * FROM users WHERE age > 20;');
    expect(snapshot.totalCost).toBe(35.5);
    expect(snapshot.executionTimeMs).toBe(12.45);

    const snapshots = useExplainHistoryStore.getState().snapshots;
    expect(snapshots.length).toBe(1);
    expect(snapshots[0].id).toBe(snapshot.id);
  });

  it('limits snapshot history to 50 items', () => {
    const store = useExplainHistoryStore.getState();
    for (let i = 0; i < 60; i++) {
      store.addSnapshot({
        sql: `SELECT ${i};`,
        planResult: dummyResult,
        parsedPlan: dummyParsedPlan,
      });
    }

    const count = useExplainHistoryStore.getState().snapshots.length;
    expect(count).toBe(50);
  });

  it('removes a specific snapshot and manages selection state', () => {
    const store = useExplainHistoryStore.getState();
    const s1 = store.addSnapshot({
      sql: 'SELECT 1;',
      planResult: dummyResult,
      parsedPlan: dummyParsedPlan,
    });
    const s2 = store.addSnapshot({
      sql: 'SELECT 2;',
      planResult: dummyResult,
      parsedPlan: dummyParsedPlan,
    });

    store.setSelectedSnapshots(s1.id, s2.id);
    expect(useExplainHistoryStore.getState().selectedSnapshotAId).toBe(s1.id);
    expect(useExplainHistoryStore.getState().selectedSnapshotBId).toBe(s2.id);

    store.removeSnapshot(s1.id);
    expect(useExplainHistoryStore.getState().snapshots.length).toBe(1);
    expect(useExplainHistoryStore.getState().selectedSnapshotAId).toBeNull();
    expect(useExplainHistoryStore.getState().selectedSnapshotBId).toBe(s2.id);
  });
});
