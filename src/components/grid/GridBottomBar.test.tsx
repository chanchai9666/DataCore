import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GridBottomBar } from './GridBottomBar';
import { createCellContent } from './gridUtils';

describe('GridBottomBar Component', () => {
  it('renders pagination and row count', () => {
    render(<GridBottomBar page={2} pageSize={100} totalRows={350} />);
    expect(screen.getByText('Page 2 of 4')).toBeInTheDocument();
    expect(screen.getByText('350 rows')).toBeInTheDocument();
  });

  it('triggers onPageChange when navigation buttons are clicked', () => {
    const onPageChange = vi.fn();
    render(<GridBottomBar page={2} pageSize={100} totalRows={400} onPageChange={onPageChange} />);

    fireEvent.click(screen.getByRole('button', { name: /previous page/i }));
    expect(onPageChange).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('disables Commit and Discard when hasPendingChanges is false', () => {
    render(<GridBottomBar hasPendingChanges={false} />);
    expect(screen.getByRole('button', { name: /commit changes/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /discard changes/i })).toBeDisabled();
  });

  it('enables Commit and Discard when hasPendingChanges is true', () => {
    const onCommit = vi.fn();
    const onDiscard = vi.fn();
    render(
      <GridBottomBar
        hasPendingChanges={true}
        pendingCount={3}
        onCommit={onCommit}
        onDiscard={onDiscard}
      />
    );

    const commitBtn = screen.getByRole('button', { name: /commit changes/i });
    expect(commitBtn).not.toBeDisabled();
    expect(commitBtn).toHaveTextContent('Commit (3)');

    fireEvent.click(commitBtn);
    expect(onCommit).toHaveBeenCalledTimes(1);

    const discardBtn = screen.getByRole('button', { name: /discard changes/i });
    fireEvent.click(discardBtn);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('triggers onAddRow and onDeleteRow callbacks', () => {
    const onAddRow = vi.fn();
    const onDeleteRow = vi.fn();
    render(<GridBottomBar onAddRow={onAddRow} onDeleteRow={onDeleteRow} canDelete={true} />);

    fireEvent.click(screen.getByRole('button', { name: /add row/i }));
    expect(onAddRow).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /delete selected row/i }));
    expect(onDeleteRow).toHaveBeenCalledTimes(1);
  });

  it('renders auto-commit toggle and fires callback when clicked', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <GridBottomBar isAutoCommit={true} onToggleAutoCommit={onToggle} />
    );

    const toggleBtn = screen.getByRole('button', { name: /toggle auto-commit mode/i });
    expect(toggleBtn).toBeInTheDocument();
    expect(toggleBtn).toHaveTextContent(/auto-commit/i);

    fireEvent.click(toggleBtn);
    expect(onToggle).toHaveBeenCalledTimes(1);

    // Re-render in staging mode
    rerender(<GridBottomBar isAutoCommit={false} onToggleAutoCommit={onToggle} />);
    expect(toggleBtn).toHaveTextContent(/staging mode/i);
  });

  it('renders sensitive data mask toggle and triggers callback', () => {
    const onToggleMask = vi.fn();
    const { rerender } = render(
      <GridBottomBar isMasked={true} onToggleMask={onToggleMask} />
    );

    const maskBtn = screen.getByTestId('grid-mask-toggle');
    expect(maskBtn).toHaveTextContent(/masked/i);

    fireEvent.click(maskBtn);
    expect(onToggleMask).toHaveBeenCalledTimes(1);

    // Re-render unmasked
    rerender(<GridBottomBar isMasked={false} onToggleMask={onToggleMask} />);
    expect(maskBtn).toHaveTextContent(/unmasked/i);
  });

  it('renders Fast Edit toggle and disables Auto-Commit toggle while Fast Edit is active', () => {
    const onToggleFastEdit = vi.fn();
    const onToggleAutoCommit = vi.fn();

    const { rerender } = render(
      <GridBottomBar
        isFastEdit={false}
        onToggleFastEdit={onToggleFastEdit}
        isAutoCommit={true}
        onToggleAutoCommit={onToggleAutoCommit}
      />
    );

    const fastEditBtn = screen.getByTestId('fast-edit-toggle-btn');
    expect(fastEditBtn).toBeInTheDocument();
    const autoCommitBtn = screen.getByRole('button', { name: /toggle auto-commit mode/i });
    expect(autoCommitBtn).not.toBeDisabled();

    fireEvent.click(fastEditBtn);
    expect(onToggleFastEdit).toHaveBeenCalledTimes(1);

    rerender(
      <GridBottomBar
        isFastEdit={true}
        onToggleFastEdit={onToggleFastEdit}
        isAutoCommit={false}
        onToggleAutoCommit={onToggleAutoCommit}
      />
    );

    expect(autoCommitBtn).toBeDisabled();
  });

  it('configures cell readonly and overlay capabilities in fastEditMode', () => {
    const emailCol = { name: 'email', data_type: 'TEXT', nullable: true, is_primary_key: false };
    const boolCol = { name: 'active', data_type: 'BOOLEAN', nullable: true, is_primary_key: false };
    const binCol = { name: 'avatar', data_type: 'BYTEA', nullable: true, is_primary_key: false };

    const maskedCell = createCellContent({ Text: 'a@b.com' }, emailCol, true, true);
    expect((maskedCell as { readonly?: boolean }).readonly).toBe(true);
    expect(maskedCell.allowOverlay).toBe(false);

    const boolCell = createCellContent({ Boolean: true }, boolCol, false, true);
    expect(boolCell.allowOverlay).toBe(true);
    expect((boolCell as { readonly?: boolean }).readonly).toBe(false);

    const bytesCell = createCellContent({ Bytes: 'AQID' }, binCol, false, true);
    expect((bytesCell as { readonly?: boolean }).readonly).toBe(true);
    expect(bytesCell.allowOverlay).toBe(false);
  });
});
