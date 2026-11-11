import { quoteIdentifier, qualifyTable } from './queryBuilder';

export type IndexType = 'BTREE' | 'HASH' | 'GIN' | 'GIST' | 'FULLTEXT';

export interface AdvancedCreateIndexParams {
  tableName: string;
  schemaName?: string;
  driver: string;
  indexName: string;
  columns: string[];
  isUnique?: boolean;
  indexType?: IndexType;
}

export interface TablePartitionInfo {
  name: string;
  partitionExpression?: string;
  partitionMethod?: string; // RANGE, LIST, HASH
  rowCount?: number;
  dataSize?: string;
}

export interface BufferCacheMetrics {
  cacheHitRatio: number; // 0.0 - 100.0 %
  readsFromDisk: number;
  hitsInCache: number;
  deadlocksCount?: number;
  commitsCount?: number;
  rollbacksCount?: number;
}

/**
 * Builds an advanced CREATE INDEX statement supporting B-Tree, Hash, GIN, GiST, and Full-text.
 */
export function buildAdvancedCreateIndexSql(params: AdvancedCreateIndexParams): string {
  const { tableName, schemaName, driver, indexName, columns, isUnique, indexType } = params;
  const cleanName = indexName.trim();
  const cleanTable = tableName.trim();

  if (!cleanName || !cleanTable || !columns || columns.length === 0) {
    return '';
  }

  const d = driver?.toLowerCase() || 'postgres';
  const fullTable = qualifyTable(cleanTable, schemaName, d);
  const qIndex = quoteIdentifier(cleanName, d);
  const qCols = columns
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => quoteIdentifier(c, d))
    .join(', ');

  if (!qCols) return '';

  if (d === 'mysql') {
    if (indexType === 'FULLTEXT') {
      return `CREATE FULLTEXT INDEX ${qIndex} ON ${fullTable} (${qCols});`;
    }
    const usingClause = indexType === 'HASH' ? ' USING HASH' : indexType === 'BTREE' ? ' USING BTREE' : '';
    const uniquePrefix = isUnique ? 'UNIQUE ' : '';
    return `CREATE ${uniquePrefix}INDEX ${qIndex} ON ${fullTable} (${qCols})${usingClause};`;
  }

  if (d === 'sqlite') {
    const uniquePrefix = isUnique ? 'UNIQUE ' : '';
    return `CREATE ${uniquePrefix}INDEX ${qIndex} ON ${fullTable} (${qCols});`;
  }

  // PostgreSQL
  const typeMap: Record<IndexType, string> = {
    BTREE: 'btree',
    HASH: 'hash',
    GIN: 'gin',
    GIST: 'gist',
    FULLTEXT: 'gin',
  };

  const usingClause = indexType && indexType !== 'BTREE' ? ` USING ${typeMap[indexType] || 'btree'}` : '';
  const uniquePrefix = isUnique && indexType !== 'HASH' && indexType !== 'GIN' && indexType !== 'GIST' ? 'UNIQUE ' : '';
  return `CREATE ${uniquePrefix}INDEX ${qIndex} ON ${fullTable}${usingClause} (${qCols});`;
}

/**
 * Builds REFRESH MATERIALIZED VIEW statement.
 */
export function buildRefreshMaterializedViewSql(
  viewName: string,
  schemaName?: string,
  concurrently?: boolean
): string {
  const full = qualifyTable(viewName, schemaName, 'postgres');
  const conc = concurrently ? ' CONCURRENTLY' : '';
  return `REFRESH MATERIALIZED VIEW${conc} ${full};`;
}

/**
 * Builds SQL to fetch the DDL definition of a View.
 */
export function buildGetViewDdlSql(viewName: string, schemaName: string, driver: string): string {
  const d = driver?.toLowerCase() || 'postgres';

  if (d === 'mysql') {
    const full = qualifyTable(viewName, schemaName, d);
    return `SHOW CREATE VIEW ${full};`;
  }

  if (d === 'sqlite') {
    return `SELECT sql FROM sqlite_master WHERE type='view' AND name='${viewName}';`;
  }

  // PostgreSQL
  const s = schemaName || 'public';
  return `
SELECT definition 
FROM pg_views 
WHERE schemaname = '${s}' AND viewname = '${viewName}';
  `.trim();
}

/**
 * Builds query to inspect Table Partitioning metadata.
 */
export function buildGetTablePartitionsSql(
  tableName: string,
  schemaName: string,
  driver: string
): string {
  const d = driver?.toLowerCase() || 'postgres';

  if (d === 'mysql') {
    const schemaClause = schemaName ? `AND TABLE_SCHEMA = '${schemaName}'` : '';
    return `
SELECT 
  PARTITION_NAME AS name,
  PARTITION_METHOD AS partition_method,
  PARTITION_EXPRESSION AS partition_expression,
  TABLE_ROWS AS row_count,
  ROUND(DATA_LENGTH / 1024 / 1024, 2) AS data_size_mb
FROM information_schema.PARTITIONS
WHERE TABLE_NAME = '${tableName}' ${schemaClause}
  AND PARTITION_NAME IS NOT NULL
ORDER BY PARTITION_ORDINAL_POSITION ASC;
    `.trim();
  }

  if (d === 'sqlite') {
    return `-- SQLite does not have native table partitioning; virtual tables or unions are used.`;
  }

  // PostgreSQL
  const s = schemaName || 'public';
  return `
SELECT
  c.relname AS name,
  pg_get_expr(c.relpartbound, c.oid) AS partition_expression,
  pt.partstrat AS partition_method,
  c.reltuples::bigint AS row_count,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS data_size
FROM pg_class p
JOIN pg_inherits i ON i.inhparent = p.oid
JOIN pg_class c ON c.oid = i.inhrelid
JOIN pg_namespace n ON n.oid = p.relnamespace
LEFT JOIN pg_partitioned_table pt ON pt.partrelid = p.oid
WHERE n.nspname = '${s}' AND p.relname = '${tableName}'
ORDER BY c.relname ASC;
  `.trim();
}

/**
 * Builds SQL to inspect Buffer Pool, Cache Hit Ratio, and Transaction health metrics.
 */
export function buildBufferCacheStatsSql(driver: string): string {
  const d = driver?.toLowerCase() || 'postgres';

  if (d === 'mysql') {
    return `
SHOW GLOBAL STATUS WHERE Variable_name IN (
  'Innodb_buffer_pool_read_requests',
  'Innodb_buffer_pool_reads',
  'Innodb_row_lock_waits',
  'Innodb_deadlocks',
  'Com_commit',
  'Com_rollback'
);
    `.trim();
  }

  if (d === 'sqlite') {
    return `
SELECT 
  (SELECT * FROM pragma_page_count()) AS page_count,
  (SELECT * FROM pragma_page_size()) AS page_size,
  (SELECT * FROM pragma_cache_size()) AS cache_size;
    `.trim();
  }

  // PostgreSQL: pg_stat_database
  return `
SELECT
  datname,
  blks_read,
  blks_hit,
  CASE WHEN (blks_hit + blks_read) = 0 THEN 100.0
       ELSE ROUND((blks_hit::numeric / (blks_hit + blks_read)::numeric) * 100.0, 2)
  END AS cache_hit_ratio,
  xact_commit,
  xact_rollback,
  deadlocks
FROM pg_stat_database
WHERE datname = current_database();
  `.trim();
}
