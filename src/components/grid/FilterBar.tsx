import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, Filter, Play, ChevronDown, Search, Check, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ColumnMeta, FilterCondition, FilterOperator, TableFilterState } from '../../types/db';
import { buildSqlWhereClause, isNumericDataType, isSafeUnquotedNumber } from './filterUtils';

export interface FilterBarProps {
  columns: ColumnMeta[];
  filterState: TableFilterState;
  onChange: (newState: TableFilterState) => void;
  onApply: () => void;
  onClear: () => void;
  onClose?: () => void;
  theme?: import('../../types/theme').AppTheme;
  driver?: string;
}

const AVAILABLE_OPERATORS: FilterOperator[] = [
  '=',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
  'LIKE',
  'LIKE %%',
  'NOT LIKE',
  'IS NULL',
  'IS NOT NULL',
];

interface ColumnComboboxProps {
  columns: ColumnMeta[];
  value: string;
  onChange: (columnName: string) => void;
  searchPlaceholder: string;
  noMatchText: string;
}

const ColumnCombobox: React.FC<ColumnComboboxProps> = ({
  columns,
  value,
  onChange,
  searchPlaceholder,
  noMatchText,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 280,
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedCol = useMemo(
    () => columns.find((c) => c.name === value) || columns[0],
    [columns, value]
  );

  const filteredColumns = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return columns;
    return columns.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.data_type && c.data_type.toLowerCase().includes(q))
    );
  }, [columns, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const dropdownHeight = 290;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top =
        spaceBelow >= dropdownHeight || spaceBelow >= rect.top
          ? rect.bottom + 4
          : Math.max(8, rect.top - dropdownHeight - 4);
      const width = Math.max(rect.width, 280);
      const left = Math.min(rect.left, Math.max(8, window.innerWidth - width - 8));
      setPopoverPos({ top, left, width });
    }
    const timer = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isOpen]);

  const handleSelect = (colName: string) => {
    onChange(colName);
    setIsOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) =>
        filteredColumns.length > 0 ? Math.min(prev + 1, filteredColumns.length - 1) : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredColumns[activeIndex];
      if (target) {
        handleSelect(target.name);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setQuery('');
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        data-testid="filter-column-combobox"
        onClick={() => setIsOpen((prev) => !prev)}
        className="h-[34px] w-[250px] shrink-0 flex items-center justify-between gap-2 bg-grid text-text border border-line rounded px-2.5 text-[13px] hover:border-[var(--accent)] focus:outline-none focus:border-[var(--accent)] transition-colors"
      >
        <span className="truncate font-mono text-left">
          {selectedCol ? (
            <>
              <span className="font-medium">{selectedCol.name}</span>{' '}
              <span className="text-[11px] text-muted">({selectedCol.data_type})</span>
            </>
          ) : (
            <span className="text-muted">—</span>
          )}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0" />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            data-testid="filter-column-popover"
            style={{
              top: popoverPos.top,
              left: popoverPos.left,
              width: popoverPos.width,
            }}
            className="fixed z-[100] rounded-lg border border-line bg-panel text-text shadow-xl overflow-hidden"
          >
            <div className="p-2 border-b border-line bg-sidebar">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={searchPlaceholder}
                  data-testid="filter-column-search-input"
                  className="w-full h-[32px] pl-8 pr-2.5 rounded border border-line bg-grid text-text placeholder:text-muted text-[13px] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>
            <div
              role="listbox"
              className="max-h-60 overflow-y-auto py-1"
            >
              {filteredColumns.length === 0 ? (
                <div className="px-3 py-3 text-center text-xs text-muted">
                  {noMatchText}
                </div>
              ) : (
                filteredColumns.map((col, idx) => {
                  const isSelected = col.name === selectedCol?.name;
                  const isHighlighted = idx === activeIndex;
                  return (
                    <button
                      key={col.name}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => handleSelect(col.name)}
                      className={`w-full text-left px-3 py-1.5 flex items-center justify-between gap-2 text-[13px] transition-colors ${
                        isSelected
                          ? 'bg-[var(--sel)] text-text font-medium'
                          : isHighlighted
                          ? 'bg-[var(--row-alt)] text-text'
                          : 'text-text hover:bg-[var(--row-alt)]'
                      }`}
                    >
                      <span className="truncate font-mono">
                        {col.name}{' '}
                        <span className="text-[11px] text-muted">({col.data_type})</span>
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-accent shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export const FilterBar: React.FC<FilterBarProps> = ({
  columns,
  filterState,
  onChange,
  onApply,
  onClear,
  onClose,
  theme: _theme = 'dark',
  driver,
}) => {
  const { t } = useTranslation();
  const sqlPreview = useMemo(() => {
    const clause = buildSqlWhereClause(filterState.conditions, filterState.conjunction, driver);
    return clause ? `WHERE ${clause}` : '';
  }, [filterState.conditions, filterState.conjunction, driver]);

  const handleToggleEnabled = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...filterState,
      enabled: e.target.checked,
    });
  };

  const handleConjunctionChange = (conjunction: 'AND' | 'OR') => {
    onChange({
      ...filterState,
      conjunction,
      conditions: filterState.conditions.map((c) => ({ ...c, conjunction })),
    });
  };

  const handleConditionChange = (id: string, updates: Partial<FilterCondition>) => {
    const updated = filterState.conditions.map((c) => {
      if (c.id === id) {
        const defaultCol = columns[0]?.name || '';
        return { ...c, column: c.column || defaultCol, ...updates };
      }
      return c;
    });
    onChange({
      ...filterState,
      conditions: updated,
    });
  };

  const handleAddCondition = () => {
    const defaultColumn = columns[0]?.name || '';
    const newCond: FilterCondition = {
      id: crypto.randomUUID ? crypto.randomUUID() : `cond-${Date.now()}-${Math.random()}`,
      column: defaultColumn,
      operator: '=',
      value: '',
      enabled: true,
      conjunction: filterState.conjunction,
    };
    onChange({
      ...filterState,
      conditions: [...filterState.conditions, newCond],
    });
  };

  const handleRemoveCondition = (id: string) => {
    if (filterState.conditions.length <= 1) {
      // Clear values if removing last condition
      onChange({
        ...filterState,
        conditions: [
          {
            id: 'c-default',
            column: columns[0]?.name || '',
            operator: '=',
            value: '',
          },
        ],
      });
      return;
    }
    onChange({
      ...filterState,
      conditions: filterState.conditions.filter((c) => c.id !== id),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onApply();
    }
  };

  const inputCls = 'bg-grid text-text border-line placeholder:text-muted';
  const secondaryBtnCls = 'bg-panel hover:bg-black/5 dark:hover:bg-white/10 text-text border-line';
  const previewBadgeCls = 'text-accent bg-accent/10 border-accent/30';

  return (
    <div
      data-testid="filter-bar"
      className="border-t px-3 py-2 text-xs select-none transition-colors bg-panel border-line text-text"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center space-x-2">
          {/* Active Checkbox */}
          <label className="flex items-center space-x-1.5 cursor-pointer text-xs font-semibold">
            <input
              type="checkbox"
              aria-label="Toggle Filter Active"
              checked={filterState.enabled}
              onChange={handleToggleEnabled}
              className="rounded focus:ring-0 focus:ring-offset-0 border-line bg-grid text-accent"
            />
            <span className="flex items-center space-x-1 text-text">
              <Filter className="w-3.5 h-3.5 text-accent" />
              <span>{t('grid.filterLabel', 'Filter:')}</span>
            </span>
          </label>

          {/* Conjunction toggle (AND / OR) */}
          <div className="inline-flex rounded-md shadow-sm border p-0.5 text-[11px] border-line bg-sidebar">
            <button
              type="button"
              className={`px-2 py-0.5 rounded font-medium transition-colors ${
                filterState.conjunction === 'AND'
                  ? 'bg-accent text-white'
                  : 'text-muted hover:text-text'
              }`}
              onClick={() => handleConjunctionChange('AND')}
            >
              AND
            </button>
            <button
              type="button"
              className={`px-2 py-0.5 rounded font-medium transition-colors ${
                filterState.conjunction === 'OR'
                  ? 'bg-accent text-white'
                  : 'text-muted hover:text-text'
              }`}
              onClick={() => handleConjunctionChange('OR')}
            >
              OR
            </button>
          </div>
        </div>

        {/* Action Buttons: Apply, Clear, Close */}
        <div className="flex items-center space-x-1.5">
          {sqlPreview && (
            <span
              className={`text-[11px] font-mono max-w-sm truncate border px-2 py-0.5 rounded ${previewBadgeCls}`}
              title={sqlPreview}
            >
              {sqlPreview}
            </span>
          )}

          <button
            type="button"
            data-testid="apply-filter-btn"
            onClick={onApply}
            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium text-xs flex items-center space-x-1 shadow-sm transition-colors"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>{t('grid.apply', 'Apply')}</span>
          </button>

          <button
            type="button"
            data-testid="clear-filter-btn"
            onClick={onClear}
            className={`px-2 py-1 border rounded text-xs transition-colors ${secondaryBtnCls}`}
          >
            {t('grid.clear', 'Clear')}
          </button>

          {onClose && (
            <button
              type="button"
              data-testid="close-filter-bar-btn"
              onClick={onClose}
              title="Close Filter Bar"
              className="p-1 rounded transition-colors text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Conditions Rows */}
      <div className="space-y-2 max-h-56 overflow-y-auto overflow-x-auto pr-1">
        {filterState.conditions.map((cond, idx) => {
          const isNullOp = cond.operator === 'IS NULL' || cond.operator === 'IS NOT NULL';
          const isRowEnabled = cond.enabled !== false;
          const rowConj = cond.conjunction ?? filterState.conjunction;
          const colMeta = columns.find((c) => c.name === (cond.column || columns[0]?.name));
          const isComparisonOp = ['=', '!=', '>', '<', '>=', '<='].includes(cond.operator);
          const trimmedVal = cond.value?.trim() ?? '';
          const hasNumericMismatch =
            isRowEnabled &&
            isComparisonOp &&
            trimmedVal !== '' &&
            isNumericDataType(colMeta?.data_type) &&
            !isSafeUnquotedNumber(trimmedVal);

          return (
            <div
              key={cond.id || idx}
              className={`flex items-center gap-2 transition-opacity ${
                isRowEnabled ? '' : 'opacity-50'
              }`}
            >
              {/* Per-row AND/OR selector (row 2+) */}
              <div className="w-12 shrink-0 flex justify-end">
                {idx > 0 && (
                  <button
                    type="button"
                    data-testid={`row-conjunction-${cond.id || idx}`}
                    onClick={() =>
                      handleConditionChange(cond.id, {
                        conjunction: rowConj === 'AND' ? 'OR' : 'AND',
                      })
                    }
                    title={t(
                      'grid.toggleRowConjunction',
                      'Click to switch AND / OR for this condition'
                    )}
                    className={`w-11 h-[28px] rounded border text-[11px] font-semibold transition-colors ${
                      rowConj === 'OR'
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400'
                        : 'bg-sidebar border-line text-muted hover:text-text'
                    }`}
                  >
                    {rowConj}
                  </button>
                )}
              </div>

              {/* Per-row enable/disable toggle */}
              <input
                type="checkbox"
                aria-label={t('grid.toggleRowEnabled', 'Enable or disable this condition')}
                title={t('grid.toggleRowEnabled', 'Enable or disable this condition')}
                checked={isRowEnabled}
                onChange={(e) =>
                  handleConditionChange(cond.id, { enabled: e.target.checked })
                }
                className="shrink-0 rounded focus:ring-0 focus:ring-offset-0 border-line bg-grid text-accent cursor-pointer"
              />

              {/* Searchable Column selector (uniform width) */}
              <ColumnCombobox
                columns={columns}
                value={cond.column || columns[0]?.name || ''}
                onChange={(colName) => handleConditionChange(cond.id, { column: colName })}
                searchPlaceholder={t('grid.searchColumnsPlaceholder', 'Search columns...')}
                noMatchText={t('grid.noColumnsMatch', 'No matching columns')}
              />

              {/* Operator selector (uniform width) */}
              <select
                aria-label="Filter Operator"
                value={cond.operator}
                onChange={(e) =>
                  handleConditionChange(cond.id, { operator: e.target.value as FilterOperator })
                }
                className={`h-[34px] w-[116px] shrink-0 ${inputCls} border rounded px-2.5 text-[13px] focus:outline-none focus:border-[var(--accent)] font-mono`}
              >
                {AVAILABLE_OPERATORS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>

              {/* Value Input */}
              <div className="relative flex-1 min-w-[140px]">
                <input
                  type="text"
                  disabled={isNullOp}
                  placeholder={isNullOp ? '(no value needed)' : 'Enter filter value...'}
                  value={isNullOp ? '' : cond.value}
                  onChange={(e) => handleConditionChange(cond.id, { value: e.target.value })}
                  onKeyDown={handleKeyDown}
                  className={`w-full h-[34px] ${inputCls} border rounded px-2.5 ${
                    hasNumericMismatch ? 'pr-7 border-amber-500/70' : ''
                  } text-[13px] focus:outline-none focus:border-[var(--accent)] ${
                    isNullOp ? 'opacity-50 cursor-not-allowed italic' : ''
                  }`}
                />
                {hasNumericMismatch && (
                  <span
                    data-testid={`numeric-mismatch-warn-${cond.id || idx}`}
                    title={t(
                      'grid.numericMismatchHint',
                      'Numeric column expects a number for comparison operators.'
                    )}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-500"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>

              {/* Delete condition button */}
              <button
                type="button"
                onClick={() => handleRemoveCondition(cond.id)}
                title="Remove Condition"
                className="shrink-0 p-1.5 rounded transition-colors text-muted hover:text-red-500 hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add Condition Footer */}
      <div className="mt-1.5 pt-1 border-t border-line flex items-center">
        <button
          type="button"
          onClick={handleAddCondition}
          className="text-blue-400 hover:text-blue-300 text-[11px] font-medium flex items-center space-x-1 hover:underline"
        >
          <Plus className="w-3 h-3" />
          <span>{t('grid.addCondition', 'Add Condition')}</span>
        </button>
      </div>
    </div>
  );
};
