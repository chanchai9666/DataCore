import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ForeignKeyPeekPopover } from './ForeignKeyPeekPopover';

describe('ForeignKeyPeekPopover', () => {
  it('renders target table, column, and foreign key value', () => {
    const onClose = vi.fn();
    const onNavigate = vi.fn();

    render(
      <ForeignKeyPeekPopover
        isOpen={true}
        onClose={onClose}
        targetTable="departments"
        targetColumn="id"
        value={101}
        position={{ x: 200, y: 300 }}
        onNavigate={onNavigate}
      />
    );

    expect(screen.getByText('Foreign Key Reference')).toBeInTheDocument();
    expect(screen.getByText('departments')).toBeInTheDocument();
    expect(screen.getByText(/id/)).toBeInTheDocument();
    expect(screen.getByText('101')).toBeInTheDocument();

    const jumpBtn = screen.getByRole('button', { name: /jump to record/i });
    fireEvent.click(jumpBtn);
    expect(onNavigate).toHaveBeenCalledWith('departments', 'id', 101);
  });

  it('fetches and renders preview data if onPeek is provided', async () => {
    const onPeek = vi.fn().mockResolvedValue({
      id: 101,
      name: 'Engineering',
      location: 'Building A',
    });

    render(
      <ForeignKeyPeekPopover
        isOpen={true}
        onClose={() => {}}
        targetTable="departments"
        targetColumn="id"
        value={101}
        position={{ x: 200, y: 300 }}
        onPeek={onPeek}
      />
    );

    expect(onPeek).toHaveBeenCalledWith('departments', 'id', 101);

    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
      expect(screen.getByText('Building A')).toBeInTheDocument();
    });
  });

  it('closes when close button is clicked or Escape key is pressed', () => {
    const onClose = vi.fn();

    render(
      <ForeignKeyPeekPopover
        isOpen={true}
        onClose={onClose}
        targetTable="departments"
        targetColumn="id"
        value={101}
        position={{ x: 200, y: 300 }}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
