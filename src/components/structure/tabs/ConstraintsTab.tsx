import React, { useState, useMemo } from 'react';
import { ShieldAlert, Trash2, Plus, X } from 'lucide-react';
import { dbApi } from '../../../api/db';
import {
  buildAddConstraintSql,
  buildDropConstraintSql,
  type TableConstraintStructure,
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
  isDark,
  constraints,
  columns,
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
  const [newConstraintType, setNewConstraintType] = useState<'CHECK' | 'UNIQUE'>('CHECK');
  const [newConstraintExpr, setNewConstraintExpr] = useState('');
  const [newConstraintCols, setNewConstraintCols] = useState<string[]>([]);

  // Drop constraint state
  const [dropConstraintTarget, setDropConstraintTarget] = useState<TableConstraintStructure | null>(null);

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
    if (newConstraintType === 'UNIQUE' && newConstraintCols.length === 0) return '';
    try {
      return buildAddConstraintSql({
        driver,
        tableName,
        schemaName,
        name: newConstraintName.trim(),
        type: newConstraintType,
        expression: newConstraintExpr.trim(),
        columns: newConstraintCols,
      });
    } catch {
      return '';
    }
  }, [driver, tableName, schemaName, newConstraintName, newConstraintType, newConstraintExpr, newConstraintCols]);

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
        type: dropConstraintTarget.type === 'CHECK' ? 'CHECK' : 'UNIQUE',
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

  return (
    <div>
      {constraints.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400 space-y-2">
          <ShieldAlert className="w-10 h-10 opacity-30" />
          <span className="text-xs">No custom constraints defined on this table.</span>
          <button
            type="button"
            onClick={openAddConstraint}
            className="mt-2 px-3 py-1.5 text-xs rounded bg-purple-600 hover:bg-purple-500 text-white flex items-center space-x-1"
          >
            <Plus className="w-3 h-3" />
            <span>Add Constraint</span>
          </button>
        </div>
      ) : (
        <div
          className={`border rounded-lg overflow-hidden shadow-sm ${
            isDark ? 'border-gray-800 bg-gray-900/50' : 'border-gray-200 bg-white'
          }`}
        >
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr
                className={`border-b font-medium ${
                  isDark
                    ? 'bg-gray-900/90 border-gray-800 text-gray-400'
                    : 'bg-gray-100/90 border-gray-200 text-gray-600'
                }`}
              >
                <th className="py-2.5 px-3 w-12 text-center">#</th>
                <th className="py-2.5 px-3">Constraint Name</th>
                <th className="py-2.5 px-3 w-28 text-center">Type</th>
                <th className="py-2.5 px-3">Expression / Details</th>
                <th className="py-2.5 px-3 w-24 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {constraints.map((c, i) => (
                <tr
                  key={c.name}
                  data-testid={`constraint-row-${c.name}`}
                  className={`transition-colors ${
                    isDark
                      ? 'hover:bg-gray-800/40 text-gray-200'
                      : 'hover:bg-gray-50 text-gray-800 divide-gray-100'
                  }`}
                >
                  <td className="py-2 px-3 text-center text-gray-500 font-mono text-[11px]">
                    {i + 1}
                  </td>
                  <td className="py-2 px-3 font-medium flex items-center space-x-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                    <span className="font-mono text-xs">{c.name}</span>
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        c.type === 'CHECK'
                          ? 'bg-purple-950/80 text-purple-300 border border-purple-800'
                          : 'bg-blue-950/80 text-blue-300 border border-blue-800'
                      }`}
                    >
                      {c.type}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-mono text-xs text-gray-300">
                    {c.definition || (c.columns && c.columns.join(', ')) || '-'}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button
                      type="button"
                      data-testid={`drop-constraint-btn-${c.name}`}
                      onClick={() => setDropConstraintTarget(c)}
                      title="Drop Constraint"
                      className="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors"
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
          <div
            className={`w-full max-w-md rounded-lg shadow-xl border overflow-hidden ${
              isDark ? 'bg-gray-900 border-gray-700 text-gray-200' : 'bg-white border-gray-300 text-gray-900'
            }`}
          >
            <div
              className={`flex items-center justify-between px-4 py-3 border-b ${
                isDark ? 'border-gray-800 bg-gray-850' : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-semibold">Add Constraint to {tableName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="p-1 rounded text-gray-400 hover:text-gray-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddConstraintSubmit} className="p-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-medium mb-1">
                  Constraint Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  data-testid="new-constraint-name-input"
                  placeholder="e.g. chk_price_positive, uq_user_email"
                  value={newConstraintName}
                  onChange={(e) => setNewConstraintName(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded border text-xs font-mono outline-none focus:border-purple-500 ${
                    isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>

              <div>
                <label className="block font-medium mb-1">Constraint Type</label>
                <div className="flex items-center space-x-4">
                  <label className="inline-flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="constraintType"
                      value="CHECK"
                      checked={newConstraintType === 'CHECK'}
                      onChange={() => setNewConstraintType('CHECK')}
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
                      onChange={() => setNewConstraintType('UNIQUE')}
                      className="text-purple-600 focus:ring-0"
                    />
                    <span>UNIQUE Columns</span>
                  </label>
                </div>
              </div>

              {newConstraintType === 'CHECK' ? (
                <div>
                  <label className="block font-medium mb-1">
                    Check Expression <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    data-testid="new-constraint-expr-input"
                    placeholder="e.g. price > 0 AND quantity >= 0"
                    value={newConstraintExpr}
                    onChange={(e) => setNewConstraintExpr(e.target.value)}
                    className={`w-full px-2.5 py-1.5 rounded border text-xs font-mono outline-none focus:border-purple-500 ${
                      isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />
                </div>
              ) : (
                <div>
                  <label className="block font-medium mb-1">
                    Columns to Include in Unique Constraint <span className="text-red-400">*</span>
                  </label>
                  <div
                    className={`max-h-32 overflow-y-auto p-2 rounded border space-y-1 ${
                      isDark ? 'bg-gray-800/80 border-gray-700' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    {columns.map((c) => (
                      <label
                        key={c.name}
                        className="flex items-center space-x-2 py-0.5 px-1 hover:bg-gray-700/30 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
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
                        <span className="text-[10px] text-gray-500">({c.dataType})</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {addConstraintPreviewSql && (
                <div>
                  <label className="block font-medium mb-1 text-gray-400">SQL Preview</label>
                  <div
                    data-testid="add-constraint-preview-sql"
                    className="p-2 rounded bg-gray-950 border border-gray-800 font-mono text-[11px] text-purple-300 select-text break-all"
                  >
                    {addConstraintPreviewSql}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className={`px-3 py-1.5 rounded transition-colors ${
                    isDark ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
                  }`}
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
          <div
            className={`w-full max-w-sm rounded-lg shadow-xl border overflow-hidden ${
              isDark ? 'bg-gray-900 border-gray-700 text-gray-200' : 'bg-white border-gray-300 text-gray-900'
            }`}
          >
            <div className="p-4 space-y-3 text-xs">
              <div className="flex items-center space-x-2 text-red-400 font-semibold text-sm">
                <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                <h3 className="text-sm font-semibold">Drop Constraint</h3>
              </div>

              <p className="text-gray-300">
                Are you sure you want to drop constraint{' '}
                <strong className="text-white font-mono bg-red-950/60 px-1 py-0.5 rounded border border-red-900/60">
                  {dropConstraintTarget.name}
                </strong>{' '}
                from table <strong className="font-mono text-white">{tableName}</strong>?
              </p>

              <div className="p-2 rounded bg-gray-950 border border-gray-800 font-mono text-[11px] text-red-300">
                {buildDropConstraintSql({
                  tableName,
                  schemaName,
                  driver,
                  name: dropConstraintTarget.name,
                  type: dropConstraintTarget.type === 'CHECK' ? 'CHECK' : 'UNIQUE',
                })}
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDropConstraintTarget(null)}
                  className={`px-3 py-1.5 rounded transition-colors ${
                    isDark ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
                  }`}
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
