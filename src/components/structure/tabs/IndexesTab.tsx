import React, { useState, useMemo } from 'react';
import { Layers, Key, Trash2, Plus, X, ShieldAlert } from 'lucide-react';
import { dbApi } from '../../../api/db';
import { buildDropIndexSql, type TableIndexStructure } from '../tableManagementHelpers';
import { buildAdvancedCreateIndexSql, type IndexType } from '../../../api/performanceHelpers';
import type { TableColumnStructure } from '../tableStructureHelpers';

export interface IndexesTabProps {
  tabId: string;
  tableName: string;
  schemaName?: string;
  driver?: string;
  isDark: boolean;
  indexes: TableIndexStructure[];
  columns: TableColumnStructure[];
  filterText?: string;
  loadStructure: () => Promise<void>;
  showStatus: (type: 'success' | 'error', text: string) => void;
  onStructureChanged?: () => void;
  isAddModalOpen?: boolean;
  onCloseAddModal?: () => void;
  onOpenAddModal?: () => void;
}

export const IndexesTab: React.FC<IndexesTabProps> = ({
  tabId,
  tableName,
  schemaName,
  driver = 'postgres',
  isDark: _isDark,
  indexes,
  columns,
  filterText,
  loadStructure,
  showStatus,
  onStructureChanged,
  isAddModalOpen: controlledAddOpen,
  onCloseAddModal,
  onOpenAddModal,
}) => {
  const [internalAddOpen, setInternalAddOpen] = useState(false);
  const isAddOpen = controlledAddOpen !== undefined ? controlledAddOpen : internalAddOpen;
  const setAddOpen = (open: boolean) => {
    if (controlledAddOpen !== undefined && onCloseAddModal && !open) {
      onCloseAddModal();
    } else if (controlledAddOpen !== undefined && onOpenAddModal && open) {
      onOpenAddModal();
    } else {
      setInternalAddOpen(open);
    }
  };

  const [submitting, setSubmitting] = useState(false);

  // Add index form states
  const [newIndexName, setNewIndexName] = useState('');
  const [newIndexCols, setNewIndexCols] = useState<string[]>([]);
  const [newIndexUnique, setNewIndexUnique] = useState(false);
  const [newIndexType, setNewIndexType] = useState<IndexType>('BTREE');

  // Drop index state
  const [dropIndexTarget, setDropIndexTarget] = useState<TableIndexStructure | null>(null);

  // Initialize form when opening
  const openAddIndex = () => {
    const defaultCol = columns[0]?.name || '';
    setNewIndexName(`idx_${tableName}_${defaultCol || 'col'}`);
    setNewIndexCols(defaultCol ? [defaultCol] : []);
    setNewIndexUnique(false);
    setNewIndexType('BTREE');
    setAddOpen(true);
  };

  React.useEffect(() => {
    if (isAddOpen) {
      const defaultCol = columns[0]?.name || '';
      setNewIndexName((prev) => (prev ? prev : `idx_${tableName}_${defaultCol || 'col'}`));
      setNewIndexCols((prev) => (prev.length > 0 ? prev : (defaultCol ? [defaultCol] : [])));
    }
  }, [isAddOpen, columns, tableName]);

  // Preview SQL for Add Index
  const addIndexPreviewSql = useMemo(() => {
    if (!newIndexName.trim() || newIndexCols.length === 0) return '';
    try {
      return buildAdvancedCreateIndexSql({
        driver,
        tableName,
        schemaName,
        indexName: newIndexName.trim(),
        columns: newIndexCols,
        isUnique: newIndexUnique,
        indexType: newIndexType,
      });
    } catch {
      return '';
    }
  }, [driver, tableName, schemaName, newIndexName, newIndexCols, newIndexUnique, newIndexType]);

  // Handle Add Index
  const handleAddIndexSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIndexName.trim() || newIndexCols.length === 0) return;

    setSubmitting(true);
    try {
      const sql = buildAdvancedCreateIndexSql({
        driver,
        tableName,
        schemaName,
        indexName: newIndexName.trim(),
        columns: newIndexCols,
        isUnique: newIndexUnique,
        indexType: newIndexType,
      });

      await dbApi.executeQuery(tabId, sql);
      setAddOpen(false);
      showStatus('success', `Created index '${newIndexName.trim()}' successfully`);
      await loadStructure();
      onStructureChanged?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus('error', `Failed to create index: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Drop Index
  const handleDropIndexConfirm = async () => {
    if (!dropIndexTarget) return;
    setSubmitting(true);
    try {
      const sql = buildDropIndexSql({
        tableName,
        schemaName,
        driver,
        indexName: dropIndexTarget.name,
      });

      await dbApi.executeQuery(tabId, sql);
      setDropIndexTarget(null);
      showStatus('success', `Dropped index '${dropIndexTarget.name}' successfully`);
      await loadStructure();
      onStructureChanged?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus('error', `Failed to drop index: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredIndexes = useMemo(() => {
    if (!filterText?.trim()) return indexes;
    const q = filterText.toLowerCase();
    return indexes.filter(
      (idx) =>
        idx.name.toLowerCase().includes(q) ||
        idx.columns.some((c) => c.toLowerCase().includes(q)) ||
        (idx.indexType && idx.indexType.toLowerCase().includes(q))
    );
  }, [indexes, filterText]);

  return (
    <div>
      {indexes.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 border border-dashed rounded-lg text-center max-w-md mx-auto my-6 border-gray-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/40">
          <div className="p-3 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/40 text-blue-600 dark:text-blue-400 mb-3">
            <Layers className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100 mb-1">
            No Indexes Configured
          </h3>
          <p className="text-xs text-gray-500 dark:text-zinc-400 mb-4 max-w-xs">
            Indexes speed up database query performance on frequently queried columns.
          </p>
          <button
            type="button"
            onClick={openAddIndex}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-500 text-white flex items-center space-x-1.5 shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Create Index</span>
          </button>
        </div>
      ) : filteredIndexes.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-gray-400 space-y-2">
          <span className="text-xs">No indexes match &quot;{filterText}&quot;</span>
        </div>
      ) : (
        <div className="border border-line bg-panel rounded-lg overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-line bg-sidebar text-muted font-medium">
                <th className="py-2.5 px-3 w-12 text-center">#</th>
                <th className="py-2.5 px-3">Index Name</th>
                <th className="py-2.5 px-3">Indexed Columns</th>
                <th className="py-2.5 px-3 w-28 text-center">Type</th>
                <th className="py-2.5 px-3 w-28 text-center">Attributes</th>
                <th className="py-2.5 px-3 w-24 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-grid">
              {filteredIndexes.map((idx, i) => (
                <tr
                  key={idx.name}
                  data-testid={`index-row-${idx.name}`}
                  className="transition-colors hover:bg-black/5 dark:hover:bg-white/5 text-text"
                >
                  <td className="py-2 px-3 text-center text-muted font-mono text-[11px]">
                    {i + 1}
                  </td>

                  <td className="py-2 px-3 font-medium flex items-center space-x-1.5">
                    {idx.isPrimary ? (
                      <span title="Primary Key Index">
                        <Key className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                      </span>
                    ) : (
                      <Layers className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    )}
                    <span className="font-mono text-xs">{idx.name}</span>
                  </td>

                  <td className="py-2 px-3 font-mono text-xs text-text">
                    {idx.columns.join(', ')}
                  </td>

                  <td className="py-2 px-3 text-center">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-sidebar text-text border border-line">
                      {idx.indexType || 'BTREE'}
                    </span>
                  </td>

                  <td className="py-2 px-3 text-center space-x-1">
                    {idx.isPrimary && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/40 shadow-2xs">
                        PK
                      </span>
                    )}
                    {idx.isUnique && !idx.isPrimary && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-300 border border-blue-500/40 shadow-2xs">
                        UNIQUE
                      </span>
                    )}
                  </td>

                  <td className="py-2 px-3 text-right">
                    {!idx.isPrimary && (
                      <button
                        type="button"
                        data-testid={`drop-index-btn-${idx.name}`}
                        onClick={() => setDropIndexTarget(idx)}
                        title="Drop Index"
                        className="p-1 rounded text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Index Modal */}
      {isAddOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-lg shadow-xl border border-line bg-panel text-text overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-line bg-sidebar shrink-0">
              <div className="flex items-center space-x-2">
                <Plus className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-semibold">Add New Index</h3>
              </div>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="p-1 rounded text-muted hover:text-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddIndexSubmit} className="p-5 space-y-4 text-xs overflow-y-auto">
              <div>
                <label className="block text-muted mb-1 font-medium">
                  Index Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. idx_users_email"
                  value={newIndexName}
                  onChange={(e) => setNewIndexName(e.target.value)}
                  data-testid="new-index-name-input"
                  className="w-full h-9 px-3 rounded border border-line bg-grid text-text font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-muted mb-1 font-medium">
                  Indexed Columns <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border rounded border-line bg-sidebar">
                  {columns.map((col) => {
                    const isSelected = newIndexCols.includes(col.name);
                    return (
                      <label
                        key={col.name}
                        className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded cursor-pointer border text-xs transition-colors ${
                          isSelected
                            ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/50 font-semibold'
                            : 'bg-panel text-muted border-line hover:text-text'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewIndexCols((prev) => [...prev, col.name]);
                            } else {
                              setNewIndexCols((prev) => prev.filter((c) => c !== col.name));
                            }
                          }}
                          data-testid={`new-index-col-checkbox-${col.name}`}
                          className="sr-only"
                        />
                        <span>{col.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-muted mb-1 font-medium">Index Type / Structure</label>
                <select
                  value={newIndexType}
                  onChange={(e) => setNewIndexType(e.target.value as IndexType)}
                  data-testid="new-index-type-select"
                  className="w-full h-9 px-3 rounded border border-line bg-grid text-text focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                >
                  <option value="BTREE">B-Tree (Balanced Tree - General Purpose)</option>
                  <option value="HASH">Hash (Hash Table - Equality lookups O(1))</option>
                  <option value="GIN">GIN (Generalized Inverted Index for JSON/Arrays)</option>
                  <option value="FULLTEXT">Full-Text (Search title, description, content)</option>
                </select>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="new-index-unique"
                  checked={newIndexUnique}
                  onChange={(e) => setNewIndexUnique(e.target.checked)}
                  data-testid="new-index-unique-checkbox"
                  className="rounded border-line bg-grid text-blue-500 focus:ring-0"
                />
                <label htmlFor="new-index-unique" className="text-text select-none cursor-pointer">
                  Unique Index (disallow duplicate values)
                </label>
              </div>

              {addIndexPreviewSql && (
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    SQL Preview
                  </div>
                  <pre
                    data-testid="add-index-preview-sql"
                    className="p-2 rounded font-mono text-[11px] overflow-x-auto border border-line bg-sidebar text-emerald-600 dark:text-emerald-300"
                  >
                    {addIndexPreviewSql}
                  </pre>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="px-3 py-1.5 rounded transition-colors text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !newIndexName.trim() || newIndexCols.length === 0}
                  data-testid="confirm-add-index-btn"
                  className="px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Creating...' : 'Create Index'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drop Index Confirmation Modal */}
      {dropIndexTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm rounded-lg shadow-xl border border-line bg-panel text-text overflow-hidden">
            <div className="p-4 space-y-3 text-xs">
              <div className="flex items-center space-x-2 text-red-500 font-semibold text-sm">
                <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                <h3 className="text-sm font-semibold">Drop Index</h3>
              </div>

              <p className="text-muted">
                Are you sure you want to drop index{' '}
                <strong className="text-red-500 font-mono bg-red-500/10 px-1 py-0.5 rounded border border-red-500/30">
                  {dropIndexTarget.name}
                </strong>{' '}
                from table <strong className="font-mono text-text">{tableName}</strong>?
              </p>

              <div className="p-2 rounded bg-sidebar border border-line font-mono text-[11px] text-red-500">
                {buildDropIndexSql({
                  tableName,
                  schemaName,
                  driver,
                  indexName: dropIndexTarget.name,
                })}
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDropIndexTarget(null)}
                  className="px-3 py-1.5 rounded transition-colors text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="confirm-drop-index-btn"
                  onClick={handleDropIndexConfirm}
                  disabled={submitting}
                  className="px-3.5 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white font-medium shadow-sm transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Dropping...' : 'Drop Index'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
