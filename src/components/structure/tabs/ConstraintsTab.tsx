import React, { useState, useMemo } from 'react';
import { ShieldAlert, Trash2, Plus, X } from 'lucide-react';
import { dbApi } from '../../../api/db';
import {
  buildAddConstraintSql,
  buildDropConstraintSql,
  type TableConstraintStructure,
  type TableIndexStructure,
  type TableTriggerDef,
} from '../tableManagementHelpers';
import type { TableColumnStructure } from '../tableStructureHelpers';

export interface ConstraintsTabProps {
  tabId: string;
  tableName: string;
  schemaName?: string;
  driver?: string;
  isDark: boolean;
  constraints: TableConstraintStructure[];
  columns: TableColumnStructure[];
  indexes?: TableIndexStructure[];
  triggers?: TableTriggerDef[];
  filterText?: string;
  loadStructure: () => Promise<void>;
  showStatus: (type: 'success' | 'error', text: string) => void;
  onStructureChanged?: () => void;
  isAddModalOpen?: boolean;
  onCloseAddModal?: () => void;
  onOpenAddModal?: () => void;
}

export const ConstraintsTab: React.FC<ConstraintsTabProps> = ({
  tabId,
  tableName,
  schemaName,
  driver = 'postgres',
  isDark: _isDark,
  constraints,
  columns,
  indexes = [],
  triggers = [],
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

  // Add constraint form states
  const [newConstraintName, setNewConstraintName] = useState('');
  const [newConstraintType, setNewConstraintType] = useState<'CHECK' | 'UNIQUE' | 'PRIMARY KEY'>('CHECK');
  const [newConstraintExpr, setNewConstraintExpr] = useState('');
  const [newConstraintCols, setNewConstraintCols] = useState<string[]>([]);

  // Drop constraint state
  const [dropConstraintTarget, setDropConstraintTarget] = useState<TableConstraintStructure | null>(null);

  const existingSqliteColumns = useMemo(
    () =>
      columns.map((c) => ({
        name: c.name,
        type: c.dataType,
        nullable: c.isNullable,
        defaultValue: c.defaultValue,
        isPrimaryKey: c.isPrimaryKey,
        isUnique: c.isUnique,
        isAutoIncrement: c.isAutoIncrement,
        checkConstraint: c.checkConstraint,
        collation: c.collation,
      })),
    [columns]
  );

  const handleConstraintTypeChange = (type: 'CHECK' | 'UNIQUE' | 'PRIMARY KEY') => {
    setNewConstraintType(type);
    if (!newConstraintName.trim() || /^(chk|uq|pk)_/.test(newConstraintName.trim())) {
      if (type === 'PRIMARY KEY') setNewConstraintName(`pk_${tableName}`);
      else if (type === 'UNIQUE') setNewConstraintName(`uq_${tableName}`);
      else setNewConstraintName(`chk_${tableName}_valid`);
    }
  };

  const openAddConstraint = () => {
    const defaultCol = columns[0]?.name || '';
    setNewConstraintName(`chk_${tableName}_valid`);
    setNewConstraintType('CHECK');
    setNewConstraintExpr(`${defaultCol} IS NOT NULL`);
    setNewConstraintCols(defaultCol ? [defaultCol] : []);
    setAddOpen(true);
  };

  // Preview SQL for Add Constraint
  const addConstraintPreviewSql = useMemo(() => {
    if (!newConstraintName.trim()) return '';
    if (newConstraintType === 'CHECK' && !newConstraintExpr.trim()) return '';
    if ((newConstraintType === 'UNIQUE' || newConstraintType === 'PRIMARY KEY') && newConstraintCols.length === 0) return '';
    try {
      return buildAddConstraintSql({
        driver,
        tableName,
        schemaName,
        name: newConstraintName.trim(),
        type: newConstraintType,
        expression: newConstraintExpr.trim(),
        columns: newConstraintCols,
        existingColumns: existingSqliteColumns,
        existingIndexes: indexes,
        existingTriggers: triggers,
      });
    } catch {
      return '';
    }
  }, [driver, tableName, schemaName, newConstraintName, newConstraintType, newConstraintExpr, newConstraintCols, existingSqliteColumns, indexes, triggers]);

  // Handle Add Constraint
  const handleAddConstraintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConstraintName.trim()) return;

    setSubmitting(true);
    try {
      const sql = buildAddConstraintSql({
        driver,
        tableName,
        schemaName,
        name: newConstraintName.trim(),
        type: newConstraintType,
        expression: newConstraintExpr.trim(),
        columns: newConstraintCols,
        existingColumns: existingSqliteColumns,
        existingIndexes: indexes,
        existingTriggers: triggers,
      });

      await dbApi.executeQuery(tabId, sql);
      setAddOpen(false);
      setNewConstraintName('');
      setNewConstraintExpr('');
      setNewConstraintCols([]);
      showStatus('success', `Created constraint '${newConstraintName.trim()}' successfully`);
      await loadStructure();
      onStructureChanged?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus('error', `Failed to create constraint: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Drop Constraint
  const handleDropConstraintConfirm = async () => {
    if (!dropConstraintTarget) return;
    setSubmitting(true);
    try {
      const sql = buildDropConstraintSql({
        tableName,
        schemaName,
        driver,
        name: dropConstraintTarget.name,
        type: dropConstraintTarget.type,
        existingColumns: existingSqliteColumns,
        existingIndexes: indexes,
        existingTriggers: triggers,
      });
      await dbApi.executeQuery(tabId, sql);
      setDropConstraintTarget(null);
      showStatus('success', `Dropped constraint '${dropConstraintTarget.name}' successfully`);
      await loadStructure();
      onStructureChanged?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus('error', `Failed to drop constraint: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredConstraints = useMemo(() => {
    if (!filterText?.trim()) return constraints;
    const q = filterText.toLowerCase();
    return constraints.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.type.toLowerCase().includes(q) ||
        (c.definition && c.definition.toLowerCase().includes(q)) ||
        (c.columns && c.columns.some((col) => col.toLowerCase().includes(q)))
    );
  }, [constraints, filterText]);

  return (
    <div>
      {constraints.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 border border-dashed rounded-lg text-center max-w-md mx-auto my-6 border-gray-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/40">
          <div className="p-3 rounded-full bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/40 text-purple-600 dark:text-purple-400 mb-3">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100 mb-1">
            No Custom Constraints
          </h3>
          <p className="text-xs text-gray-500 dark:text-zinc-400 mb-4 max-w-xs">
            Constraints ensure valid data entries by enforcing check expressions on rows.
          </p>
          <button
            type="button"
            onClick={openAddConstraint}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-500 text-white flex items-center space-x-1.5 shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Add Constraint</span>
          </button>
        </div>
      ) : filteredConstraints.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-gray-400 space-y-2">
          <span className="text-xs">No constraints match &quot;{filterText}&quot;</span>
        </div>
      ) : (
        <div className="border border-line bg-panel rounded-lg overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-line bg-sidebar text-muted font-medium">
                <th className="py-2.5 px-3 w-12 text-center">#</th>
                <th className="py-2.5 px-3">Constraint Name</th>
                <th className="py-2.5 px-3 w-28 text-center">Type</th>
                <th className="py-2.5 px-3">Expression / Details</th>
                <th className="py-2.5 px-3 w-24 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-grid">
              {filteredConstraints.map((c, i) => (
                <tr
                  key={c.name}
                  data-testid={`constraint-row-${c.name}`}
                  className="transition-colors hover:bg-black/5 dark:hover:bg-white/5 text-text"
                >
                  <td className="py-2 px-3 text-center text-muted font-mono text-[11px]">
                    {i + 1}
                  </td>
                  <td className="py-2 px-3 font-medium flex items-center space-x-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                    <span className="font-mono text-xs">{c.name}</span>
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                        c.type === 'PRIMARY KEY'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/30'
                          : c.type === 'CHECK'
                          ? 'bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/30'
                          : 'bg-blue-500/10 text-blue-600 dark:text-blue-300 border-blue-500/30'
                      }`}
                    >
                      {c.type}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-mono text-xs text-text">
                    {c.definition || (c.columns && c.columns.join(', ')) || '-'}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button
                      type="button"
                      data-testid={`drop-constraint-btn-${c.name}`}
                      onClick={() => setDropConstraintTarget(c)}
                      title="Drop Constraint"
                      className="p-1 rounded text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Constraint Modal */}
      {isAddOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-lg shadow-xl border border-line bg-panel text-text overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-line bg-sidebar shrink-0">
              <div className="flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 text-purple-500" />
                <h3 className="text-sm font-semibold">Add Constraint to {tableName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="p-1 rounded text-muted hover:text-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddConstraintSubmit} className="p-5 space-y-4 text-xs overflow-y-auto">
              <div>
                <label className="block font-medium mb-1">
                  Constraint Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  data-testid="new-constraint-name-input"
                  placeholder="e.g. pk_users, chk_price_positive, uq_user_email"
                  value={newConstraintName}
                  onChange={(e) => setNewConstraintName(e.target.value)}
                  className="w-full h-9 px-3 rounded border border-line bg-grid text-text text-xs font-mono outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block font-medium mb-1.5">Constraint Type</label>
                <div className="flex items-center space-x-5">
                  <label className="inline-flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="constraintType"
                      value="PRIMARY KEY"
                      data-testid="constraint-type-pk-radio"
                      checked={newConstraintType === 'PRIMARY KEY'}
                      onChange={() => handleConstraintTypeChange('PRIMARY KEY')}
                      className="text-amber-500 focus:ring-0"
                    />
                    <span className="font-medium">PRIMARY KEY</span>
                  </label>
                  <label className="inline-flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="constraintType"
                      value="CHECK"
                      checked={newConstraintType === 'CHECK'}
                      onChange={() => handleConstraintTypeChange('CHECK')}
                      className="text-purple-600 focus:ring-0"
                    />
                    <span>CHECK Expression</span>
                  </label>
                  <label className="inline-flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="constraintType"
                      value="UNIQUE"
                      checked={newConstraintType === 'UNIQUE'}
                      onChange={() => handleConstraintTypeChange('UNIQUE')}
                      className="text-purple-600 focus:ring-0"
                    />
                    <span>UNIQUE Columns</span>
                  </label>
                </div>
              </div>

              {newConstraintType === 'CHECK' ? (
                <div>
                  <label className="block font-medium mb-1">
                    Check Expression <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    data-testid="new-constraint-expr-input"
                    placeholder="e.g. price > 0 AND quantity >= 0"
                    value={newConstraintExpr}
                    onChange={(e) => setNewConstraintExpr(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-line bg-grid text-text text-xs font-mono outline-none focus:border-purple-500"
                  />
                </div>
              ) : (
                <div>
                  <label className="block font-medium mb-1">
                    {newConstraintType === 'PRIMARY KEY'
                      ? 'Columns to Include in Primary Key'
                      : 'Columns to Include in Unique Constraint'}{' '}
                    <span className="text-red-500">*</span>
                  </label>
                  <div className="max-h-40 overflow-y-auto p-2.5 rounded border border-line bg-sidebar space-y-1">
                    {columns.map((c) => (
                      <label
                        key={c.name}
                        className="flex items-center space-x-2 py-1 px-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          data-testid={`constraint-col-checkbox-${c.name}`}
                          checked={newConstraintCols.includes(c.name)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewConstraintCols([...newConstraintCols, c.name]);
                            } else {
                              setNewConstraintCols(newConstraintCols.filter((col) => col !== c.name));
                            }
                          }}
                          className="rounded text-purple-600 focus:ring-0"
                        />
                        <span className="font-mono text-xs">{c.name}</span>
                        <span className="text-[10px] text-muted">({c.dataType})</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {addConstraintPreviewSql && (
                <div>
                  <label className="block font-medium mb-1 text-muted">SQL Preview</label>
                  <div
                    data-testid="add-constraint-preview-sql"
                    className="p-2 rounded bg-sidebar border border-line font-mono text-[11px] text-purple-600 dark:text-purple-300 select-text break-all"
                  >
                    {addConstraintPreviewSql}
                  </div>
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
                  data-testid="confirm-add-constraint-btn"
                  disabled={
                    submitting ||
                    !newConstraintName.trim() ||
                    (newConstraintType === 'CHECK' ? !newConstraintExpr.trim() : newConstraintCols.length === 0)
                  }
                  className="px-3.5 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-medium shadow-sm transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Constraint'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drop Constraint Confirmation Modal */}
      {dropConstraintTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm rounded-lg shadow-xl border border-line bg-panel text-text overflow-hidden">
            <div className="p-4 space-y-3 text-xs">
              <div className="flex items-center space-x-2 text-red-500 font-semibold text-sm">
                <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                <h3 className="text-sm font-semibold">Drop Constraint</h3>
              </div>

              <p className="text-muted">
                Are you sure you want to drop constraint{' '}
                <strong className="text-red-500 font-mono bg-red-500/10 px-1 py-0.5 rounded border border-red-500/30">
                  {dropConstraintTarget.name}
                </strong>{' '}
                from table <strong className="font-mono text-text">{tableName}</strong>?
              </p>

              <div className="p-2 rounded bg-sidebar border border-line font-mono text-[11px] text-red-500 whitespace-pre-wrap break-all">
                {buildDropConstraintSql({
                  tableName,
                  schemaName,
                  driver,
                  name: dropConstraintTarget.name,
                  type: dropConstraintTarget.type,
                  existingColumns: existingSqliteColumns,
                  existingIndexes: indexes,
                  existingTriggers: triggers,
                })}
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDropConstraintTarget(null)}
                  className="px-3 py-1.5 rounded transition-colors text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="confirm-drop-constraint-btn"
                  onClick={handleDropConstraintConfirm}
                  disabled={submitting}
                  className="px-3.5 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white font-medium shadow-sm transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Dropping...' : 'Drop Constraint'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
