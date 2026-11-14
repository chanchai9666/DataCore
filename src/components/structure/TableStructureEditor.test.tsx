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
    expect(screen.getByRole('button', { name: /columns \(3\)/i })).toBeInTheDocument();

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

  it('opens DropTableModal when Drop Table toolbar button is clicked', async () => {
    render(
      <TableStructureEditor
        tabId="tab-1"
        connectionId="conn-1"
        tableName="categories"
        schemaName="public"
        driver="postgres"
      />
    );

    const dropBtn = await screen.findByTestId('drop-table-toolbar-btn');
    fireEvent.click(dropBtn);

    expect(await screen.findByRole('heading', { name: /drop table/i })).toBeInTheDocument();
    expect(screen.getByTestId('drop-table-confirm-input')).toBeInTheDocument();
  });

  it('opens RenameTableModal when Rename Table toolbar button is clicked', async () => {
    render(
      <TableStructureEditor
        tabId="tab-1"
        connectionId="conn-1"
        tableName="categories"
        schemaName="public"
        driver="postgres"
      />
    );

    const renameBtn = await screen.findByTestId('rename-table-toolbar-btn');
    fireEvent.click(renameBtn);

    expect(await screen.findByRole('heading', { name: /rename table/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/New Table Name/i)).toHaveValue('categories');
  });

  it('opens TableMaintenanceModal when Maintain toolbar button is clicked', async () => {
    render(
      <TableStructureEditor
        tabId="tab-1"
        connectionId="conn-1"
        tableName="categories"
        schemaName="public"
        driver="postgres"
      />
    );

    const maintainBtn = await screen.findByTestId('maintenance-table-toolbar-btn');
    fireEvent.click(maintainBtn);

    expect(
      await screen.findByRole('heading', { name: /Table Maintenance & Diagnostics/i })
    ).toBeInTheDocument();
  });

  it('switches to indexes tab, creates a new index, and drops an index', async () => {
    // Provide query results: columns result, then index result
    const mockIndexesResult: QueryResult = {
      columns: [],
      rows: [
        ['categories_pkey', 'true', 'true', 'id', 'btree'],
        ['idx_categories_name', 'false', 'false', 'name', 'btree'],
      ],
      execution_time_ms: 5,
    };

    vi.mocked(dbApi.executeQuery).mockImplementation(async (_tabId, sql) => {
      if (sql.includes('FROM pg_class t')) {
        return mockIndexesResult;
      }
      return mockColumnsResult;
    });

    render(
      <TableStructureEditor
        tabId="tab-1"
        connectionId="conn-1"
        tableName="categories"
        schemaName="public"
        driver="postgres"
      />
    );

    // Switch to Indexes tab
    const indexesTabBtn = await screen.findByTestId('tab-indexes-btn');
    fireEvent.click(indexesTabBtn);

    // Verify index list items
    expect(await screen.findByText('categories_pkey')).toBeInTheDocument();
    expect(screen.getByText('idx_categories_name')).toBeInTheDocument();

    // Open Add Index modal
    const addIndexBtn = screen.getByTestId('add-index-btn');
    fireEvent.click(addIndexBtn);

    expect(screen.getByText('Add New Index')).toBeInTheDocument();
    const nameInput = screen.getByTestId('new-index-name-input');
    fireEvent.change(nameInput, { target: { value: 'idx_categories_sort' } });

    // Pick column 'sort_order'
    const colCheckbox = screen.getByTestId('new-index-col-checkbox-sort_order');
    fireEvent.click(colCheckbox);

    // Toggle Unique
    const uniqueCheckbox = screen.getByTestId('new-index-unique-checkbox');
    fireEvent.click(uniqueCheckbox);

    // Verify preview SQL
    expect(screen.getByTestId('add-index-preview-sql').textContent).toContain(
      'CREATE UNIQUE INDEX "idx_categories_sort" ON "public"."categories" ("id", "sort_order");'
    );

    // Submit Add Index
    const confirmAddBtn = screen.getByTestId('confirm-add-index-btn');
    fireEvent.click(confirmAddBtn);

    await waitFor(() => {
      expect(dbApi.executeQuery).toHaveBeenCalledWith(
        'tab-1',
        'CREATE UNIQUE INDEX "idx_categories_sort" ON "public"."categories" ("id", "sort_order");'
      );
    });

    // Test Drop Index
    const dropIndexBtn = screen.getByTestId('drop-index-btn-idx_categories_name');
    fireEvent.click(dropIndexBtn);

    expect(screen.getByRole('heading', { name: /drop index/i })).toBeInTheDocument();
    const confirmDropBtn = screen.getByTestId('confirm-drop-index-btn');
    fireEvent.click(confirmDropBtn);

    await waitFor(() => {
      expect(dbApi.executeQuery).toHaveBeenCalledWith(
        'tab-1',
        'DROP INDEX "public"."idx_categories_name";'
      );
    });
  });

  it('switches to SQL Preview tab and displays inline DDL schema definition', async () => {
    render(
      <TableStructureEditor
        tabId="tab-1"
        connectionId="conn-1"
        tableName="categories"
        schemaName="public"
        driver="postgres"
      />
    );

    const ddlTabBtn = await screen.findByTestId('tab-ddl-btn');
    fireEvent.click(ddlTabBtn);

    expect(screen.getByText(/SQL Schema Definition \(DDL\)/i)).toBeInTheDocument();
    expect(screen.getByText(/CREATE TABLE "public"."categories"/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy sql/i })).toBeInTheDocument();
  });

  it('switches to Foreign Keys tab, adds a foreign key, and drops it', async () => {
    vi.mocked(dbApi.executeQuery).mockImplementation(async (_tabId, sql) => {
      if (sql.includes('referential_constraints')) {
        return {
          columns: [],
          rows: [
            ['fk_categories_parent', 'sort_order', 'categories', 'id', 'NO ACTION', 'CASCADE'],
          ],
          execution_time_ms: 2,
        };
      }
      return mockColumnsResult;
    });

    render(
      <TableStructureEditor
        tabId="tab-1"
        connectionId="conn-1"
        tableName="categories"
        schemaName="public"
        driver="postgres"
      />
    );

    const fkTabBtn = await screen.findByTestId('tab-foreign-keys-btn');
    fireEvent.click(fkTabBtn);

    // Verify existing FK is rendered
    expect(await screen.findByText('fk_categories_parent')).toBeInTheDocument();
    expect(screen.getByText(/CASCADE/)).toBeInTheDocument();

    // Open Add Foreign Key modal
    const addFkBtn = screen.getByTestId('add-foreign-key-btn');
    fireEvent.click(addFkBtn);

    expect(screen.getByText('Add Foreign Key to categories')).toBeInTheDocument();

    // Fill in Add FK form
    const fkNameInput = screen.getByTestId('new-fk-name-input');
    fireEvent.change(fkNameInput, { target: { value: 'fk_categories_user' } });

    const colSelect = screen.getByTestId('new-fk-col-select');
    fireEvent.change(colSelect, { target: { value: 'id' } });

    const targetTableInput = screen.getByTestId('new-fk-target-table-input');
    fireEvent.change(targetTableInput, { target: { value: 'users' } });

    const targetColInput = screen.getByTestId('new-fk-target-col-input');
    fireEvent.change(targetColInput, { target: { value: 'id' } });

    // Verify preview SQL
    expect(screen.getByTestId('add-fk-preview-sql').textContent).toContain(
      'ALTER TABLE "public"."categories" ADD CONSTRAINT "fk_categories_user" FOREIGN KEY ("id") REFERENCES "public"."users" ("id");'
    );

    // Confirm Add FK
    const confirmAddFkBtn = screen.getByTestId('confirm-add-fk-btn');
    fireEvent.click(confirmAddFkBtn);

    await waitFor(() => {
      expect(dbApi.executeQuery).toHaveBeenCalledWith(
        'tab-1',
        'ALTER TABLE "public"."categories" ADD CONSTRAINT "fk_categories_user" FOREIGN KEY ("id") REFERENCES "public"."users" ("id");'
      );
    });

    // Test Drop FK
    const dropFkBtn = screen.getByTestId('drop-fk-btn-fk_categories_parent');
    fireEvent.click(dropFkBtn);

    expect(screen.getByRole('heading', { name: /drop foreign key/i })).toBeInTheDocument();
    const confirmDropBtn = screen.getByTestId('confirm-drop-fk-btn');
    fireEvent.click(confirmDropBtn);

    await waitFor(() => {
      expect(dbApi.executeQuery).toHaveBeenCalledWith(
        'tab-1',
        'ALTER TABLE "public"."categories" DROP CONSTRAINT "fk_categories_parent";'
      );
    });
  });

  it('switches to Constraints tab, adds a CHECK constraint, and drops it', async () => {
    vi.mocked(dbApi.executeQuery).mockImplementation(async (_tabId, sql) => {
      if (sql.includes('check_constraints')) {
        return {
          columns: [],
          rows: [
            ['chk_sort_positive', 'CHECK', 'sort_order >= 0'],
          ],
          execution_time_ms: 2,
        };
      }
      return mockColumnsResult;
    });

    render(
      <TableStructureEditor
        tabId="tab-1"
        connectionId="conn-1"
        tableName="categories"
        schemaName="public"
        driver="postgres"
      />
    );

    const constTabBtn = await screen.findByTestId('tab-constraints-btn');
    fireEvent.click(constTabBtn);

    // Verify existing constraint is rendered
    expect(await screen.findByText('chk_sort_positive')).toBeInTheDocument();
    expect(screen.getByText('sort_order >= 0')).toBeInTheDocument();

    // Open Add Constraint modal
    const addConstBtn = screen.getByTestId('add-constraint-btn');
    fireEvent.click(addConstBtn);

    expect(screen.getByText('Add Constraint to categories')).toBeInTheDocument();

    const nameInput = screen.getByTestId('new-constraint-name-input');
    fireEvent.change(nameInput, { target: { value: 'chk_name_length' } });

    const exprInput = screen.getByTestId('new-constraint-expr-input');
    fireEvent.change(exprInput, { target: { value: 'length(name) > 2' } });

    // Verify preview SQL
    expect(screen.getByTestId('add-constraint-preview-sql').textContent).toContain(
      'ALTER TABLE "public"."categories" ADD CONSTRAINT "chk_name_length" CHECK (length(name) > 2);'
    );

    // Confirm Add Constraint
    const confirmAddBtn = screen.getByTestId('confirm-add-constraint-btn');
    fireEvent.click(confirmAddBtn);

    await waitFor(() => {
      expect(dbApi.executeQuery).toHaveBeenCalledWith(
        'tab-1',
        'ALTER TABLE "public"."categories" ADD CONSTRAINT "chk_name_length" CHECK (length(name) > 2);'
      );
    });

    // Test Drop Constraint
    const dropBtn = screen.getByTestId('drop-constraint-btn-chk_sort_positive');
    fireEvent.click(dropBtn);

    expect(screen.getByRole('heading', { name: /drop constraint/i })).toBeInTheDocument();
    const confirmDropBtn = screen.getByTestId('confirm-drop-constraint-btn');
    fireEvent.click(confirmDropBtn);

    await waitFor(() => {
      expect(dbApi.executeQuery).toHaveBeenCalledWith(
        'tab-1',
        'ALTER TABLE "public"."categories" DROP CONSTRAINT "chk_sort_positive";'
      );
    });
  });

  it('switches to Security / RLS tab, toggles RLS, creates policy, and drops policy', async () => {
    vi.mocked(dbApi.executeQuery).mockImplementation(async (_tabId, sql) => {
      if (sql.includes('SELECT rowsecurity FROM pg_tables')) {
        return {
          columns: [],
          rows: [[true]],
          execution_time_ms: 1,
        };
      }
      if (sql.includes('pg_policies')) {
        return {
          columns: [],
          rows: [
            ['policy_user_isolation', true, 'PUBLIC', 'ALL', 'user_id = current_user', ''],
          ],
          execution_time_ms: 1,
        };
      }
      return mockColumnsResult;
    });

    render(
      <TableStructureEditor
        tabId="tab-1"
        connectionId="conn-1"
        tableName="categories"
        schemaName="public"
        driver="postgres"
      />
    );

    const rlsTabBtn = await screen.findByTestId('tab-security-btn');
    fireEvent.click(rlsTabBtn);

    // Verify existing policy is rendered
    expect(await screen.findByText('policy_user_isolation')).toBeInTheDocument();
    expect(screen.getByText('user_id = current_user')).toBeInTheDocument();
    expect(screen.getByTestId('rls-status-state')).toHaveTextContent('ENABLED');

    // Toggle RLS
    const toggleBtn = screen.getByTestId('toggle-rls-btn');
    fireEvent.click(toggleBtn);
    await waitFor(() => {
      expect(dbApi.executeQuery).toHaveBeenCalledWith(
        'tab-1',
        'ALTER TABLE "public"."categories" DISABLE ROW LEVEL SECURITY;'
      );
    });

    // Open Add Policy Modal
    const addPolicyBtn = screen.getByTestId('add-policy-btn');
    fireEvent.click(addPolicyBtn);

    expect(screen.getByRole('heading', { name: /add rls policy/i })).toBeInTheDocument();
    const nameInput = screen.getByTestId('new-policy-name-input');
    fireEvent.change(nameInput, { target: { value: 'policy_tenant' } });

    const usingInput = screen.getByTestId('new-policy-using-input');
    fireEvent.change(usingInput, { target: { value: 'tenant_id = 123' } });

    expect(screen.getByTestId('add-policy-preview-sql').textContent).toContain(
      'CREATE POLICY "policy_tenant" ON "public"."categories" AS PERMISSIVE FOR ALL TO PUBLIC USING (tenant_id = 123);'
    );

    fireEvent.click(screen.getByTestId('confirm-add-policy-btn'));
    await waitFor(() => {
      expect(dbApi.executeQuery).toHaveBeenCalledWith(
        'tab-1',
        'CREATE POLICY "policy_tenant" ON "public"."categories" AS PERMISSIVE FOR ALL TO PUBLIC USING (tenant_id = 123);'
      );
    });

    // Test Drop Policy
    const dropBtn = screen.getByTestId('drop-policy-btn-policy_user_isolation');
    fireEvent.click(dropBtn);

    expect(screen.getByRole('heading', { name: /drop rls policy/i })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('confirm-drop-policy-btn'));

    await waitFor(() => {
      expect(dbApi.executeQuery).toHaveBeenCalledWith(
        'tab-1',
        'DROP POLICY "policy_user_isolation" ON "public"."categories";'
      );
    });
  });

  it('correctly unwraps CellValue Rust objects for RLS status and policies, and disables RLS on non-Postgres', async () => {
    vi.mocked(dbApi.executeQuery).mockImplementation(async (_tabId, sql) => {
      if (sql.includes('SELECT rowsecurity FROM pg_tables')) {
        return {
          columns: [],
          rows: [[{ Boolean: true }]],
          execution_time_ms: 1,
        };
      }
      if (sql.includes('pg_policies')) {
        return {
          columns: [],
          rows: [
            [
              { Text: 'policy_secure_tenant' },
              { Boolean: true },
              { Text: 'authenticated, admin' },
              { Text: 'SELECT' },
              { Text: 'tenant_id = current_setting("app.current_tenant")' },
              { Null: null },
            ],
          ],
          execution_time_ms: 1,
        };
      }
      return mockColumnsResult;
    });

    render(
      <TableStructureEditor
        tabId="tab-1"
        connectionId="conn-1"
        tableName="categories"
        schemaName="public"
        driver="postgres"
      />
    );

    const rlsTabBtn = await screen.findByTestId('tab-security-btn');
    fireEvent.click(rlsTabBtn);

    // Verify policy name is unwrapped without [object Object]
    expect(await screen.findByText('policy_secure_tenant')).toBeInTheDocument();
    expect(screen.queryByText(/\[object Object\]/)).not.toBeInTheDocument();
    expect(screen.getByTestId('rls-status-state')).toHaveTextContent('ENABLED');

    // Now render with MySQL driver and verify toggle button is disabled and warns
    render(
      <TableStructureEditor
        tabId="tab-mysql"
        connectionId="conn-mysql"
        tableName="categories"
        schemaName="public"
        driver="mysql"
      />
    );

    const mysqlTabBtn = screen.getAllByTestId('tab-security-btn')[1];
    fireEvent.click(mysqlTabBtn);

    const mysqlToggleBtns = screen.getAllByTestId('toggle-rls-btn');
    const mysqlToggleBtn = mysqlToggleBtns[mysqlToggleBtns.length - 1];
    expect(mysqlToggleBtn).toBeDisabled();
  });

  it('filters columns in real-time when typing in quick filter input', async () => {
    render(
      <TableStructureEditor
        tabId="tab-1"
        connectionId="conn-1"
        tableName="categories"
        schemaName="public"
        driver="postgres"
      />
    );

    // Initial columns
    expect(await screen.findByTestId('column-row-id')).toBeInTheDocument();
    expect(screen.getByTestId('column-row-name')).toBeInTheDocument();
    expect(screen.getByTestId('column-row-sort_order')).toBeInTheDocument();

    // Type filter
    const filterInput = screen.getByPlaceholderText(/filter columns/i);
    fireEvent.change(filterInput, { target: { value: 'name' } });

    expect(screen.getByTestId('column-row-name')).toBeInTheDocument();
    expect(screen.queryByTestId('column-row-id')).not.toBeInTheDocument();
    expect(screen.queryByTestId('column-row-sort_order')).not.toBeInTheDocument();

    // Clear filter
    fireEvent.change(filterInput, { target: { value: '' } });
    expect(screen.getByTestId('column-row-id')).toBeInTheDocument();
    expect(screen.getByTestId('column-row-name')).toBeInTheDocument();
    expect(screen.getByTestId('column-row-sort_order')).toBeInTheDocument();
  });

  it('triggers onModeChange when clicking mode switcher buttons', async () => {
    const onModeChange = vi.fn();
    render(
      <TableStructureEditor
        tabId="tab-1"
        connectionId="conn-1"
        tableName="categories"
        schemaName="public"
        driver="postgres"
        currentMode="structure"
        onModeChange={onModeChange}
      />
    );

    const dataBtn = await screen.findByTestId('table-mode-data-btn');
    fireEvent.click(dataBtn);
    expect(onModeChange).toHaveBeenCalledWith('data');

    const structBtn = screen.getByTestId('table-mode-structure-btn');
    fireEvent.click(structBtn);
    expect(onModeChange).toHaveBeenCalledWith('structure');
  });
});
