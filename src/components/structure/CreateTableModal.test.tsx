import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateTableModal } from './CreateTableModal';
import { dbApi } from '../../api/db';

vi.mock('../../api/db', () => ({
  dbApi: {
    executeQuery: vi.fn(),
    executeDirectQuery: vi.fn().mockResolvedValue({
      columns: [],
      rows: [],
      execution_time_ms: 25,
    }),
  },
}));

describe('CreateTableModal', () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <CreateTableModal
        isOpen={false}
        connectionId="conn-1"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders modal with initial columns and previews SQL live', () => {
    render(
      <CreateTableModal
        isOpen={true}
        connectionId="conn-1"
        schemaName="public"
        driver="postgres"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByRole('heading', { name: /create new table/i })).toBeInTheDocument();

    const nameInput = screen.getByTestId('create-table-name-input');
    fireEvent.change(nameInput, { target: { value: 'articles' } });

    const preview = screen.getByTestId('create-table-sql-preview');
    expect(preview.textContent).toContain('CREATE TABLE "public"."articles" (');
    expect(preview.textContent).toContain('"id" SERIAL PRIMARY KEY');
  });

  it('allows adding columns and adding timestamps', () => {
    render(
      <CreateTableModal
        isOpen={true}
        connectionId="conn-1"
        schemaName="public"
        driver="postgres"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const addColBtn = screen.getByTestId('add-column-row-btn');
    fireEvent.click(addColBtn);

    const colNameInput = screen.getByTestId('column-name-input-2');
    fireEvent.change(colNameInput, { target: { value: 'title' } });

    // Add Timestamps
    const tsBtn = screen.getByRole('button', { name: /\+ timestamps/i });
    fireEvent.click(tsBtn);

    const nameInput = screen.getByTestId('create-table-name-input');
    fireEvent.change(nameInput, { target: { value: 'posts' } });

    const preview = screen.getByTestId('create-table-sql-preview');
    expect(preview.textContent).toContain('"title" VARCHAR(255)');
    expect(preview.textContent).toContain('"created_at" TIMESTAMPTZ NOT NULL DEFAULT now()');
    expect(preview.textContent).toContain('"updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()');
  });

  it('supports configuring indexes and previews CREATE INDEX in SQL', () => {
    render(
      <CreateTableModal
        isOpen={true}
        connectionId="conn-1"
        schemaName="public"
        driver="postgres"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const nameInput = screen.getByTestId('create-table-name-input');
    fireEvent.change(nameInput, { target: { value: 'users' } });

    // Switch to Indexes tab
    const indexesTab = screen.getByTestId('tab-indexes-btn');
    fireEvent.click(indexesTab);

    // Click Add Index
    const addIndexBtn = screen.getByTestId('add-index-btn');
    fireEvent.click(addIndexBtn);

    // Edit Index Name
    const indexNameInput = screen.getByTestId('index-name-input-0');
    fireEvent.change(indexNameInput, { target: { value: 'idx_users_name' } });

    // Toggle Unique
    const uniqueCheckbox = screen.getByTestId('index-unique-checkbox-0');
    fireEvent.click(uniqueCheckbox);

    // Verify SQL Preview includes CREATE UNIQUE INDEX
    const preview = screen.getByTestId('create-table-sql-preview');
    expect(preview.textContent).toContain('CREATE TABLE "public"."users" (');
    expect(preview.textContent).toContain('CREATE UNIQUE INDEX "idx_users_name" ON "public"."users" ("id");');
  });

  it('submits successfully and calls dbApi.executeDirectQuery', async () => {
    render(
      <CreateTableModal
        isOpen={true}
        connectionId="conn-1"
        schemaName="public"
        driver="postgres"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const nameInput = screen.getByTestId('create-table-name-input');
    fireEvent.change(nameInput, { target: { value: 'categories' } });

    const submitBtn = screen.getByTestId('submit-create-table-btn');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(dbApi.executeDirectQuery).toHaveBeenCalledWith(
        'conn-1',
        expect.stringContaining('CREATE TABLE "public"."categories"')
      );
      expect(onSuccess).toHaveBeenCalledWith('categories', 'public');
      expect(onClose).toHaveBeenCalled();
    });
  });
});
