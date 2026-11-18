import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CellDetailDrawer } from './CellDetailDrawer';

describe('CellDetailDrawer', () => {
  const baseCellInfo = {
    columnName: 'sale_id',
    dataType: 'UUID',
    value: { Text: 'f701e9aa-c29b-44cd-a412-82a3986b1afb' } as any,
    rowIndex: 11,
  };

  it('uses theme CSS variables instead of hardcoded dark-only backgrounds', () => {
    render(
      <CellDetailDrawer
        isOpen={true}
        onClose={vi.fn()}
        cellInfo={baseCellInfo}
        onSaveValue={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.style.backgroundColor).toContain('var(--bg-panel');
    expect(dialog.style.backgroundColor).not.toContain('#181818');

    const metaColumnName = screen.getByText('sale_id');
    const metaBar = metaColumnName.closest('div')?.parentElement;
    expect(metaBar?.style.backgroundColor).toContain('var(--bg-sidebar');
    expect(metaBar?.style.backgroundColor).not.toContain('#1f1f1f');

    // View mode toggle button should not hardcode dark #334155
    const viewBtn = screen.getByTitle('View mode');
    fireEvent.click(viewBtn);
    expect(viewBtn.style.backgroundColor).not.toBe('rgb(51, 65, 85)');
    expect(viewBtn.style.backgroundColor).toContain('var(--accent');

    // Content area uses theme token instead of #141414
    const pre = screen.getByText('f701e9aa-c29b-44cd-a412-82a3986b1afb');
    const contentArea = pre.parentElement;
    expect(contentArea?.style.backgroundColor).toContain('var(--bg-grid');
    expect(contentArea?.style.backgroundColor).not.toContain('#141414');
  });

  it('uses theme CSS variables in edit mode textarea and cancel button', () => {
    render(
      <CellDetailDrawer
        isOpen={true}
        onClose={vi.fn()}
        cellInfo={baseCellInfo}
        onSaveValue={vi.fn()}
      />
    );

    const textarea = screen.getByPlaceholderText('Enter value...');
    expect(textarea.style.backgroundColor).toContain('var(--bg-input');
    expect(textarea.style.color).toContain('var(--text');
    expect(textarea.style.backgroundColor).not.toBe('rgb(30, 41, 59)');

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    expect(cancelBtn.style.backgroundColor).toContain('var(--btn-bg');
    expect(cancelBtn.style.color).toContain('var(--text');
  });

  it('uses theme CSS variables for Date & Time Intelligence banner', () => {
    render(
      <CellDetailDrawer
        isOpen={true}
        onClose={vi.fn()}
        cellInfo={{
          columnName: 'created_at',
          dataType: 'TIMESTAMPTZ',
          value: { Text: '2026-01-15T10:30:00Z' } as any,
          rowIndex: 0,
        }}
      />
    );

    const banner = screen.getByTestId('datetime-intelligence');
    expect(banner.style.backgroundColor).toContain('var(--bg-card');
    expect(banner.style.backgroundColor).not.toBe('rgb(30, 41, 59)');
  });
});
