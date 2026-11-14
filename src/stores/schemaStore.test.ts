import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSchemaStore, fetchDatabaseSchemaMap } from './schemaStore';
import { dbApi } from '../api/db';

vi.mock('../api/db', () => ({
  dbApi: {
    executeDirectQuery: vi.fn(),
  },
}));

describe('schemaStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSchemaStore.setState({ schemas: {}, isLoading: {} });
  });

  it('fetches schema map for sqlite correctly', async () => {
    const mockExecute = vi.mocked(dbApi.executeDirectQuery);
    // 1st query: tables
    mockExecute.mockResolvedValueOnce({
      columns: [{ name: 'name', data_type: 'text', nullable: false }],
      rows: [['users'], ['orders']],
      execution_time_ms: 5,
    });
    // 2nd query: columns
    mockExecute.mockResolvedValueOnce({
      columns: [
        { name: 'table_name', data_type: 'text', nullable: false },
        { name: 'column_name', data_type: 'text', nullable: false },
      ],
      rows: [
        ['users', 'id'],
        ['users', 'email'],
        ['orders', 'id'],
        ['orders', 'user_id'],
        ['orders', 'amount'],
      ],
      execution_time_ms: 10,
    });

    const schema = await fetchDatabaseSchemaMap('conn-sqlite', 'sqlite');
    expect(schema).toEqual({
      users: ['id', 'email'],
      orders: ['id', 'user_id', 'amount'],
    });
  });

  it('fetches schema map for postgres correctly', async () => {
    const mockExecute = vi.mocked(dbApi.executeDirectQuery);
    mockExecute.mockResolvedValueOnce({
      columns: [{ name: 'table_name', data_type: 'text', nullable: false }],
      rows: [['customers']],
      execution_time_ms: 5,
    });
    mockExecute.mockResolvedValueOnce({
      columns: [
        { name: 'table_name', data_type: 'text', nullable: false },
        { name: 'column_name', data_type: 'text', nullable: false },
      ],
      rows: [
        ['customers', 'customer_id'],
        ['customers', 'name'],
      ],
      execution_time_ms: 8,
    });

    const schema = await fetchDatabaseSchemaMap('conn-pg', 'postgres', 'public');
    expect(schema).toEqual({
      customers: ['customer_id', 'name'],
    });
  });

  it('supports store operations: setSchema, invalidateSchema, getSchema', () => {
    const store = useSchemaStore.getState();
    store.setSchema('conn-1', { products: ['id', 'title', 'price'] });

    expect(useSchemaStore.getState().getSchema('conn-1')).toEqual({
      products: ['id', 'title', 'price'],
    });

    store.invalidateSchema('conn-1');
    expect(useSchemaStore.getState().getSchema('conn-1')).toEqual({});
  });
});
