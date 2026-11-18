import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Search, Key, Link2, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CellValue, ColumnMeta } from '../../types/db';
import type { TableForeignKeyStructure } from '../structure/tableManagementHelpers';
import { extractCellValue } from './gridUtils';

export interface RecordFormViewProps {
  columns: ColumnMeta[];
  rows: CellValue[][];
  selectedRowIndex: number;
  onSelectRowIndex: (index: number) => void;
  isReadOnly?: boolean;
  isMasked?: boolean;
  foreignKeys?: TableForeignKeyStructure[];
  stagedValues?: Record<string, unknown>;
  onEditField?: (rowIndex: number, colIndex: number, newValue: unknown) => void;
  onNavigateToRecord?: (foreignTable: string, foreignColumn: string, value: unknown) => void;
}

export const RecordFormView: React.FC<RecordFormViewProps> = ({
  columns,
  rows,
  selectedRowIndex,
  onSelectRowIndex,
  isReadOnly = false,
  foreignKeys = [],
  stagedValues = {},
  onEditField,
  onNavigateToRecord,
}) => {
  const { t } = useTranslation();
  const [columnFilter, setColumnFilter] = useState('');

  const safeRowIndex = rows.length > 0 ? Math.min(Math.max(0, selectedRowIndex), rows.length - 1) : 0;
  const currentRow = rows[safeRowIndex];

  const fkByColumn = useMemo(() => {
    const map = new Map<string, { table: string; column: string }>();
    for (const fk of foreignKeys) {
      fk.columnNames.forEach((colName, idx) => {
        map.set(colName, {
          table: fk.foreignTableName,
          column: fk.foreignColumnNames[idx] || fk.foreignColumnNames[0] || 'id',
        });
      });
    }
    return map;
  }, [foreignKeys]);

  const filteredColumns = useMemo(() => {
    const q = columnFilter.trim().toLowerCase();
    return columns
      .map((col, idx) => ({ col, colIndex: idx }))
      .filter(({ col }) => !q || col.name.toLowerCase().includes(q) || col.data_type.toLowerCase().includes(q));
  }, [columns, columnFilter]);

  if (!currentRow || rows.length === 0) {
    return (
      <div
        data-testid="record-form-empty"
        className="flex items-center justify-center h-full bg-grid text-muted text-sm"
      >
        {t('grid.noRecords', 'No records to display')}
      </div>
    );
  }

  return (
    <div
      data-testid="record-form-view"
      className="flex flex-col h-full bg-grid text-text overflow-hidden"
    >
      {/* Top Record Navigation & Column Filter */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-line bg-panel flex-shrink-0 gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="form-prev-record-btn"
            onClick={() => onSelectRowIndex(Math.max(0, safeRowIndex - 1))}
            disabled={safeRowIndex <= 0}
            aria-label={t('grid.prevRecord', 'Previous Record')}
            className="p-1 rounded border border-line bg-sidebar hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <span
            data-testid="form-record-indicator"
            className="text-xs font-mono font-medium text-text px-1"
          >
            {t('grid.recordOfTotal', {
              current: safeRowIndex + 1,
              total: rows.length,
              defaultValue: `Record ${safeRowIndex + 1} of ${rows.length}`,
            })}
          </span>
          <button
            type="button"
            data-testid="form-next-record-btn"
            onClick={() => onSelectRowIndex(Math.min(rows.length - 1, safeRowIndex + 1))}
            disabled={safeRowIndex >= rows.length - 1}
            aria-label={t('grid.nextRecord', 'Next Record')}
            className="p-1 rounded border border-line bg-sidebar hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        <div className="relative w-56">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            data-testid="form-column-filter"
            value={columnFilter}
            onChange={(e) => setColumnFilter(e.target.value)}
            placeholder={t('grid.filterColumns', 'Filter columns...')}
            className="w-full h-7 pl-7 pr-2.5 text-xs bg-sidebar border border-line rounded text-text placeholder:text-muted focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Vertical Form Fields */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto space-y-2.5">
          {filteredColumns.map(({ col, colIndex }) => {
            const stageKey = `${safeRowIndex}:${colIndex}`;
            const hasStaged = Object.prototype.hasOwnProperty.call(stagedValues, stageKey);
            const rawCell = currentRow[colIndex];
            const extracted = extractCellValue(rawCell);
            const effectiveValue = hasStaged ? stagedValues[stageKey] : extracted.rawValue;
            const isNull = effectiveValue === null || effectiveValue === undefined;
            const displayStr = isNull
              ? ''
              : typeof effectiveValue === 'object'
              ? JSON.stringify(effectiveValue)
              : String(effectiveValue);

            const fk = fkByColumn.get(col.name);

            return (
              <div
                key={col.name}
                data-testid={`form-field-row-${col.name}`}
                className={`grid grid-cols-12 gap-3 items-center p-2.5 rounded-lg border transition-colors ${
                  hasStaged
                    ? 'border-amber-500/50 bg-amber-500/5'
                    : 'border-line bg-panel'
                }`}
              >
                {/* Label & Badges */}
                <div className="col-span-4 flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-text truncate font-mono">
                      {col.name}
                    </span>
                    {col.is_primary_key && (
                      <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-500 border border-amber-500/30">
                        <Key size={9} />
                        {t('grid.pkBadge', 'PK')}
                      </span>
                    )}
                    {fk && (
                      <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-500 border border-blue-500/30">
                        <Link2 size={9} />
                        {t('grid.fkBadge', 'FK')}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted font-mono truncate">
                    {col.data_type}
                  </span>
                </div>

                {/* Value Editor */}
                <div className="col-span-8 flex items-center gap-1.5">
                  <input
                    type="text"
                    data-testid={`form-input-${col.name}`}
                    value={displayStr}
                    readOnly={isReadOnly || !onEditField}
                    placeholder={isNull ? 'NULL' : ''}
                    onChange={(e) => onEditField?.(safeRowIndex, colIndex, e.target.value)}
                    className={`flex-1 h-8 px-2.5 text-xs font-mono rounded border bg-grid text-text focus:outline-none focus:border-accent ${
                      isNull ? 'italic text-muted border-line' : 'border-line'
                    } ${isReadOnly ? 'opacity-75 cursor-default' : ''}`}
                  />
                  {!isReadOnly && onEditField && !isNull && (
                    <button
                      type="button"
                      data-testid={`form-null-btn-${col.name}`}
                      onClick={() => onEditField(safeRowIndex, colIndex, null)}
                      title={t('grid.setNull', 'Set NULL')}
                      className="px-2 h-8 text-[10px] font-mono rounded border border-line bg-sidebar text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0"
                    >
                      NULL
                    </button>
                  )}
                  {fk && onNavigateToRecord && !isNull && (
                    <button
                      type="button"
                      data-testid={`form-fk-jump-${col.name}`}
                      onClick={() => onNavigateToRecord(fk.table, fk.column, effectiveValue)}
                      title={`${fk.table}.${fk.column}`}
                      className="p-1.5 h-8 rounded border border-line bg-sidebar text-blue-500 hover:bg-blue-500/10 transition-colors shrink-0"
                    >
                      <ExternalLink size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
