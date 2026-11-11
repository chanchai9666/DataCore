import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SavepointModal } from './SavepointModal';
import { dbApi } from '../../api/db';

vi.mock('../../api/db', () => ({
  dbApi: {
    executeQuery: vi.fn().mockResolvedValue({
      columns: [],
      rows: [],
      execution_time_ms: 5,
    }),
  },
}));

describe('SavepointModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    render(<SavepointModal isOpen={false} tabId="tab-1" onClose={onClose} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders savepoint dialog when open', () => {
    render(<SavepointModal isOpen={true} tabId="tab-1" onClose={onClose} />);
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Transaction Savepoints')).toBeDefined();
  });

  it('creates a new savepoint', async () => {
    render(<SavepointModal isOpen={true} tabId="tab-1" onClose={onClose} />);
    const input = screen.getByPlaceholderText(/Savepoint name/);
    fireEvent.change(input, { target: { value: 'sp_test' } });

    const submitBtn = screen.getByText('Savepoint');
    fireEvent.click(submitBtn);

    expect(dbApi.executeQuery).toHaveBeenCalledWith('tab-1', 'SAVEPOINT sp_test;');
  });
});
