import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DuplicateTableModal } from './DuplicateTableModal';
import { dbApi } from '../../api/db';

vi.mock('../../api/db', () => ({
  dbApi: {
    duplicateTable: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('DuplicateTableModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly with default target table name', () => {
    render(
      <DuplicateTableModal
        isOpen={true}
        connectionId="conn-1"
        sourceTableName="products"
        schemaName="public"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Duplicate Table')).toBeInTheDocument();
    expect(screen.getByText('public.products')).toBeInTheDocument();

    const input = screen.getByLabelText(/New Table Name/i) as HTMLInputElement;
    expect(input.value).toBe('products_copy');

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('validates empty new table name', async () => {
    render(
      <DuplicateTableModal
        isOpen={true}
        connectionId="conn-1"
        sourceTableName="products"
        onClose={vi.fn()}
      />
    );

    const input = screen.getByLabelText(/New Table Name/i);
    fireEvent.change(input, { target: { value: '   ' } });

    fireEvent.click(screen.getByRole('button', { name: /^Duplicate$/i }));

    expect(
      await screen.findByText('Please provide a name for the new table.')
    ).toBeInTheDocument();
    expect(dbApi.duplicateTable).not.toHaveBeenCalled();
  });

  it('validates duplicate name identical to source', async () => {
    render(
      <DuplicateTableModal
        isOpen={true}
        connectionId="conn-1"
        sourceTableName="products"
        onClose={vi.fn()}
      />
    );

    const input = screen.getByLabelText(/New Table Name/i);
    fireEvent.change(input, { target: { value: 'products' } });

    fireEvent.click(screen.getByRole('button', { name: /^Duplicate$/i }));

    expect(
      await screen.findByText(
        'New table name must be different from source table name.'
      )
    ).toBeInTheDocument();
    expect(dbApi.duplicateTable).not.toHaveBeenCalled();
  });

  it('submits successfully and calls callbacks', async () => {
    vi.mocked(dbApi.duplicateTable).mockResolvedValueOnce();
    const handleClose = vi.fn();
    const handleSuccess = vi.fn();

    render(
      <DuplicateTableModal
        isOpen={true}
        connectionId="conn-1"
        sourceTableName="orders"
        schemaName="public"
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    );

    const input = screen.getByLabelText(/New Table Name/i);
    fireEvent.change(input, { target: { value: 'orders_archive' } });

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox); // uncheck copy data

    fireEvent.click(screen.getByRole('button', { name: /^Duplicate$/i }));

    await waitFor(() => {
      expect(dbApi.duplicateTable).toHaveBeenCalledWith({
        connectionId: 'conn-1',
        schema: 'public',
        sourceTable: 'orders',
        newTableName: 'orders_archive',
        copyData: false,
      });
      expect(handleSuccess).toHaveBeenCalledWith('orders_archive');
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <DuplicateTableModal
        isOpen={false}
        connectionId="conn-1"
        sourceTableName="orders"
        onClose={vi.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});
