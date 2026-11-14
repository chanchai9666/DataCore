import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImpactPreviewModal } from './ImpactPreviewModal';
import { EditorToolbar } from './EditorToolbar';
import * as impactSimulator from '../../utils/impactSimulator';
import type { ImpactSimulationResult } from '../../types/db';

describe('ImpactPreviewModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    sql: 'DELETE FROM users WHERE status = "inactive";',
    connectionId: 'conn-1',
    simulationResult: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render anything when isOpen is false', () => {
    const { container } = render(<ImpactPreviewModal {...defaultProps} isOpen={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('impact-preview-modal')).not.toBeInTheDocument();
  });

  it('renders modal dialog with title, close button and query preview', () => {
    render(<ImpactPreviewModal {...defaultProps} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Query Impact Preview')).toBeInTheDocument();
    expect(screen.getByTestId('sql-preview-text')).toHaveTextContent(defaultProps.sql);
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  it('displays loading spinner when isLoading is true', () => {
    render(<ImpactPreviewModal {...defaultProps} isLoading={true} />);

    expect(screen.getByTestId('impact-loading')).toBeInTheDocument();
    expect(
      screen.getByText(/Simulating execution in temporary rollback transaction/i)
    ).toBeInTheDocument();
  });

  it('displays error message when error prop is provided', () => {
    const errorMsg = 'syntax error at or near "FROMM"';
    render(<ImpactPreviewModal {...defaultProps} error={errorMsg} />);

    expect(screen.getByTestId('impact-error')).toBeInTheDocument();
    expect(screen.getByText('Simulation Failed')).toBeInTheDocument();
    expect(screen.getByText(errorMsg)).toBeInTheDocument();
  });

  it('displays non-destructive statement note when is_mutation is false', () => {
    const nonMutationResult: ImpactSimulationResult = {
      is_mutation: false,
      table_name: null,
      affected_rows: 0,
      execution_time_ms: 5,
      preview_warning: 'Query is a SELECT statement.',
    };

    render(
      <ImpactPreviewModal
        {...defaultProps}
        sql="SELECT * FROM users;"
        simulationResult={nonMutationResult}
      />
    );

    expect(screen.getByTestId('impact-non-mutation')).toBeInTheDocument();
    expect(screen.getByText('Non-Destructive Statement')).toBeInTheDocument();
    expect(screen.getByText(/Query is a SELECT statement/i)).toBeInTheDocument();
  });

  it('displays affected rows badge formatted with commas and execution time', () => {
    const result: ImpactSimulationResult = {
      is_mutation: true,
      table_name: 'users',
      affected_rows: 1420,
      execution_time_ms: 32,
      preview_warning: 'High risk: 1420 rows will be affected.',
    };

    render(
      <ImpactPreviewModal
        {...defaultProps}
        sql="DELETE FROM users WHERE age > 30;"
        simulationResult={result}
      />
    );

    const badge = screen.getByTestId('affected-rows-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('⚠️ 1,420 rows will be affected');
    expect(badge).toHaveTextContent('32 ms');
    expect(screen.getByText('users')).toBeInTheDocument();
  });

  it('displays critical warning when query has no WHERE clause (entire table affected)', () => {
    const result: ImpactSimulationResult = {
      is_mutation: true,
      table_name: 'orders',
      affected_rows: 500,
      execution_time_ms: 15,
      preview_warning: 'CRITICAL: No WHERE clause detected.',
    };

    render(
      <ImpactPreviewModal
        {...defaultProps}
        sql="DELETE FROM orders;"
        simulationResult={result}
      />
    );

    expect(screen.getByTestId('risk-critical-warning')).toBeInTheDocument();
    expect(screen.getByText(/CRITICAL WARNING: No WHERE Clause!/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm run/i })).toHaveTextContent(
      'Execute Anyway'
    );
  });

  it('displays high risk warning when affected rows exceed 100 with WHERE clause', () => {
    const result: ImpactSimulationResult = {
      is_mutation: true,
      table_name: 'logs',
      affected_rows: 250,
      execution_time_ms: 20,
      preview_warning: 'High risk: 250 rows will be affected.',
    };

    render(
      <ImpactPreviewModal
        {...defaultProps}
        sql="UPDATE logs SET archived = true WHERE created_at < '2025-01-01';"
        simulationResult={result}
      />
    );

    expect(screen.getByTestId('risk-high-warning')).toBeInTheDocument();
    expect(screen.getByText(/HIGH RISK: Large Data Mutation/i)).toBeInTheDocument();
    expect(screen.getByText(/More than 100 rows \(250 rows\) will be affected/i)).toBeInTheDocument();
  });

  it('displays low risk controlled impact note when affected rows <= 100 with WHERE clause', () => {
    const result: ImpactSimulationResult = {
      is_mutation: true,
      table_name: 'products',
      affected_rows: 15,
      execution_time_ms: 8,
      preview_warning: null,
    };

    render(
      <ImpactPreviewModal
        {...defaultProps}
        sql="UPDATE products SET price = 99 WHERE id = 10;"
        simulationResult={result}
      />
    );

    expect(screen.getByTestId('risk-low-note')).toBeInTheDocument();
    expect(screen.getByText(/Controlled impact: Query contains a WHERE clause \(15 rows\)/i)).toBeInTheDocument();
  });

  it('calls onClose when Cancel button or Close X button is clicked', () => {
    render(<ImpactPreviewModal {...defaultProps} />);

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);

    const closeBtn = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(2);
  });

  it('calls onClose when Escape key is pressed', () => {
    render(<ImpactPreviewModal {...defaultProps} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm and onClose when Proceed button is clicked', () => {
    const result: ImpactSimulationResult = {
      is_mutation: true,
      table_name: 'items',
      affected_rows: 5,
      execution_time_ms: 10,
    };

    render(
      <ImpactPreviewModal
        {...defaultProps}
        simulationResult={result}
      />
    );

    const proceedBtn = screen.getByRole('button', { name: /confirm run/i });
    fireEvent.click(proceedBtn);

    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('auto-fetches simulation impact when connectionId and sql are passed without simulationResult', async () => {
    const mockResult: ImpactSimulationResult = {
      is_mutation: true,
      table_name: 'customers',
      affected_rows: 42,
      execution_time_ms: 12,
      preview_warning: null,
    };

    const spy = vi
      .spyOn(impactSimulator, 'simulateImpact')
      .mockResolvedValueOnce(mockResult);

    render(
      <ImpactPreviewModal
        isOpen={true}
        onClose={vi.fn()}
        connectionId="conn-auto-1"
        sql="DELETE FROM customers WHERE active = false;"
      />
    );

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith(
        'conn-auto-1',
        'DELETE FROM customers WHERE active = false;'
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('affected-rows-badge')).toHaveTextContent(
        '⚠️ 42 rows will be affected'
      );
    });
  });

  it('handles auto-fetch simulation failure gracefully', async () => {
    vi.spyOn(impactSimulator, 'simulateImpact').mockRejectedValueOnce(
      new Error('Database connection lost')
    );

    render(
      <ImpactPreviewModal
        isOpen={true}
        onClose={vi.fn()}
        connectionId="conn-broken"
        sql="DELETE FROM customers;"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('impact-error')).toBeInTheDocument();
      expect(screen.getByText('Database connection lost')).toBeInTheDocument();
    });
  });
});

