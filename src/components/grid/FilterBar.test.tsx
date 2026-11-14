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

    expect(screen.getByDisplayValue(/product_name/i)).toBeInTheDocument();
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

  it('renders correctly with light theme classes (Issue #122)', () => {
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
    expect(filterBar.className).toContain('bg-gray-50');
    expect(screen.getByText('Filter:').parentElement?.className).toContain('text-gray-700');
    expect(screen.getByTestId('clear-filter-btn').className).toContain('bg-white');
  });
});
