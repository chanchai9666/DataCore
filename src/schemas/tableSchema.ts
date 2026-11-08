import { z } from 'zod';

export const tableColumnSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, 'Column name cannot be empty'),
  baseType: z.string().optional(),
  dataType: z.string().optional(),
  length: z.string().optional(),
  isPrimaryKey: z.boolean().optional(),
  primaryKey: z.boolean().optional(),
  nullable: z.boolean().optional(),
  autoIncrement: z.boolean().optional(),
  defaultValue: z.string().optional(),
  comment: z.string().optional(),
});

export const createTableSchema = z
  .object({
    tableName: z.string().trim().min(1, 'Table name is required'),
    schema: z.string().optional(),
    columns: z.array(tableColumnSchema).min(1, 'At least one column is required'),
  })
  .refine(
    (data) => {
      const names = data.columns.map((c) => c.name.trim().toLowerCase()).filter(Boolean);
      const uniqueNames = new Set(names);
      return uniqueNames.size === names.length;
    },
    {
      message: 'Duplicate column names are not allowed',
      path: ['columns'],
    }
  );

export type TableColumnFormValues = z.infer<typeof tableColumnSchema>;
export type CreateTableFormValues = z.infer<typeof createTableSchema>;
