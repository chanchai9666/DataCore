import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table as TableIcon,
  Plus,
  RefreshCw,
  Code,
  Key,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  X,
  Layers,
  ShieldAlert,
} from 'lucide-react';
import { dbApi } from '../../api/db';
import {
  getFetchColumnsSql,
  parseColumnsFromQueryResult,
  buildAddColumnSql,
  buildDropColumnSql,
  buildRenameColumnSql,
  buildModifyColumnSql,
  generateTableDdl,
  composeDataType,
  parseDataType,
  getDataTypeSpec,
  type TableColumnStructure,
} from './tableStructureHelpers';
import { DropTableModal } from './DropTableModal';

export interface TableStructureEditorProps {
  tabId: string;
  connectionId: string;
  tableName: string;
  schemaName?: string;
  driver?: string;
  theme?: 'dark' | 'light';
  onStructureChanged?: () => void;
}

const BASE_TYPES = [
  'VARCHAR',
  'CHAR',
  'INT',
  'INTEGER',
  'BIGINT',
  'SMALLINT',
  'TEXT',
  'BOOLEAN',
  'NUMERIC',
  'DECIMAL',
  'FLOAT',
  'REAL',
  'DOUBLE PRECISION',
  'DATE',
  'TIME',
  'TIMESTAMP',
  'TIMESTAMPTZ',
  'UUID',
  'JSONB',
  'JSON',
];

const PRESETS = [
  'VARCHAR(30)',
  'VARCHAR(255)',
  'INT(5)',
  'INTEGER',
  'BIGINT',
  'TEXT',
  'BOOLEAN',
  'NUMERIC(10,2)',
  'TIMESTAMPTZ',
  'UUID',
];

