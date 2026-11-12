import type { ERTable } from './db';

export type TableDiffStatus = 'identical' | 'different' | 'only_in_source' | 'only_in_target';

export type ColumnDiffStatus =
  | 'identical'
  | 'added'
  | 'removed'
  | 'type_mismatch'
  | 'nullability_mismatch';

export interface ColumnDiff {
  name: string;
  status: ColumnDiffStatus;
  sourceType?: string;
  targetType?: string;
  sourceNullable?: boolean;
  targetNullable?: boolean;
  sourcePk?: boolean;
  targetPk?: boolean;
}

export interface TableDiff {
  tableName: string;
  status: TableDiffStatus;
  columnDiffs: ColumnDiff[];
  indexDiffs?: string[];
  foreignKeyDiffs?: string[];
}

export interface SchemaDiffTarget {
  connectionId: string;
  schemaName?: string;
  driver?: string;
  tables: ERTable[];
}

export interface SchemaDiffSummary {
  identicalCount: number;
  differentCount: number;
  onlyInSourceCount: number;
  onlyInTargetCount: number;
}

export interface SchemaDiffResult {
  source: { connectionId: string; schemaName?: string; driver?: string };
  target: { connectionId: string; schemaName?: string; driver?: string };
  tables: TableDiff[];
  summary: SchemaDiffSummary;
}

export interface MigrationScript {
  up: string;
  down: string;
}
