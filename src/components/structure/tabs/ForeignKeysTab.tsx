import React, { useState, useMemo } from 'react';
import { Link2, Trash2, Plus, X, ShieldAlert } from 'lucide-react';
import { dbApi } from '../../../api/db';
import {
  buildAddForeignKeySql,
  buildDropForeignKeySql,
  type TableForeignKeyStructure,
  type TableIndexStructure,
} from '../tableManagementHelpers';
import type { TableColumnStructure } from '../tableStructureHelpers';
import type { TableTriggerDef } from '../../../api/queryBuilder';

export interface ForeignKeysTabProps {
  tabId: string;
  tableName: string;
  schemaName?: string;
  driver?: string;
  isDark: boolean;
  foreignKeys: TableForeignKeyStructure[];
  columns: TableColumnStructure[];
  indexes: TableIndexStructure[];
  triggers: TableTriggerDef[];
  tableDdl: string | null;
  filterText?: string;
  loadStructure: () => Promise<void>;
  showStatus: (type: 'success' | 'error', text: string) => void;
  onStructureChanged?: () => void;
  isAddModalOpen?: boolean;
  onCloseAddModal?: () => void;
  onOpenAddModal?: () => void;
}

export const ForeignKeysTab: React.FC<ForeignKeysTabProps> = ({
  tabId,
  tableName,
  schemaName,
  driver = 'postgres',
  isDark,
  foreignKeys,
  columns,
  indexes,
  triggers,
  tableDdl,
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

  // Add FK form states
  const [newFkName, setNewFkName] = useState('');
  const [newFkCol, setNewFkCol] = useState('');
  const [newFkForeignTable, setNewFkForeignTable] = useState('');
  const [newFkForeignCol, setNewFkForeignCol] = useState('id');
  const [newFkOnDelete, setNewFkOnDelete] = useState('NO ACTION');
  const [newFkOnUpdate, setNewFkOnUpdate] = useState('NO ACTION');

  // Drop FK state
  const [dropFkTarget, setDropFkTarget] = useState<TableForeignKeyStructure | null>(null);

  const openAddFk = () => {
    const defaultCol = columns[0]?.name || '';
    setNewFkName(`fk_${tableName}_${defaultCol || 'col'}`);
    setNewFkCol(defaultCol);
    setNewFkForeignTable('');
    setNewFkForeignCol('id');
    setNewFkOnDelete('NO ACTION');
    setNewFkOnUpdate('NO ACTION');
    setAddOpen(true);
  };

  // Preview SQL for Add Foreign Key
  const addFkPreviewSql = useMemo(() => {
    if (!newFkCol || !newFkForeignTable.trim() || !newFkForeignCol.trim()) return '';
    try {
      return buildAddForeignKeySql({
        driver,
        tableName,
        schemaName,
        constraintName: newFkName.trim() || undefined,
        columns: [newFkCol],
        foreignTable: newFkForeignTable.trim(),
        foreignColumns: [newFkForeignCol.trim()],
        onDelete: newFkOnDelete,
        onUpdate: newFkOnUpdate,
        existingColumns: columns.map((c) => ({
          name: c.name,
          type: c.dataType,
          nullable: c.isNullable,
          isPrimaryKey: c.isPrimaryKey,
          defaultValue: c.defaultValue,
          isUnique: c.isUnique,
          checkConstraint: c.checkConstraint,
          isAutoIncrement: c.isAutoIncrement,
          collation: c.collation,
        })),
        originalDdl: tableDdl ?? undefined,
        existingIndexes: indexes,
        existingTriggers: triggers,
      });
    } catch {
      return '';
    }
  }, [
    driver,
    tableName,
    schemaName,
    newFkName,
    newFkCol,
    newFkForeignTable,
    newFkForeignCol,
    newFkOnDelete,
    newFkOnUpdate,
    columns,
    tableDdl,
    indexes,
    triggers,
  ]);

  // Preview SQL for Drop Foreign Key
  const dropFkPreviewSql = useMemo(() => {
    if (!dropFkTarget) return '';
    try {
      return buildDropForeignKeySql({
        driver,
        tableName,
        schemaName,
        constraintName: dropFkTarget.name,
        existingColumns: columns.map((c) => ({
          name: c.name,
          type: c.dataType,
          nullable: c.isNullable,
          isPrimaryKey: c.isPrimaryKey,
          defaultValue: c.defaultValue,
          isUnique: c.isUnique,
          checkConstraint: c.checkConstraint,
          isAutoIncrement: c.isAutoIncrement,
          collation: c.collation,
        })),
        originalDdl: tableDdl ?? undefined,
        existingIndexes: indexes,
        existingTriggers: triggers,
        remainingForeignKeys: foreignKeys.filter((fk) => fk.name !== dropFkTarget.name),
      });
    } catch {
      return '';
    }
  }, [driver, tableName, schemaName, dropFkTarget, columns, tableDdl, indexes, triggers, foreignKeys]);

  // Handle Add FK
  const handleAddFkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFkCol || !newFkForeignTable.trim() || !newFkForeignCol.trim()) return;

    setSubmitting(true);
    try {
      const sql = buildAddForeignKeySql({
        driver,
        tableName,
        schemaName,
        constraintName: newFkName.trim() || undefined,
        columns: [newFkCol],
        foreignTable: newFkForeignTable.trim(),
        foreignColumns: [newFkForeignCol.trim()],
        onDelete: newFkOnDelete,
        onUpdate: newFkOnUpdate,
        existingColumns: columns.map((c) => ({
          name: c.name,
          type: c.dataType,
          nullable: c.isNullable,
          isPrimaryKey: c.isPrimaryKey,
          defaultValue: c.defaultValue,
          isUnique: c.isUnique,
          checkConstraint: c.checkConstraint,
          isAutoIncrement: c.isAutoIncrement,
          collation: c.collation,
        })),
        originalDdl: tableDdl ?? undefined,
        existingIndexes: indexes,
        existingTriggers: triggers,
      });

      await dbApi.executeQuery(tabId, sql);
      setAddOpen(false);
      setNewFkName('');
      setNewFkCol('');
      setNewFkForeignTable('');
      setNewFkForeignCol('id');
      showStatus('success', `Created foreign key on '${newFkCol}' successfully`);
      await loadStructure();
      onStructureChanged?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus('error', `Failed to create foreign key: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Drop FK
  const handleDropFkConfirm = async () => {
    if (!dropFkTarget) return;
    setSubmitting(true);
    try {
      const sql = buildDropForeignKeySql({
        driver,
        tableName,
        schemaName,
        constraintName: dropFkTarget.name,
        existingColumns: columns.map((c) => ({
          name: c.name,
          type: c.dataType,
          nullable: c.isNullable,
          isPrimaryKey: c.isPrimaryKey,
          defaultValue: c.defaultValue,
          isUnique: c.isUnique,
          checkConstraint: c.checkConstraint,
          isAutoIncrement: c.isAutoIncrement,
          collation: c.collation,
        })),
        originalDdl: tableDdl ?? undefined,
        existingIndexes: indexes,
        existingTriggers: triggers,
        remainingForeignKeys: foreignKeys.filter((fk) => fk.name !== dropFkTarget.name),
      });
      await dbApi.executeQuery(tabId, sql);
      setDropFkTarget(null);
      showStatus('success', `Dropped foreign key '${dropFkTarget.name}' successfully`);
      await loadStructure();
      onStructureChanged?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus('error', `Failed to drop foreign key: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredForeignKeys = useMemo(() => {
    if (!filterText?.trim()) return foreignKeys;
    const q = filterText.toLowerCase();
    return foreignKeys.filter(
      (fk) =>
        fk.name.toLowerCase().includes(q) ||
        fk.foreignTableName.toLowerCase().includes(q) ||
        fk.columnNames.some((c) => c.toLowerCase().includes(q)) ||
        fk.foreignColumnNames.some((c) => c.toLowerCase().includes(q))
    );
  }, [foreignKeys, filterText]);

  return (
    <div>
      {foreignKeys.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 border border-dashed rounded-lg text-center max-w-md mx-auto my-6 border-gray-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/40">
          <div className="p-3 rounded-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/40 text-indigo-600 dark:text-indigo-400 mb-3">
            <Link2 className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100 mb-1">
            No Foreign Keys Defined
          </h3>
          <p className="text-xs text-gray-500 dark:text-zinc-400 mb-4 max-w-xs">
            Foreign keys enforce referential integrity between tables in your database schema.
          </p>
          <button
            type="button"
            onClick={openAddFk}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-500 text-white flex items-center space-x-1.5 shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Add Foreign Key</span>
          </button>
        </div>
      ) : filteredForeignKeys.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-gray-400 space-y-2">
          <span className="text-xs">No foreign keys match &quot;{filterText}&quot;</span>
        </div>
      ) : (
        <div
          className={`border rounded-lg overflow-hidden shadow-xs ${
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
                <th className="py-2.5 px-3">Local Column</th>
                <th className="py-2.5 px-3">Referenced Table & Column</th>
                <th className="py-2.5 px-3 w-28 text-center">On Delete</th>
                <th className="py-2.5 px-3 w-28 text-center">On Update</th>
                <th className="py-2.5 px-3 w-24 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-gray-800' : 'divide-gray-100'}`}>
              {filteredForeignKeys.map((fk, i) => (
                <tr
                  key={fk.name}
                  data-testid={`fk-row-${fk.name}`}
                  className={`transition-colors ${
                    isDark
                      ? 'hover:bg-gray-800/40 text-gray-200'
                      : 'hover:bg-gray-50/80 text-gray-900'
                  }`}
                >
                  <td className="py-2 px-3 text-center text-gray-400 dark:text-gray-500 font-mono text-[11px]">
                    {i + 1}
                  </td>
                  <td className="py-2 px-3 font-medium flex items-center space-x-1.5">
                    <Link2 className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                    <span className="font-mono text-xs">{fk.name}</span>
                  </td>
                  <td className="py-2 px-3 font-mono text-xs text-blue-600 dark:text-blue-400 font-medium">
                    {fk.columnNames.join(', ')}
                  </td>
                  <td className="py-2 px-3 font-mono text-xs text-gray-700 dark:text-gray-300">
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400 mr-1">
                      {fk.foreignTableName}
                    </span>
                    <span>({fk.foreignColumnNames.join(', ')})</span>
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                      {fk.onDelete || 'NO ACTION'}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                      {fk.onUpdate || 'NO ACTION'}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button
                      type="button"
                      data-testid={`drop-fk-btn-${fk.name}`}
                      onClick={() => setDropFkTarget(fk)}
                      title="Drop Foreign Key"
                      className="p-1 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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

      {/* Add Foreign Key Modal */}
      {isAddOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <div
            className={`w-full max-w-lg rounded-lg shadow-xl border overflow-hidden ${
              isDark ? 'bg-gray-900 border-gray-700 text-gray-200' : 'bg-white border-gray-300 text-gray-900'
            }`}
          >
            <div
              className={`flex items-center justify-between px-4 py-3 border-b ${
                isDark ? 'border-gray-800 bg-gray-850' : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Link2 className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold">Add Foreign Key to {tableName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="p-1 rounded text-gray-400 hover:text-gray-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddFkSubmit} className="p-4 space-y-3.5 text-xs">
              {driver?.toLowerCase().includes('sqlite') && (
                <div data-testid="sqlite-fk-rebuild-notice" className="p-2.5 rounded bg-blue-950/40 border border-blue-800 text-[11px] text-blue-200">
                  ℹ️ <strong>SQLite Table Rebuild:</strong> SQLite does not support <code className="font-mono">ALTER TABLE ADD CONSTRAINT</code>. A safe table rebuild migration will be executed to recreate the table with the new foreign key.
                </div>
              )}
              <div>
                <label className="block font-medium mb-1">Constraint Name</label>
                <input
                  type="text"
                  data-testid="new-fk-name-input"
                  placeholder={`fk_${tableName}_col`}
                  value={newFkName}
                  onChange={(e) => setNewFkName(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded border text-xs font-mono outline-none focus:border-blue-500 ${
                    isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">
                    Local Column <span className="text-red-400">*</span>
                  </label>
                  <select
                    required
                    data-testid="new-fk-col-select"
                    value={newFkCol}
                    onChange={(e) => setNewFkCol(e.target.value)}
                    className={`w-full px-2.5 py-1.5 rounded border text-xs font-mono outline-none focus:border-blue-500 ${
                      isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    <option value="">Select column...</option>
                    {columns.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} ({c.dataType})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium mb-1">
                    Referenced Table <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    data-testid="new-fk-target-table-input"
                    placeholder="e.g. users, customers"
                    value={newFkForeignTable}
                    onChange={(e) => setNewFkForeignTable(e.target.value)}
                    className={`w-full px-2.5 py-1.5 rounded border text-xs font-mono outline-none focus:border-blue-500 ${
                      isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1">
                  Referenced Column <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  data-testid="new-fk-target-col-input"
                  placeholder="e.g. id"
                  value={newFkForeignCol}
                  onChange={(e) => setNewFkForeignCol(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded border text-xs font-mono outline-none focus:border-blue-500 ${
                    isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">On Delete Action</label>
                  <select
                    value={newFkOnDelete}
                    onChange={(e) => setNewFkOnDelete(e.target.value)}
                    className={`w-full px-2.5 py-1.5 rounded border text-xs outline-none focus:border-blue-500 ${
                      isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    <option value="NO ACTION">NO ACTION</option>
                    <option value="CASCADE">CASCADE</option>
                    <option value="SET NULL">SET NULL</option>
                    <option value="RESTRICT">RESTRICT</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium mb-1">On Update Action</label>
                  <select
                    value={newFkOnUpdate}
                    onChange={(e) => setNewFkOnUpdate(e.target.value)}
                    className={`w-full px-2.5 py-1.5 rounded border text-xs outline-none focus:border-blue-500 ${
                      isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    <option value="NO ACTION">NO ACTION</option>
                    <option value="CASCADE">CASCADE</option>
                    <option value="SET NULL">SET NULL</option>
                    <option value="RESTRICT">RESTRICT</option>
                  </select>
                </div>
              </div>

              {addFkPreviewSql && (
                <div>
                  <label className="block font-medium mb-1 text-gray-400">SQL Preview</label>
                  <div
                    data-testid="add-fk-preview-sql"
                    className="p-2 rounded bg-gray-950 border border-gray-800 font-mono text-[11px] text-blue-300 select-text break-all"
                  >
                    {addFkPreviewSql}
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
                  data-testid="confirm-add-fk-btn"
                  disabled={submitting || !newFkCol || !newFkForeignTable.trim() || !newFkForeignCol.trim()}
                  className="px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-sm transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Foreign Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drop Foreign Key Confirmation Modal */}
      {dropFkTarget && (
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
                <h3 className="text-sm font-semibold">Drop Foreign Key</h3>
              </div>

              <p className="text-gray-300">
                Are you sure you want to drop foreign key{' '}
                <strong className="text-white font-mono bg-red-950/60 px-1 py-0.5 rounded border border-red-900/60">
                  {dropFkTarget.name}
                </strong>{' '}
                from table <strong className="font-mono text-white">{tableName}</strong>?
              </p>

              <div className="p-2 rounded bg-gray-950 border border-gray-800 font-mono text-[11px] text-red-300">
                {dropFkPreviewSql}
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDropFkTarget(null)}
                  className={`px-3 py-1.5 rounded transition-colors ${
                    isDark ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="confirm-drop-fk-btn"
                  onClick={handleDropFkConfirm}
                  disabled={submitting}
                  className="px-3.5 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white font-medium shadow-sm transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Dropping...' : 'Drop Foreign Key'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
