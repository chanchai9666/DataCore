import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuditLogDrawer } from './AuditLogDrawer';
import { useAuditLogStore } from '../../stores/auditLogStore';

describe('AuditLogDrawer', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useAuditLogStore.getState().clearLogs();
    useAuditLogStore.getState().addLog({
      action: 'QUERY',
      user: 'root',
      connectionName: 'Production Postgres',
      database: 'app_db',
      query: 'SELECT * FROM users WHERE active = true',
      executionTimeMs: 45,
      rowsAffected: 120,
      status: 'SUCCESS',
    });
    useAuditLogStore.getState().addLog({
      action: 'DDL',
      user: 'admin',
      connectionName: 'Production Postgres',
      database: 'app_db',
      query: 'DROP TABLE deprecated_logs',
      status: 'FAILURE',
      errorMessage: 'Permission denied',
    });
  });

  it('renders nothing when isOpen is false', () => {
    render(<AuditLogDrawer isOpen={false} onClose={onClose} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders audit entries when open', () => {
    render(<AuditLogDrawer isOpen={true} onClose={onClose} />);
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Security & Audit Log')).toBeDefined();
    expect(screen.getAllByText('Production Postgres / app_db').length).toBe(2);
    expect(screen.getByText('QUERY')).toBeDefined();
    expect(screen.getByText('DDL')).toBeDefined();
  });

  it('expands entry to show full query statement', () => {
    render(<AuditLogDrawer isOpen={true} onClose={onClose} />);
    const entryHeader = screen.getByText('QUERY');
    fireEvent.click(entryHeader);

    expect(screen.getByText(/SELECT \* FROM users WHERE active = true/)).toBeDefined();
  });

  it('filters by search input', () => {
    render(<AuditLogDrawer isOpen={true} onClose={onClose} />);
    const searchInput = screen.getByPlaceholderText(/Search queries, users/);
    fireEvent.change(searchInput, { target: { value: 'deprecated_logs' } });

    expect(screen.getByText('DDL')).toBeDefined();
    expect(screen.queryByText('QUERY')).toBeNull();
  });

  it('calls onClose when close button clicked', () => {
    render(<AuditLogDrawer isOpen={true} onClose={onClose} />);
    const closeBtn = screen.getByLabelText('Close Audit Log');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
