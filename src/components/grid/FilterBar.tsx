import React, { useMemo } from 'react';
import { Plus, X, Filter, Play } from 'lucide-react';
import type { ColumnMeta, FilterCondition, FilterOperator, TableFilterState } from '../../types/db';
import { buildSqlWhereClause } from './filterUtils';

export interface FilterBarProps {
  columns: ColumnMeta[];
  filterState: TableFilterState;
  onChange: (newState: TableFilterState) => void;
  onApply: () => void;
  onClear: () => void;
  onClose?: () => void;
  theme?: 'dark' | 'light';
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
  'NOT LIKE',
  'IS NULL',
  'IS NOT NULL',
];

export const FilterBar: React.FC<FilterBarProps> = ({
  columns,
  filterState,
  onChange,
  onApply,
  onClear,
  onClose,
  theme = 'dark',
  driver,
}) => {
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

  const isDark = theme === 'dark';

  return (
    <div
      data-testid="filter-bar"
      className={`border-t px-3 py-2 text-xs select-none transition-colors ${
        isDark
          ? 'bg-gray-900/95 border-gray-800 text-gray-200'
          : 'bg-gray-50 border-gray-200 text-gray-800'
      }`}
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
              className="rounded border-gray-700 bg-gray-800 text-blue-500 focus:ring-0 focus:ring-offset-0"
            />
            <span className="flex items-center space-x-1 text-gray-300">
              <Filter className="w-3.5 h-3.5 text-blue-400" />
              <span>Filter:</span>
            </span>
          </label>

          {/* Conjunction toggle (AND / OR) */}
          <div className="inline-flex rounded-md shadow-sm border border-gray-700 bg-gray-800 p-0.5 text-[11px]">
            <button
              type="button"
              className={`px-2 py-0.5 rounded font-medium transition-colors ${
                filterState.conjunction === 'AND'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
              onClick={() => handleConjunctionChange('AND')}
            >
              AND
            </button>
            <button
              type="button"
              className={`px-2 py-0.5 rounded font-medium transition-colors ${
                filterState.conjunction === 'OR'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
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
              className="text-[11px] font-mono text-blue-300 max-w-sm truncate bg-blue-950/40 border border-blue-900/50 px-2 py-0.5 rounded"
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
            <span>Apply</span>
          </button>

          <button
            type="button"
            data-testid="clear-filter-btn"
            onClick={onClear}
            className="px-2 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white rounded text-xs transition-colors"
          >
            Clear
          </button>

          {onClose && (
            <button
              type="button"
              data-testid="close-filter-bar-btn"
              onClick={onClose}
              title="Close Filter Bar"
              className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Conditions Rows */}
      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
        {filterState.conditions.map((cond, idx) => {
          const isNullOp = cond.operator === 'IS NULL' || cond.operator === 'IS NOT NULL';

          return (
            <div key={cond.id || idx} className="flex items-center space-x-2">
              <span className="text-[11px] text-gray-500 w-4 text-right">
                {idx === 0 ? '' : filterState.conjunction}
              </span>

              {/* Column selector */}
              <select
                value={cond.column || columns[0]?.name || ''}
                onChange={(e) => handleConditionChange(cond.id, { column: e.target.value })}
                className="bg-gray-800 text-gray-200 border border-gray-700 rounded px-2 py-0.5 text-xs focus:outline-none focus:border-blue-500"
              >
                {columns.map((col) => (
                  <option key={col.name} value={col.name}>
                    {col.name} ({col.data_type})
                  </option>
                ))}
              </select>

              {/* Operator selector */}
              <select
                value={cond.operator}
                onChange={(e) =>
                  handleConditionChange(cond.id, { operator: e.target.value as FilterOperator })
                }
                className="bg-gray-800 text-gray-200 border border-gray-700 rounded px-2 py-0.5 text-xs focus:outline-none focus:border-blue-500 font-mono"
              >
                {AVAILABLE_OPERATORS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>

              {/* Value Input */}
              <input
                type="text"
                disabled={isNullOp}
                placeholder={isNullOp ? '(no value needed)' : 'Enter filter value...'}
                value={isNullOp ? '' : cond.value}
                onChange={(e) => handleConditionChange(cond.id, { value: e.target.value })}
                onKeyDown={handleKeyDown}
                className={`flex-1 bg-gray-800 text-gray-200 border border-gray-700 rounded px-2 py-0.5 text-xs focus:outline-none focus:border-blue-500 ${
                  isNullOp ? 'opacity-50 cursor-not-allowed italic' : ''
                }`}
              />

              {/* Delete condition button */}
              <button
                type="button"
                onClick={() => handleRemoveCondition(cond.id)}
                title="Remove Condition"
                className="p-1 text-gray-500 hover:text-red-400 rounded hover:bg-gray-800 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add Condition Footer */}
      <div className="mt-1.5 pt-1 border-t border-gray-800/60 flex items-center">
        <button
          type="button"
          onClick={handleAddCondition}
          className="text-blue-400 hover:text-blue-300 text-[11px] font-medium flex items-center space-x-1 hover:underline"
        >
          <Plus className="w-3 h-3" />
          <span>Add Condition</span>
        </button>
      </div>
    </div>
  );
};
