import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InsertRowModal } from './InsertRowModal';
import { ColumnMeta } from '../../types/db';

const mockColumns: ColumnMeta[] = [
  { name: 'id', data_type: 'uuid', nullable: false },
  { name: 'name', data_type: 'varchar', nullable: false },
  { name: 'price', data_type: 'numeric', nullable: true },
];

describe('InsertRowModal', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <InsertRowModal
        isOpen={false}
        onClose={vi.fn()}
        tableName="products"
        columns={mockColumns}
        onSubmit={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders all column fields when open', () => {
    render(
      <InsertRowModal
        isOpen={true}
        onClose={vi.fn()}
        tableName="products"
        schemaName="public"
        columns={mockColumns}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText(/Insert New Row/i)).toBeInTheDocument();
    expect(screen.getByText('public.products')).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/price/i)).toBeInTheDocument();
  });

  it('calls onSubmit with user inputted data and converts numbers', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <InsertRowModal
        isOpen={true}
        onClose={onClose}
        tableName="products"
        columns={mockColumns}
        onSubmit={onSubmit}
      />
    );

    const nameInput = screen.getByPlaceholderText('Enter name...');
    fireEvent.change(nameInput, { target: { value: 'Test Product' } });

    const priceInput = screen.getByPlaceholderText('Enter price...');
    fireEvent.change(priceInput, { target: { value: '150' } });

    const submitBtn = screen.getByRole('button', { name: /Insert Row/i });
    fireEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith({
      id: null,
      name: 'Test Product',
      price: 150,
    });
  });

  it('calls onClose when Cancel button is clicked', () => {
    const onClose = vi.fn();
    render(
      <InsertRowModal
        isOpen={true}
        onClose={onClose}
        tableName="products"
        columns={mockColumns}
        onSubmit={vi.fn()}
      />
    );

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('displays message when columns list is empty and disables submit button', () => {
    render(
      <InsertRowModal
        isOpen={true}
        onClose={vi.fn()}
        tableName="test_data"
        columns={[]}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText('No columns found for this table.')).toBeInTheDocument();
    const submitBtn = screen.getByRole('button', { name: /Insert Row/i });
    expect(submitBtn).toBeDisabled();
  });
});
