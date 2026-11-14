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
});