describe('EditorToolbar - Impact Preview Button', () => {
  const defaultProps = {
    isRunning: false,
    autoCommit: true,
    executionTimeMs: null,
    rowCount: null,
    rowsAffected: null,
    errorMessage: null,
    onRun: vi.fn(),
    onCancel: vi.fn(),
    onToggleAutoCommit: vi.fn(),
    onCommit: vi.fn(),
    onRollback: vi.fn(),
  };

  it('renders Impact Preview button on toolbar and handles click', () => {
    const onImpactPreview = vi.fn();
    render(<EditorToolbar {...defaultProps} onImpactPreview={onImpactPreview} />);

    const impactBtn = screen.getByRole('button', { name: /impact preview/i });
    expect(impactBtn).toBeInTheDocument();
    expect(impactBtn).not.toBeDisabled();

    fireEvent.click(impactBtn);
    expect(onImpactPreview).toHaveBeenCalledTimes(1);
  });

  it('opens integrated ImpactPreviewModal when onImpactPreview prop is omitted', async () => {
    vi.spyOn(impactSimulator, 'simulateImpact').mockResolvedValue({
      is_mutation: true,
      table_name: 'users',
      affected_rows: 5,
      execution_time_ms: 10,
    });

    render(
      <EditorToolbar
        {...defaultProps}
        connectionId="conn-test"
        sql="DELETE FROM users;"
      />
    );

    expect(screen.queryByTestId('impact-preview-modal')).not.toBeInTheDocument();

    const impactBtn = screen.getByRole('button', { name: /impact preview/i });
    fireEvent.click(impactBtn);

    expect(screen.getByTestId('impact-preview-modal')).toBeInTheDocument();
  });

  it('disables Impact Preview button when query isRunning', () => {
    render(<EditorToolbar {...defaultProps} isRunning={true} />);

    const impactBtn = screen.getByRole('button', { name: /impact preview/i });
    expect(impactBtn).toBeDisabled();
  });
});
