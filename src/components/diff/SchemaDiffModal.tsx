import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import * as Dialog from '@radix-ui/react-dialog';
import {
  GitCompare,
  ArrowLeftRight,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  MinusCircle,
  Copy,
  Check,
  Play,
  FileCode,
  Table as TableIcon,
  Search,
  Key,
  Database,
  Layers,
  Link2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useConnectionStore } from '../../stores/connectionStore';
import {
  fetchSchemaForDiff,
  compareSchemas,
  generateMigrationSql,
  extractRunnableStatements,
} from '../../api/schemaDiffApi';
import { dbApi } from '../../api/db';
import { showConfirmDialog } from '../../utils/dialog';
import type { SchemaDiffResult, TableDiff, MigrationScript } from '../../types/schemaDiff';

export interface SchemaDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialConnectionId?: string;
  initialSchemaName?: string;
}

export const SchemaDiffModal: React.FC<SchemaDiffModalProps> = ({
  isOpen,
  onClose,
  initialConnectionId,
  initialSchemaName,
}) => {
  const { t } = useTranslation();
  const { connections } = useConnectionStore();

  const [sourceConnId, setSourceConnId] = useState<string>('');
  const [sourceSchema, setSourceSchema] = useState<string>('');
  const [targetConnId, setTargetConnId] = useState<string>('');
  const [targetSchema, setTargetSchema] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [diffResult, setDiffResult] = useState<SchemaDiffResult | null>(null);
  const [migrationScript, setMigrationScript] = useState<MigrationScript | null>(null);

  const [selectedTable, setSelectedTable] = useState<TableDiff | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'different' | 'source_only' | 'target_only'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeViewTab, setActiveViewTab] = useState<'details' | 'migration_up' | 'migration_down'>('details');
  const [copied, setCopied] = useState<boolean>(false);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [allowDestructiveDrop, setAllowDestructiveDrop] = useState<boolean>(false);

  // Initialize connection selectors
  useEffect(() => {
    if (connections.length > 0) {
      const srcId = initialConnectionId || connections[0].id;
      setSourceConnId(srcId);
      setSourceSchema(initialSchemaName || '');

      // Pick a different target connection if possible
      const otherConn = connections.find((c) => c.id !== srcId) || connections[0];
      setTargetConnId(otherConn.id);
      setTargetSchema('');
    }
  }, [connections, initialConnectionId, initialSchemaName]);

  const handleSwap = () => {
    setSourceConnId(targetConnId);
    setSourceSchema(targetSchema);
    setTargetConnId(sourceConnId);
    setTargetSchema(sourceSchema);
    setDiffResult(null);
    setMigrationScript(null);
  };

  const handleCompare = async () => {
    if (!sourceConnId || !targetConnId) {
      toast.error('Please select both source and target connections.');
      return;
    }

    const srcConn = connections.find((c) => c.id === sourceConnId);
    const tgtConn = connections.find((c) => c.id === targetConnId);
    if (!srcConn || !tgtConn) return;

    setIsLoading(true);
    setDiffResult(null);
    setMigrationScript(null);

    try {
      const [srcSchemaData, tgtSchemaData] = await Promise.all([
        fetchSchemaForDiff(sourceConnId, srcConn.driver, sourceSchema || undefined),
        fetchSchemaForDiff(targetConnId, tgtConn.driver, targetSchema || undefined),
      ]);

      const diff = compareSchemas(srcSchemaData, tgtSchemaData);
      setDiffResult(diff);
      const scripts = generateMigrationSql(diff, tgtConn.driver, { allowDestructiveDrop });
      setMigrationScript(scripts);

      if (diff.tables.length > 0) {
        setSelectedTable(diff.tables[0]);
      }
      toast.success('Schema comparison completed.');
    } catch (err: any) {
      console.error('Schema comparison failed:', err);
      toast.error(err?.message || 'Failed to compare schemas.');
    } finally {
      setIsLoading(false);
    }
  };

  // Whenever allowDestructiveDrop changes, recompute migration script
  useEffect(() => {
    if (diffResult && targetConnId) {
      const tgtConn = connections.find((c) => c.id === targetConnId);
      const scripts = generateMigrationSql(diffResult, tgtConn?.driver || 'postgres', {
        allowDestructiveDrop,
      });
      setMigrationScript(scripts);
    }
  }, [allowDestructiveDrop, diffResult, targetConnId, connections]);

  const handleCopySql = (sql: string) => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('SQL script copied to clipboard.');
  };

  const handleExecuteMigration = async () => {
    if (!migrationScript?.up || !targetConnId) return;

    const tgtConn = connections.find((c) => c.id === targetConnId);
    const runnableStatements = extractRunnableStatements(migrationScript.up, tgtConn?.driver);
    if (runnableStatements.length === 0) {
      toast.info('No executable statements found in migration script.');
      return;
    }

    if (allowDestructiveDrop && migrationScript.up.includes('DROP TABLE IF EXISTS')) {
      const dangerConfirmed = await showConfirmDialog(
        'Warning: Destructive DROP TABLE is enabled. Existing tables in the target database will be permanently deleted. Are you sure you want to proceed?',
        {
          title: 'DANGER: Destructive Table Deletion',
          okLabel: 'Permanently Drop Tables',
          kind: 'error',
        }
      );
      if (!dangerConfirmed) return;
    }

    const confirmed = await showConfirmDialog(
      `Are you sure you want to apply the UP migration script (${runnableStatements.length} statement${runnableStatements.length > 1 ? 's' : ''}) to the target database? This may modify or drop schema objects.`,
      {
        title: 'Apply Schema Migration',
        okLabel: 'Apply Migration',
        kind: 'warning',
      }
    );

    if (!confirmed) return;

    setIsExecuting(true);
    try {
      // Execute runnable statements sequentially
      for (let i = 0; i < runnableStatements.length; i++) {
        const stmt = runnableStatements[i];
        await dbApi.executeDirectQuery(targetConnId, `${stmt};`);
      }
      toast.success(
        `Migration executed successfully (${runnableStatements.length} statement${runnableStatements.length > 1 ? 's' : ''}).`
      );
      // Re-run compare to reflect updated schema
      await handleCompare();
    } catch (err: any) {
      console.error('Migration execution failed:', err);
      const rawError = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
      toast.error(`Execution failed: ${rawError || 'Unknown error'}`);
    } finally {
      setIsExecuting(false);
    }
  };

  // Filtered tables
  const filteredTables = useMemo(() => {
    if (!diffResult) return [];
    return diffResult.tables.filter((t) => {
      if (searchQuery.trim() && !t.tableName.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (filterMode === 'different' && t.status !== 'different') return false;
      if (filterMode === 'source_only' && t.status !== 'only_in_source') return false;
      if (filterMode === 'target_only' && t.status !== 'only_in_target') return false;
      return true;
    });
  }, [diffResult, filterMode, searchQuery]);

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-100" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[94vw] max-w-6xl h-[88vh] bg-panel border border-line rounded-xl shadow-2xl flex flex-col overflow-hidden z-50 text-text">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-line bg-black/10 dark:bg-white/5 shrink-0">
            <div className="flex items-center gap-2.5">
              <GitCompare className="w-5 h-5 text-purple-400" />
              <div>
                <h2 className="text-sm font-semibold text-text">{t('tools.schemaDiffTitle', 'Schema Diff & Synchronization')}</h2>
                <p className="text-xs text-muted">
                  Compare database schemas, detect schema drift, and generate synchronized migration scripts
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close', 'Close')}
              className="p-1.5 rounded text-muted hover:text-text hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Connection Selectors Toolbar */}
          <div className="px-5 py-3 border-b border-line bg-panel flex flex-wrap items-center gap-3 shrink-0">
            {/* Source Connection */}
            <div className="flex items-center gap-2 flex-1 min-w-[260px]">
              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider shrink-0 w-14">
                {t('tools.sourceLabel', 'Source:')}
              </span>
              <select
                value={sourceConnId}
                onChange={(e) => setSourceConnId(e.target.value)}
                className="flex-1 h-[34px] text-xs bg-black/10 dark:bg-white/5 border border-line rounded px-2.5 py-1.5 outline-none focus:border-accent text-text"
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.driver})
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder={
                  connections.find((c) => c.id === sourceConnId)?.driver === 'sqlite'
                    ? 'N/A (SQLite)'
                    : 'Schema (optional)'
                }
                disabled={connections.find((c) => c.id === sourceConnId)?.driver === 'sqlite'}
                value={sourceSchema}
                onChange={(e) => setSourceSchema(e.target.value)}
                className={`w-28 h-[34px] text-xs bg-black/10 dark:bg-white/5 border border-line rounded px-2 py-1.5 outline-none focus:border-accent text-text ${
                  connections.find((c) => c.id === sourceConnId)?.driver === 'sqlite'
                    ? 'opacity-50 cursor-not-allowed'
                    : ''
                }`}
              />
            </div>

            {/* Swap Button */}
            <button
              type="button"
              onClick={handleSwap}
              title={t('tools.swapConnections', 'Swap Source and Target')}
              className="p-1.5 rounded-md hover:bg-white/10 text-muted hover:text-text transition-colors border border-line shrink-0"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>

            {/* Target Connection */}
            <div className="flex items-center gap-2 flex-1 min-w-[260px]">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider shrink-0 w-14">
                {t('tools.targetLabel', 'Target:')}
              </span>
              <select
                value={targetConnId}
                onChange={(e) => setTargetConnId(e.target.value)}
                className="flex-1 h-[34px] text-xs bg-black/10 dark:bg-white/5 border border-line rounded px-2.5 py-1.5 outline-none focus:border-accent text-text"
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.driver})
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder={
                  connections.find((c) => c.id === targetConnId)?.driver === 'sqlite'
                    ? 'N/A (SQLite)'
                    : 'Schema (optional)'
                }
                disabled={connections.find((c) => c.id === targetConnId)?.driver === 'sqlite'}
                value={targetSchema}
                onChange={(e) => setTargetSchema(e.target.value)}
                className={`w-28 h-[34px] text-xs bg-black/10 dark:bg-white/5 border border-line rounded px-2 py-1.5 outline-none focus:border-accent text-text ${
                  connections.find((c) => c.id === targetConnId)?.driver === 'sqlite'
                    ? 'opacity-50 cursor-not-allowed'
                    : ''
                }`}
              />
            </div>

            {/* Compare Button */}
            <button
              type="button"
              onClick={handleCompare}
              disabled={isLoading}
              data-testid="diff-compare-btn"
              className="px-4 h-[34px] rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm transition-colors shrink-0"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('tools.comparing', 'Comparing...')}</span>
                </>
              ) : (
                <>
                  <GitCompare className="w-3.5 h-3.5" />
                  <span>{t('tools.compareSchemas', 'Compare Schemas')}</span>
                </>
              )}
            </button>
          </div>

          {/* Summary & View Tabs Bar */}
          {diffResult && (
            <div className="px-5 py-2.5 border-b border-line bg-black/5 dark:bg-white/[0.02] flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-muted mr-1">Summary:</span>
                <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-mono text-[11px] font-medium border border-blue-500/20">
                  {diffResult.summary.identicalCount} Identical
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono text-[11px] font-medium border border-amber-500/20">
                  {diffResult.summary.differentCount} Modified
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono text-[11px] font-medium border border-emerald-500/20">
                  +{diffResult.summary.onlyInSourceCount} In Source Only
                </span>
                <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 font-mono text-[11px] font-medium border border-rose-500/20">
                  -{diffResult.summary.onlyInTargetCount} In Target Only
                </span>
                {diffResult.summary.skippedCount !== undefined && diffResult.summary.skippedCount > 0 && (
                  <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 font-mono text-[11px] font-medium border border-purple-500/20">
                    {diffResult.summary.skippedCount} Limitations Skipped
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 bg-black/10 dark:bg-white/5 p-0.5 rounded border border-line shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveViewTab('details')}
                  data-testid="diff-tab-details"
                  className={`px-3 py-1 rounded text-xs transition-colors ${
                    activeViewTab === 'details'
                      ? 'bg-blue-600 text-white font-medium shadow-xs'
                      : 'text-muted hover:text-text'
                  }`}
                >
                  Diff Details
                </button>
                <button
                  type="button"
                  onClick={() => setActiveViewTab('migration_up')}
                  data-testid="diff-tab-migration"
                  className={`px-3 py-1 rounded text-xs transition-colors ${
                    activeViewTab === 'migration_up'
                      ? 'bg-blue-600 text-white font-medium shadow-xs'
                      : 'text-muted hover:text-text'
                  }`}
                >
                  Migration UP
                </button>
                <button
                  type="button"
                  onClick={() => setActiveViewTab('migration_down')}
                  data-testid="diff-tab-down"
                  className={`px-3 py-1 rounded text-xs transition-colors ${
                    activeViewTab === 'migration_down'
                      ? 'bg-blue-600 text-white font-medium shadow-xs'
                      : 'text-muted hover:text-text'
                  }`}
                >
                  Migration DOWN
                </button>
              </div>
            </div>
          )}

          {/* Main Content Area */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {!diffResult ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted">
                <GitCompare className="w-12 h-12 text-muted/40 mb-3" />
                <p className="text-sm font-medium text-text">No Schema Comparison Yet</p>
                <p className="text-xs text-muted/80 mt-1 max-w-sm text-center">
                  Select your Source and Target database connections above and click "Compare Schemas" to detect differences.
                </p>
              </div>
            ) : activeViewTab === 'details' ? (
              <>
                {/* Left: Table List */}
                <div className="w-72 border-r border-line flex flex-col bg-panel shrink-0">
                  <div className="p-2.5 border-b border-line space-y-2">
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-black/10 dark:bg-white/5 border border-line text-xs">
                      <Search className="w-3.5 h-3.5 text-muted" />
                      <input
                        type="text"
                        placeholder="Filter tables..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-transparent border-none outline-none text-xs text-text placeholder-muted/60 w-full"
                      />
                    </div>
                    <div className="flex items-center gap-1 text-[11px]">
                      {(['all', 'different', 'source_only', 'target_only'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setFilterMode(m)}
                          className={`px-1.5 py-0.5 rounded capitalize transition-colors ${
                            filterMode === m
                              ? 'bg-blue-600 text-white font-medium'
                              : 'text-muted hover:text-text hover:bg-white/5'
                          }`}
                        >
                          {m === 'source_only' ? '+Source' : m === 'target_only' ? '-Target' : m}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto divide-y divide-line/30">
                    {filteredTables.map((table) => {
                      const isSelected = selectedTable?.tableName === table.tableName;
                      return (
                        <button
                          key={table.tableName}
                          type="button"
                          onClick={() => setSelectedTable(table)}
                          className={`w-full text-left px-3 py-2 flex items-center justify-between text-xs transition-colors ${
                            isSelected
                              ? 'bg-blue-500/15 border-l-2 border-blue-500 text-text font-medium'
                              : 'hover:bg-white/5 text-muted'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <TableIcon className="w-3.5 h-3.5 text-muted shrink-0" />
                            <span className="truncate">{table.tableName}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {table.skippedItems && table.skippedItems.length > 0 && (
                              <span className="w-2 h-2 rounded-full bg-amber-500" title="Contains Driver Limitations" />
                            )}
                            {table.status === 'identical' && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                            )}
                            {table.status === 'different' && (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                            )}
                            {table.status === 'only_in_source' && (
                              <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
                            )}
                            {table.status === 'only_in_target' && (
                              <MinusCircle className="w-3.5 h-3.5 text-rose-400" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Table Structure Diff Inspector */}
                <div className="flex-1 flex flex-col bg-panel min-h-0 overflow-y-auto p-4 space-y-4">
                  {selectedTable ? (
                    <div>
                      {/* Table Header Info */}
                      <div className="flex items-center justify-between pb-3 mb-3 border-b border-line">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-text">
                            Table: {selectedTable.tableName}
                          </h4>
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded font-medium ${
                              selectedTable.status === 'identical'
                                ? 'bg-blue-500/10 text-blue-400'
                                : selectedTable.status === 'different'
                                ? 'bg-amber-500/10 text-amber-400'
                                : selectedTable.status === 'only_in_source'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-rose-500/10 text-rose-400'
                            }`}
                          >
                            {selectedTable.status.replace(/_/g, ' ').toUpperCase()}
                          </span>
                        </div>
                      </div>

                      {/* Driver Limitations Warning Box */}
                      {selectedTable.skippedItems && selectedTable.skippedItems.length > 0 && (
                        <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
                          <div className="flex items-center gap-1.5 font-semibold text-amber-400 mb-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>Driver Limitations on Existing Table ({selectedTable.skippedItems.length})</span>
                          </div>
                          <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-300/90 pl-1">
                            {selectedTable.skippedItems.map((item, idx) => (
                              <li key={idx}>
                                <span className="font-medium text-amber-200">{item.description}</span>: {item.reason}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Primary Key Comparison (if exists) */}
                      {selectedTable.primaryKeyDiff && (
                        <div className="mb-4 p-3 rounded-lg border border-line bg-black/5 dark:bg-white/[0.02]">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-text">
                              <Key className="w-3.5 h-3.5 text-amber-400" />
                              <span>Primary Key</span>
                            </div>
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                                selectedTable.primaryKeyDiff.status === 'identical'
                                  ? 'text-muted'
                                  : selectedTable.primaryKeyDiff.canApplyToTarget
                                  ? 'bg-emerald-500/15 text-emerald-400'
                                  : 'bg-amber-500/15 text-amber-400'
                              }`}
                            >
                              {selectedTable.primaryKeyDiff.canApplyToTarget
                                ? 'Can Apply'
                                : 'Unsupported (Skip)'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                            <div>
                              <span className="text-muted block text-[11px]">Source PK:</span>
                              <span className="text-emerald-400 font-medium">
                                {selectedTable.primaryKeyDiff.sourceColumns.length > 0
                                  ? selectedTable.primaryKeyDiff.sourceColumns.join(', ')
                                  : '(None)'}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted block text-[11px]">Target PK:</span>
                              <span className="text-rose-400 font-medium">
                                {selectedTable.primaryKeyDiff.targetColumns.length > 0
                                  ? selectedTable.primaryKeyDiff.targetColumns.join(', ')
                                  : '(None)'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Columns Comparison Table */}
                      <div className="border border-line rounded-lg overflow-hidden mb-4">
                        <div className="bg-black/10 dark:bg-white/5 px-3 py-2 border-b border-line text-xs font-semibold text-text flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-blue-400" />
                          <span>Columns ({selectedTable.columnDiffs.length})</span>
                        </div>
                        <table className="w-full text-xs text-left">
                          <thead className="bg-black/5 dark:bg-white/[0.02] border-b border-line font-medium text-muted">
                            <tr>
                              <th className="py-2 px-3">Column</th>
                              <th className="py-2 px-3">Status</th>
                              <th className="py-2 px-3">Source (New)</th>
                              <th className="py-2 px-3">Target (Current)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line/30 font-mono">
                            {selectedTable.columnDiffs.map((col) => (
                              <tr
                                key={col.name}
                                className={
                                  col.status === 'added'
                                    ? 'bg-emerald-500/5'
                                    : col.status === 'removed'
                                    ? 'bg-rose-500/5'
                                    : col.status !== 'identical'
                                    ? 'bg-amber-500/5'
                                    : ''
                                }
                              >
                                <td className="py-2 px-3 text-text font-medium flex items-center gap-1">
                                  {col.sourcePk && <Key className="w-3 h-3 text-amber-400 shrink-0" />}
                                  <span>{col.name}</span>
                                </td>
                                <td className="py-2 px-3">
                                  <span
                                    className={`text-[10px] px-1.5 py-0.5 rounded font-sans font-medium ${
                                      col.status === 'identical'
                                        ? 'text-muted'
                                        : col.status === 'added'
                                        ? 'bg-emerald-500/15 text-emerald-400'
                                        : col.status === 'removed'
                                        ? 'bg-rose-500/15 text-rose-400'
                                        : 'bg-amber-500/15 text-amber-400'
                                    }`}
                                  >
                                    {col.status.replace(/_/g, ' ')}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-emerald-400">
                                  {col.sourceType
                                    ? `${col.sourceType} ${col.sourceNullable ? 'NULL' : 'NOT NULL'}${col.sourcePk ? ' (PK)' : ''}`
                                    : '-'}
                                </td>
                                <td className="py-2 px-3 text-rose-400">
                                  {col.targetType
                                    ? `${col.targetType} ${col.targetNullable ? 'NULL' : 'NOT NULL'}${col.targetPk ? ' (PK)' : ''}`
                                    : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Indexes Comparison Table */}
                      {selectedTable.indexDiffs && selectedTable.indexDiffs.length > 0 && (
                        <div className="border border-line rounded-lg overflow-hidden mb-4">
                          <div className="bg-black/10 dark:bg-white/5 px-3 py-2 border-b border-line text-xs font-semibold text-text flex items-center gap-1.5">
                            <Database className="w-3.5 h-3.5 text-purple-400" />
                            <span>Indexes ({selectedTable.indexDiffs.length})</span>
                          </div>
                          <table className="w-full text-xs text-left">
                            <thead className="bg-black/5 dark:bg-white/[0.02] border-b border-line font-medium text-muted">
                              <tr>
                                <th className="py-2 px-3">Index Name</th>
                                <th className="py-2 px-3">Status</th>
                                <th className="py-2 px-3">Columns</th>
                                <th className="py-2 px-3">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line/30 font-mono">
                              {selectedTable.indexDiffs.map((idx) => (
                                <tr key={idx.name}>
                                  <td className="py-2 px-3 text-text font-medium">{idx.name}</td>
                                  <td className="py-2 px-3">
                                    <span
                                      className={`text-[10px] px-1.5 py-0.5 rounded font-sans font-medium ${
                                        idx.status === 'added'
                                          ? 'bg-emerald-500/15 text-emerald-400'
                                          : 'bg-rose-500/15 text-rose-400'
                                      }`}
                                    >
                                      {idx.status}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-muted">{idx.columns.join(', ')}</td>
                                  <td className="py-2 px-3 text-emerald-400 font-sans text-[11px]">
                                    Will Create Index
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Foreign Keys Comparison Table */}
                      {selectedTable.foreignKeyDiffs && selectedTable.foreignKeyDiffs.length > 0 && (
                        <div className="border border-line rounded-lg overflow-hidden">
                          <div className="bg-black/10 dark:bg-white/5 px-3 py-2 border-b border-line text-xs font-semibold text-text flex items-center gap-1.5">
                            <Link2 className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Foreign Keys ({selectedTable.foreignKeyDiffs.length})</span>
                          </div>
                          <table className="w-full text-xs text-left">
                            <thead className="bg-black/5 dark:bg-white/[0.02] border-b border-line font-medium text-muted">
                              <tr>
                                <th className="py-2 px-3">Constraint Name</th>
                                <th className="py-2 px-3">Status</th>
                                <th className="py-2 px-3">From Column</th>
                                <th className="py-2 px-3">References</th>
                                <th className="py-2 px-3">Capability</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line/30 font-mono">
                              {selectedTable.foreignKeyDiffs.map((fk) => (
                                <tr key={fk.name}>
                                  <td className="py-2 px-3 text-text font-medium">{fk.name}</td>
                                  <td className="py-2 px-3">
                                    <span
                                      className={`text-[10px] px-1.5 py-0.5 rounded font-sans font-medium ${
                                        fk.status === 'added'
                                          ? 'bg-emerald-500/15 text-emerald-400'
                                          : 'bg-rose-500/15 text-rose-400'
                                      }`}
                                    >
                                      {fk.status}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-muted">{fk.columnNames.join(', ')}</td>
                                  <td className="py-2 px-3 text-muted">
                                    {fk.foreignTableName}({fk.foreignColumnNames.join(', ')})
                                  </td>
                                  <td className="py-2 px-3 font-sans text-[11px]">
                                    {fk.canApplyToTarget ? (
                                      <span className="text-emerald-400">Will Add Constraint</span>
                                    ) : (
                                      <span className="text-amber-400">Skipped (SQLite limitation)</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-muted text-xs">
                      Select a table to view structure differences
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Migration Script View */
              <div className="flex-1 flex flex-col p-4 bg-panel min-h-0">
                {/* Script View Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-line shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileCode className="w-4 h-4 text-blue-400 shrink-0" />
                    <span className="text-xs font-semibold text-text truncate">
                      {activeViewTab === 'migration_up'
                        ? 'UP Migration Script (Apply to Target)'
                        : 'DOWN Migration Script (Revert Changes)'}
                    </span>
                    {migrationScript?.skippedItems && migrationScript.skippedItems.length > 0 && activeViewTab === 'migration_up' && (
                      <span className="text-[10px] bg-amber-500/15 text-amber-400 font-medium px-2 py-0.5 rounded-full shrink-0 border border-amber-500/20">
                        {migrationScript.skippedItems.length} Limitations Skipped
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {activeViewTab === 'migration_up' && (
                      <label className="flex items-center gap-1.5 text-xs text-amber-400 font-medium cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={allowDestructiveDrop}
                          onChange={(e) => setAllowDestructiveDrop(e.target.checked)}
                          className="rounded border-line bg-surface text-amber-500 focus:ring-0"
                        />
                        <span>Allow destructive DROP</span>
                      </label>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        handleCopySql(
                          activeViewTab === 'migration_up'
                            ? migrationScript?.up || ''
                            : migrationScript?.down || ''
                        )
                      }
                      className="px-3 py-1.5 rounded border border-line hover:bg-white/10 text-xs font-medium text-text flex items-center gap-1.5 transition-colors"
                    >
                      {copied ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-muted" />
                      )}
                      <span>Copy SQL</span>
                    </button>

                    {activeViewTab === 'migration_up' && (
                      <button
                        type="button"
                        onClick={handleExecuteMigration}
                        disabled={isExecuting}
                        className="px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm transition-colors shrink-0"
                      >
                        {isExecuting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                        <span>Execute on Target</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Target Driver Limitation Alert Banner */}
                {activeViewTab === 'migration_up' && migrationScript?.skippedItems && migrationScript.skippedItems.length > 0 && (
                  <div className="mb-3 px-3.5 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 shrink-0">
                    <div className="flex items-center gap-2 font-medium text-amber-400">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Target Driver Limitations Notice ({migrationScript.skippedItems.length} changes safely skipped):</span>
                    </div>
                    <p className="mt-1 text-[11px] text-amber-300/80 pl-6">
                      The target database cannot apply certain schema modifications (such as altering primary keys, foreign keys, or column nullability) on existing tables. These items have been safely omitted so your migration script can execute cleanly.
                    </p>
                  </div>
                )}

                {/* High Contrast SQL Code Box */}
                <div className="flex-1 bg-slate-900/95 dark:bg-slate-950 border border-slate-700/80 dark:border-slate-800 rounded-lg p-4 font-mono text-xs overflow-auto text-slate-100 whitespace-pre selection:bg-blue-600/40 leading-relaxed shadow-inner">
                  {activeViewTab === 'migration_up'
                    ? migrationScript?.up
                    : migrationScript?.down}
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default SchemaDiffModal;
