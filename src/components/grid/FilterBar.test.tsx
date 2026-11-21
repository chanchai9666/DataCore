import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FilterBar } from './FilterBar';
import type { ColumnMeta, TableFilterState } from '../../types/db';

describe('FilterBar', () => {
  const mockColumns: ColumnMeta[] = [
    { name: 'id', data_type: 'INTEGER', nullable: false },
    { name: 'product_name', data_type: 'TEXT', nullable: true },
    { name: 'price', data_type: 'REAL', nullable: true },
  ];

  const initialFilterState: TableFilterState = {
    enabled: true,
    conjunction: 'AND',
    conditions: [
      { id: 'c1', column: 'product_name', operator: 'LIKE', value: 'น้ำแข็ง' },
    ],
  };

  it('renders filter bar with initial conditions and SQL preview', () => {
    render(
      <FilterBar
        columns={mockColumns}
        filterState={initialFilterState}
        onChange={vi.fn()}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(screen.getByTestId('filter-column-combobox')).toHaveTextContent(/product_name\s*\(TEXT\)/i);
    expect(screen.getByDisplayValue('LIKE')).toBeInTheDocument();
    expect(screen.getByDisplayValue('น้ำแข็ง')).toBeInTheDocument();
    expect(screen.getByText(/WHERE "product_name" LIKE '%น้ำแข็ง%'/i)).toBeInTheDocument();
  });

  it('adds a new condition when + Add Condition is clicked', () => {
    const handleChange = vi.fn();
    render(
      <FilterBar
        columns={mockColumns}
        filterState={initialFilterState}
        onChange={handleChange}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />
    );

    const addBtn = screen.getByRole('button', { name: /\+ Add Condition|Add Condition/i });
    fireEvent.click(addBtn);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        conditions: expect.arrayContaining([
          expect.objectContaining({ column: 'product_name', operator: 'LIKE' }),
          expect.objectContaining({ column: 'id', operator: '=' }),
        ]),
      })
    );
  });

  it('disables value input when IS NULL or IS NOT NULL is selected', () => {
    const filterStateWithNull: TableFilterState = {
      enabled: true,
      conjunction: 'AND',
      conditions: [
        { id: 'c1', column: 'price', operator: 'IS NULL', value: '' },
      ],
    };

    render(
      <FilterBar
        columns={mockColumns}
        filterState={filterStateWithNull}
        onChange={vi.fn()}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />
    );

    const valueInput = screen.getByPlaceholderText(/(no value needed)/i);
    expect(valueInput).toBeDisabled();
  });

  it('triggers onApply when Apply button is clicked or Enter key is pressed in value input', () => {
    const handleApply = vi.fn();
    render(
      <FilterBar
        columns={mockColumns}
        filterState={initialFilterState}
        onChange={vi.fn()}
        onApply={handleApply}
        onClear={vi.fn()}
      />
    );

    const applyBtn = screen.getByTestId('apply-filter-btn');
    fireEvent.click(applyBtn);
    expect(handleApply).toHaveBeenCalledTimes(1);

    const valueInput = screen.getByDisplayValue('น้ำแข็ง');
    fireEvent.keyDown(valueInput, { key: 'Enter', code: 'Enter' });
    expect(handleApply).toHaveBeenCalledTimes(2);
  });

  it('triggers onClear when Clear button is clicked', () => {
    const handleClear = vi.fn();
    render(
      <FilterBar
        columns={mockColumns}
        filterState={initialFilterState}
        onChange={vi.fn()}
        onApply={vi.fn()}
        onClear={handleClear}
      />
    );

    const clearBtn = screen.getByTestId('clear-filter-btn');
    fireEvent.click(clearBtn);
    expect(handleClear).toHaveBeenCalledTimes(1);
  });

  it('toggles filter active checkbox', () => {
    const handleChange = vi.fn();
    render(
      <FilterBar
        columns={mockColumns}
        filterState={initialFilterState}
        onChange={handleChange}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />
    );

    const checkbox = screen.getByRole('checkbox', { name: /toggle filter active/i });
    fireEvent.click(checkbox);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    );
  });

  it('renders using semantic design token classes for Light/Dark themes (Phase 50)', () => {
    render(
      <FilterBar
        columns={mockColumns}
        filterState={initialFilterState}
        onChange={vi.fn()}
        onApply={vi.fn()}
        onClear={vi.fn()}
        theme="light"
      />
    );

    const filterBar = screen.getByTestId('filter-bar');
    expect(filterBar.className).toContain('bg-panel');
    expect(filterBar.className).toContain('border-line');
    expect(filterBar.className).toContain('text-text');
    expect(screen.getByText('Filter:').parentElement?.className).toContain('text-text');
    expect(screen.getByTestId('clear-filter-btn').className).toContain('bg-panel');
  });

  it('opens searchable column combobox, filters by column name or type, and selects column', () => {
    const handleChange = vi.fn();
    render(
      <FilterBar
        columns={mockColumns}
        filterState={initialFilterState}
        onChange={handleChange}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('filter-column-combobox'));
    const searchInput = screen.getByTestId('filter-column-search-input');
    fireEvent.change(searchInput, { target: { value: 'REAL' } });

    expect(screen.queryByRole('option', { name: /product_name/i })).not.toBeInTheDocument();
    const priceOption = screen.getByRole('option', { name: /price\s*\(REAL\)/i });
    fireEvent.click(priceOption);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        conditions: [expect.objectContaining({ column: 'price' })],
      })
    );
  });

  it('supports LIKE %% operator in selector and SQL preview', () => {
    const handleChange = vi.fn();
    const likePctState: TableFilterState = {
      enabled: true,
      conjunction: 'AND',
      conditions: [
        { id: 'c1', column: 'product_name', operator: 'LIKE %%', value: 'coffee' },
      ],
    };

    render(
      <FilterBar
        columns={mockColumns}
        filterState={likePctState}
        onChange={handleChange}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />
    );

    const opSelect = screen.getByLabelText('Filter Operator');
    expect(opSelect).toHaveValue('LIKE %%');
    expect(screen.getByText(/WHERE "product_name" LIKE '%coffee%'/i)).toBeInTheDocument();
  });

  it('uses uniform fixed widths for column combobox and operator dropdown', () => {
    render(
      <FilterBar
        columns={mockColumns}
        filterState={initialFilterState}
        onChange={vi.fn()}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(screen.getByTestId('filter-column-combobox').className).toContain('w-[250px]');
    expect(screen.getByLabelText('Filter Operator').className).toContain('w-[116px]');
  });

  it('toggles per-row AND/OR conjunction and per-row enabled state', () => {
    const handleChange = vi.fn();
    const multiState: TableFilterState = {
      enabled: true,
      conjunction: 'AND',
      conditions: [
        { id: 'c1', column: 'product_name', operator: 'LIKE %%', value: 'ice', enabled: true },
        { id: 'c2', column: 'price', operator: '>', value: '10', enabled: true, conjunction: 'AND' },
      ],
    };

    render(
      <FilterBar
        columns={mockColumns}
        filterState={multiState}
        onChange={handleChange}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />
    );

    // Toggle row 2 conjunction from AND -> OR
    fireEvent.click(screen.getByTestId('row-conjunction-c2'));
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        conditions: expect.arrayContaining([
          expect.objectContaining({ id: 'c2', conjunction: 'OR' }),
        ]),
      })
    );

    // Toggle row 2 enabled checkbox -> false
    const rowCheckboxes = screen.getAllByRole('checkbox', { name: /enable or disable this condition/i });
    fireEvent.click(rowCheckboxes[1]);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        conditions: expect.arrayContaining([
          expect.objectContaining({ id: 'c2', enabled: false }),
        ]),
      })
    );
  });

  it('shows numeric mismatch warning when non-numeric value is entered on numeric column', () => {
    const mismatchState: TableFilterState = {
      enabled: true,
      conjunction: 'AND',
      conditions: [
        { id: 'c1', column: 'price', operator: '=', value: 'abc', enabled: true },
      ],
    };

    render(
      <FilterBar
        columns={mockColumns}
        filterState={mismatchState}
        onChange={vi.fn()}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(screen.getByTestId('numeric-mismatch-warn-c1')).toBeInTheDocument();
  });
});
