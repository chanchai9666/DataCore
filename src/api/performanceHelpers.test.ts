import { describe, it, expect } from 'vitest';
import {
  buildAdvancedCreateIndexSql,
  buildRefreshMaterializedViewSql,
  buildGetViewDdlSql,
  buildGetTablePartitionsSql,
  buildBufferCacheStatsSql,
} from './performanceHelpers';

describe('performanceHelpers', () => {
  describe('buildAdvancedCreateIndexSql', () => {
    it('generates Postgres B-Tree, Hash, and GIN indexes', () => {
      expect(
        buildAdvancedCreateIndexSql({
          tableName: 'products',
          driver: 'postgres',
          indexName: 'idx_products_btree',
          columns: ['category_id', 'price'],
          indexType: 'BTREE',
        })
      ).toBe('CREATE INDEX "idx_products_btree" ON "products" ("category_id", "price");');

      expect(
        buildAdvancedCreateIndexSql({
          tableName: 'users',
          driver: 'postgres',
          indexName: 'idx_users_email_hash',
          columns: ['email'],
          indexType: 'HASH',
        })
      ).toBe('CREATE INDEX "idx_users_email_hash" ON "users" USING hash ("email");');

      expect(
        buildAdvancedCreateIndexSql({
          tableName: 'documents',
          driver: 'postgres',
          indexName: 'idx_docs_gin',
          columns: ['metadata'],
          indexType: 'GIN',
        })
      ).toBe('CREATE INDEX "idx_docs_gin" ON "documents" USING gin ("metadata");');
    });

    it('generates MySQL Full-text and Hash indexes', () => {
      expect(
        buildAdvancedCreateIndexSql({
          tableName: 'articles',
          driver: 'mysql',
          indexName: 'ft_articles_content',
          columns: ['title', 'body'],
          indexType: 'FULLTEXT',
        })
      ).toBe('CREATE FULLTEXT INDEX `ft_articles_content` ON `articles` (`title`, `body`);');

      expect(
        buildAdvancedCreateIndexSql({
          tableName: 'cache_entries',
          driver: 'mysql',
          indexName: 'idx_cache_hash',
          columns: ['cache_key'],
          indexType: 'HASH',
        })
      ).toBe('CREATE INDEX `idx_cache_hash` ON `cache_entries` (`cache_key`) USING HASH;');
    });

    it('generates SQLite index (falls back gracefully)', () => {
      expect(
        buildAdvancedCreateIndexSql({
          tableName: 'users',
          driver: 'sqlite',
          indexName: 'idx_users_name',
          columns: ['name'],
          isUnique: true,
        })
      ).toBe('CREATE UNIQUE INDEX "idx_users_name" ON "users" ("name");');
    });
  });

  describe('Views and Materialized Views', () => {
    it('builds REFRESH MATERIALIZED VIEW statement for Postgres', () => {
      expect(buildRefreshMaterializedViewSql('monthly_sales')).toBe(
        'REFRESH MATERIALIZED VIEW "monthly_sales";'
      );
      expect(buildRefreshMaterializedViewSql('monthly_sales', 'analytics', true)).toBe(
        'REFRESH MATERIALIZED VIEW CONCURRENTLY "analytics"."monthly_sales";'
      );
    });

    it('builds query to fetch view DDL', () => {
      expect(buildGetViewDdlSql('user_summary', 'public', 'postgres')).toContain('pg_views');
      expect(buildGetViewDdlSql('user_summary', 'app_db', 'mysql')).toContain('SHOW CREATE VIEW');
      expect(buildGetViewDdlSql('user_summary', '', 'sqlite')).toContain('sqlite_master');
      expect(buildGetViewDdlSql("view'with'quotes", '', 'sqlite')).toBe(
        "SELECT sql FROM sqlite_master WHERE type='view' AND name='view''with''quotes';"
      );
    });
  });

  describe('Table Partitioning', () => {
    it('builds table partitions inspection query for Postgres', () => {
      const q = buildGetTablePartitionsSql('orders', 'public', 'postgres');
      expect(q).toContain('pg_partitioned_table');
      expect(q).toContain('pg_inherits');
    });

    it('builds table partitions query for MySQL', () => {
      const q = buildGetTablePartitionsSql('orders', 'sales_db', 'mysql');
      expect(q).toContain('information_schema.PARTITIONS');
    });
  });

  describe('Buffer Cache & Performance Stats', () => {
    it('builds buffer cache hit ratio query for Postgres', () => {
      const q = buildBufferCacheStatsSql('postgres');
      expect(q).toContain('pg_stat_database');
      expect(q).toContain('blks_hit');
      expect(q).toContain('blks_read');
    });

    it('builds buffer pool query for MySQL', () => {
      const q = buildBufferCacheStatsSql('mysql');
      expect(q).toContain('Innodb_buffer_pool');
    });

    it('builds cache query for SQLite', () => {
      const q = buildBufferCacheStatsSql('sqlite');
      expect(q).toContain('pragma_page_count');
    });
  });
});
