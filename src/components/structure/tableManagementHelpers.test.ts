import { describe, it, expect } from 'vitest';
import {
  buildCreateTableSql,
  buildDropTableSql,
  buildCreateIndexSql,
  buildDropIndexSql,
  getFetchIndexesSql,
  parseIndexesFromQueryResult,
  buildAddForeignKeySql,
  buildDropForeignKeySql,
  buildAddConstraintSql,
  buildDropConstraintSql,
  getFetchForeignKeysSql,
  parseForeignKeysFromQueryResult,
  getFetchConstraintsSql,
  parseConstraintsFromQueryResult,
  type NewTableColumnConfig,
  type CreateTableConfig,
  type TableIndexConfig,
} from './tableManagementHelpers';

describe('tableManagementHelpers', () => {
  describe('buildDropTableSql', () => {
    it('generates DROP TABLE for PostgreSQL with schema and optional CASCADE', () => {
      const sqlNoCascade = buildDropTableSql('customers', 'public', 'postgres', false);
      expect(sqlNoCascade).toBe('DROP TABLE "public"."customers";');

      const sqlCascade = buildDropTableSql('customers', 'public', 'postgres', true);
      expect(sqlCascade).toBe('DROP TABLE "public"."customers" CASCADE;');
    });

    it('generates DROP TABLE for MySQL with backticks', () => {
      const sql = buildDropTableSql('orders', undefined, 'mysql', false);
      expect(sql).toBe('DROP TABLE `orders`;');
    });

    it('generates DROP TABLE for SQLite with double quotes', () => {
      const sql = buildDropTableSql('items', undefined, 'sqlite', false);
      expect(sql).toBe('DROP TABLE "items";');
    });

    it('handles table without schema in postgres', () => {
      const sql = buildDropTableSql('users', undefined, 'postgres', false);
      expect(sql).toBe('DROP TABLE "users";');
    });
  });

  describe('buildCreateTableSql', () => {
    it('generates CREATE TABLE for PostgreSQL with PK and various types', () => {
      const columns: NewTableColumnConfig[] = [
        {
          name: 'id',
          dataType: 'SERIAL',
          isPrimaryKey: true,
          nullable: false,
        },
        {
          name: 'username',
          dataType: 'VARCHAR(50)',
          isPrimaryKey: false,
          nullable: false,
        },
        {
          name: 'email',
          dataType: 'VARCHAR(255)',
          isPrimaryKey: false,
          nullable: true,
        },
        {
          name: 'is_active',
          dataType: 'BOOLEAN',
          isPrimaryKey: false,
          nullable: false,
          defaultValue: 'true',
        },
        {
          name: 'created_at',
          dataType: 'TIMESTAMP',
          isPrimaryKey: false,
          nullable: false,
          defaultValue: 'now()',
        },
      ];

      const config: CreateTableConfig = {
        tableName: 'users',
        schemaName: 'public',
        driver: 'postgres',
        columns,
      };

      const sql = buildCreateTableSql(config);
      expect(sql).toContain('CREATE TABLE "public"."users" (');
      expect(sql).toContain('"id" SERIAL PRIMARY KEY');
      expect(sql).toContain('"username" VARCHAR(50) NOT NULL');
      expect(sql).toContain('"email" VARCHAR(255)');
      expect(sql).toContain('"is_active" BOOLEAN NOT NULL DEFAULT true');
      expect(sql).toContain('"created_at" TIMESTAMP NOT NULL DEFAULT now()');
      expect(sql.trim().endsWith(');')).toBe(true);
    });

    it('generates CREATE TABLE for MySQL with backticks and composite PK', () => {
      const columns: NewTableColumnConfig[] = [
        {
          name: 'order_id',
          dataType: 'INT',
          isPrimaryKey: true,
          nullable: false,
        },
        {
          name: 'item_id',
          dataType: 'INT',
          isPrimaryKey: true,
          nullable: false,
        },
        {
          name: 'quantity',
          dataType: 'INT',
          isPrimaryKey: false,
          nullable: false,
          defaultValue: '1',
        },
      ];

      const config: CreateTableConfig = {
        tableName: 'order_items',
        driver: 'mysql',
        columns,
      };

      const sql = buildCreateTableSql(config);
      expect(sql).toContain('CREATE TABLE `order_items` (');
      expect(sql).toContain('`order_id` INT NOT NULL');
      expect(sql).toContain('`item_id` INT NOT NULL');
      expect(sql).toContain('`quantity` INT NOT NULL DEFAULT 1');
      expect(sql).toContain('PRIMARY KEY (`order_id`, `item_id`)');
    });

    it('generates CREATE TABLE for SQLite with autoincrement PK', () => {
      const columns: NewTableColumnConfig[] = [
        {
          name: 'id',
          dataType: 'INTEGER',
          isPrimaryKey: true,
          nullable: false,
          autoIncrement: true,
        },
        {
          name: 'title',
          dataType: 'TEXT',
          isPrimaryKey: false,
          nullable: false,
        },
      ];

      const config: CreateTableConfig = {
        tableName: 'notes',
        driver: 'sqlite',
        columns,
      };

      const sql = buildCreateTableSql(config);
      expect(sql).toContain('CREATE TABLE "notes" (');
      expect(sql).toContain('"id" INTEGER PRIMARY KEY AUTOINCREMENT');
      expect(sql).toContain('"title" TEXT NOT NULL');
    });

    it('returns empty string when tableName is blank or columns are empty', () => {
      expect(
        buildCreateTableSql({
          tableName: '',
          columns: [{ name: 'id', dataType: 'INT', isPrimaryKey: true, nullable: false }],
        })
      ).toBe('');

      expect(
        buildCreateTableSql({
          tableName: 'empty_table',
          columns: [],
        })
      ).toBe('');
    });

    it('generates CREATE TABLE along with CREATE INDEX statements when indexes are specified', () => {
      const columns: NewTableColumnConfig[] = [
        { name: 'id', dataType: 'SERIAL', isPrimaryKey: true, nullable: false },
        { name: 'email', dataType: 'VARCHAR(255)', isPrimaryKey: false, nullable: false },
        { name: 'company_id', dataType: 'INT', isPrimaryKey: false, nullable: true },
      ];

      const indexes: TableIndexConfig[] = [
        { name: 'idx_users_email', columns: ['email'], isUnique: true },
        { name: 'idx_users_company', columns: ['company_id'], isUnique: false },
      ];

      const sql = buildCreateTableSql({
        tableName: 'users',
        schemaName: 'public',
        driver: 'postgres',
        columns,
        indexes,
      });

      expect(sql).toContain('CREATE TABLE "public"."users" (');
      expect(sql).toContain('CREATE UNIQUE INDEX "idx_users_email" ON "public"."users" ("email");');
      expect(sql).toContain('CREATE INDEX "idx_users_company" ON "public"."users" ("company_id");');
    });
  });

  describe('buildCreateIndexSql', () => {
    it('generates index SQL for PostgreSQL', () => {
      const sql = buildCreateIndexSql({
        tableName: 'orders',
        schemaName: 'sales',
        driver: 'postgres',
        indexName: 'idx_orders_customer',
        columns: ['customer_id', 'created_at'],
        isUnique: false,
      });
      expect(sql).toBe('CREATE INDEX "idx_orders_customer" ON "sales"."orders" ("customer_id", "created_at");');
    });

    it('generates UNIQUE index SQL for MySQL', () => {
      const sql = buildCreateIndexSql({
        tableName: 'users',
        driver: 'mysql',
        indexName: 'idx_users_email_uniq',
        columns: ['email'],
        isUnique: true,
      });
      expect(sql).toBe('CREATE UNIQUE INDEX `idx_users_email_uniq` ON `users` (`email`);');
    });

    it('generates index SQL for SQLite', () => {
      const sql = buildCreateIndexSql({
        tableName: 'products',
        driver: 'sqlite',
        indexName: 'idx_products_sku',
        columns: ['sku'],
        isUnique: true,
      });
      expect(sql).toBe('CREATE UNIQUE INDEX "idx_products_sku" ON "products" ("sku");');
    });

    it('returns empty string if index name or columns are missing', () => {
      expect(buildCreateIndexSql({ tableName: 't', indexName: '', columns: ['a'] })).toBe('');
      expect(buildCreateIndexSql({ tableName: 't', indexName: 'idx', columns: [] })).toBe('');
    });
  });

  describe('buildDropIndexSql', () => {
    it('generates DROP INDEX for PostgreSQL with schema', () => {
      const sql = buildDropIndexSql({
        indexName: 'idx_users_email',
        schemaName: 'public',
        driver: 'postgres',
      });
      expect(sql).toBe('DROP INDEX "public"."idx_users_email";');
    });

    it('generates DROP INDEX for MySQL', () => {
      const sql = buildDropIndexSql({
        indexName: 'idx_users_email',
        tableName: 'users',
        driver: 'mysql',
      });
      expect(sql).toBe('DROP INDEX `idx_users_email` ON `users`;');
    });

    it('generates DROP INDEX for SQLite', () => {
      const sql = buildDropIndexSql({
        indexName: 'idx_users_email',
        driver: 'sqlite',
      });
      expect(sql).toBe('DROP INDEX "idx_users_email";');
    });
  });

  describe('getFetchIndexesSql and parseIndexesFromQueryResult', () => {
    it('generates valid index fetch query for drivers', () => {
      expect(getFetchIndexesSql('postgres', 'users', 'public')).toContain('FROM pg_class t');
      expect(getFetchIndexesSql('mysql', 'users', 'app_db')).toContain('FROM information_schema.STATISTICS');
      expect(getFetchIndexesSql('sqlite', 'users')).toContain("FROM sqlite_master WHERE type = 'index'");
    });

    it('parses postgres index query results correctly', () => {
      const result = {
        columns: [],
        rows: [
          ['users_pkey', 'true', 'true', 'id', 'btree'],
          ['idx_users_email', 'true', 'false', 'email', 'btree'],
          ['idx_users_name_age', 'false', 'false', 'name, age', 'btree'],
        ],
        execution_time_ms: 5,
      };

      const parsed = parseIndexesFromQueryResult(result, 'postgres');
      expect(parsed).toHaveLength(3);
      expect(parsed[0]).toEqual({
        name: 'users_pkey',
        columns: ['id'],
        isUnique: true,
        isPrimary: true,
        indexType: 'btree',
      });
      expect(parsed[2]).toEqual({
        name: 'idx_users_name_age',
        columns: ['name', 'age'],
        isUnique: false,
        isPrimary: false,
        indexType: 'btree',
      });
    });

    it('parses sqlite index query results correctly', () => {
      const result = {
        columns: [],
        rows: [
          ['idx_products_sku', 'CREATE UNIQUE INDEX "idx_products_sku" ON "products" ("sku")'],
          ['idx_products_cat', 'CREATE INDEX idx_products_cat ON products (category_id, created_at)'],
        ],
        execution_time_ms: 1,
      };

      const parsed = parseIndexesFromQueryResult(result, 'sqlite');
      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBe('idx_products_sku');
      expect(parsed[0].columns).toEqual(['sku']);
      expect(parsed[0].isUnique).toBe(true);
      expect(parsed[1].name).toBe('idx_products_cat');
      expect(parsed[1].columns).toEqual(['category_id', 'created_at']);
      expect(parsed[1].isUnique).toBe(false);
    });
  });

  describe('Foreign Keys Management', () => {
    it('generates ADD FOREIGN KEY SQL with actions', () => {
      const sql = buildAddForeignKeySql({
        tableName: 'orders',
        schemaName: 'public',
        driver: 'postgres',
        constraintName: 'fk_orders_user',
        columns: ['user_id'],
        foreignTable: 'users',
        foreignColumns: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'SET NULL',
      });

      expect(sql).toBe(
        'ALTER TABLE "public"."orders" ADD CONSTRAINT "fk_orders_user" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE CASCADE ON UPDATE SET NULL;'
      );
    });

    it('generates table-rebuild migration for SQLite when adding foreign key', () => {
      const sql = buildAddForeignKeySql({
        tableName: 'orders',
        driver: 'sqlite',
        constraintName: 'fk_orders_user',
        columns: ['user_id'],
        foreignTable: 'users',
        foreignColumns: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'SET NULL',
        existingColumns: [
          { name: 'id', type: 'INTEGER', isPrimaryKey: true, isAutoIncrement: true },
          { name: 'user_id', type: 'INTEGER', nullable: false, defaultValue: '0' },
          { name: 'code', type: 'TEXT', isUnique: true, checkConstraint: 'length(code) > 2' },
          { name: 'amount', type: 'REAL' },
        ],
      });

      expect(sql).toContain('PRAGMA foreign_keys = OFF;');
      expect(sql).toContain('BEGIN TRANSACTION;');
      expect(sql).toContain('CREATE TABLE "orders_datacore_rebuild" (');
      expect(sql).toContain('"id" INTEGER PRIMARY KEY AUTOINCREMENT');
      expect(sql).toContain('"user_id" INTEGER NOT NULL DEFAULT 0');
      expect(sql).toContain('"code" TEXT UNIQUE CHECK (length(code) > 2)');
      expect(sql).toContain('CONSTRAINT "fk_orders_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE SET NULL');
      expect(sql).toContain('INSERT INTO "orders_datacore_rebuild" ("id", "user_id", "code", "amount") SELECT "id", "user_id", "code", "amount" FROM "orders";');
      expect(sql).toContain('DROP TABLE "orders";');
      expect(sql).toContain('ALTER TABLE "orders_datacore_rebuild" RENAME TO "orders";');
      expect(sql).toContain('COMMIT;');
      expect(sql).toContain('PRAGMA foreign_keys = ON;');
    });

    it('throws descriptive error for SQLite if existingColumns is missing', () => {
      expect(() =>
        buildAddForeignKeySql({
          tableName: 'orders',
          driver: 'sqlite',
          columns: ['user_id'],
          foreignTable: 'users',
          foreignColumns: ['id'],
        })
      ).toThrow('SQLite does not support ALTER TABLE ADD CONSTRAINT FOREIGN KEY');
    });

    it('generates table-rebuild migration for SQLite when dropping foreign key', () => {
      const sql = buildDropForeignKeySql({
        tableName: 'orders',
        driver: 'sqlite',
        constraintName: 'fk_orders_user',
        existingColumns: [
          { name: 'id', type: 'INTEGER', isPrimaryKey: true },
          { name: 'user_id', type: 'INTEGER' },
        ],
        remainingForeignKeys: [
          {
            name: 'fk_orders_store',
            columns: ['store_id'],
            foreignTable: 'stores',
            foreignColumns: ['id'],
          },
        ],
      });

      expect(sql).toContain('PRAGMA foreign_keys = OFF;');
      expect(sql).toContain('BEGIN TRANSACTION;');
      expect(sql).toContain('CREATE TABLE "orders_datacore_rebuild"');
      expect(sql).toContain('CONSTRAINT "fk_orders_store" FOREIGN KEY ("store_id") REFERENCES "stores" ("id")');
      expect(sql).not.toContain('fk_orders_user');
      expect(sql).toContain('DROP TABLE "orders";');
      expect(sql).toContain('ALTER TABLE "orders_datacore_rebuild" RENAME TO "orders";');
      expect(sql).toContain('COMMIT;');
      expect(sql).toContain('PRAGMA foreign_keys = ON;');
    });

    it('generates DROP FOREIGN KEY SQL for MySQL and Postgres', () => {
      const pgSql = buildDropForeignKeySql({
        tableName: 'orders',
        driver: 'postgres',
        constraintName: 'fk_orders_user',
      });
      expect(pgSql).toBe('ALTER TABLE "orders" DROP CONSTRAINT "fk_orders_user";');

      const mySql = buildDropForeignKeySql({
        tableName: 'orders',
        driver: 'mysql',
        constraintName: 'fk_orders_user',
      });
      expect(mySql).toBe('ALTER TABLE `orders` DROP FOREIGN KEY `fk_orders_user`;');
    });

    it('generates correct query to fetch foreign keys across drivers', () => {
      expect(getFetchForeignKeysSql('sqlite', 'orders')).toContain('PRAGMA foreign_key_list');
      expect(getFetchForeignKeysSql('mysql', 'orders')).toContain('REFERENTIAL_CONSTRAINTS');
      expect(getFetchForeignKeysSql('postgres', 'orders', 'public')).toContain('information_schema.referential_constraints');
    });

    it('parses postgres foreign keys query result', () => {
      const result = {
        columns: [],
        rows: [
          ['fk_orders_user', 'user_id', 'users', 'id', 'NO ACTION', 'CASCADE'],
        ],
        execution_time_ms: 2,
      };

      const parsed = parseForeignKeysFromQueryResult(result, 'postgres');
      expect(parsed).toHaveLength(1);
      expect(parsed[0].name).toBe('fk_orders_user');
      expect(parsed[0].columnNames).toEqual(['user_id']);
      expect(parsed[0].foreignTableName).toBe('users');
      expect(parsed[0].foreignColumnNames).toEqual(['id']);
      expect(parsed[0].onDelete).toBe('CASCADE');
      expect(parsed[0].onUpdate).toBe('NO ACTION');
    });
  });

  describe('Constraints Management', () => {
    it('generates ADD CHECK and UNIQUE constraint SQL', () => {
      const checkSql = buildAddConstraintSql({
        tableName: 'products',
        driver: 'postgres',
        name: 'chk_price_positive',
        type: 'CHECK',
        expression: 'price > 0',
      });
      expect(checkSql).toBe('ALTER TABLE "products" ADD CONSTRAINT "chk_price_positive" CHECK (price > 0);');

      const uniqueSql = buildAddConstraintSql({
        tableName: 'users',
        driver: 'postgres',
        name: 'uq_email',
        type: 'UNIQUE',
        columns: ['email'],
      });
      expect(uniqueSql).toBe('ALTER TABLE "users" ADD CONSTRAINT "uq_email" UNIQUE ("email");');
    });

    it('generates DROP CONSTRAINT SQL for MySQL and Postgres', () => {
      const pgSql = buildDropConstraintSql({
        tableName: 'products',
        driver: 'postgres',
        name: 'chk_price',
      });
      expect(pgSql).toBe('ALTER TABLE "products" DROP CONSTRAINT "chk_price";');

      const mySqlCheck = buildDropConstraintSql({
        tableName: 'products',
        driver: 'mysql',
        name: 'chk_price',
        type: 'CHECK',
      });
      expect(mySqlCheck).toBe('ALTER TABLE `products` DROP CHECK `chk_price`;');
    });

    it('generates correct query to fetch constraints across drivers', () => {
      expect(getFetchConstraintsSql('sqlite', 'products')).toContain('sqlite_master');
      expect(getFetchConstraintsSql('mysql', 'products')).toContain('TABLE_CONSTRAINTS');
      expect(getFetchConstraintsSql('postgres', 'products', 'public')).toContain('information_schema.check_constraints');
    });

    it('parses constraints query result', () => {
      const result = {
        columns: [],
        rows: [
          ['chk_price', 'CHECK', 'price > 0'],
          ['uq_code', 'UNIQUE', null],
        ],
        execution_time_ms: 2,
      };

      const parsed = parseConstraintsFromQueryResult(result, 'postgres');
      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBe('chk_price');
      expect(parsed[0].type).toBe('CHECK');
      expect(parsed[0].definition).toBe('price > 0');
      expect(parsed[1].type).toBe('UNIQUE');
    });
  });
});
