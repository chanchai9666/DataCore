import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TableStructureEditor } from './TableStructureEditor';
import { dbApi } from '../../api/db';
import type { QueryResult } from '../../types/db';

vi.mock('../../api/db', () => ({
  dbApi: {
    openSession: vi.fn().mockResolvedValue(undefined),
    executeQuery: vi.fn(),
    fetchTableData: vi.fn(),
  },
}));

describe('TableStructureEditor', () => {
  const mockColumnsResult: QueryResult = {
    columns: [],
    rows: [
      ['id', 'uuid', 'uuid', 'NO', 'gen_random_uuid()', '1', 'YES'],
      ['name', 'text', 'text', 'NO', null, '2', 'NO'],
      ['sort_order', 'integer', 'int4', 'YES', '0', '3', 'NO'],
    ],
    execution_time_ms: 10,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dbApi.executeQuery).mockResolvedValue(mockColumnsResult);
  });

  it('renders columns structure with column names, types, and primary key', async () => {
    render(
      <TableStructureEditor
        tabId="tab-1"
        connectionId="conn-1"
        tableName="categories"
        schemaName="public"
        driver="postgres"
      />
    );

    expect(await screen.findByText('categories')).toBeInTheDocument();
    expect(screen.getByText('3 columns')).toBeInTheDocument();

    // Verify column rows
    expect(screen.getByText('id')).toBeInTheDocument();
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('sort_order')).toBeInTheDocument();

    // Verify types and badges
    expect(screen.getByText('uuid')).toBeInTheDocument();
    expect(screen.getByText('PK')).toBeInTheDocument();
  });

  it('opens Add Column modal and executes ALTER TABLE ADD COLUMN', async () => {
    render(
      <TableStructureEditor
        tabId="tab-1"
        connectionId="conn-1"
        tableName="categories"
        schemaName="public"
        driver="postgres"
      />
    );

    const addBtn = await screen.findByTestId('add-column-btn');
    fireEvent.click(addBtn);

    expect(screen.getByText(/Add Column to categories/i)).toBeInTheDocument();

    // Fill in new column form
    const nameInput = screen.getByPlaceholderText(/description, status/i);
    fireEvent.change(nameInput, { target: { value: 'description' } });

    // Check SQL preview
    expect(screen.getByText(/ALTER TABLE "public"."categories" ADD COLUMN "description"/i)).toBeInTheDocument();

    // Submit
    const submitBtn = screen.getByTestId('submit-add-column-btn');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(dbApi.executeQuery).toHaveBeenCalledWith(
        'tab-1',
        expect.stringContaining('ALTER TABLE "public"."categories" ADD COLUMN "description"')
      );
    });
  });

  it('allows defining custom length/values like VARCHAR(30) and INT(5)', async () => {
    render(
      <TableStructureEditor
        tabId="tab-1"
        connectionId="conn-1"
        tableName="categories"
        schemaName="public"
        driver="postgres"
      />
    );

    const addBtn = await screen.findByTestId('add-column-btn');
    fireEvent.click(addBtn);

    const nameInput = screen.getByPlaceholderText(/description, status/i);
    fireEvent.change(nameInput, { target: { value: 'short_code' } });

    // Change length to 30
    const lengthInput = screen.getByTestId('add-col-length-input');
    fireEvent.change(lengthInput, { target: { value: '30' } });

    // SQL preview should now show VARCHAR(30)
    expect(screen.getByText(/ALTER TABLE "public"."categories" ADD COLUMN "short_code" VARCHAR\(30\)/i)).toBeInTheDocument();

    // Select INT and enter length 5
    const typeSelect = screen.getByTestId('add-col-type-select');
    fireEvent.change(typeSelect, { target: { value: 'INT' } });
    fireEvent.change(lengthInput, { target: { value: '5' } });

    // SQL preview should now show INT(5)
    expect(screen.getByText(/ALTER TABLE "public"."categories" ADD COLUMN "short_code" INT\(5\)/i)).toBeInTheDocument();

    // Clicking quick preset VARCHAR(30) button
    const presetBtn = screen.getByTestId('preset-btn-VARCHAR(30)');
    fireEvent.click(presetBtn);

    expect(screen.getByText(/ALTER TABLE "public"."categories" ADD COLUMN "short_code" VARCHAR\(30\)/i)).toBeInTheDocument();

    const submitBtn = screen.getByTestId('submit-add-column-btn');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(dbApi.executeQuery).toHaveBeenCalledWith(
        'tab-1',
        expect.stringContaining('ALTER TABLE "public"."categories" ADD COLUMN "short_code" VARCHAR(30)')
      );
    });
  });

  it('correlates length and default values when changing data type', async () => {
    render(
      <TableStructureEditor
        tabId="tab-1"
        connectionId="conn-1"
        tableName="categories"
        schemaName="public"
        driver="postgres"
      />
    );

    const addBtn = await screen.findByTestId('add-column-btn');
    fireEvent.click(addBtn);

    const typeSelect = screen.getByTestId('add-col-type-select');
    const lengthInput = screen.getByTestId('add-col-length-input');

    // Select DATE
    fireEvent.change(typeSelect, { target: { value: 'DATE' } });
    expect(lengthInput).toBeDisabled();
    expect(lengthInput).toHaveValue('');
    expect(screen.getByText(/ประเภท DATE เป็นประเภทข้อมูลที่ไม่ต้องระบุความยาว/i)).toBeInTheDocument();

    // Select DECIMAL
    fireEvent.change(typeSelect, { target: { value: 'DECIMAL' } });
    expect(lengthInput).not.toBeDisabled();
    expect(lengthInput).toHaveValue('10,2');

    // Select BOOLEAN
    fireEvent.change(typeSelect, { target: { value: 'BOOLEAN' } });
    expect(lengthInput).toBeDisabled();
    expect(screen.getByText('true')).toBeInTheDocument();
    expect(screen.getByText('false')).toBeInTheDocument();

    // Clicking 'true' suggestion fills default value
    fireEvent.click(screen.getByText('true'));
    const defaultInput = screen.getByPlaceholderText(/true, false/i);
    expect(defaultInput).toHaveValue('true');
  });

  it('opens Edit Column modal and executes ALTER TABLE statements', async () => {
    render(
      <TableStructureEditor
        tabId="tab-1"
        connectionId="conn-1"
        tableName="categories"
        schemaName="public"
        driver="postgres"
      />
    );

    const editBtn = await screen.findByTestId('edit-column-btn-name');
    fireEvent.click(editBtn);

    expect(screen.getByText(/Edit Column:/i)).toBeInTheDocument();

    // Rename column
    const nameInput = screen.getByDisplayValue('name');
    fireEvent.change(nameInput, { target: { value: 'title' } });

    // Save
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(dbApi.executeQuery).toHaveBeenCalledWith(
        'tab-1',
        expect.stringContaining('ALTER TABLE "public"."categories" RENAME COLUMN "name" TO "title"')
      );
    });
  });

  it('opens Drop Column confirmation and executes ALTER TABLE DROP COLUMN', async () => {
    render(
      <TableStructureEditor
        tabId="tab-1"
        connectionId="conn-1"
        tableName="categories"
        schemaName="public"
        driver="postgres"
      />
    );

    const dropBtn = await screen.findByTestId('drop-column-btn-sort_order');
    fireEvent.click(dropBtn);

    expect(screen.getByText(/Are you sure you want to drop column/i)).toBeInTheDocument();

    const confirmBtn = screen.getByTestId('confirm-drop-column-btn');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(dbApi.executeQuery).toHaveBeenCalledWith(
        'tab-1',
        'ALTER TABLE "public"."categories" DROP COLUMN "sort_order";'
      );
    });
  });

  it('opens DDL modal with CREATE TABLE script', async () => {
    render(
      <TableStructureEditor
        tabId="tab-1"
        connectionId="conn-1"
        tableName="categories"
        schemaName="public"
        driver="postgres"
      />
    );

    const ddlBtn = await screen.findByTestId('view-ddl-btn');
    fireEvent.click(ddlBtn);

    expect(screen.getByText(/Table DDL — categories/i)).toBeInTheDocument();
    expect(screen.getByText(/CREATE TABLE "public"."categories"/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy sql/i })).toBeInTheDocument();
  });
});
