import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DangerousQueryConfirmModal } from './DangerousQueryConfirmModal';

describe('DangerousQueryConfirmModal', () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <DangerousQueryConfirmModal
        isOpen={false}
        sql="DROP TABLE users;"
        analysis={{ isDangerous: true, riskLevel: 'CRITICAL', reason: 'Drops a table' }}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders modal with warning and buttons', () => {
    render(
      <DangerousQueryConfirmModal
        isOpen={true}
        sql="DELETE FROM users;"
        analysis={{ isDangerous: true, riskLevel: 'CRITICAL', reason: 'Unbounded delete' }}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Dangerous Query Warning')).toBeInTheDocument();
    expect(screen.getByText('Unbounded delete')).toBeInTheDocument();
    expect(screen.getByText('DELETE FROM users;')).toBeInTheDocument();

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalled();

    const executeBtn = screen.getByRole('button', { name: /execute anyway/i });
    fireEvent.click(executeBtn);
    expect(onConfirm).toHaveBeenCalled();
  });

  it('enforces Production Safe Mode with required confirmation text in production environment', () => {
    const handleConfirm = vi.fn();
    const handleCancel = vi.fn();

    render(
      <DangerousQueryConfirmModal
        isOpen={true}
        sql="DROP TABLE production_orders;"
        environment="production"
        connectionName="Main Prod DB"
        analysis={{ isDangerous: true, riskLevel: 'CRITICAL', reason: 'Destructive drop command detected' }}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );

    // Banner and Safe Mode indicator
    expect(screen.getByTestId('production-safe-mode-banner')).toBeInTheDocument();
    expect(screen.getByText(/Target connection "Main Prod DB" is in PRODUCTION/i)).toBeInTheDocument();
    expect(screen.getByText('PRODUCTION')).toBeInTheDocument();

    const executeBtn = screen.getByRole('button', { name: /execute anyway/i });
    // Initially disabled in production
    expect(executeBtn).toBeDisabled();
    fireEvent.click(executeBtn);
    expect(handleConfirm).not.toHaveBeenCalled();

    // Type incorrect confirmation text
    const input = screen.getByTestId('safe-mode-confirm-input');
    fireEvent.change(input, { target: { value: 'yes' } });
    expect(executeBtn).toBeDisabled();

    // Type exact "CONFIRM"
    fireEvent.change(input, { target: { value: 'CONFIRM' } });
    expect(executeBtn).not.toBeDisabled();

    fireEvent.click(executeBtn);
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });
});
