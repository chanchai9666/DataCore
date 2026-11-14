import { z } from 'zod';

export const baseConnectionSchema = z.object({
  name: z.string().trim().min(1, 'Connection name is required'),
  driver: z.enum(['sqlite', 'postgres', 'mysql']),
  folder: z.string().optional(),
  rememberPassword: z.boolean().optional(),
  password: z.string().optional(),
  sslMode: z.string().optional(),
  environment: z.enum(['development', 'staging', 'production']).or(z.literal('')).optional(),
  readOnly: z.boolean().optional(),
  read_only: z.boolean().optional(),
});

export const sqliteConnectionSchema = baseConnectionSchema.extend({
  driver: z.literal('sqlite'),
  database: z.string().trim().min(1, 'Database path is required'),
  host: z.string().optional(),
  port: z.union([z.number(), z.string()]).optional(),
  user: z.string().optional(),
});

export const networkConnectionSchema = baseConnectionSchema.extend({
  driver: z.enum(['postgres', 'mysql']),
  host: z.string().trim().min(1, 'Host is required'),
  port: z
    .union([z.number(), z.string()])
    .refine((val) => {
      if (val === '' || val === undefined || val === null) return false;
      const num = Number(val);
      return !isNaN(num) && num > 0 && Number.isInteger(num);
    }, 'Port must be a valid positive integer'),
  database: z.string().trim().min(1, 'Database name is required'),
  user: z.string().trim().min(1, 'User is required'),
});

export const connectionSchema = z.discriminatedUnion('driver', [
  sqliteConnectionSchema,
  networkConnectionSchema,
]);

export const testSqliteConnectionSchema = sqliteConnectionSchema.extend({
  name: z.string().optional(),
});

export const testNetworkConnectionSchema = networkConnectionSchema.extend({
  name: z.string().optional(),
});

export const testConnectionSchema = z.discriminatedUnion('driver', [
  testSqliteConnectionSchema,
  testNetworkConnectionSchema,
]);

export type ConnectionFormValues = z.infer<typeof connectionSchema>;

export function validateConnectionForm(
  data: unknown,
  isTesting: boolean = false
): {
  success: boolean;
  errors: Partial<Record<string, string>>;
} {
  const schema = isTesting ? testConnectionSchema : connectionSchema;
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, errors: {} };
  }
  const errors: Partial<Record<string, string>> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0]);
    if (field && !errors[field]) {
      errors[field] = issue.message;
    }
  }
  return { success: false, errors };
}
