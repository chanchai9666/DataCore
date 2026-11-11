import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ExecutionPlanDrawer } from './ExecutionPlanDrawer';
import type { QueryResult } from '../../types/db';

describe('ExecutionPlanDrawer', () => {
  const mockOnClose = vi.fn();

  const mockPlanResultText: QueryResult = {
    columns: [{ name: 'QUERY PLAN', data_type: 'TEXT', nullable: true }],
    rows: [
      [{ Text: 'Seq Scan on users  (cost=0.00..1.05 rows=5 width=68) (actual time=0.011..0.013 rows=5 loops=1)' }],
      [{ Text: '  Filter: (active = true)' }],
      [{ Text: 'Planning Time: 0.045 ms' }],
      [{ Text: 'Execution Time: 0.032 ms' }],
    ],
    execution_time_ms: 12,
  };

  const mockPlanResultSqlite: QueryResult = {
    columns: [
      { name: 'id', data_type: 'INTEGER', nullable: false },
      { name: 'parent', data_type: 'INTEGER', nullable: false },
      { name: 'notused', data_type: 'INTEGER', nullable: false },
      { name: 'detail', data_type: 'TEXT', nullable: false },
    ],
    rows: [
      [{ Integer: 2 }, { Integer: 0 }, { Integer: 0 }, { Text: 'SEARCH users USING INDEX idx_users_email (email=?)' }],
    ],
    execution_time_ms: 5,
  };

  it('renders drawer with plan details', () => {
    render(
      <ExecutionPlanDrawer
        isOpen={true}
        onClose={mockOnClose}
        sql="SELECT * FROM users WHERE active = true;"
        planResult={mockPlanResultText}
        isAnalyzing={true}
        driver="postgres"
      />
    );

    expect(screen.getByText('Query Execution Plan')).toBeInTheDocument();
    expect(screen.getByText(/Seq Scan on users/)).toBeInTheDocument();
    expect(screen.getAllByText(/0\.032 ms/).length).toBeGreaterThan(0);
  });

  it('detects scan warning for sequential scan', () => {
    render(
      <ExecutionPlanDrawer
        isOpen={true}
        onClose={mockOnClose}
        sql="SELECT * FROM users WHERE active = true;"
        planResult={mockPlanResultText}
        isAnalyzing={false}
        driver="postgres"
      />
    );

    expect(screen.getByText(/Sequential Scan detected/i)).toBeInTheDocument();
  });

  it('renders sqlite plan steps correctly', () => {
    render(
      <ExecutionPlanDrawer
        isOpen={true}
        onClose={mockOnClose}
        sql="SELECT * FROM users WHERE email = 'test@example.com';"
        planResult={mockPlanResultSqlite}
        isAnalyzing={false}
        driver="sqlite"
      />
    );

    expect(screen.getByText(/SEARCH users USING INDEX/)).toBeInTheDocument();
    expect(screen.getByText(/Index Scan/i)).toBeInTheDocument();
  });

  it('switches between visual and raw view tabs', () => {
    render(
      <ExecutionPlanDrawer
        isOpen={true}
        onClose={mockOnClose}
        sql="SELECT * FROM users;"
        planResult={mockPlanResultText}
        driver="postgres"
      />
    );

    const rawTab = screen.getByRole('button', { name: /raw output/i });
    fireEvent.click(rawTab);

    expect(screen.getByRole('button', { name: /visual plan/i })).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    render(
      <ExecutionPlanDrawer
        isOpen={true}
        onClose={mockOnClose}
        sql="SELECT 1;"
        planResult={mockPlanResultText}
      />
    );

    const closeBtn = screen.getByLabelText(/close plan/i);
    fireEvent.click(closeBtn);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
