import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecordFormView } from './RecordFormView';
import type { ColumnMeta, CellValue } from '../../types/db';

const columns: ColumnMeta[] = [
  { name: 'id', data_type: 'integer', is_primary_key: true, nullable: false },
  { name: 'username', data_type: 'varchar', is_primary_key: false, nullable: false },
  { name: 'bio', data_type: 'text', is_primary_key: false, nullable: true },
  { name: 'org_id', data_type: 'integer', is_primary_key: false, nullable: true },
];

const rows: CellValue[][] = [
  [{ Int: 1 }, { Text: 'alice' }, { Null: null } as unknown as CellValue, { Int: 10 }],
  [{ Int: 2 }, { Text: 'bob' }, { Text: 'Engineer' }, { Int: 20 }],
];

describe('RecordFormView', () => {
  it('renders fields for selected row and supports Next/Prev record navigation', () => {
    const onSelectRowIndex = vi.fn();
    const { rerender } = render(
      <RecordFormView
        columns={columns}
        rows={rows}
        selectedRowIndex={0}
        onSelectRowIndex={onSelectRowIndex}
      />
    );

    expect(screen.getByTestId('form-record-indicator')).toHaveTextContent('Record 1 of 2');
    expect((screen.getByTestId('form-input-username') as HTMLInputElement).value).toBe('alice');
    expect(screen.getByText('PK')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('form-next-record-btn'));
    expect(onSelectRowIndex).toHaveBeenCalledWith(1);

    rerender(
      <RecordFormView
        columns={columns}
        rows={rows}
        selectedRowIndex={1}
        onSelectRowIndex={onSelectRowIndex}
      />
    );
    expect(screen.getByTestId('form-record-indicator')).toHaveTextContent('Record 2 of 2');
    expect((screen.getByTestId('form-input-username') as HTMLInputElement).value).toBe('bob');
  });

  it('filters columns and triggers onEditField / Set NULL when editable', () => {
    const onEditField = vi.fn();
    render(
      <RecordFormView
        columns={columns}
        rows={rows}
        selectedRowIndex={1}
        onSelectRowIndex={vi.fn()}
        onEditField={onEditField}
      />
    );

    fireEvent.change(screen.getByTestId('form-input-username'), { target: { value: 'bobby' } });
    expect(onEditField).toHaveBeenCalledWith(1, 1, 'bobby');

    fireEvent.click(screen.getByTestId('form-null-btn-bio'));
    expect(onEditField).toHaveBeenCalledWith(1, 2, null);

    fireEvent.change(screen.getByTestId('form-column-filter'), { target: { value: 'bio' } });
    expect(screen.getByTestId('form-field-row-bio')).toBeInTheDocument();
    expect(screen.queryByTestId('form-field-row-username')).not.toBeInTheDocument();
  });

  it('disables editing and hides NULL button in read-only mode', () => {
    render(
      <RecordFormView
        columns={columns}
        rows={rows}
        selectedRowIndex={0}
        onSelectRowIndex={vi.fn()}
        isReadOnly={true}
        onEditField={vi.fn()}
      />
    );

    expect(screen.getByTestId('form-input-username')).toHaveAttribute('readonly');
    expect(screen.queryByTestId('form-null-btn-username')).not.toBeInTheDocument();
  });
});
