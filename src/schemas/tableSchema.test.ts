import { describe, it, expect } from 'vitest';
import { createTableSchema } from './tableSchema';

describe('createTableSchema', () => {
  it('validates a correct table configuration', () => {
    const valid = {
      tableName: 'users',
      schema: 'public',
      columns: [
        {
          id: '1',
          name: 'id',
          dataType: 'integer',
          primaryKey: true,
          nullable: false,
          autoIncrement: true,
        },
        {
          id: '2',
          name: 'email',
          dataType: 'varchar',
          length: '255',
          primaryKey: false,
          nullable: false,
          autoIncrement: false,
        },
      ],
    };
    const res = createTableSchema.safeParse(valid);
    expect(res.success).toBe(true);
  });

  it('fails when table name is empty', () => {
    const invalid = {
      tableName: '   ',
      columns: [
        {
          id: '1',
          name: 'id',
          dataType: 'integer',
        },
      ],
    };
    const res = createTableSchema.safeParse(invalid);
    expect(res.success).toBe(false);
  });

  it('fails when column names are duplicate', () => {
    const duplicate = {
      tableName: 'orders',
      columns: [
        { id: '1', name: 'user_id', dataType: 'integer' },
        { id: '2', name: 'USER_ID', dataType: 'integer' },
      ],
    };
    const res = createTableSchema.safeParse(duplicate);
    expect(res.success).toBe(false);
  });
});
