import { quoteIdentifier, qualifyTable, formatSqlLiteral } from './queryBuilder';

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
    return `SELECT sql FROM sqlite_master WHERE type='view' AND name=${formatSqlLiteral(viewName, 'sqlite')};`;
  }

  // PostgreSQL
  const s = schemaName || 'public';
  return `
SELECT definition 
FROM pg_views 
WHERE schemaname = ${formatSqlLiteral(s, 'postgres')} AND viewname = ${formatSqlLiteral(viewName, 'postgres')};
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
    const schemaClause = schemaName ? `AND TABLE_SCHEMA = ${formatSqlLiteral(schemaName, 'mysql')}` : '';
    return `
SELECT 
  PARTITION_NAME AS name,
  PARTITION_METHOD AS partition_method,
  PARTITION_EXPRESSION AS partition_expression,
  TABLE_ROWS AS row_count,
  ROUND(DATA_LENGTH / 1024 / 1024, 2) AS data_size_mb
FROM information_schema.PARTITIONS
WHERE TABLE_NAME = ${formatSqlLiteral(tableName, 'mysql')} ${schemaClause}
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
WHERE n.nspname = ${formatSqlLiteral(s, 'postgres')} AND p.relname = ${formatSqlLiteral(tableName, 'postgres')}
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

export type PartitionRangeType = 'monthly' | 'yearly' | 'custom';

export interface CreateRangePartitionParams {
  tableName: string;
  schemaName?: string;
  partitionName: string;
  rangeType: PartitionRangeType;
  year?: number;
  month?: number; // 1-12
  fromValue?: string;
  toValue?: string;
  driver: string;
}

function resolveRangeBounds(params: CreateRangePartitionParams): { from: string; to: string } {
  const year = params.year ?? new Date().getFullYear();
  if (params.rangeType === 'monthly') {
    const month = Math.min(12, Math.max(1, params.month ?? 1));
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const to = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
    return { from, to };
  }
  if (params.rangeType === 'yearly') {
    return {
      from: `${year}-01-01`,
      to: `${year + 1}-01-01`,
    };
  }
  return {
    from: (params.fromValue ?? '').trim(),
    to: (params.toValue ?? '').trim(),
  };
}

/**
 * Builds DDL to create a Range Partition (monthly, yearly, or custom bounds).
 */
export function buildCreateRangePartitionSql(params: CreateRangePartitionParams): string {
  const d = params.driver?.toLowerCase() || 'postgres';
  const cleanTable = params.tableName.trim();
  const cleanPart = params.partitionName.trim();
  if (!cleanTable || !cleanPart) return '';

  const { from, to } = resolveRangeBounds(params);
  if (!to || (params.rangeType === 'custom' && d === 'postgres' && !from)) {
    return '';
  }

  const fullTable = qualifyTable(cleanTable, params.schemaName, d);

  if (d === 'mysql') {
    const qPart = quoteIdentifier(cleanPart, 'mysql');
    return `ALTER TABLE ${fullTable} ADD PARTITION (PARTITION ${qPart} VALUES LESS THAN (${formatSqlLiteral(to, 'mysql')}));`;
  }

  if (d === 'sqlite') {
    return '-- SQLite does not support native table partitioning.';
  }

  const fullPart = qualifyTable(cleanPart, params.schemaName, d);
  return `CREATE TABLE ${fullPart} PARTITION OF ${fullTable} FOR VALUES FROM (${formatSqlLiteral(from, d)}) TO (${formatSqlLiteral(to, d)});`;
}

export interface PartitionActionParams {
  tableName: string;
  schemaName?: string;
  partitionName: string;
  concurrently?: boolean;
  driver: string;
}

/**
 * Builds SQL to detach an existing partition for archiving (PostgreSQL).
 */
export function buildDetachPartitionSql(params: PartitionActionParams): string {
  const d = params.driver?.toLowerCase() || 'postgres';
  const cleanTable = params.tableName.trim();
  const cleanPart = params.partitionName.trim();
  if (!cleanTable || !cleanPart) return '';

  if (d === 'mysql') {
    return '-- MySQL does not support DETACH PARTITION; use DROP PARTITION or EXCHANGE PARTITION instead.';
  }
  if (d === 'sqlite') {
    return '-- SQLite does not support native table partitioning.';
  }

  const fullTable = qualifyTable(cleanTable, params.schemaName, d);
  const fullPart = qualifyTable(cleanPart, params.schemaName, d);
  const conc = params.concurrently ? ' CONCURRENTLY' : '';
  return `ALTER TABLE ${fullTable} DETACH PARTITION ${fullPart}${conc};`;
}

/**
 * Builds SQL to drop an old partition.
 */
export function buildDropPartitionSql(params: PartitionActionParams): string {
  const d = params.driver?.toLowerCase() || 'postgres';
  const cleanTable = params.tableName.trim();
  const cleanPart = params.partitionName.trim();
  if (!cleanTable || !cleanPart) return '';

  if (d === 'mysql') {
    const fullTable = qualifyTable(cleanTable, params.schemaName, 'mysql');
    const qPart = quoteIdentifier(cleanPart, 'mysql');
    return `ALTER TABLE ${fullTable} DROP PARTITION ${qPart};`;
  }
  if (d === 'sqlite') {
    return '-- SQLite does not support native table partitioning.';
  }

  const fullPart = qualifyTable(cleanPart, params.schemaName, d);
  return `DROP TABLE IF EXISTS ${fullPart};`;
}

export interface BackgroundMaintenanceParams {
  tableName: string;
  schemaName?: string;
  operation: 'vacuum_analyze' | 'optimize';
  driver: string;
}

/**
 * Builds SQL to run VACUUM ANALYZE / OPTIMIZE TABLE in the background.
 */
export function buildBackgroundMaintenanceSql(params: BackgroundMaintenanceParams): string {
  const d = params.driver?.toLowerCase() || 'postgres';
  const cleanTable = params.tableName.trim();
  if (!cleanTable) return '';

  const fullTable = qualifyTable(cleanTable, params.schemaName, d);
  if (d === 'mysql' || params.operation === 'optimize') {
    if (d === 'mysql') {
      return `OPTIMIZE TABLE ${fullTable};`;
    }
  }
  if (d === 'sqlite') {
    return `ANALYZE ${fullTable};`;
  }
  return `VACUUM (ANALYZE) ${fullTable};`;
}

/**
 * Builds SQL to poll background maintenance progress (PostgreSQL / MySQL).
 */
export function buildMaintenanceProgressSql(driver: string): string {
  const d = driver?.toLowerCase() || 'postgres';
  if (d === 'mysql') {
    return `SELECT ID, COMMAND, TIME, STATE, INFO FROM information_schema.PROCESSLIST WHERE INFO LIKE '%OPTIMIZE%' ORDER BY TIME DESC LIMIT 5;`;
  }
  if (d === 'sqlite') {
    return `SELECT 'running' AS phase;`;
  }
  return `SELECT pid, phase, heap_blks_total, heap_blks_scanned, heap_blks_vacuumed FROM pg_stat_progress_vacuum LIMIT 5;`;
}
