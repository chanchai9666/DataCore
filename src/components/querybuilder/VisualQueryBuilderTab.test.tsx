import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VisualQueryBuilderTab } from './VisualQueryBuilderTab';
import * as erDiagramApi from '../../api/erDiagramApi';
import { dbApi } from '../../api/db';
import * as tabHelpers from '../sidebar/tabHelpers';
import type { Tab, ERDiagramData, QueryResult } from '../../types/db';

vi.mock('../../api/erDiagramApi', () => ({
  fetchERDiagramData: vi.fn(),
}));

vi.mock('../../api/db', () => ({
  dbApi: {
    openSession: vi.fn().mockResolvedValue(undefined),
    executeQuery: vi.fn(),
  },
}));

vi.mock('../sidebar/tabHelpers', () => ({
  openQueryTab: vi.fn(),
}));

// Mock DataGrid so we don't have to load canvas/glide-data-grid in unit test
vi.mock('../grid/DataGrid', () => ({
  DataGrid: ({ data }: { data: any }) => (
    <div data-testid="mock-data-grid">
      <span>Rows: {data?.rows?.length || 0}</span>
    </div>
  ),
}));

describe('VisualQueryBuilderTab', () => {
  const mockTab: Tab = {
    id: 'tab-qb-1',
    connectionId: 'conn-1',
    type: 'query-builder',
    title: 'Query Builder',
    autoCommit: true,
    queryContent: '',
  };

  const mockDiagramData: ERDiagramData = {
    tables: [
      {
        id: 'users',
        name: 'users',
        x: 0,
        y: 0,
        columns: [
          { name: 'id', dataType: 'INTEGER', isPrimaryKey: true, isNullable: false },
          { name: 'name', dataType: 'TEXT', isPrimaryKey: false, isNullable: false },
          { name: 'email', dataType: 'TEXT', isPrimaryKey: false, isNullable: true },
          { name: 'age', dataType: 'INTEGER', isPrimaryKey: false, isNullable: true },
        ],
      },
      {
        id: 'orders',
        name: 'orders',
        x: 0,
        y: 0,
        columns: [
          { name: 'id', dataType: 'INTEGER', isPrimaryKey: true, isNullable: false },
          { name: 'user_id', dataType: 'INTEGER', isPrimaryKey: false, isNullable: false },
          { name: 'total_amount', dataType: 'REAL', isPrimaryKey: false, isNullable: false },
          { name: 'status', dataType: 'TEXT', isPrimaryKey: false, isNullable: false },
        ],
      },
    ],
    relationships: [
      {
        id: 'fk_orders_user',
        fromTable: 'orders',
        fromColumn: 'user_id',
        toTable: 'users',
        toColumn: 'id',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(erDiagramApi.fetchERDiagramData).mockResolvedValue(mockDiagramData);
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders correctly and loads schema tables', async () => {
    render(
      <VisualQueryBuilderTab
        tab={mockTab}
        connectionId="conn-1"
        driver="postgres"
      />
    );

    expect(screen.getByTestId('visual-query-builder-tab')).toBeInTheDocument();
    expect(screen.getByText('Visual Query Builder')).toBeInTheDocument();

    await waitFor(() => {
      expect(erDiagramApi.fetchERDiagramData).toHaveBeenCalledWith('conn-1', 'postgres', undefined);
    });

    // Base table selector should have 'users' and 'orders'
    const tableSelect = (await screen.findByTestId('qb-base-table-select')) as HTMLSelectElement;
    expect(tableSelect.value).toBe('users');

    // Columns should be displayed
    expect(screen.getByTestId('qb-col-checkbox-id')).toBeInTheDocument();
    expect(screen.getByTestId('qb-col-checkbox-name')).toBeInTheDocument();
    expect(screen.getByTestId('qb-col-checkbox-email')).toBeInTheDocument();

    // SQL preview should be generated
    const sqlPreview = screen.getByTestId('qb-sql-preview');
    expect(sqlPreview.textContent).toContain('SELECT');
    expect(sqlPreview.textContent).toContain('FROM "users"');
  });

  it('allows toggling column selection and setting aliases', async () => {
    render(
      <VisualQueryBuilderTab
        tab={mockTab}
        connectionId="conn-1"
        driver="postgres"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('qb-col-checkbox-id')).toBeInTheDocument();
    });

    // Deselect all
    const deselectBtn = screen.getByTestId('qb-deselect-all-columns-btn');
    fireEvent.click(deselectBtn);

    const sqlPreview = screen.getByTestId('qb-sql-preview');
    expect(sqlPreview.textContent).toContain('SELECT *\nFROM "users"');

    // Select 'name'
    fireEvent.click(screen.getByTestId('qb-col-checkbox-name'));
    expect(sqlPreview.textContent).toContain('SELECT "users"."name"\nFROM "users"');

    // Set alias on 'name'
    const aliasInput = screen.getByTestId('qb-col-alias-name');
    fireEvent.change(aliasInput, { target: { value: 'user_name' } });
    expect(sqlPreview.textContent).toContain('SELECT "users"."name" AS "user_name"\nFROM "users"');
  });

  it('allows selecting aggregate functions on columns', async () => {
    render(
      <VisualQueryBuilderTab
        tab={mockTab}
        connectionId="conn-1"
        driver="postgres"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('qb-col-checkbox-id')).toBeInTheDocument();
    });

    // Deselect all then select 'id'
    fireEvent.click(screen.getByTestId('qb-deselect-all-columns-btn'));
    fireEvent.click(screen.getByTestId('qb-col-checkbox-id'));

    const aggSelect = screen.getByTestId('qb-col-aggregate-id');
    fireEvent.change(aggSelect, { target: { value: 'COUNT' } });

    const sqlPreview = screen.getByTestId('qb-sql-preview');
    expect(sqlPreview.textContent).toContain('SELECT COUNT("users"."id")\nFROM "users"');
  });

  it('supports table joins (INNER / LEFT JOIN)', async () => {
    render(
      <VisualQueryBuilderTab
        tab={mockTab}
        connectionId="conn-1"
        driver="postgres"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('qb-base-table-select')).toBeInTheDocument();
    });

    // Add JOIN
    const addJoinBtn = screen.getByTestId('qb-add-join-btn');
    fireEvent.click(addJoinBtn);

    // Verify join elements are present
    expect(screen.getByTestId('qb-join-type-0')).toBeInTheDocument();
    expect(screen.getByTestId('qb-join-table-0')).toBeInTheDocument();

    // Change join type to LEFT JOIN
    fireEvent.change(screen.getByTestId('qb-join-type-0'), { target: { value: 'LEFT' } });

    const sqlPreview = screen.getByTestId('qb-sql-preview');
    expect(sqlPreview.textContent).toContain('LEFT JOIN "orders" ON');

    // Remove join
    const removeJoinBtn = screen.getByTestId('qb-remove-join-0');
    fireEvent.click(removeJoinBtn);

    expect(screen.queryByTestId('qb-join-type-0')).not.toBeInTheDocument();
    expect(sqlPreview.textContent).not.toContain('LEFT JOIN');
  });

  it('supports filter conditions (equals, contains, between, is_null)', async () => {
    render(
      <VisualQueryBuilderTab
        tab={mockTab}
        connectionId="conn-1"
        driver="postgres"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('qb-add-filter-btn')).toBeInTheDocument();
    });

    // Add filter 1: equals
    fireEvent.click(screen.getByTestId('qb-add-filter-btn'));
    fireEvent.change(screen.getByTestId('qb-filter-col-0'), { target: { value: 'name' } });
    fireEvent.change(screen.getByTestId('qb-filter-op-0'), { target: { value: 'equals' } });
    fireEvent.change(screen.getByTestId('qb-filter-val-0'), { target: { value: 'Alice' } });

    let sqlPreview = screen.getByTestId('qb-sql-preview');
    expect(sqlPreview.textContent).toContain(`WHERE "users"."name" = 'Alice'`);

    // Add filter 2: contains
    fireEvent.click(screen.getByTestId('qb-add-filter-btn'));
    fireEvent.change(screen.getByTestId('qb-filter-col-1'), { target: { value: 'email' } });
    fireEvent.change(screen.getByTestId('qb-filter-op-1'), { target: { value: 'contains' } });
    fireEvent.change(screen.getByTestId('qb-filter-val-1'), { target: { value: 'gmail' } });

    sqlPreview = screen.getByTestId('qb-sql-preview');
    expect(sqlPreview.textContent).toContain(`"users"."name" = 'Alice' AND "users"."email" LIKE '%gmail%'`);

    // Toggle conjunction to OR
    const conjToggle = screen.getByTestId('qb-conjunction-toggle');
    fireEvent.click(conjToggle);

    sqlPreview = screen.getByTestId('qb-sql-preview');
    expect(sqlPreview.textContent).toContain(`"users"."name" = 'Alice' OR "users"."email" LIKE '%gmail%'`);

    // Add filter 3: between
    fireEvent.click(screen.getByTestId('qb-add-filter-btn'));
    fireEvent.change(screen.getByTestId('qb-filter-col-2'), { target: { value: 'age' } });
    fireEvent.change(screen.getByTestId('qb-filter-op-2'), { target: { value: 'between' } });
    fireEvent.change(screen.getByTestId('qb-filter-val-2'), { target: { value: '20' } });
    fireEvent.change(screen.getByTestId('qb-filter-val-to-2'), { target: { value: '30' } });

    sqlPreview = screen.getByTestId('qb-sql-preview');
    expect(sqlPreview.textContent).toContain(`"users"."age" BETWEEN 20 AND 30`);

    // Add filter 4: is_null
    fireEvent.click(screen.getByTestId('qb-add-filter-btn'));
    fireEvent.change(screen.getByTestId('qb-filter-col-3'), { target: { value: 'email' } });
    fireEvent.change(screen.getByTestId('qb-filter-op-3'), { target: { value: 'is_null' } });

    sqlPreview = screen.getByTestId('qb-sql-preview');
    expect(sqlPreview.textContent).toContain(`"users"."email" IS NULL`);
  });

  it('supports sorting (ORDER BY) and LIMIT / OFFSET', async () => {
    render(
      <VisualQueryBuilderTab
        tab={mockTab}
        connectionId="conn-1"
        driver="postgres"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('qb-add-sort-btn')).toBeInTheDocument();
    });

    // Add sort
    fireEvent.click(screen.getByTestId('qb-add-sort-btn'));
    fireEvent.change(screen.getByTestId('qb-sort-col-0'), { target: { value: 'id' } });
    fireEvent.change(screen.getByTestId('qb-sort-dir-0'), { target: { value: 'DESC' } });

    // Set limit
    const limitInput = screen.getByTestId('qb-limit-input');
    fireEvent.change(limitInput, { target: { value: '25' } });

    const sqlPreview = screen.getByTestId('qb-sql-preview');
    expect(sqlPreview.textContent).toContain('ORDER BY "users"."id" DESC');
    expect(sqlPreview.textContent).toContain('LIMIT 25');
  });

  it('copies live SQL to clipboard', async () => {
    render(
      <VisualQueryBuilderTab
        tab={mockTab}
        connectionId="conn-1"
        driver="postgres"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('qb-copy-sql-btn')).toBeInTheDocument();
    });

    const copyBtn = screen.getByTestId('qb-copy-sql-btn');
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });

  it('opens generated query in SQL Editor tab', async () => {
    render(
      <VisualQueryBuilderTab
        tab={mockTab}
        connectionId="conn-1"
        driver="postgres"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('qb-open-editor-btn')).toBeInTheDocument();
    });

    const openEditorBtn = screen.getByTestId('qb-open-editor-btn');
    fireEvent.click(openEditorBtn);

    expect(tabHelpers.openQueryTab).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: 'conn-1',
        tableName: 'users',
        driver: 'postgres',
      })
    );
  });

  it('executes query and displays results in DataGrid', async () => {
    const mockResult: QueryResult = {
      columns: [
        { name: 'id', data_type: 'INTEGER', nullable: false },
        { name: 'name', data_type: 'TEXT', nullable: false },
      ],
      rows: [
        ['1', 'Alice'],
        ['2', 'Bob'],
      ],
      execution_time_ms: 12,
    };

    vi.mocked(dbApi.executeQuery).mockResolvedValueOnce(mockResult);

    render(
      <VisualQueryBuilderTab
        tab={mockTab}
        connectionId="conn-1"
        driver="postgres"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('qb-run-query-btn')).toBeInTheDocument();
    });

    const runBtn = screen.getByTestId('qb-run-query-btn');
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(dbApi.executeQuery).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByTestId('mock-data-grid')).toBeInTheDocument();
      expect(screen.getByText('Rows: 2')).toBeInTheDocument();
      expect(screen.getByText('2 rows')).toBeInTheDocument();
    });
  });

  it('displays error banner if query execution fails', async () => {
    vi.mocked(dbApi.executeQuery).mockRejectedValueOnce(new Error('Syntax error near FROM'));

    render(
      <VisualQueryBuilderTab
        tab={mockTab}
        connectionId="conn-1"
        driver="postgres"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('qb-run-query-btn')).toBeInTheDocument();
    });

    const runBtn = screen.getByTestId('qb-run-query-btn');
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByTestId('qb-execution-error')).toBeInTheDocument();
      expect(screen.getByText('Syntax error near FROM')).toBeInTheDocument();
    });
  });
});
