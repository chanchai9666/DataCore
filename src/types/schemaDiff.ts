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

export interface SkippedItem {
  tableName: string;
  itemType: 'primary_key' | 'foreign_key' | 'index' | 'column_type' | 'nullability';
  description: string;
  reason: string;
}

export interface IndexDiff {
  name: string;
  tableName: string;
  columns: string[];
  isUnique: boolean;
  status: 'added' | 'removed' | 'identical';
  canApplyToTarget: boolean;
  skipReason?: string;
}

export interface ForeignKeyDiff {
  name: string;
  tableName: string;
  columnNames: string[];
  foreignTableName: string;
  foreignColumnNames: string[];
  status: 'added' | 'removed' | 'identical';
  canApplyToTarget: boolean;
  skipReason?: string;
}

export interface PrimaryKeyDiff {
  tableName: string;
  sourceColumns: string[];
  targetColumns: string[];
  status: 'identical' | 'mismatch' | 'added' | 'removed';
  canApplyToTarget: boolean;
  skipReason?: string;
}

export interface TableDiff {
  tableName: string;
  status: TableDiffStatus;
  columnDiffs: ColumnDiff[];
  indexDiffs?: IndexDiff[];
  foreignKeyDiffs?: ForeignKeyDiff[];
  primaryKeyDiff?: PrimaryKeyDiff;
  skippedItems?: SkippedItem[];
}

export interface SchemaTableMetadata {
  tableName: string;
  columns: {
    name: string;
    dataType: string;
    isNullable: boolean;
    isPrimaryKey: boolean;
  }[];
  indexes?: {
    name: string;
    columns: string[];
    isUnique: boolean;
    isPrimary?: boolean;
  }[];
  foreignKeys?: {
    name: string;
    columnNames: string[];
    foreignTableName: string;
    foreignColumnNames: string[];
  }[];
}

export interface SchemaDiffTarget {
  connectionId: string;
  schemaName?: string;
  driver?: string;
  tables: ERTable[];
  metadata?: SchemaTableMetadata[];
}

export interface SchemaDiffSummary {
  identicalCount: number;
  differentCount: number;
  onlyInSourceCount: number;
  onlyInTargetCount: number;
  skippedCount?: number;
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
  executableStatementCount?: number;
  skippedItems?: SkippedItem[];
}
