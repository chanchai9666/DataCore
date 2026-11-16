import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExplainPlanDiffModal } from './ExplainPlanDiffModal';
import { useExplainHistoryStore } from '../../stores/explainHistoryStore';
import type { QueryResult } from '../../types/db';
import type { ParsedPlan } from '../../api/planParser';

describe('ExplainPlanDiffModal', () => {
  const dummyResult: QueryResult = {
    columns: [{ name: 'plan', data_type: 'text', nullable: true }],
    rows: [],
    execution_time_ms: 10,
  };

  const planBefore: ParsedPlan = {
    nodes: [
      {
        id: 1,
        nodeType: 'Seq Scan',
        relation: 'users',
        cost: { startup: 0, total: 1000 },
        detail: 'Seq Scan on users (cost=0.00..1000.00)',
        level: 0,
        isIndex: false,
        isSeqScan: true,
      },
    ],
    totalCost: '1000.00',
    executionTime: '120.00 ms',
    hasIndexScan: false,
    hasSeqScan: true,
  };

  const planAfter: ParsedPlan = {
    nodes: [
      {
        id: 2,
        nodeType: 'Index Scan',
        relation: 'users',
        cost: { startup: 0.25, total: 250 },
        detail: 'Index Scan using idx_users_email on users',
        level: 0,
        isIndex: true,
        isSeqScan: false,
      },
    ],
    totalCost: '250.00',
    executionTime: '15.00 ms',
    hasIndexScan: true,
    hasSeqScan: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useExplainHistoryStore.getState().clearSnapshots();
  });

  it('renders diff comparison with cost and execution time deltas', () => {
    const sBefore = useExplainHistoryStore.getState().addSnapshot({
      sql: 'SELECT * FROM users WHERE email = "a@b.com";',
      planResult: dummyResult,
      parsedPlan: planBefore,
      totalCost: 1000,
      executionTimeMs: 120,
    });

    const sAfter = useExplainHistoryStore.getState().addSnapshot({
      sql: 'SELECT * FROM users WHERE email = "a@b.com"; -- optimized with index',
      planResult: dummyResult,
      parsedPlan: planAfter,
      totalCost: 250,
      executionTimeMs: 15,
    });

    useExplainHistoryStore.getState().setSelectedSnapshots(sBefore.id, sAfter.id);

    render(
      <ExplainPlanDiffModal
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Query Execution Plan Diff (Before vs After)')).toBeInTheDocument();
    expect(screen.getByText('-75.0%')).toBeInTheDocument(); // Cost delta: (250-1000)/1000 = -75%
    expect(screen.getByText('-87.5%')).toBeInTheDocument(); // Time delta: (15-120)/120 = -87.5%
    expect(screen.getByText(/Converted Table Seq Scan to Index Scan/)).toBeInTheDocument();
  });

  it('copies diff summary when Copy Diff is clicked', () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

    const sBefore = useExplainHistoryStore.getState().addSnapshot({
      sql: 'SELECT * FROM users;',
      planResult: dummyResult,
      parsedPlan: planBefore,
      totalCost: 1000,
      executionTimeMs: 120,
    });

    const sAfter = useExplainHistoryStore.getState().addSnapshot({
      sql: 'SELECT * FROM users;',
      planResult: dummyResult,
      parsedPlan: planAfter,
      totalCost: 250,
      executionTimeMs: 15,
    });

    useExplainHistoryStore.getState().setSelectedSnapshots(sBefore.id, sAfter.id);

    render(
      <ExplainPlanDiffModal
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    const copyBtn = screen.getByText('Copy Diff');
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith(
      expect.stringContaining('EXPLAIN PLAN DIFF SUMMARY')
    );
  });
});