export const TableStructureEditor: React.FC<TableStructureEditorProps> = ({
  tabId,
  connectionId,
  tableName,
  schemaName,
  driver = 'postgres',
  theme = 'dark',
  onStructureChanged,
}) => {
  const [columns, setColumns] = useState<TableColumnStructure[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editColTarget, setEditColTarget] = useState<TableColumnStructure | null>(null);
  const [dropColTarget, setDropColTarget] = useState<TableColumnStructure | null>(null);
  const [isDdlModalOpen, setIsDdlModalOpen] = useState(false);
  const [isDropTableModalOpen, setIsDropTableModalOpen] = useState(false);
  const [ddlCopied, setDdlCopied] = useState(false);

  // Add form fields
  const [newColName, setNewColName] = useState('');
  const [newColBaseType, setNewColBaseType] = useState('VARCHAR');
  const [newColLength, setNewColLength] = useState('255');
  const [newColCustomType, setNewColCustomType] = useState('');
  const [newColNullable, setNewColNullable] = useState(true);
  const [newColDefault, setNewColDefault] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit form fields
  const [editColName, setEditColName] = useState('');
  const [editColBaseType, setEditColBaseType] = useState('VARCHAR');
  const [editColLength, setEditColLength] = useState('');
  const [editColCustomType, setEditColCustomType] = useState('');
  const [editColNullable, setEditColNullable] = useState(true);
  const [editColDefault, setEditColDefault] = useState('');

  // Composed final data types
  const computedNewColType = useMemo(() => {
    if (newColBaseType === 'CUSTOM') {
      return newColCustomType.trim();
    }
    return composeDataType(newColBaseType, newColLength);
  }, [newColBaseType, newColLength, newColCustomType]);

  const computedEditColType = useMemo(() => {
    if (editColBaseType === 'CUSTOM') {
      return editColCustomType.trim();
    }
    return composeDataType(editColBaseType, editColLength);
  }, [editColBaseType, editColLength, editColCustomType]);

  // Data Type change handlers that correlate length/values with the selected type
  const handleNewColBaseTypeChange = (newType: string) => {
    setNewColBaseType(newType);
    if (newType === 'CUSTOM') {
      setNewColLength('');
      return;
    }
    const spec = getDataTypeSpec(newType);
    if (!spec.hasLength) {
      setNewColLength('');
    } else {
      setNewColLength(spec.defaultLength || '');
    }
  };

  const handleEditColBaseTypeChange = (newType: string) => {
    setEditColBaseType(newType);
    if (newType === 'CUSTOM') {
      setEditColLength('');
      return;
    }
    const spec = getDataTypeSpec(newType);
    if (!spec.hasLength) {
      setEditColLength('');
    } else {
      setEditColLength(spec.defaultLength || '');
    }
  };

  // Preset applicator
  const applyPreset = (preset: string, isEdit = false) => {
    const { baseType, lengthOrValues } = parseDataType(preset);
    const matched = BASE_TYPES.find((t) => t.toUpperCase() === baseType.toUpperCase());
    if (isEdit) {
      if (matched) {
        setEditColBaseType(matched);
        const spec = getDataTypeSpec(matched);
        setEditColLength(spec.hasLength ? (lengthOrValues || spec.defaultLength || '') : '');
        setEditColCustomType('');
      } else {
        setEditColBaseType('CUSTOM');
        setEditColLength('');
        setEditColCustomType(preset);
      }
    } else {
      if (matched) {
        setNewColBaseType(matched);
        const spec = getDataTypeSpec(matched);
        setNewColLength(spec.hasLength ? (lengthOrValues || spec.defaultLength || '') : '');
        setNewColCustomType('');
      } else {
        setNewColBaseType('CUSTOM');
        setNewColLength('');
        setNewColCustomType(preset);
      }
    }
  };

  // Load column structure
  const loadStructure = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await dbApi.openSession(connectionId, tabId);
      const sql = getFetchColumnsSql(driver, tableName, schemaName);
      let parsedCols: TableColumnStructure[] = [];

      try {
        const result = await dbApi.executeQuery(tabId, sql);
        parsedCols = parseColumnsFromQueryResult(result, driver);
      } catch (queryErr) {
        console.warn('Specialized structure query failed, trying fetchTableData fallback:', queryErr);
      }

      // If still empty or query failed, fallback to fetchTableData
      if (parsedCols.length === 0) {
        const tableData = await dbApi.fetchTableData(tabId, tableName, schemaName, 1, 0);
        parsedCols = parseColumnsFromQueryResult(
          { columns: [], rows: [], execution_time_ms: 0 },
          driver,
          tableData.columns
        );
      }

      setColumns(parsedCols);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [connectionId, tabId, tableName, schemaName, driver]);

  useEffect(() => {
    loadStructure();
  }, [loadStructure]);

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    if (type === 'success') {
      setTimeout(() => {
        setStatusMessage(null);
      }, 4000);
    }
  };

  // Preview SQL for Add Column
  const addColumnPreviewSql = useMemo(() => {
    if (!newColName.trim() || !computedNewColType) return '';
    try {
      return buildAddColumnSql({
        driver,
        tableName,
        schemaName,
        columnName: newColName.trim(),
        dataType: computedNewColType,
        isNullable: newColNullable,
        defaultValue: newColDefault.trim() || undefined,
      });
    } catch {
      return '';
    }
  }, [driver, tableName, schemaName, newColName, computedNewColType, newColNullable, newColDefault]);

  // Handle Add Column
  const handleAddColumnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim() || !computedNewColType) return;

    setSubmitting(true);
    try {
      const sql = buildAddColumnSql({
        driver,
        tableName,
        schemaName,
        columnName: newColName.trim(),
        dataType: computedNewColType,
        isNullable: newColNullable,
        defaultValue: newColDefault.trim() || undefined,
      });

      await dbApi.executeQuery(tabId, sql);
      setIsAddModalOpen(false);
      setNewColName('');
      setNewColBaseType('VARCHAR');
      setNewColLength('255');
      setNewColCustomType('');
      setNewColNullable(true);
      setNewColDefault('');
      showStatus('success', `Added column '${newColName.trim()}' (${computedNewColType}) successfully`);
      await loadStructure();
      onStructureChanged?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus('error', `Failed to add column: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (col: TableColumnStructure) => {
    setEditColTarget(col);
    setEditColName(col.name);
    const { baseType, lengthOrValues } = parseDataType(col.dataType);
    const matched = BASE_TYPES.find((t) => t.toUpperCase() === baseType.toUpperCase());
    if (matched) {
      setEditColBaseType(matched);
      setEditColLength(lengthOrValues);
      setEditColCustomType('');
    } else {
      setEditColBaseType('CUSTOM');
      setEditColLength('');
      setEditColCustomType(col.dataType);
    }
    setEditColNullable(col.isNullable);
    setEditColDefault(col.defaultValue || '');
  };

  // Preview SQL for Edit Column
  const editColumnPreviewSqls = useMemo(() => {
    if (!editColTarget) return [];
    const stmts: string[] = [];

    // Rename
    if (editColName.trim() && editColName.trim() !== editColTarget.name) {
      stmts.push(
        buildRenameColumnSql({
          driver,
          tableName,
          schemaName,
          oldColumnName: editColTarget.name,
          newColumnName: editColName.trim(),
        })
      );
    }

    // Alter modifications
    try {
      const targetCol = editColName.trim() || editColTarget.name;
      const alterStmts = buildModifyColumnSql({
        driver,
        tableName,
        schemaName,
        columnName: targetCol,
        oldDataType: editColTarget.dataType,
        newDataType: computedEditColType !== editColTarget.dataType ? computedEditColType : undefined,
        oldIsNullable: editColTarget.isNullable,
        isNullable: editColNullable !== editColTarget.isNullable ? editColNullable : undefined,
        oldDefaultValue: editColTarget.defaultValue,
        defaultValue: editColDefault.trim() !== (editColTarget.defaultValue || '') ? editColDefault.trim() : undefined,
      });
      stmts.push(...alterStmts);
    } catch {
      // Ignored for preview
    }

    return stmts;
  }, [editColTarget, editColName, computedEditColType, editColNullable, editColDefault, driver, tableName, schemaName]);

  // Handle Edit Column Submit
  const handleEditColumnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editColTarget || !computedEditColType) return;

    setSubmitting(true);
    try {
      // 1. Check Rename
      let activeColName = editColTarget.name;
      if (editColName.trim() && editColName.trim() !== editColTarget.name) {
        const renameSql = buildRenameColumnSql({
          driver,
          tableName,
          schemaName,
          oldColumnName: editColTarget.name,
          newColumnName: editColName.trim(),
        });
        await dbApi.executeQuery(tabId, renameSql);
        activeColName = editColName.trim();
      }

      // 2. Check Modify (Type, Nullable, Default)
      const modifyStmts = buildModifyColumnSql({
        driver,
        tableName,
        schemaName,
        columnName: activeColName,
        oldDataType: editColTarget.dataType,
        newDataType: computedEditColType !== editColTarget.dataType ? computedEditColType : undefined,
        oldIsNullable: editColTarget.isNullable,
        isNullable: editColNullable !== editColTarget.isNullable ? editColNullable : undefined,
        oldDefaultValue: editColTarget.defaultValue,
        defaultValue: editColDefault.trim() !== (editColTarget.defaultValue || '') ? editColDefault.trim() : undefined,
      });

      for (const stmt of modifyStmts) {
        await dbApi.executeQuery(tabId, stmt);
      }

      setEditColTarget(null);
      showStatus('success', `Updated column '${activeColName}' (${computedEditColType}) successfully`);
      await loadStructure();
      onStructureChanged?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus('error', `Failed to update column: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Drop Column
  const handleDropColumnConfirm = async () => {
    if (!dropColTarget) return;
    setSubmitting(true);
    try {
      const sql = buildDropColumnSql({
        driver,
        tableName,
        schemaName,
        columnName: dropColTarget.name,
      });
      await dbApi.executeQuery(tabId, sql);
      setDropColTarget(null);
      showStatus('success', `Dropped column '${dropColTarget.name}' successfully`);
      await loadStructure();
      onStructureChanged?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus('error', `Failed to drop column: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  // DDL String
  const ddlString = useMemo(() => {
    return generateTableDdl({
      driver,
      tableName,
      schemaName,
      columns,
    });
  }, [driver, tableName, schemaName, columns]);

  const newSpec = getDataTypeSpec(newColBaseType);
  const editSpec = getDataTypeSpec(editColBaseType);

  const isDark = theme === 'dark';

  return (
    <div
      data-testid="table-structure-editor"
      className={`flex-1 flex flex-col min-h-0 overflow-hidden ${
        isDark ? 'bg-gray-950 text-gray-200' : 'bg-gray-50 text-gray-800'
      }`}
    >
      {/* Top Structure Toolbar */}
      <div
        className={`flex items-center justify-between px-4 py-2.5 border-b text-xs flex-shrink-0 ${
          isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
        }`}
      >
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 font-medium">
            <TableIcon className="w-4 h-4 text-emerald-400" />
            <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>
              {schemaName ? `${schemaName}.` : ''}
            </span>
            <span className="font-semibold text-sm">{tableName}</span>
          </div>

          <span
            className={`px-2 py-0.5 rounded text-[11px] font-mono ${
              isDark ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {columns.length} columns
          </span>

          {statusMessage && (
            <div
              data-testid="structure-status-badge"
              className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-medium ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                  : 'bg-red-950/80 text-red-300 border border-red-800'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-red-400" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            data-testid="add-column-btn"
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Column</span>
          </button>

          <button
            type="button"
            data-testid="refresh-structure-btn"
            onClick={loadStructure}
            disabled={loading}
            title="Refresh Structure"
            className={`p-1.5 rounded transition-colors ${
              isDark
                ? 'hover:bg-gray-800 text-gray-400 hover:text-gray-200'
                : 'hover:bg-gray-200 text-gray-600 hover:text-gray-900'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            data-testid="view-ddl-btn"
            onClick={() => setIsDdlModalOpen(true)}
            title="View DDL / CREATE TABLE"
            className={`inline-flex items-center space-x-1 px-2.5 py-1.5 rounded text-xs transition-colors border ${
              isDark
                ? 'border-gray-700 bg-gray-800/80 hover:bg-gray-800 text-gray-300'
                : 'border-gray-300 bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <Code className="w-3.5 h-3.5 text-blue-400" />
            <span>DDL</span>
          </button>

          <button
            type="button"
            data-testid="drop-table-toolbar-btn"
            onClick={() => setIsDropTableModalOpen(true)}
            title="Drop Table"
            className={`inline-flex items-center space-x-1 px-2.5 py-1.5 rounded text-xs transition-colors border ${
              isDark
                ? 'border-red-900/40 bg-red-950/30 hover:bg-red-900/50 text-red-400'
                : 'border-red-200 bg-red-50 hover:bg-red-100 text-red-600'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
            <span>Drop</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-auto p-4">
        {loading && columns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 space-y-2 text-gray-400">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
            <span className="text-xs">Loading structure...</span>
          </div>
        ) : error ? (
          <div className="p-4 rounded border border-red-800/60 bg-red-950/30 text-red-300 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold mb-1">Failed to load structure</div>
              <div>{error}</div>
              <button
                type="button"
                onClick={loadStructure}
                className="mt-2 px-2.5 py-1 bg-red-900/60 hover:bg-red-800 rounded text-white"
              >
                Retry
              </button>
            </div>
          </div>
        ) : columns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 space-y-2">
            <Layers className="w-10 h-10 opacity-30" />
            <span className="text-xs">No columns found in this table.</span>
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
                  <th className="py-2.5 px-3">Column Name</th>
                  <th className="py-2.5 px-3">Data Type</th>
                  <th className="py-2.5 px-3 w-24 text-center">Nullable</th>
                  <th className="py-2.5 px-3">Default Value</th>
                  <th className="py-2.5 px-3 w-28 text-center">Key</th>
                  <th className="py-2.5 px-3 w-24 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {columns.map((col) => (
                  <tr
                    key={col.name}
                    data-testid={`column-row-${col.name}`}
                    className={`transition-colors ${
                      isDark
                        ? 'hover:bg-gray-800/40 text-gray-200'
                        : 'hover:bg-gray-50 text-gray-800 divide-gray-100'
                    }`}
                  >
                    <td className="py-2 px-3 text-center text-gray-500 font-mono text-[11px]">
                      {col.ordinalPosition}
                    </td>

                    <td className="py-2 px-3 font-medium flex items-center space-x-1.5">
                      {col.isPrimaryKey && (
                        <span title="Primary Key">
                          <Key className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        </span>
                      )}
                      <span className="font-mono text-sm">{col.name}</span>
                    </td>

                    <td className="py-2 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded font-mono text-[11px] font-medium ${
                          isDark
                            ? 'bg-blue-950/60 text-blue-300 border border-blue-900/50'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}
                      >
                        {col.dataType}
                      </span>
                    </td>

                    <td className="py-2 px-3 text-center">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          col.isNullable
                            ? isDark
                              ? 'bg-gray-800 text-gray-300'
                              : 'bg-gray-200 text-gray-700'
                            : isDark
                            ? 'bg-amber-950/60 text-amber-300 border border-amber-900/40'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {col.isNullable ? 'YES' : 'NO'}
                      </span>
                    </td>

                    <td className="py-2 px-3 font-mono text-xs text-gray-400">
                      {col.defaultValue ? (
                        <span className="text-gray-300">{col.defaultValue}</span>
                      ) : (
                        <span className="text-gray-500 italic">NULL</span>
                      )}
                    </td>

                    <td className="py-2 px-3 text-center">
                      {col.isPrimaryKey ? (
                        <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-700">
                          <Key className="w-2.5 h-2.5" />
                          <span>PK</span>
                        </span>
                      ) : (
                        <span className="text-gray-600">-</span>
                      )}
                    </td>

                    <td className="py-2 px-3 text-right">
                      <div className="inline-flex items-center space-x-1">
                        <button
                          type="button"
                          data-testid={`edit-column-btn-${col.name}`}
                          onClick={() => openEditModal(col)}
                          title="Edit Column"
                          className={`p-1 rounded transition-colors ${
                            isDark
                              ? 'hover:bg-gray-700 text-gray-400 hover:text-blue-300'
                              : 'hover:bg-gray-200 text-gray-500 hover:text-blue-600'
                          }`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          data-testid={`drop-column-btn-${col.name}`}
                          onClick={() => setDropColTarget(col)}
                          title="Drop Column"
                          className="p-1 rounded hover:bg-red-950/60 text-gray-400 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* Modal: Add Column                                                        */}
      {/* ========================================================================= */}
      {isAddModalOpen && (
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
                <Plus className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold">
                  Add Column to {tableName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded text-gray-400 hover:text-gray-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddColumnSubmit} className="p-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-medium mb-1">
                  Column Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. description, status, age"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  className={`w-full px-3 py-1.5 rounded border focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-xs ${
                    isDark ? 'bg-gray-950 border-gray-700 text-white' : 'bg-white border-gray-300'
                  }`}
                  autoFocus
                />
              </div>

              {/* Data Type & Length / Values */}
              <div>
                <div className="grid grid-cols-2 gap-2 mb-1">
                  <label className="font-medium">Data Type</label>
                  <label className="font-medium">
                    Length / Values{' '}
                    <span className="text-gray-400 font-normal">
                      {newSpec.hasLength ? `(${newSpec.lengthPlaceholder || 'e.g. 30, 5, 10,2'})` : '(Not applicable)'}
                    </span>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    data-testid="add-col-type-select"
                    value={newColBaseType}
                    onChange={(e) => handleNewColBaseTypeChange(e.target.value)}
                    className={`w-full px-2 py-1.5 rounded border text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono ${
                      isDark ? 'bg-gray-950 border-gray-700 text-white' : 'bg-white border-gray-300'
                    }`}
                  >
                    {BASE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                    <option value="CUSTOM">Custom...</option>
                  </select>

                  <input
                    type="text"
                    data-testid="add-col-length-input"
                    placeholder={newSpec.lengthPlaceholder || 'e.g. 5, 30, 10,2'}
                    value={newColLength}
                    disabled={!newSpec.hasLength || newColBaseType === 'CUSTOM'}
                    onChange={(e) => setNewColLength(e.target.value)}
                    className={`w-full px-3 py-1.5 rounded border focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-xs ${
                      !newSpec.hasLength || newColBaseType === 'CUSTOM'
                        ? 'opacity-40 cursor-not-allowed bg-gray-800'
                        : isDark
                        ? 'bg-gray-950 border-gray-700 text-white'
                        : 'bg-white border-gray-300'
                    }`}
                  />
                </div>

                {!newSpec.hasLength && newColBaseType !== 'CUSTOM' && (
                  <p className="text-[10px] text-gray-500 mt-1">
                    ประเภท {newColBaseType} เป็นประเภทข้อมูลที่ไม่ต้องระบุความยาว/ขนาด
                  </p>
                )}

                {newColBaseType === 'CUSTOM' && (
                  <div className="mt-2">
                    <label className="block text-[11px] font-medium text-gray-400 mb-0.5">
                      Custom Type Definition
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. VARCHAR(30), INT(5), geometry(Point, 4326)"
                      value={newColCustomType}
                      onChange={(e) => setNewColCustomType(e.target.value)}
                      className={`w-full px-3 py-1.5 rounded border focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-xs ${
                        isDark ? 'bg-gray-950 border-gray-700 text-white' : 'bg-white border-gray-300'
                      }`}
                    />
                  </div>
                )}

                {/* Quick Presets */}
                <div className="mt-2">
                  <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-1">
                    Quick Presets:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {PRESETS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        data-testid={`preset-btn-${p}`}
                        onClick={() => applyPreset(p, false)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors border ${
                          computedNewColType === p
                            ? 'bg-blue-600 text-white border-blue-500'
                            : isDark
                            ? 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                            : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="add-col-nullable"
                  checked={newColNullable}
                  onChange={(e) => setNewColNullable(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="add-col-nullable" className="cursor-pointer select-none">
                  Allow NULL (Nullable)
                </label>
              </div>

              <div>
                <label className="block font-medium mb-1">
                  Default Value <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder={newSpec.defaultPlaceholder || "e.g. 'active', 0, now(), gen_random_uuid()"}
                  value={newColDefault}
                  onChange={(e) => setNewColDefault(e.target.value)}
                  className={`w-full px-3 py-1.5 rounded border focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-xs ${
                    isDark ? 'bg-gray-950 border-gray-700 text-white' : 'bg-white border-gray-300'
                  }`}
                />
                {newSpec.defaultSuggestions && newSpec.defaultSuggestions.length > 0 && (
                  <div className="flex items-center space-x-1.5 mt-1.5 flex-wrap gap-y-1">
                    <span className="text-[10px] text-gray-400">Suggestions:</span>
                    {newSpec.defaultSuggestions.map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => setNewColDefault(sug)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                          newColDefault === sug
                            ? 'bg-emerald-600 text-white border-emerald-500'
                            : isDark
                            ? 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                            : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {addColumnPreviewSql && (
                <div className="pt-1">
                  <div className="text-[11px] font-medium text-gray-400 mb-1">
                    SQL Statement Preview:
                  </div>
                  <pre
                    className={`p-2 rounded font-mono text-[11px] overflow-x-auto border ${
                      isDark ? 'bg-gray-950 border-gray-800 text-emerald-300' : 'bg-gray-100 border-gray-200 text-emerald-700'
                    }`}
                  >
                    {addColumnPreviewSql}
                  </pre>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className={`px-3 py-1.5 rounded transition-colors ${
                    isDark ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="submit-add-column-btn"
                  disabled={submitting || !newColName.trim() || !computedNewColType}
                  className="px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Adding...' : 'Add Column'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Modal: Edit Column                                                       */}
      {/* ========================================================================= */}
      {editColTarget && (
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
                <Edit2 className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold">
                  Edit Column: <span className="font-mono text-blue-400">{editColTarget.name}</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditColTarget(null)}
                className="p-1 rounded text-gray-400 hover:text-gray-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditColumnSubmit} className="p-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-medium mb-1">
                  Column Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editColName}
                  onChange={(e) => setEditColName(e.target.value)}
                  className={`w-full px-3 py-1.5 rounded border focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-xs ${
                    isDark ? 'bg-gray-950 border-gray-700 text-white' : 'bg-white border-gray-300'
                  }`}
                />
              </div>

              {/* Data Type & Length / Values */}
              <div>
                <div className="grid grid-cols-2 gap-2 mb-1">
                  <label className="font-medium">Data Type</label>
                  <label className="font-medium">
                    Length / Values{' '}
                    <span className="text-gray-400 font-normal">
                      {editSpec.hasLength ? `(${editSpec.lengthPlaceholder || 'e.g. 30, 5, 10,2'})` : '(Not applicable)'}
                    </span>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    data-testid="edit-col-type-select"
                    value={editColBaseType}
                    onChange={(e) => handleEditColBaseTypeChange(e.target.value)}
                    className={`w-full px-2 py-1.5 rounded border text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono ${
                      isDark ? 'bg-gray-950 border-gray-700 text-white' : 'bg-white border-gray-300'
                    }`}
                  >
                    {BASE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                    <option value="CUSTOM">Custom...</option>
                  </select>

                  <input
                    type="text"
                    data-testid="edit-col-length-input"
                    placeholder={editSpec.lengthPlaceholder || 'e.g. 5, 30, 10,2'}
                    value={editColLength}
                    disabled={!editSpec.hasLength || editColBaseType === 'CUSTOM'}
                    onChange={(e) => setEditColLength(e.target.value)}
                    className={`w-full px-3 py-1.5 rounded border focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-xs ${
                      !editSpec.hasLength || editColBaseType === 'CUSTOM'
                        ? 'opacity-40 cursor-not-allowed bg-gray-800'
                        : isDark
                        ? 'bg-gray-950 border-gray-700 text-white'
                        : 'bg-white border-gray-300'
                    }`}
                  />
                </div>

                {!editSpec.hasLength && editColBaseType !== 'CUSTOM' && (
                  <p className="text-[10px] text-gray-500 mt-1">
                    ประเภท {editColBaseType} เป็นประเภทข้อมูลที่ไม่ต้องระบุความยาว/ขนาด
                  </p>
                )}

                {editColBaseType === 'CUSTOM' && (
                  <div className="mt-2">
                    <label className="block text-[11px] font-medium text-gray-400 mb-0.5">
                      Custom Type Definition
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. VARCHAR(30), INT(5)"
                      value={editColCustomType}
                      onChange={(e) => setEditColCustomType(e.target.value)}
                      className={`w-full px-3 py-1.5 rounded border focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-xs ${
                        isDark ? 'bg-gray-950 border-gray-700 text-white' : 'bg-white border-gray-300'
                      }`}
                    />
                  </div>
                )}

                {/* Quick Presets */}
                <div className="mt-2">
                  <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-1">
                    Quick Presets:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {PRESETS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => applyPreset(p, true)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors border ${
                          computedEditColType === p
                            ? 'bg-blue-600 text-white border-blue-500'
                            : isDark
                            ? 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                            : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="edit-col-nullable"
                  checked={editColNullable}
                  onChange={(e) => setEditColNullable(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="edit-col-nullable" className="cursor-pointer select-none">
                  Allow NULL (Nullable)
                </label>
              </div>

              <div>
                <label className="block font-medium mb-1">
                  Default Value <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder={editSpec.defaultPlaceholder || "e.g. 'active', 0, now()"}
                  value={editColDefault}
                  onChange={(e) => setEditColDefault(e.target.value)}
                  className={`w-full px-3 py-1.5 rounded border focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-xs ${
                    isDark ? 'bg-gray-950 border-gray-700 text-white' : 'bg-white border-gray-300'
                  }`}
                />
                {editSpec.defaultSuggestions && editSpec.defaultSuggestions.length > 0 && (
                  <div className="flex items-center space-x-1.5 mt-1.5 flex-wrap gap-y-1">
                    <span className="text-[10px] text-gray-400">Suggestions:</span>
                    {editSpec.defaultSuggestions.map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => setEditColDefault(sug)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                          editColDefault === sug
                            ? 'bg-blue-600 text-white border-blue-500'
                            : isDark
                            ? 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                            : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {editColumnPreviewSqls.length > 0 && (
                <div className="pt-1">
                  <div className="text-[11px] font-medium text-gray-400 mb-1">
                    SQL Statement Preview:
                  </div>
                  <pre
                    className={`p-2 rounded font-mono text-[11px] overflow-x-auto border ${
                      isDark ? 'bg-gray-950 border-gray-800 text-blue-300' : 'bg-gray-100 border-gray-200 text-blue-700'
                    }`}
                  >
                    {editColumnPreviewSqls.join('\n')}
                  </pre>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setEditColTarget(null)}
                  className={`px-3 py-1.5 rounded transition-colors ${
                    isDark ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !editColName.trim() || !computedEditColType}
                  className="px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-sm transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Modal: Drop Column Confirmation                                          */}
      {/* ========================================================================= */}
      {dropColTarget && (
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
                <span>Drop Column</span>
              </div>

              <p className="text-gray-300">
                Are you sure you want to drop column{' '}
                <strong className="text-white font-mono bg-red-950/60 px-1 py-0.5 rounded border border-red-900/60">
                  {dropColTarget.name}
                </strong>{' '}
                from table <strong className="font-mono text-white">{tableName}</strong>?
              </p>

              <div className="p-2 rounded bg-red-950/40 border border-red-900/40 text-[11px] text-red-300">
                ⚠️ All data stored in this column will be permanently deleted.
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDropColTarget(null)}
                  className={`px-3 py-1.5 rounded transition-colors ${
                    isDark ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="confirm-drop-column-btn"
                  onClick={handleDropColumnConfirm}
                  disabled={submitting}
                  className="px-3.5 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white font-medium shadow-sm transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Dropping...' : 'Drop Column'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Modal: View DDL                                                          */}
      {/* ========================================================================= */}
      {isDdlModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <div
            className={`w-full max-w-xl rounded-lg shadow-xl border overflow-hidden flex flex-col max-h-[80vh] ${
              isDark ? 'bg-gray-900 border-gray-700 text-gray-200' : 'bg-white border-gray-300 text-gray-900'
            }`}
          >
            <div
              className={`flex items-center justify-between px-4 py-3 border-b flex-shrink-0 ${
                isDark ? 'border-gray-800 bg-gray-850' : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Code className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold">Table DDL — {tableName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDdlModalOpen(false)}
                className="p-1 rounded text-gray-400 hover:text-gray-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 flex-1 min-h-0 overflow-auto">
              <pre
                className={`p-3 rounded font-mono text-xs overflow-x-auto border ${
                  isDark ? 'bg-gray-950 border-gray-800 text-blue-300' : 'bg-gray-100 border-gray-200 text-blue-800'
                }`}
              >
                {ddlString}
              </pre>
            </div>

            <div
              className={`flex items-center justify-between px-4 py-2.5 border-t flex-shrink-0 ${
                isDark ? 'border-gray-800 bg-gray-950/60' : 'border-gray-200 bg-gray-50'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(ddlString);
                  setDdlCopied(true);
                  setTimeout(() => setDdlCopied(false), 2000);
                }}
                className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs border font-medium transition-colors ${
                  ddlCopied
                    ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300'
                    : isDark
                    ? 'border-gray-700 hover:bg-gray-800 text-gray-300'
                    : 'border-gray-300 hover:bg-gray-200 text-gray-700'
                }`}
              >
                {ddlCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{ddlCopied ? 'Copied!' : 'Copy SQL'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsDdlModalOpen(false)}
                className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Drop Table */}
      <DropTableModal
        isOpen={isDropTableModalOpen}
        tableName={tableName}
        schemaName={schemaName}
        connectionId={connectionId}
        driver={driver}
        onClose={() => setIsDropTableModalOpen(false)}
        onSuccess={() => {
          onStructureChanged?.();
        }}
      />
    </div>
  );
};
