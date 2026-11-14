import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Wand2,
  Play,
  Copy,
  Check,
  FileCode,
  Plus,
  Trash2,
  Table as TableIcon,
  Filter as FilterIcon,
  ArrowUpDown,
  Link2,
  RefreshCw,
  Loader2,
  AlertCircle,
  Database,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  buildSelectQuery,
  type SelectQueryConfig,
  type SelectedColumn,
  type QueryJoin,
  type QueryFilter,
  type QueryOrderBy,
  type QueryJoinType,
  type QueryFilterOperator,
} from '../../api/queryBuilder';
import { fetchERDiagramData } from '../../api/erDiagramApi';
import { dbApi } from '../../api/db';
import { openQueryTab } from '../sidebar/tabHelpers';
import { DataGrid } from '../grid/DataGrid';
import type { Tab, QueryResult, ERTable } from '../../types/db';

export interface VisualQueryBuilderTabProps {
  tab: Tab;
  connectionId: string;
  driver?: string;
  schemaName?: string;
  tableName?: string;
  theme?: 'dark' | 'light';
}

interface ColumnSelectionState {
  id: string;
  table: string;
  column: string;
  alias: string;
  selected: boolean;
  aggregate?: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX' | '';
  distinct?: boolean;
}

export const VisualQueryBuilderTab: React.FC<VisualQueryBuilderTabProps> = ({
  tab,
  connectionId,
  driver = 'sqlite',
  schemaName,
  tableName: initialTableName,
  theme = 'dark',
}) => {
  // Schema introspection state
  const [tables, setTables] = useState<ERTable[]>([]);
  const [isLoadingSchema, setIsLoadingSchema] = useState<boolean>(true);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  // Query configuration state
  const [baseTable, setBaseTable] = useState<string>(initialTableName || tab.tableName || '');
  const [baseTableAlias, setBaseTableAlias] = useState<string>('');
  const [distinct, setDistinct] = useState<boolean>(false);
  const [columns, setColumns] = useState<ColumnSelectionState[]>([]);
  const [joins, setJoins] = useState<QueryJoin[]>([]);
  const [filters, setFilters] = useState<QueryFilter[]>([]);
  const [filterConjunction, setFilterConjunction] = useState<'AND' | 'OR'>('AND');
  const [orderBy, setOrderBy] = useState<QueryOrderBy[]>([]);
  const [limit, setLimit] = useState<number>(100);
  const [offset, setOffset] = useState<number>(0);

  // Execution & UI state
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Load schema tables and columns
  const loadSchema = useCallback(async () => {
    setIsLoadingSchema(true);
    setSchemaError(null);
    try {
      const diagram = await fetchERDiagramData(connectionId, driver, schemaName);
      setTables(diagram.tables);

      // If no baseTable chosen yet, default to initial or first available table
      if (!baseTable && diagram.tables.length > 0) {
        setBaseTable(diagram.tables[0].name);
      }
    } catch (err: any) {
      console.error('Failed to introspect schema for Query Builder:', err);
      setSchemaError(err?.message || 'Failed to introspect database schema.');
    } finally {
      setIsLoadingSchema(false);
    }
  }, [connectionId, driver, schemaName, baseTable]);

  useEffect(() => {
    loadSchema();
  }, [loadSchema]);

  // Synchronize available columns when base table or joins change
  useEffect(() => {
    if (!baseTable) {
      setColumns([]);
      return;
    }

    setColumns((prevCols) => {
      const prevMap = new Map<string, ColumnSelectionState>();
      for (const col of prevCols) {
        prevMap.set(`${col.table}.${col.column}`, col);
      }

      const nextCols: ColumnSelectionState[] = [];

      // Add base table columns
      const baseTbl = tables.find((t) => t.name === baseTable);
      if (baseTbl) {
        const tableLabel = baseTableAlias.trim() || baseTable;
        for (const c of baseTbl.columns) {
          const key = `${tableLabel}.${c.name}`;
          const existing = prevMap.get(key) || prevMap.get(`${baseTable}.${c.name}`);
          nextCols.push({
            id: key,
            table: tableLabel,
            column: c.name,
            alias: existing?.alias || '',
            selected: existing ? existing.selected : true, // default selected on initial load
            aggregate: existing?.aggregate || '',
            distinct: existing?.distinct || false,
          });
        }
      }

      // Add columns for joined tables
      for (const join of joins) {
        const joinTbl = tables.find((t) => t.name === join.table);
        if (joinTbl) {
          const tableLabel = join.alias?.trim() || join.table;
          for (const c of joinTbl.columns) {
            const key = `${tableLabel}.${c.name}`;
            const existing = prevMap.get(key) || prevMap.get(`${join.table}.${c.name}`);
            nextCols.push({
              id: key,
              table: tableLabel,
              column: c.name,
              alias: existing?.alias || '',
              selected: existing ? existing.selected : false,
              aggregate: existing?.aggregate || '',
              distinct: existing?.distinct || false,
            });
          }
        }
      }

      return nextCols;
    });
  }, [baseTable, baseTableAlias, joins, tables]);

  // Compute live SQL preview
  const liveSql = useMemo(() => {
    if (!baseTable) return '';

    const selectedCols: SelectedColumn[] = columns
      .filter((c) => c.selected)
      .map((c) => ({
        table: c.table,
        column: c.column,
        alias: c.alias.trim() || undefined,
        aggregate: c.aggregate || undefined,
        distinct: c.distinct,
      }));

    const config: SelectQueryConfig = {
      driver,
      baseTable,
      baseTableAlias: baseTableAlias.trim() || undefined,
      schemaName,
      distinct,
      columns: selectedCols,
      joins: joins.filter((j) => j.table && j.leftColumn && j.rightColumn),
      filters: filters.filter((f) => f.column && f.column.trim().length > 0),
      filterConjunction,
      orderBy: orderBy.filter((o) => o.column && o.column.trim().length > 0),
      limit: limit >= 0 ? limit : undefined,
      offset: offset > 0 ? offset : undefined,
    };

    return buildSelectQuery(config);
  }, [
    baseTable,
    baseTableAlias,
    schemaName,
    driver,
    distinct,
    columns,
    joins,
    filters,
    filterConjunction,
    orderBy,
    limit,
    offset,
  ]);

  // Column selection helpers
  const handleToggleColumn = (id: string) => {
    setColumns((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c))
    );
  };

  const handleSelectAllColumns = () => {
    setColumns((prev) => prev.map((c) => ({ ...c, selected: true })));
  };

  const handleDeselectAllColumns = () => {
    setColumns((prev) => prev.map((c) => ({ ...c, selected: false })));
  };

  const handleColumnAliasChange = (id: string, alias: string) => {
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, alias } : c)));
  };

  const handleColumnAggregateChange = (
    id: string,
    aggregate: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX' | ''
  ) => {
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, aggregate } : c)));
  };

  // Joins helpers
  const handleAddJoin = () => {
    if (tables.length === 0) return;
    const remainingTables = tables.filter((t) => t.name !== baseTable);
    const targetTable = remainingTables[0]?.name || tables[0].name;
    const baseTblObj = tables.find((t) => t.name === baseTable);
    const targetTblObj = tables.find((t) => t.name === targetTable);

    // Try finding matching id / foreign key or default to first columns
    const leftCol = baseTblObj?.columns.find((c) => c.name === 'id')?.name || baseTblObj?.columns[0]?.name || 'id';
    const rightCol =
      targetTblObj?.columns.find(
        (c) => c.name === `${baseTable}_id` || c.name === 'user_id' || c.name === 'id'
      )?.name ||
      targetTblObj?.columns[0]?.name ||
      'id';

    const newJoin: QueryJoin = {
      id: `join-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'INNER',
      table: targetTable,
      leftTable: baseTableAlias.trim() || baseTable,
      leftColumn: leftCol,
      rightTable: targetTable,
      rightColumn: rightCol,
    };
    setJoins((prev) => [...prev, newJoin]);
  };

  const handleUpdateJoin = (index: number, updates: Partial<QueryJoin>) => {
    setJoins((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const handleRemoveJoin = (index: number) => {
    setJoins((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Filter helpers
  const handleAddFilter = () => {
    const firstCol = columns[0]?.column || 'id';
    const firstTable = columns[0]?.table || baseTable;
    const newFilter: QueryFilter = {
      id: `filter-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      table: joins.length > 0 ? firstTable : undefined,
      column: firstCol,
      operator: 'equals',
      value: '',
    };
    setFilters((prev) => [...prev, newFilter]);
  };

  const handleUpdateFilter = (index: number, updates: Partial<QueryFilter>) => {
    setFilters((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const handleRemoveFilter = (index: number) => {
    setFilters((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Order By helpers
  const handleAddOrderBy = () => {
    const firstCol = columns[0]?.column || 'id';
    const firstTable = columns[0]?.table || baseTable;
    const newOrder: QueryOrderBy = {
      id: `sort-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      table: joins.length > 0 ? firstTable : undefined,
      column: firstCol,
      direction: 'ASC',
    };
    setOrderBy((prev) => [...prev, newOrder]);
  };

  const handleUpdateOrderBy = (index: number, updates: Partial<QueryOrderBy>) => {
    setOrderBy((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const handleRemoveOrderBy = (index: number) => {
    setOrderBy((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Copy SQL
  const handleCopySql = () => {
    if (!liveSql) return;
    navigator.clipboard.writeText(liveSql);
    setCopied(true);
    toast.success('SQL copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  // Open in SQL Editor
  const handleOpenInSqlEditor = () => {
    if (!liveSql) return;
    openQueryTab({
      connectionId,
      tableName: baseTable,
      schemaName,
      driver,
      initialQuery: `${liveSql}\n`,
    });
    toast.success('Opened in SQL Editor');
  };

  // Execute Query Now
  const handleRunQuery = async () => {
    if (!liveSql || isExecuting) return;
    setIsExecuting(true);
    setExecutionError(null);

    try {
      await dbApi.openSession(connectionId, tab.id).catch(() => {});
      const result = await dbApi.executeQuery(tab.id, liveSql);
      setQueryResult(result);
      toast.success(`Query executed: ${result.rows.length} rows returned`);
    } catch (err: any) {
      console.error('Visual query execution error:', err);
      const msg = err?.message || 'Error executing query';
      setExecutionError(msg);
      toast.error(msg);
    } finally {
      setIsExecuting(false);
    }
  };

  // Available column names for dropdowns
  const availableColumns = useMemo(() => {
    return columns.map((c) => ({
      key: `${c.table}.${c.column}`,
      table: c.table,
      column: c.column,
      label: joins.length > 0 ? `${c.table}.${c.column}` : c.column,
    }));
  }, [columns, joins.length]);

  return (
    <div
      data-testid="visual-query-builder-tab"
      className={`flex-1 flex flex-col min-h-0 h-full overflow-hidden ${
        theme === 'dark' ? 'bg-[#181825] text-gray-200' : 'bg-white text-gray-800'
      }`}
    >
      {/* Top Header / Bar */}
      <div
        className={`flex items-center justify-between px-4 py-2 border-b flex-shrink-0 ${
          theme === 'dark' ? 'bg-[#1e1e2e] border-gray-800' : 'bg-gray-50 border-gray-200'
        }`}
      >
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 font-semibold text-sm">
            <Wand2 className="w-4 h-4 text-amber-400" />
            <span>Visual Query Builder</span>
          </div>

          <div className="h-4 w-px bg-gray-600/30" />

          {/* Base Table Selector */}
          <div className="flex items-center space-x-2 text-xs">
            <span className="font-medium text-gray-400">Base Table:</span>
            {isLoadingSchema ? (
              <div className="flex items-center space-x-1 text-gray-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Loading tables...</span>
              </div>
            ) : (
              <select
                data-testid="qb-base-table-select"
                aria-label="Base Table"
                value={baseTable}
                onChange={(e) => {
                  setBaseTable(e.target.value);
                  setBaseTableAlias('');
                  setJoins([]);
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded border outline-none ${
                  theme === 'dark'
                    ? 'bg-[#11111b] border-gray-700 text-gray-100 focus:border-amber-500'
                    : 'bg-white border-gray-300 text-gray-800 focus:border-amber-500'
                }`}
              >
                {tables.length === 0 ? (
                  <option value="">No tables available</option>
                ) : (
                  tables.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))
                )}
              </select>
            )}

            <input
              type="text"
              data-testid="qb-base-table-alias"
              aria-label="Table Alias"
              placeholder="Alias (e.g. u)"
              value={baseTableAlias}
              onChange={(e) => setBaseTableAlias(e.target.value)}
              className={`w-24 px-2 py-1 text-xs rounded border outline-none ${
                theme === 'dark'
                  ? 'bg-[#11111b] border-gray-700 text-gray-200 placeholder-gray-500'
                  : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'
              }`}
            />

            <label className="flex items-center space-x-1.5 cursor-pointer ml-2">
              <input
                type="checkbox"
                data-testid="qb-distinct-checkbox"
                checked={distinct}
                onChange={(e) => setDistinct(e.target.checked)}
                className="rounded border-gray-600 text-amber-500 focus:ring-0"
              />
              <span className="text-xs font-mono font-medium">DISTINCT</span>
            </label>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            data-testid="qb-refresh-schema-btn"
            onClick={loadSchema}
            disabled={isLoadingSchema}
            title="Refresh database schema"
            className={`p-1.5 rounded transition-colors text-xs ${
              theme === 'dark' ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-200 text-gray-600'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSchema ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            data-testid="qb-copy-sql-btn"
            onClick={handleCopySql}
            disabled={!liveSql}
            className={`inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-medium rounded border transition-colors ${
              theme === 'dark'
                ? 'bg-gray-800/80 hover:bg-gray-700 border-gray-700 text-gray-200'
                : 'bg-gray-100 hover:bg-gray-200 border-gray-300 text-gray-700'
            }`}
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy SQL'}</span>
          </button>

          <button
            type="button"
            data-testid="qb-open-editor-btn"
            onClick={handleOpenInSqlEditor}
            disabled={!liveSql}
            className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-medium rounded border border-blue-500/50 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-colors"
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Open in SQL Editor</span>
          </button>

          <button
            type="button"
            data-testid="qb-run-query-btn"
            onClick={handleRunQuery}
            disabled={!liveSql || isExecuting}
            className="inline-flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold rounded bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors disabled:opacity-50"
          >
            {isExecuting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{isExecuting ? 'Running...' : 'Run Query'}</span>
          </button>
        </div>
      </div>

      {schemaError && (
        <div className="bg-red-900/30 border-b border-red-700/50 px-4 py-2 flex items-center space-x-2 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{schemaError}</span>
        </div>
      )}

      {/* Main Split Layout: Left is Visual Builder, Right is SQL Preview & Results */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Pane: Builder Controls */}
        <div
          className={`w-7/12 flex flex-col min-h-0 border-r overflow-y-auto ${
            theme === 'dark' ? 'border-gray-800 bg-[#161622]' : 'border-gray-200 bg-gray-50/50'
          }`}
        >
          <div className="p-4 space-x-0 space-y-5">
            {/* 1. Columns Selection */}
            <div
              className={`rounded-lg border p-3.5 shadow-sm ${
                theme === 'dark' ? 'bg-[#1e1e2e] border-gray-800' : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-700/30">
                <div className="flex items-center space-x-2">
                  <TableIcon className="w-4 h-4 text-blue-400" />
                  <span className="font-semibold text-xs uppercase tracking-wider">Columns</span>
                  <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-blue-500/20 text-blue-400">
                    {columns.filter((c) => c.selected).length} / {columns.length} selected
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-xs">
                  <button
                    type="button"
                    data-testid="qb-select-all-columns-btn"
                    onClick={handleSelectAllColumns}
                    className="hover:text-blue-400 transition-colors"
                  >
                    Select All
                  </button>
                  <span className="text-gray-500">•</span>
                  <button
                    type="button"
                    data-testid="qb-deselect-all-columns-btn"
                    onClick={handleDeselectAllColumns}
                    className="hover:text-blue-400 transition-colors"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {columns.length === 0 ? (
                <p className="text-xs text-gray-500 py-3 text-center">
                  Select a Base Table above to choose columns.
                </p>
              ) : (
                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                  {columns.map((col) => (
                    <div
                      key={col.id}
                      className={`flex items-center justify-between p-1.5 rounded text-xs transition-colors ${
                        col.selected
                          ? theme === 'dark'
                            ? 'bg-blue-950/20 border border-blue-900/30'
                            : 'bg-blue-50/50 border border-blue-100'
                          : theme === 'dark'
                          ? 'hover:bg-gray-800/40'
                          : 'hover:bg-gray-100'
                      }`}
                    >
                      <label className="flex items-center space-x-2 cursor-pointer flex-1 min-w-0">
                        <input
                          type="checkbox"
                          data-testid={`qb-col-checkbox-${col.column}`}
                          checked={col.selected}
                          onChange={() => handleToggleColumn(col.id)}
                          className="rounded border-gray-600 text-blue-500 focus:ring-0"
                        />
                        <span className="font-medium truncate font-mono">{col.column}</span>
                        {joins.length > 0 && (
                          <span className="text-[10px] text-gray-500 font-mono truncate">
                            ({col.table})
                          </span>
                        )}
                      </label>

                      {col.selected && (
                        <div className="flex items-center space-x-2">
                          <select
                            data-testid={`qb-col-aggregate-${col.column}`}
                            aria-label={`Aggregate for ${col.column}`}
                            value={col.aggregate || ''}
                            onChange={(e) =>
                              handleColumnAggregateChange(
                                col.id,
                                e.target.value as any
                              )
                            }
                            className={`px-1.5 py-0.5 text-[11px] rounded border outline-none font-mono ${
                              theme === 'dark'
                                ? 'bg-[#11111b] border-gray-700 text-gray-200'
                                : 'bg-white border-gray-300 text-gray-700'
                            }`}
                          >
                            <option value="">No Agg</option>
                            <option value="COUNT">COUNT</option>
                            <option value="SUM">SUM</option>
                            <option value="AVG">AVG</option>
                            <option value="MIN">MIN</option>
                            <option value="MAX">MAX</option>
                          </select>

                          <input
                            type="text"
                            data-testid={`qb-col-alias-${col.column}`}
                            aria-label={`Alias for ${col.column}`}
                            placeholder="Alias"
                            value={col.alias}
                            onChange={(e) => handleColumnAliasChange(col.id, e.target.value)}
                            className={`w-24 px-1.5 py-0.5 text-[11px] font-mono rounded border outline-none ${
                              theme === 'dark'
                                ? 'bg-[#11111b] border-gray-700 text-gray-200 placeholder-gray-600'
                                : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'
                            }`}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2. JOINs Section */}
            <div
              className={`rounded-lg border p-3.5 shadow-sm ${
                theme === 'dark' ? 'bg-[#1e1e2e] border-gray-800' : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-700/30">
                <div className="flex items-center space-x-2">
                  <Link2 className="w-4 h-4 text-purple-400" />
                  <span className="font-semibold text-xs uppercase tracking-wider">
                    JOIN Tables ({joins.length})
                  </span>
                </div>
                <button
                  type="button"
                  data-testid="qb-add-join-btn"
                  onClick={handleAddJoin}
                  className="inline-flex items-center space-x-1 px-2 py-0.5 text-xs rounded bg-purple-600 hover:bg-purple-500 text-white transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add JOIN</span>
                </button>
              </div>

              {joins.length === 0 ? (
                <p className="text-xs text-gray-500 py-2 text-center">
                  No tables joined. Click &quot;Add JOIN&quot; to link related tables.
                </p>
              ) : (
                <div className="space-y-2">
                  {joins.map((join, idx) => {
                    const leftTableColumns =
                      tables.find((t) => t.name === baseTable)?.columns || [];
                    const rightTableColumns =
                      tables.find((t) => t.name === join.table)?.columns || [];

                    return (
                      <div
                        key={join.id}
                        className={`p-2.5 rounded border flex flex-col space-y-2 text-xs ${
                          theme === 'dark'
                            ? 'bg-[#161622] border-gray-700/60'
                            : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <select
                              data-testid={`qb-join-type-${idx}`}
                              aria-label={`Join Type ${idx}`}
                              value={join.type}
                              onChange={(e) =>
                                handleUpdateJoin(idx, {
                                  type: e.target.value as QueryJoinType,
                                })
                              }
                              className={`px-2 py-1 font-mono font-semibold rounded border outline-none ${
                                theme === 'dark'
                                  ? 'bg-[#11111b] border-gray-700 text-purple-400'
                                  : 'bg-white border-gray-300 text-purple-600'
                              }`}
                            >
                              <option value="INNER">INNER JOIN</option>
                              <option value="LEFT">LEFT JOIN</option>
                              <option value="RIGHT">RIGHT JOIN</option>
                              <option value="FULL">FULL JOIN</option>
                            </select>

                            <select
                              data-testid={`qb-join-table-${idx}`}
                              aria-label={`Join Table ${idx}`}
                              value={join.table}
                              onChange={(e) => {
                                const newTable = e.target.value;
                                const newTargetObj = tables.find((t) => t.name === newTable);
                                handleUpdateJoin(idx, {
                                  table: newTable,
                                  rightTable: newTable,
                                  rightColumn: newTargetObj?.columns[0]?.name || 'id',
                                });
                              }}
                              className={`px-2 py-1 font-medium rounded border outline-none ${
                                theme === 'dark'
                                  ? 'bg-[#11111b] border-gray-700 text-gray-200'
                                  : 'bg-white border-gray-300 text-gray-800'
                              }`}
                            >
                              {tables.map((t) => (
                                <option key={t.name} value={t.name}>
                                  {t.name}
                                </option>
                              ))}
                            </select>

                            <input
                              type="text"
                              data-testid={`qb-join-alias-${idx}`}
                              aria-label={`Join Alias ${idx}`}
                              placeholder="Alias (optional)"
                              value={join.alias || ''}
                              onChange={(e) =>
                                handleUpdateJoin(idx, { alias: e.target.value })
                              }
                              className={`w-28 px-2 py-1 text-xs rounded border outline-none font-mono ${
                                theme === 'dark'
                                  ? 'bg-[#11111b] border-gray-700 text-gray-200'
                                  : 'bg-white border-gray-300 text-gray-800'
                              }`}
                            />
                          </div>

                          <button
                            type="button"
                            data-testid={`qb-remove-join-${idx}`}
                            onClick={() => handleRemoveJoin(idx)}
                            title="Remove JOIN"
                            className="p-1 text-red-400 hover:text-red-300 hover:bg-red-950/30 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* ON condition */}
                        <div className="flex items-center space-x-2 pl-2 border-l-2 border-purple-500/40 text-[11px] font-mono">
                          <span className="text-gray-400">ON</span>
                          <span className="font-semibold text-gray-300">{join.leftTable}.</span>
                          <select
                            data-testid={`qb-join-left-col-${idx}`}
                            aria-label={`Join Left Column ${idx}`}
                            value={join.leftColumn}
                            onChange={(e) =>
                              handleUpdateJoin(idx, { leftColumn: e.target.value })
                            }
                            className={`px-1.5 py-0.5 rounded border outline-none ${
                              theme === 'dark'
                                ? 'bg-[#11111b] border-gray-700 text-gray-200'
                                : 'bg-white border-gray-300 text-gray-800'
                            }`}
                          >
                            {leftTableColumns.map((c) => (
                              <option key={c.name} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          </select>

                          <span className="text-gray-400">=</span>

                          <span className="font-semibold text-gray-300">
                            {join.alias || join.table}.
                          </span>
                          <select
                            data-testid={`qb-join-right-col-${idx}`}
                            aria-label={`Join Right Column ${idx}`}
                            value={join.rightColumn}
                            onChange={(e) =>
                              handleUpdateJoin(idx, { rightColumn: e.target.value })
                            }
                            className={`px-1.5 py-0.5 rounded border outline-none ${
                              theme === 'dark'
                                ? 'bg-[#11111b] border-gray-700 text-gray-200'
                                : 'bg-white border-gray-300 text-gray-800'
                            }`}
                          >
                            {rightTableColumns.map((c) => (
                              <option key={c.name} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. Filters (WHERE) Section */}
            <div
              className={`rounded-lg border p-3.5 shadow-sm ${
                theme === 'dark' ? 'bg-[#1e1e2e] border-gray-800' : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-700/30">
                <div className="flex items-center space-x-2">
                  <FilterIcon className="w-4 h-4 text-emerald-400" />
                  <span className="font-semibold text-xs uppercase tracking-wider">
                    Filters / Conditions (WHERE)
                  </span>
                  <button
                    type="button"
                    data-testid="qb-conjunction-toggle"
                    onClick={() =>
                      setFilterConjunction((prev) => (prev === 'AND' ? 'OR' : 'AND'))
                    }
                    className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded transition-colors ${
                      filterConjunction === 'AND'
                        ? 'bg-blue-600 text-white'
                        : 'bg-amber-600 text-white'
                    }`}
                  >
                    Match: {filterConjunction}
                  </button>
                </div>
                <button
                  type="button"
                  data-testid="qb-add-filter-btn"
                  onClick={handleAddFilter}
                  className="inline-flex items-center space-x-1 px-2 py-0.5 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Condition</span>
                </button>
              </div>

              {filters.length === 0 ? (
                <p className="text-xs text-gray-500 py-2 text-center">
                  No filter conditions. All rows will be returned.
                </p>
              ) : (
                <div className="space-y-2">
                  {filters.map((filter, idx) => {
                    const isBetween = filter.operator === 'between';
                    const isNullOp = filter.operator === 'is_null' || filter.operator === 'is_not_null';

                    return (
                      <div
                        key={filter.id}
                        className={`flex items-center space-x-2 p-2 rounded border text-xs ${
                          theme === 'dark'
                            ? 'bg-[#161622] border-gray-700/60'
                            : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        {joins.length > 0 && (
                          <span className="text-[10px] text-gray-500 font-mono">
                            {filter.table || baseTable}.
                          </span>
                        )}

                        {/* Column selector */}
                        <select
                          data-testid={`qb-filter-col-${idx}`}
                          aria-label={`Filter Column ${idx}`}
                          value={filter.column}
                          onChange={(e) => {
                            const val = e.target.value;
                            const matched = availableColumns.find((c) => c.column === val);
                            handleUpdateFilter(idx, {
                              column: val,
                              table: matched?.table,
                            });
                          }}
                          className={`px-2 py-1 font-mono rounded border outline-none ${
                            theme === 'dark'
                              ? 'bg-[#11111b] border-gray-700 text-gray-200'
                              : 'bg-white border-gray-300 text-gray-800'
                          }`}
                        >
                          {availableColumns.map((c) => (
                            <option key={c.key} value={c.column}>
                              {c.label}
                            </option>
                          ))}
                        </select>

                        {/* Operator selector */}
                        <select
                          data-testid={`qb-filter-op-${idx}`}
                          aria-label={`Filter Operator ${idx}`}
                          value={filter.operator}
                          onChange={(e) =>
                            handleUpdateFilter(idx, {
                              operator: e.target.value as QueryFilterOperator,
                            })
                          }
                          className={`px-2 py-1 font-mono font-medium rounded border outline-none ${
                            theme === 'dark'
                              ? 'bg-[#11111b] border-gray-700 text-emerald-400'
                              : 'bg-white border-gray-300 text-emerald-600'
                          }`}
                        >
                          <option value="equals">equals (=)</option>
                          <option value="not_equals">not equals (!=)</option>
                          <option value="contains">contains (LIKE %...%)</option>
                          <option value="starts_with">starts with (LIKE ...%)</option>
                          <option value="ends_with">ends with (LIKE %...)</option>
                          <option value="greater_than">greater than (&gt;)</option>
                          <option value="less_than">less than (&lt;)</option>
                          <option value="greater_or_equal">greater or equal (&gt;=)</option>
                          <option value="less_or_equal">less or equal (&lt;=)</option>
                          <option value="between">between</option>
                          <option value="is_null">is NULL</option>
                          <option value="is_not_null">is NOT NULL</option>
                        </select>

                        {/* Value inputs */}
                        {!isNullOp && (
                          <input
                            type="text"
                            data-testid={`qb-filter-val-${idx}`}
                            aria-label={`Filter Value ${idx}`}
                            placeholder="Value"
                            value={filter.value || ''}
                            onChange={(e) =>
                              handleUpdateFilter(idx, { value: e.target.value })
                            }
                            className={`flex-1 min-w-[90px] px-2 py-1 text-xs rounded border outline-none font-mono ${
                              theme === 'dark'
                                ? 'bg-[#11111b] border-gray-700 text-gray-200'
                                : 'bg-white border-gray-300 text-gray-800'
                            }`}
                          />
                        )}

                        {isBetween && (
                          <>
                            <span className="text-gray-400 font-mono text-[11px]">AND</span>
                            <input
                              type="text"
                              data-testid={`qb-filter-val-to-${idx}`}
                              aria-label={`Filter Value To ${idx}`}
                              placeholder="Value To"
                              value={filter.valueTo || ''}
                              onChange={(e) =>
                                handleUpdateFilter(idx, { valueTo: e.target.value })
                              }
                              className={`flex-1 min-w-[90px] px-2 py-1 text-xs rounded border outline-none font-mono ${
                                theme === 'dark'
                                  ? 'bg-[#11111b] border-gray-700 text-gray-200'
                                  : 'bg-white border-gray-300 text-gray-800'
                              }`}
                            />
                          </>
                        )}

                        <button
                          type="button"
                          data-testid={`qb-remove-filter-${idx}`}
                          onClick={() => handleRemoveFilter(idx)}
                          title="Remove condition"
                          className="p-1 text-red-400 hover:text-red-300 hover:bg-red-950/30 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 4. Sort & Pagination (ORDER BY & LIMIT) */}
            <div
              className={`rounded-lg border p-3.5 shadow-sm ${
                theme === 'dark' ? 'bg-[#1e1e2e] border-gray-800' : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-700/30">
                <div className="flex items-center space-x-2">
                  <ArrowUpDown className="w-4 h-4 text-cyan-400" />
                  <span className="font-semibold text-xs uppercase tracking-wider">
                    Sorting & Pagination (ORDER BY & LIMIT)
                  </span>
                </div>
                <button
                  type="button"
                  data-testid="qb-add-sort-btn"
                  onClick={handleAddOrderBy}
                  className="inline-flex items-center space-x-1 px-2 py-0.5 text-xs rounded bg-cyan-600 hover:bg-cyan-500 text-white transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Sort</span>
                </button>
              </div>

              <div className="space-y-2 mb-3">
                {orderBy.length === 0 ? (
                  <p className="text-xs text-gray-500 py-1 text-center">
                    No custom sort applied.
                  </p>
                ) : (
                  orderBy.map((sort, idx) => (
                    <div
                      key={sort.id}
                      className={`flex items-center space-x-2 p-1.5 rounded border text-xs ${
                        theme === 'dark'
                          ? 'bg-[#161622] border-gray-700/60'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <select
                        data-testid={`qb-sort-col-${idx}`}
                        aria-label={`Sort Column ${idx}`}
                        value={sort.column}
                        onChange={(e) => {
                          const val = e.target.value;
                          const matched = availableColumns.find((c) => c.column === val);
                          handleUpdateOrderBy(idx, {
                            column: val,
                            table: matched?.table,
                          });
                        }}
                        className={`px-2 py-1 font-mono rounded border outline-none ${
                          theme === 'dark'
                            ? 'bg-[#11111b] border-gray-700 text-gray-200'
                            : 'bg-white border-gray-300 text-gray-800'
                        }`}
                      >
                        {availableColumns.map((c) => (
                          <option key={c.key} value={c.column}>
                            {c.label}
                          </option>
                        ))}
                      </select>

                      <select
                        data-testid={`qb-sort-dir-${idx}`}
                        aria-label={`Sort Direction ${idx}`}
                        value={sort.direction}
                        onChange={(e) =>
                          handleUpdateOrderBy(idx, {
                            direction: e.target.value as 'ASC' | 'DESC',
                          })
                        }
                        className={`px-2 py-1 font-mono font-bold rounded border outline-none ${
                          theme === 'dark'
                            ? 'bg-[#11111b] border-gray-700 text-cyan-400'
                            : 'bg-white border-gray-300 text-cyan-600'
                        }`}
                      >
                        <option value="ASC">ASC (Ascending)</option>
                        <option value="DESC">DESC (Descending)</option>
                      </select>

                      <button
                        type="button"
                        data-testid={`qb-remove-sort-${idx}`}
                        onClick={() => handleRemoveOrderBy(idx)}
                        title="Remove sort"
                        className="p-1 text-red-400 hover:text-red-300 hover:bg-red-950/30 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Limit & Offset Inputs */}
              <div className="flex items-center space-x-4 pt-2 border-t border-gray-700/30 text-xs">
                <div className="flex items-center space-x-1.5">
                  <span className="font-medium text-gray-400">Limit:</span>
                  <input
                    type="number"
                    data-testid="qb-limit-input"
                    aria-label="Query Limit"
                    min={0}
                    value={limit}
                    onChange={(e) => setLimit(Math.max(0, parseInt(e.target.value) || 0))}
                    className={`w-20 px-2 py-1 text-xs font-mono rounded border outline-none ${
                      theme === 'dark'
                        ? 'bg-[#11111b] border-gray-700 text-gray-200'
                        : 'bg-white border-gray-300 text-gray-800'
                    }`}
                  />
                </div>

                <div className="flex items-center space-x-1.5">
                  <span className="font-medium text-gray-400">Offset:</span>
                  <input
                    type="number"
                    data-testid="qb-offset-input"
                    aria-label="Query Offset"
                    min={0}
                    value={offset}
                    onChange={(e) => setOffset(Math.max(0, parseInt(e.target.value) || 0))}
                    className={`w-20 px-2 py-1 text-xs font-mono rounded border outline-none ${
                      theme === 'dark'
                        ? 'bg-[#11111b] border-gray-700 text-gray-200'
                        : 'bg-white border-gray-300 text-gray-800'
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Pane: Live SQL Preview & Execution Results */}
        <div className="w-5/12 flex flex-col min-h-0">
          {/* Live SQL Preview Box */}
          <div
            className={`p-3 border-b flex flex-col min-h-[160px] max-h-[260px] flex-shrink-0 ${
              theme === 'dark' ? 'bg-[#11111b] border-gray-800' : 'bg-gray-100 border-gray-200'
            }`}
          >
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-gray-700/30 text-xs font-semibold text-gray-400">
              <span className="uppercase tracking-wider">Live SQL Preview</span>
              <span className="text-[10px] text-emerald-400 font-mono">Dialect: {driver}</span>
            </div>

            <pre
              data-testid="qb-sql-preview"
              className={`flex-1 font-mono text-xs overflow-auto p-2.5 rounded whitespace-pre-wrap leading-relaxed select-text ${
                theme === 'dark'
                  ? 'bg-[#181825] text-amber-200 border border-gray-800'
                  : 'bg-white text-blue-900 border border-gray-300'
              }`}
            >
              {liveSql || '-- Please select a base table to construct SQL'}
            </pre>
          </div>

          {/* Results Area */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
            <div
              className={`px-3 py-1.5 border-b flex items-center justify-between text-xs flex-shrink-0 ${
                theme === 'dark' ? 'bg-[#181825] border-gray-800 text-gray-400' : 'bg-gray-50 border-gray-200 text-gray-600'
              }`}
            >
              <div className="flex items-center space-x-2 font-medium">
                <Database className="w-3.5 h-3.5 text-blue-400" />
                <span>Query Results</span>
              </div>
              {queryResult && (
                <div className="text-[11px] font-mono text-gray-400 space-x-2">
                  <span>{queryResult.rows.length} rows</span>
                  <span>•</span>
                  <span>{queryResult.execution_time_ms} ms</span>
                </div>
              )}
            </div>

            {executionError && (
              <div
                data-testid="qb-execution-error"
                className="p-3 bg-red-950/40 border-b border-red-800/50 text-red-300 text-xs flex items-start space-x-2"
              >
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="overflow-auto font-mono text-[11px]">{executionError}</div>
              </div>
            )}

            <div
              data-testid="qb-results-container"
              className="flex-1 flex flex-col min-h-0 overflow-hidden"
            >
              {queryResult ? (
                <DataGrid data={queryResult} isLoading={isExecuting} theme={theme} />
              ) : isExecuting ? (
                <div className="flex-1 flex flex-col items-center justify-center space-y-2 text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                  <span className="text-xs">Executing query...</span>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-gray-500">
                  <Layers className="w-10 h-10 mb-2 opacity-30" />
                  <p className="text-xs">
                    Configure your query on the left and click{' '}
                    <strong className="text-emerald-500">Run Query</strong> to preview results here.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VisualQueryBuilderTab;
