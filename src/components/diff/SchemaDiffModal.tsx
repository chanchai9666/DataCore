import React, { useState, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { useConnectionStore } from '../../stores/connectionStore';
import {
  fetchSchemaForDiff,
  compareSchemas,
  generateMigrationSql,
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
      const scripts = generateMigrationSql(diff, tgtConn.driver);
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

  const handleCopySql = (sql: string) => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('SQL script copied to clipboard.');
  };

  const handleExecuteMigration = async () => {
    if (!migrationScript?.up || !targetConnId) return;

    const confirmed = await showConfirmDialog(
      'Are you sure you want to apply the UP migration script to the target database? This may modify or drop schema objects.',
      {
        title: 'Apply Schema Migration',
        okLabel: 'Apply Migration',
        kind: 'warning',
      }
    );

    if (!confirmed) return;

    setIsExecuting(true);
    try {
      await dbApi.executeDirectQuery(targetConnId, migrationScript.up);
      toast.success('Migration executed successfully on target.');
      // Re-run compare to reflect updated schema
      await handleCompare();
    } catch (err: any) {
      console.error('Migration execution failed:', err);
      toast.error(`Execution failed: ${err?.message || 'Unknown error'}`);
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
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-5xl h-[85vh] bg-panel border border-line rounded-xl shadow-2xl flex flex-col overflow-hidden z-50 text-text">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-line bg-black/10 dark:bg-white/5">
            <div className="flex items-center gap-2.5">
              <GitCompare className="w-5 h-5 text-purple-400" />
              <div>
                <Dialog.Title className="text-sm font-semibold text-text">
                  Schema Diff & Synchronization
                </Dialog.Title>
                <Dialog.Description className="text-xs text-muted">
                  Compare two database schemas, detect schema drift, and generate synchronized migration scripts
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="p-1 rounded text-muted hover:text-text hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Connection Comparison Bar */}
          <div className="px-5 py-3 border-b border-line bg-panel flex flex-wrap items-center gap-3">
            {/* Source */}
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider shrink-0 w-14">
                Source:
              </span>
              <select
                value={sourceConnId}
                onChange={(e) => setSourceConnId(e.target.value)}
                className="flex-1 text-xs bg-black/10 dark:bg-white/5 border border-line rounded px-2.5 py-1.5 outline-none focus:border-accent text-text"
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.driver})
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Schema (optional)"
                value={sourceSchema}
                onChange={(e) => setSourceSchema(e.target.value)}
                className="w-28 text-xs bg-black/10 dark:bg-white/5 border border-line rounded px-2 py-1.5 outline-none focus:border-accent text-text"
              />
            </div>

            {/* Swap Button */}
            <button
              type="button"
              onClick={handleSwap}
              title="Swap Source and Target"
              className="p-1.5 rounded-md hover:bg-white/10 text-muted hover:text-text transition-colors border border-line"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>

            {/* Target */}
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider shrink-0 w-14">
                Target:
              </span>
              <select
                value={targetConnId}
                onChange={(e) => setTargetConnId(e.target.value)}
                className="flex-1 text-xs bg-black/10 dark:bg-white/5 border border-line rounded px-2.5 py-1.5 outline-none focus:border-accent text-text"
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.driver})
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Schema (optional)"
                value={targetSchema}
                onChange={(e) => setTargetSchema(e.target.value)}
                className="w-28 text-xs bg-black/10 dark:bg-white/5 border border-line rounded px-2 py-1.5 outline-none focus:border-accent text-text"
              />
            </div>

            {/* Compare Button */}
            <button
              type="button"
              data-testid="diff-compare-btn"
              onClick={handleCompare}
              disabled={isLoading}
              className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm transition-colors"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Comparing...</span>
                </>
              ) : (
                <>
                  <GitCompare className="w-3.5 h-3.5" />
                  <span>Compare Schemas</span>
                </>
              )}
            </button>
          </div>

          {/* Results Summary Bar */}
          {diffResult && (
            <div className="px-5 py-2 border-b border-line bg-black/5 dark:bg-white/5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-text">Summary:</span>
                <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-mono">
                  {diffResult.summary.identicalCount} Identical
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono">
                  {diffResult.summary.differentCount} Modified
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">
                  +{diffResult.summary.onlyInSourceCount} In Source Only
                </span>
                <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 font-mono">
                  -{diffResult.summary.onlyInTargetCount} In Target Only
                </span>
              </div>

              {/* View Switcher Tabs */}
              <div className="flex items-center gap-1 p-0.5 rounded bg-panel border border-line">
                <button
                  type="button"
                  data-testid="diff-tab-details"
                  onClick={() => setActiveViewTab('details')}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    activeViewTab === 'details'
                      ? 'bg-blue-600 text-white font-medium'
                      : 'text-muted hover:text-text'
                  }`}
                >
                  Diff Details
                </button>
                <button
                  type="button"
                  data-testid="diff-tab-migration"
                  onClick={() => setActiveViewTab('migration_up')}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    activeViewTab === 'migration_up'
                      ? 'bg-blue-600 text-white font-medium'
                      : 'text-muted hover:text-text'
                  }`}
                >
                  Migration UP
                </button>
                <button
                  type="button"
                  data-testid="diff-tab-down"
                  onClick={() => setActiveViewTab('migration_down')}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    activeViewTab === 'migration_down'
                      ? 'bg-blue-600 text-white font-medium'
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
                  Select your Source (e.g. Development) and Target (e.g. Production) database connections above and click "Compare Schemas" to detect differences.
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
                          {table.status === 'identical' && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          )}
                          {table.status === 'different' && (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          )}
                          {table.status === 'only_in_source' && (
                            <PlusCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          )}
                          {table.status === 'only_in_target' && (
                            <MinusCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Table Column Diff Inspector */}
                <div className="flex-1 flex flex-col bg-panel min-h-0 overflow-y-auto p-4">
                  {selectedTable ? (
                    <div>
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

                      {/* Columns Comparison Table */}
                      <div className="border border-line rounded-lg overflow-hidden">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-black/10 dark:bg-white/5 border-b border-line font-medium text-muted">
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
                                <td className="py-2 px-3 text-text font-medium">
                                  {col.name}
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
                                    ? `${col.sourceType} ${col.sourceNullable ? 'NULL' : 'NOT NULL'}`
                                    : '-'}
                                </td>
                                <td className="py-2 px-3 text-rose-400">
                                  {col.targetType
                                    ? `${col.targetType} ${col.targetNullable ? 'NULL' : 'NOT NULL'}`
                                    : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-muted text-xs">
                      Select a table to view column differences
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Migration Script View */
              <div className="flex-1 flex flex-col p-4 bg-panel min-h-0">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-line">
                  <div className="flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-semibold text-text">
                      {activeViewTab === 'migration_up'
                        ? 'UP Migration Script (Apply to Target)'
                        : 'DOWN Migration Script (Revert Changes)'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleCopySql(
                          activeViewTab === 'migration_up'
                            ? migrationScript?.up || ''
                            : migrationScript?.down || ''
                        )
                      }
                      className="px-2.5 py-1 rounded border border-line hover:bg-white/10 text-xs font-medium text-text flex items-center gap-1.5 transition-colors"
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
                        className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm transition-colors"
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

                <div className="flex-1 bg-black/20 dark:bg-black/40 border border-line rounded-lg p-3 font-mono text-xs overflow-auto text-emerald-300 whitespace-pre">
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
