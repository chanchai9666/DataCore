import React, { useState, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Plus, Trash2, X, Loader2, Sparkles, Code2, AlertCircle, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { dbApi } from '../../api/db';
import {
  composeDataType,
  getDataTypeSpec,
} from './tableStructureHelpers';
import {
  buildCreateTableSql,
  type NewTableColumnConfig,
  type TableIndexConfig,
} from './tableManagementHelpers';
import { createTableSchema } from '../../schemas/tableSchema';

export interface CreateTableModalProps {
  isOpen: boolean;
  connectionId: string;
  schemaName?: string;
  driver?: string;
  onClose: () => void;
  onSuccess: (newTableName: string, schemaName?: string) => void;
}

interface ColumnRow {
  id: string;
  name: string;
  baseType: string;
  length: string;
  isPrimaryKey: boolean;
  nullable: boolean;
  defaultValue: string;
  autoIncrement?: boolean;
}

interface IndexRow {
  id: string;
  name: string;
  columns: string[];
  isUnique: boolean;
}

const COMMON_TYPES = [
  'INT',
  'BIGINT',
  'SMALLINT',
  'SERIAL',
  'VARCHAR',
  'CHAR',
  'TEXT',
  'BOOLEAN',
  'NUMERIC',
  'DECIMAL',
  'DATE',
  'TIME',
  'TIMESTAMP',
  'TIMESTAMPTZ',
  'UUID',
  'JSONB',
  'JSON',
];

export const CreateTableModal: React.FC<CreateTableModalProps> = ({
  isOpen,
  connectionId,
  schemaName,
  driver,
  onClose,
  onSuccess,
}) => {
  const isPostgres = !driver || driver.toLowerCase().includes('postgres');
  const isSqlite = driver?.toLowerCase() === 'sqlite';

  const [tableName, setTableName] = useState('');
  const [targetSchema, setTargetSchema] = useState(schemaName || (isPostgres ? 'public' : ''));
  const [columns, setColumns] = useState<ColumnRow[]>([
    {
      id: 'col-1',
      name: 'id',
      baseType: isPostgres ? 'SERIAL' : isSqlite ? 'INTEGER' : 'INT',
      length: '',
      isPrimaryKey: true,
      nullable: false,
      defaultValue: '',
      autoIncrement: true,
    },
    {
      id: 'col-2',
      name: 'name',
      baseType: 'VARCHAR',
      length: '255',
      isPrimaryKey: false,
      nullable: false,
      defaultValue: '',
    },
  ]);

  const [indexes, setIndexes] = useState<IndexRow[]>([]);
  const [activeTab, setActiveTab] = useState<'columns' | 'indexes'>('columns');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddColumn = () => {
    setColumns((prev) => [
      ...prev,
      {
        id: `col-${Date.now()}-${Math.random()}`,
        name: '',
        baseType: 'VARCHAR',
        length: '255',
        isPrimaryKey: false,
        nullable: true,
        defaultValue: '',
      },
    ]);
  };

  const handleRemoveColumn = (id: string) => {
    setColumns((prev) => {
      const removedCol = prev.find((c) => c.id === id);
      const nextCols = prev.filter((c) => c.id !== id);
      // Remove deleted column name from any existing indexes
      if (removedCol && removedCol.name.trim()) {
        const removedName = removedCol.name.trim();
        setIndexes((idxList) =>
          idxList.map((idx) => ({
            ...idx,
            columns: idx.columns.filter((col) => col !== removedName),
          }))
        );
      }
      return nextCols;
    });
  };

  const handleUpdateColumn = (id: string, updates: Partial<ColumnRow>) => {
    setColumns((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, ...updates };

        // When baseType changes, adapt length and default suggestions
        if (updates.baseType && updates.baseType !== c.baseType) {
          const spec = getDataTypeSpec(updates.baseType);
          if (!spec.hasLength) {
            updated.length = '';
          } else if (spec.defaultLength) {
            updated.length = spec.defaultLength;
          }
        }

        // If marked as Primary Key, ensure nullable is false
        if (updates.isPrimaryKey === true) {
          updated.nullable = false;
        }

        return updated;
      })
    );
  };

  const handleAddTimestamps = () => {
    setColumns((prev) => {
      const hasCreated = prev.some((c) => c.name.toLowerCase() === 'created_at');
      const hasUpdated = prev.some((c) => c.name.toLowerCase() === 'updated_at');

      const next = [...prev];
      if (!hasCreated) {
        next.push({
          id: `col-ts-1-${Date.now()}`,
          name: 'created_at',
          baseType: isPostgres ? 'TIMESTAMPTZ' : 'TIMESTAMP',
          length: '',
          isPrimaryKey: false,
          nullable: false,
          defaultValue: 'now()',
        });
      }
      if (!hasUpdated) {
        next.push({
          id: `col-ts-2-${Date.now()}`,
          name: 'updated_at',
          baseType: isPostgres ? 'TIMESTAMPTZ' : 'TIMESTAMP',
          length: '',
          isPrimaryKey: false,
          nullable: false,
          defaultValue: 'now()',
        });
      }
      return next;
    });
  };

  const handleAddIndex = () => {
    const validNamedCols = columns.filter((c) => c.name.trim().length > 0).map((c) => c.name.trim());
    const defaultCol = validNamedCols[0] || 'id';
    const cleanTable = tableName.trim() || 'table';
    const nextIdxNum = indexes.length + 1;

    setIndexes((prev) => [
      ...prev,
      {
        id: `idx-${Date.now()}-${Math.random()}`,
        name: `idx_${cleanTable}_${defaultCol}${nextIdxNum > 1 ? `_${nextIdxNum}` : ''}`,
        columns: [defaultCol],
        isUnique: false,
      },
    ]);
  };

  const handleRemoveIndex = (id: string) => {
    setIndexes((prev) => prev.filter((idx) => idx.id !== id));
  };

  const handleUpdateIndex = (id: string, updates: Partial<IndexRow>) => {
    setIndexes((prev) =>
      prev.map((idx) => (idx.id === id ? { ...idx, ...updates } : idx))
    );
  };

  const sqlPreview = useMemo(() => {
    const formattedCols: NewTableColumnConfig[] = columns
      .filter((c) => c.name.trim().length > 0)
      .map((c) => ({
        name: c.name.trim(),
        dataType: composeDataType(c.baseType, c.length),
        isPrimaryKey: c.isPrimaryKey,
        nullable: c.isPrimaryKey ? false : c.nullable,
        defaultValue: c.defaultValue.trim() || undefined,
        autoIncrement: c.autoIncrement,
      }));

    const formattedIndexes: TableIndexConfig[] = indexes
      .filter((idx) => idx.name.trim().length > 0 && idx.columns.length > 0)
      .map((idx) => ({
        name: idx.name.trim(),
        columns: idx.columns,
        isUnique: idx.isUnique,
      }));

    return buildCreateTableSql({
      tableName: tableName.trim(),
      schemaName: targetSchema.trim() || undefined,
      driver,
      columns: formattedCols,
      indexes: formattedIndexes,
    });
  }, [tableName, targetSchema, driver, columns, indexes]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = tableName.trim();
    const validCols = columns.filter((c) => c.name.trim().length > 0);

    const validationResult = createTableSchema.safeParse({
      tableName: cleanName,
      schema: targetSchema.trim() || undefined,
      columns: validCols,
    });

    if (!validationResult.success) {
      const firstIssue = validationResult.error.issues[0];
      setError(firstIssue?.message || 'Invalid table configuration.');
      return;
    }

    if (!sqlPreview) {
      setError('Failed to generate valid CREATE TABLE SQL statement.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await dbApi.executeDirectQuery(connectionId, sqlPreview);
      toast.success(`Table "${cleanName}" created successfully`);
      onSuccess(cleanName, targetSchema.trim() || undefined);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(`Failed to create table: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const validColumnNames = columns
    .map((c) => c.name.trim())
    .filter((n) => n.length > 0);

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150" />
        <Dialog.Content
          aria-describedby="create-table-desc"
          className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-panel border border-line rounded-lg shadow-2xl max-w-4xl w-full flex flex-col text-text max-h-[90vh] focus:outline-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-line bg-panel">
            <div className="flex items-center space-x-2 text-emerald-500">
              <Plus className="w-5 h-5" />
              <Dialog.Title asChild>
                <h2 id="create-table-title" className="text-base font-semibold text-text">
                  Create New Table
                </h2>
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="text-muted hover:text-text transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description id="create-table-desc" className="sr-only">
            Form to configure and create a new database table
          </Dialog.Description>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Table & Schema Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Table Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                autoFocus
                required
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="e.g. orders, users, products"
                data-testid="create-table-name-input"
                className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-1.5 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            {isPostgres && (
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  Schema
                </label>
                <input
                  type="text"
                  value={targetSchema}
                  onChange={(e) => setTargetSchema(e.target.value)}
                  placeholder="public"
                  data-testid="create-table-schema-input"
                  className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-1.5 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            )}
          </div>

          {/* Tab Selection */}
          <div className="flex border-b border-gray-800 space-x-6">
            <button
              type="button"
              data-testid="tab-columns-btn"
              onClick={() => setActiveTab('columns')}
              className={`pb-2 text-xs font-semibold flex items-center space-x-2 border-b-2 transition-colors ${
                activeTab === 'columns'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              <span>Columns ({columns.length})</span>
            </button>
            <button
              type="button"
              data-testid="tab-indexes-btn"
              onClick={() => setActiveTab('indexes')}
              className={`pb-2 text-xs font-semibold flex items-center space-x-2 border-b-2 transition-colors ${
                activeTab === 'indexes'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Indexes ({indexes.length})</span>
            </button>
          </div>

          {/* Columns Section */}
          {activeTab === 'columns' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Columns Configuration
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleAddTimestamps}
                    className="px-2.5 py-1 text-[11px] rounded bg-gray-800 hover:bg-gray-700 text-gray-300 flex items-center space-x-1 border border-gray-700 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>+ Timestamps</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAddColumn}
                    data-testid="add-column-row-btn"
                    className="px-2.5 py-1 text-[11px] rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 flex items-center space-x-1 border border-emerald-500/30 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Column</span>
                  </button>
                </div>
              </div>

              {/* Columns Table */}
              <div className="border border-gray-800 rounded overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-gray-950/60 border-b border-gray-800 text-[11px] uppercase tracking-wider text-gray-400 select-none">
                    <tr>
                      <th className="px-3 py-2 w-1/4">Name</th>
                      <th className="px-3 py-2 w-1/5">Type</th>
                      <th className="px-3 py-2 w-28">Length/Values</th>
                      <th className="px-2 py-2 text-center w-12" title="Primary Key">PK</th>
                      <th className="px-2 py-2 text-center w-16" title="Nullable">Nullable</th>
                      <th className="px-3 py-2">Default</th>
                      <th className="px-2 py-2 text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800 bg-gray-900/50 font-mono">
                    {columns.map((col, idx) => {
                      const spec = getDataTypeSpec(col.baseType);
                      return (
                        <tr key={col.id} className="hover:bg-gray-800/40">
                          {/* Name */}
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              required
                              placeholder="column_name"
                              value={col.name}
                              onChange={(e) => handleUpdateColumn(col.id, { name: e.target.value })}
                              data-testid={`column-name-input-${idx}`}
                              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                            />
                          </td>

                          {/* Type */}
                          <td className="px-2 py-1.5">
                            <select
                              value={col.baseType}
                              onChange={(e) => handleUpdateColumn(col.id, { baseType: e.target.value })}
                              data-testid={`column-type-select-${idx}`}
                              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-blue-500"
                            >
                              {COMMON_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Length / Values */}
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              disabled={!spec.hasLength}
                              value={col.length}
                              onChange={(e) => handleUpdateColumn(col.id, { length: e.target.value })}
                              placeholder={spec.lengthPlaceholder || 'N/A'}
                              data-testid={`column-length-input-${idx}`}
                              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500 disabled:opacity-40 disabled:bg-gray-900"
                            />
                          </td>

                          {/* PK */}
                          <td className="px-2 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={col.isPrimaryKey}
                              onChange={(e) =>
                                handleUpdateColumn(col.id, { isPrimaryKey: e.target.checked })
                              }
                              data-testid={`column-pk-checkbox-${idx}`}
                              className="rounded border-gray-700 bg-gray-800 text-blue-500 focus:ring-0"
                            />
                          </td>

                          {/* Nullable */}
                          <td className="px-2 py-1.5 text-center">
                            <input
                              type="checkbox"
                              disabled={col.isPrimaryKey}
                              checked={col.isPrimaryKey ? false : col.nullable}
                              onChange={(e) =>
                                handleUpdateColumn(col.id, { nullable: e.target.checked })
                              }
                              data-testid={`column-nullable-checkbox-${idx}`}
                              className="rounded border-gray-700 bg-gray-800 text-blue-500 focus:ring-0 disabled:opacity-40"
                            />
                          </td>

                          {/* Default */}
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              value={col.defaultValue}
                              onChange={(e) =>
                                handleUpdateColumn(col.id, { defaultValue: e.target.value })
                              }
                              placeholder={spec.defaultPlaceholder || 'NULL'}
                              data-testid={`column-default-input-${idx}`}
                              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                            />
                          </td>

                          {/* Actions */}
                          <td className="px-2 py-1.5 text-center">
                            <button
                              type="button"
                              disabled={columns.length <= 1}
                              onClick={() => handleRemoveColumn(col.id)}
                              aria-label={`Remove column ${col.name || idx + 1}`}
                              className="p-1 text-gray-400 hover:text-red-400 disabled:opacity-20 disabled:hover:text-gray-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Indexes Section */}
          {activeTab === 'indexes' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Indexes Configuration
                  </span>
                  <p className="text-[11px] text-gray-500">
                    Define custom single or multi-column indexes for faster queries.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddIndex}
                  data-testid="add-index-btn"
                  className="px-2.5 py-1 text-[11px] rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 flex items-center space-x-1 border border-emerald-500/30 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Index</span>
                </button>
              </div>

              {indexes.length === 0 ? (
                <div className="border border-dashed border-gray-800 rounded-lg p-6 text-center text-xs text-gray-500 bg-gray-950/30">
                  <Layers className="w-8 h-8 text-gray-600 mx-auto mb-2 opacity-60" />
                  <p>No custom indexes configured yet.</p>
                  <p className="text-[11px] text-gray-600 mt-1">
                    Primary key index is created automatically. Click "+ Add Index" to add secondary indexes.
                  </p>
                </div>
              ) : (
                <div className="border border-gray-800 rounded overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-gray-950/60 border-b border-gray-800 text-[11px] uppercase tracking-wider text-gray-400 select-none">
                      <tr>
                        <th className="px-3 py-2 w-1/3">Index Name</th>
                        <th className="px-3 py-2">Indexed Columns</th>
                        <th className="px-2 py-2 text-center w-20">Unique</th>
                        <th className="px-2 py-2 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800 bg-gray-900/50">
                      {indexes.map((idxItem, idxIndex) => (
                        <tr key={idxItem.id} className="hover:bg-gray-800/40">
                          {/* Index Name */}
                          <td className="px-2 py-2 font-mono">
                            <input
                              type="text"
                              required
                              placeholder="idx_name"
                              value={idxItem.name}
                              onChange={(e) =>
                                handleUpdateIndex(idxItem.id, { name: e.target.value })
                              }
                              data-testid={`index-name-input-${idxIndex}`}
                              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono"
                            />
                          </td>

                          {/* Columns multi-select checkboxes */}
                          <td className="px-2 py-2">
                            <div className="flex flex-wrap gap-2 items-center">
                              {validColumnNames.length === 0 ? (
                                <span className="text-[11px] text-gray-500 italic">
                                  No columns defined in Columns tab
                                </span>
                              ) : (
                                validColumnNames.map((colName) => {
                                  const isSelected = idxItem.columns.includes(colName);
                                  return (
                                    <label
                                      key={colName}
                                      className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] cursor-pointer transition-colors border ${
                                        isSelected
                                          ? 'bg-blue-950/80 text-blue-300 border-blue-600/60 font-semibold'
                                          : 'bg-gray-950 text-gray-400 border-gray-800 hover:border-gray-700'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={(e) => {
                                          const nextCols = e.target.checked
                                            ? [...idxItem.columns, colName]
                                            : idxItem.columns.filter((c) => c !== colName);
                                          handleUpdateIndex(idxItem.id, { columns: nextCols });
                                        }}
                                        data-testid={`index-col-checkbox-${idxIndex}-${colName}`}
                                        className="sr-only"
                                      />
                                      <span>{colName}</span>
                                    </label>
                                  );
                                })
                              )}
                            </div>
                          </td>

                          {/* Is Unique */}
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={idxItem.isUnique}
                              onChange={(e) =>
                                handleUpdateIndex(idxItem.id, { isUnique: e.target.checked })
                              }
                              data-testid={`index-unique-checkbox-${idxIndex}`}
                              className="rounded border-gray-700 bg-gray-800 text-blue-500 focus:ring-0"
                            />
                          </td>

                          {/* Delete */}
                          <td className="px-2 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveIndex(idxItem.id)}
                              aria-label={`Remove index ${idxItem.name || idxIndex + 1}`}
                              data-testid={`remove-index-btn-${idxIndex}`}
                              className="p-1 text-gray-400 hover:text-red-400 transition-colors"
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
            </div>
          )}

          {/* SQL Preview */}
          <div className="space-y-1">
            <div className="flex items-center space-x-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <Code2 className="w-3.5 h-3.5 text-blue-400" />
              <span>Live SQL Statement Preview</span>
            </div>
            <pre
              data-testid="create-table-sql-preview"
              className="p-3 bg-gray-950 border border-gray-800 rounded font-mono text-xs text-emerald-300 overflow-x-auto max-h-36 whitespace-pre-wrap select-all"
            >
              {sqlPreview || '-- Enter table name and columns to preview SQL --'}
            </pre>
          </div>

          {/* Error Message */}
          {error && (
            <div
              role="alert"
              className="p-3 bg-red-950/50 border border-red-500/40 rounded text-xs text-red-300 font-mono flex items-start space-x-2"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end space-x-3 pt-3 border-t border-gray-800">
            <Dialog.Close asChild>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-xs font-medium text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="submit"
              disabled={loading || !tableName.trim()}
              data-testid="submit-create-table-btn"
              className="px-4 py-2 text-xs font-medium rounded bg-emerald-600 hover:bg-emerald-500 text-white flex items-center space-x-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating Table...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Create Table</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);
};
