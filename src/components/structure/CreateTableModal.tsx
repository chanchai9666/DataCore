import React, { useState, useMemo } from 'react';
import { Plus, Trash2, X, Loader2, Sparkles, Code2, AlertCircle } from 'lucide-react';
import { dbApi } from '../../api/db';
import {
  composeDataType,
  getDataTypeSpec,
} from './tableStructureHelpers';
import {
  buildCreateTableSql,
  type NewTableColumnConfig,
} from './tableManagementHelpers';

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
    setColumns((prev) => prev.filter((c) => c.id !== id));
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

    return buildCreateTableSql({
      tableName: tableName.trim(),
      schemaName: targetSchema.trim() || undefined,
      driver,
      columns: formattedCols,
    });
  }, [tableName, targetSchema, driver, columns]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = tableName.trim();
    if (!cleanName) {
      setError('Table name is required.');
      return;
    }

    const validCols = columns.filter((c) => c.name.trim().length > 0);
    if (validCols.length === 0) {
      setError('Please define at least one column.');
      return;
    }

    if (!sqlPreview) {
      setError('Failed to generate valid CREATE TABLE SQL statement.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await dbApi.executeQuery(connectionId, sqlPreview);
      onSuccess(cleanName, targetSchema.trim() || undefined);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-table-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150 overflow-y-auto"
    >
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-w-4xl w-full my-8 flex flex-col text-gray-200 max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800 bg-gray-950/40">
          <div className="flex items-center space-x-2 text-emerald-400">
            <Plus className="w-5 h-5" />
            <h2 id="create-table-title" className="text-base font-semibold">
              Create New Table
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

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

          {/* Columns Section */}
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
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>+ Timestamps</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddColumn}
                  data-testid="add-column-row-btn"
                  className="px-2.5 py-1 text-[11px] rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 flex items-center space-x-1 border border-emerald-500/30 transition-colors"
                >
                  <Plus className="w-3 h-3" />
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
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-medium text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
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
      </div>
    </div>
  );
};
