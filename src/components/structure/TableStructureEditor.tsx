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
  Shield,
  Pencil,
  Wrench,
  Link2,
} from 'lucide-react';
import {
  buildToggleRlsSql,
  buildCreatePolicySql,
  buildDropPolicySql,
  buildGetRlsStatusSql,
  buildGetRlsPoliciesSql,
  type RlsPolicy,
  type PolicyCommand,
} from '../../api/securityHelpers';
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
import {
  buildDropIndexSql,
  getFetchIndexesSql,
  parseIndexesFromQueryResult,
  type TableIndexStructure,
  buildAddForeignKeySql,
  buildDropForeignKeySql,
  getFetchForeignKeysSql,
  parseForeignKeysFromQueryResult,
  type TableForeignKeyStructure,
  buildAddConstraintSql,
  buildDropConstraintSql,
  getFetchConstraintsSql,
  parseConstraintsFromQueryResult,
  type TableConstraintStructure,
} from './tableManagementHelpers';
import { DropTableModal } from './DropTableModal';
import { RenameTableModal } from './RenameTableModal';
import { TableMaintenanceModal } from './TableMaintenanceModal';
import { TablePartitionsModal } from '../performance/TablePartitionsModal';
import { buildAdvancedCreateIndexSql, type IndexType } from '../../api/performanceHelpers';
import { useAuditLogStore } from '../../stores/auditLogStore';
import { Split } from 'lucide-react';

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
  const [indexes, setIndexes] = useState<TableIndexStructure[]>([]);
  const [foreignKeys, setForeignKeys] = useState<TableForeignKeyStructure[]>([]);
  const [constraints, setConstraints] = useState<TableConstraintStructure[]>([]);
  const [activeTab, setActiveTab] = useState<'columns' | 'indexes' | 'foreign-keys' | 'constraints' | 'security' | 'ddl'>('columns');
  const [copiedDdl, setCopiedDdl] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // RLS states
  const [rlsEnabled, setRlsEnabled] = useState(false);
  const [rlsPolicies, setRlsPolicies] = useState<RlsPolicy[]>([]);
  const [isAddPolicyModalOpen, setIsAddPolicyModalOpen] = useState(false);
  const [dropPolicyTarget, setDropPolicyTarget] = useState<RlsPolicy | null>(null);
  const [newPolicyName, setNewPolicyName] = useState('');
  const [newPolicyCmd, setNewPolicyCmd] = useState<PolicyCommand>('ALL');
  const [newPolicyRoles, setNewPolicyRoles] = useState('PUBLIC');
  const [newPolicyPermissive, setNewPolicyPermissive] = useState(true);
  const [newPolicyUsingExpr, setNewPolicyUsingExpr] = useState('');
  const [newPolicyCheckExpr, setNewPolicyCheckExpr] = useState('');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddIndexModalOpen, setIsAddIndexModalOpen] = useState(false);
  const [isAddFkModalOpen, setIsAddFkModalOpen] = useState(false);
  const [isAddConstraintModalOpen, setIsAddConstraintModalOpen] = useState(false);
  const [editColTarget, setEditColTarget] = useState<TableColumnStructure | null>(null);
  const [dropColTarget, setDropColTarget] = useState<TableColumnStructure | null>(null);
  const [dropIndexTarget, setDropIndexTarget] = useState<TableIndexStructure | null>(null);
  const [dropFkTarget, setDropFkTarget] = useState<TableForeignKeyStructure | null>(null);
  const [dropConstraintTarget, setDropConstraintTarget] = useState<TableConstraintStructure | null>(null);
  const [isDdlModalOpen, setIsDdlModalOpen] = useState(false);
  const [isDropTableModalOpen, setIsDropTableModalOpen] = useState(false);
  const [isRenameTableModalOpen, setIsRenameTableModalOpen] = useState(false);
  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
  const [isPartitionsModalOpen, setIsPartitionsModalOpen] = useState(false);
  const [ddlCopied, setDdlCopied] = useState(false);

  // Add FK form fields
  const [newFkName, setNewFkName] = useState('');
  const [newFkCol, setNewFkCol] = useState('');
  const [newFkForeignTable, setNewFkForeignTable] = useState('');
  const [newFkForeignCol, setNewFkForeignCol] = useState('');
  const [newFkOnDelete, setNewFkOnDelete] = useState('NO ACTION');
  const [newFkOnUpdate, setNewFkOnUpdate] = useState('NO ACTION');

  // Add Constraint form fields
  const [newConstraintName, setNewConstraintName] = useState('');
  const [newConstraintType, setNewConstraintType] = useState<'CHECK' | 'UNIQUE'>('CHECK');
  const [newConstraintExpr, setNewConstraintExpr] = useState('');
  const [newConstraintCols, setNewConstraintCols] = useState<string[]>([]);

  // Add Index form fields
  const [newIndexName, setNewIndexName] = useState('');
  const [newIndexCols, setNewIndexCols] = useState<string[]>([]);
  const [newIndexType, setNewIndexType] = useState<IndexType>('BTREE');
  const [newIndexUnique, setNewIndexUnique] = useState(false);

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

  // Load column structure & indexes
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

      // Fetch indexes
      try {
        const idxSql = getFetchIndexesSql(driver, tableName, schemaName);
        const idxRes = await dbApi.executeQuery(tabId, idxSql);
        const parsedIdx = parseIndexesFromQueryResult(idxRes, driver);
        setIndexes(parsedIdx);
      } catch (idxErr) {
        console.warn('Index load fallback error:', idxErr);
      }

      // Fetch foreign keys
      try {
        const fkSql = getFetchForeignKeysSql(driver, tableName, schemaName);
        const fkRes = await dbApi.executeQuery(tabId, fkSql);
        const parsedFk = parseForeignKeysFromQueryResult(fkRes, driver);
        setForeignKeys(parsedFk);
      } catch (fkErr) {
        console.warn('Foreign key load fallback error:', fkErr);
      }

      // Fetch constraints
      try {
        const constSql = getFetchConstraintsSql(driver, tableName, schemaName);
        const constRes = await dbApi.executeQuery(tabId, constSql);
        const parsedConstraints = parseConstraintsFromQueryResult(constRes, driver);
        setConstraints(parsedConstraints);
      } catch (constErr) {
        console.warn('Constraint load fallback error:', constErr);
      }

      // Fetch Row-Level Security (RLS) status & policies
      try {
        const rlsStatusSql = buildGetRlsStatusSql(tableName, schemaName, driver);
        if (rlsStatusSql && !rlsStatusSql.startsWith('--')) {
          const rlsRes = await dbApi.executeQuery(tabId, rlsStatusSql);
          if (rlsRes.rows && rlsRes.rows.length > 0) {
            const val = rlsRes.rows[0][0];
            setRlsEnabled(val === true || val === 't' || val === 'true' || val === 1);
          }
        }
        const rlsPoliciesSql = buildGetRlsPoliciesSql(tableName, schemaName, driver);
        if (rlsPoliciesSql && !rlsPoliciesSql.startsWith('--')) {
          const policiesRes = await dbApi.executeQuery(tabId, rlsPoliciesSql);
          const parsedPolicies: RlsPolicy[] = (policiesRes.rows || []).map((r) => ({
            name: String(r[0] ?? ''),
            permissive: r[1] === true || r[1] === 't' || r[1] === 'PERMISSIVE' || r[1] === 'true',
            roles: String(r[2] ?? 'PUBLIC').split(',').map((x) => x.trim()).filter(Boolean),
            command: String(r[3] ?? 'ALL').toUpperCase() as PolicyCommand,
            usingExpr: r[4] ? String(r[4]) : undefined,
            checkExpr: r[5] ? String(r[5]) : undefined,
          }));
          setRlsPolicies(parsedPolicies);
        }
      } catch (rlsErr) {
        console.warn('RLS load fallback/unsupported:', rlsErr);
      }
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
      setIsAddIndexModalOpen(false);
      setNewIndexName('');
      setNewIndexCols([]);
      setNewIndexUnique(false);
      setNewIndexType('BTREE');
      showStatus('success', `Created index '${newIndexName.trim()}' successfully`);

      useAuditLogStore.getState().addLog({
        action: 'DDL',
        query: sql,
        status: 'SUCCESS',
      });

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
        driver,
        tableName,
        schemaName,
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
      });
    } catch {
      return '';
    }
  }, [driver, tableName, schemaName, newFkName, newFkCol, newFkForeignTable, newFkForeignCol, newFkOnDelete, newFkOnUpdate]);

  // Handle Add Foreign Key
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
      });

      await dbApi.executeQuery(tabId, sql);
      setIsAddFkModalOpen(false);
      setNewFkName('');
      setNewFkCol('');
      setNewFkForeignTable('');
      setNewFkForeignCol('');
      setNewFkOnDelete('NO ACTION');
      setNewFkOnUpdate('NO ACTION');
      showStatus('success', 'Created foreign key successfully');
      await loadStructure();
      onStructureChanged?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus('error', `Failed to create foreign key: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Drop Foreign Key
  const handleDropFkConfirm = async () => {
    if (!dropFkTarget) return;
    setSubmitting(true);
    try {
      const sql = buildDropForeignKeySql({
        driver,
        tableName,
        schemaName,
        constraintName: dropFkTarget.name,
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

  // Preview SQL for Add Constraint
  const addConstraintPreviewSql = useMemo(() => {
    if (!newConstraintName.trim()) return '';
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
      setIsAddConstraintModalOpen(false);
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
        driver,
        tableName,
        schemaName,
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

  // Preview SQL for Add RLS Policy
  const addPolicyPreviewSql = useMemo(() => {
    if (!newPolicyName.trim()) return '';
    try {
      const rolesArray = newPolicyRoles.split(',').map((r) => r.trim()).filter(Boolean);
      return buildCreatePolicySql({
        policyName: newPolicyName.trim(),
        tableName,
        schemaName,
        driver,
        command: newPolicyCmd,
        roles: rolesArray.length > 0 ? rolesArray : ['PUBLIC'],
        permissive: newPolicyPermissive,
        usingExpr: newPolicyUsingExpr.trim() || undefined,
        checkExpr: newPolicyCheckExpr.trim() || undefined,
      });
    } catch {
      return '';
    }
  }, [newPolicyName, tableName, schemaName, driver, newPolicyCmd, newPolicyRoles, newPolicyPermissive, newPolicyUsingExpr, newPolicyCheckExpr]);

  // Handle Toggle RLS
  const handleToggleRls = async () => {
    setSubmitting(true);
    try {
      const nextState = !rlsEnabled;
      const sql = buildToggleRlsSql(tableName, schemaName, nextState, driver);
      await dbApi.executeQuery(tabId, sql);
      setRlsEnabled(nextState);
      useAuditLogStore.getState().addLog({
        connectionId,
        action: 'SECURITY',
        query: sql,
        status: 'SUCCESS',
      });
      showStatus('success', `Row-Level Security ${nextState ? 'enabled' : 'disabled'} successfully.`);
      await loadStructure();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus('error', `Failed to toggle RLS: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Create Policy Submit
  const handleAddPolicySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPolicyName.trim()) return;
    setSubmitting(true);
    try {
      const rolesArray = newPolicyRoles.split(',').map((r) => r.trim()).filter(Boolean);
      const sql = buildCreatePolicySql({
        policyName: newPolicyName.trim(),
        tableName,
        schemaName,
        driver,
        command: newPolicyCmd,
        roles: rolesArray.length > 0 ? rolesArray : ['PUBLIC'],
        permissive: newPolicyPermissive,
        usingExpr: newPolicyUsingExpr.trim() || undefined,
        checkExpr: newPolicyCheckExpr.trim() || undefined,
      });
      await dbApi.executeQuery(tabId, sql);
      useAuditLogStore.getState().addLog({
        connectionId,
        action: 'SECURITY',
        query: sql,
        status: 'SUCCESS',
      });
      setIsAddPolicyModalOpen(false);
      showStatus('success', `Policy "${newPolicyName.trim()}" created successfully.`);
      await loadStructure();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus('error', `Failed to create policy: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Drop Policy
  const handleDropPolicyConfirm = async () => {
    if (!dropPolicyTarget) return;
    setSubmitting(true);
    try {
      const sql = buildDropPolicySql(dropPolicyTarget.name, tableName, schemaName, driver);
      await dbApi.executeQuery(tabId, sql);
      useAuditLogStore.getState().addLog({
        connectionId,
        action: 'SECURITY',
        query: sql,
        status: 'SUCCESS',
      });
      const droppedName = dropPolicyTarget.name;
      setDropPolicyTarget(null);
      showStatus('success', `Policy "${droppedName}" dropped successfully.`);
      await loadStructure();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus('error', `Failed to drop policy: ${msg}`);
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

          {/* Tab Selector */}
          <div className="flex items-center space-x-1 bg-gray-950/60 p-0.5 rounded border border-gray-800">
            <button
              type="button"
              data-testid="tab-columns-btn"
              onClick={() => setActiveTab('columns')}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === 'columns'
                  ? isDark ? 'bg-gray-800 text-white' : 'bg-white text-gray-900 shadow-sm'
                  : isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Columns ({columns.length})
            </button>
            <button
              type="button"
              data-testid="tab-indexes-btn"
              onClick={() => setActiveTab('indexes')}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center space-x-1 ${
                activeTab === 'indexes'
                  ? isDark ? 'bg-gray-800 text-white' : 'bg-white text-gray-900 shadow-sm'
                  : isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>Indexes ({indexes.length})</span>
            </button>
            <button
              type="button"
              data-testid="tab-foreign-keys-btn"
              onClick={() => setActiveTab('foreign-keys')}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center space-x-1 ${
                activeTab === 'foreign-keys'
                  ? isDark ? 'bg-gray-800 text-white' : 'bg-white text-gray-900 shadow-sm'
                  : isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Link2 className="w-3 h-3" />
              <span>Foreign Keys ({foreignKeys.length})</span>
            </button>
            <button
              type="button"
              data-testid="tab-constraints-btn"
              onClick={() => setActiveTab('constraints')}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center space-x-1 ${
                activeTab === 'constraints'
                  ? isDark ? 'bg-gray-800 text-white' : 'bg-white text-gray-900 shadow-sm'
                  : isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <ShieldAlert className="w-3 h-3" />
              <span>Constraints ({constraints.length})</span>
            </button>
            <button
              type="button"
              data-testid="tab-security-btn"
              onClick={() => setActiveTab('security')}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center space-x-1 ${
                activeTab === 'security'
                  ? isDark ? 'bg-gray-800 text-white' : 'bg-white text-gray-900 shadow-sm'
                  : isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Shield className="w-3 h-3 text-rose-400" />
              <span>Security / RLS ({rlsPolicies.length})</span>
            </button>
            <button
              type="button"
              data-testid="tab-ddl-btn"
              onClick={() => setActiveTab('ddl')}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center space-x-1 ${
                activeTab === 'ddl'
                  ? isDark ? 'bg-gray-800 text-white' : 'bg-white text-gray-900 shadow-sm'
                  : isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Code className="w-3 h-3 text-accent" />
              <span>SQL Preview</span>
            </button>
          </div>

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
          {activeTab === 'columns' ? (
            <button
              type="button"
              data-testid="add-column-btn"
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center space-x-1.5 px-2.5 h-btn text-xs font-medium rounded bg-accent hover:bg-accent-hover text-white shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Column</span>
            </button>
          ) : activeTab === 'indexes' ? (
            <button
              type="button"
              data-testid="add-index-btn"
              onClick={() => {
                const defaultCol = columns[0]?.name || '';
                setNewIndexName(`idx_${tableName}_${defaultCol || 'col'}`);
                setNewIndexCols(defaultCol ? [defaultCol] : []);
                setNewIndexUnique(false);
                setIsAddIndexModalOpen(true);
              }}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Index</span>
            </button>
          ) : activeTab === 'foreign-keys' ? (
            <button
              type="button"
              data-testid="add-foreign-key-btn"
              onClick={() => {
                const defaultCol = columns[0]?.name || '';
                setNewFkName(`fk_${tableName}_${defaultCol || 'col'}`);
                setNewFkCol(defaultCol);
                setNewFkForeignTable('');
                setNewFkForeignCol('id');
                setNewFkOnDelete('NO ACTION');
                setNewFkOnUpdate('NO ACTION');
                setIsAddFkModalOpen(true);
              }}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Foreign Key</span>
            </button>
          ) : activeTab === 'constraints' ? (
            <button
              type="button"
              data-testid="add-constraint-btn"
              onClick={() => {
                const defaultCol = columns[0]?.name || '';
                setNewConstraintName(`chk_${tableName}_valid`);
                setNewConstraintType('CHECK');
                setNewConstraintExpr(`${defaultCol} IS NOT NULL`);
                setNewConstraintCols(defaultCol ? [defaultCol] : []);
                setIsAddConstraintModalOpen(true);
              }}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded bg-purple-600 hover:bg-purple-500 text-white shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Constraint</span>
            </button>
          ) : activeTab === 'security' ? (
            <div className="flex items-center space-x-2">
              <button
                type="button"
                data-testid="toggle-rls-btn"
                onClick={handleToggleRls}
                disabled={submitting}
                className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded text-white shadow-sm transition-colors ${
                  rlsEnabled ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>{rlsEnabled ? 'Disable RLS' : 'Enable RLS'}</span>
              </button>
              {rlsEnabled && (
                <button
                  type="button"
                  data-testid="add-policy-btn"
                  onClick={() => {
                    setNewPolicyName(`policy_${tableName}_user`);
                    setNewPolicyCmd('ALL');
                    setNewPolicyRoles('PUBLIC');
                    setNewPolicyPermissive(true);
                    setNewPolicyUsingExpr('');
                    setNewPolicyCheckExpr('');
                    setIsAddPolicyModalOpen(true);
                  }}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded bg-rose-600 hover:bg-rose-500 text-white shadow-sm transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Policy</span>
                </button>
              )}
            </div>
          ) : null}

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
            data-testid="rename-table-toolbar-btn"
            onClick={() => setIsRenameTableModalOpen(true)}
            title="Rename Table"
            className={`inline-flex items-center space-x-1 px-2.5 py-1.5 rounded text-xs transition-colors border ${
              isDark
                ? 'border-gray-700 bg-gray-800/80 hover:bg-gray-800 text-gray-300'
                : 'border-gray-300 bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <Pencil className="w-3.5 h-3.5 text-blue-400" />
            <span>Rename</span>
          </button>

          <button
            type="button"
            data-testid="partitions-table-toolbar-btn"
            onClick={() => setIsPartitionsModalOpen(true)}
            title="Table Partitions & Ranges"
            className={`inline-flex items-center space-x-1 px-2.5 py-1.5 rounded text-xs transition-colors border ${
              isDark
                ? 'border-gray-700 bg-gray-800/80 hover:bg-gray-800 text-gray-300'
                : 'border-gray-300 bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <Split className="w-3.5 h-3.5 text-teal-400" />
            <span>Partitions</span>
          </button>

          <button
            type="button"
            data-testid="maintenance-table-toolbar-btn"
            onClick={() => setIsMaintenanceModalOpen(true)}
            title="Table Maintenance & Diagnostics"
            className={`inline-flex items-center space-x-1 px-2.5 py-1.5 rounded text-xs transition-colors border ${
              isDark
                ? 'border-gray-700 bg-gray-800/80 hover:bg-gray-800 text-gray-300'
                : 'border-gray-300 bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <Wrench className="w-3.5 h-3.5 text-emerald-400" />
            <span>Maintain</span>
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
        ) : activeTab === 'columns' ? (
          columns.length === 0 ? (
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
          )
        ) : activeTab === 'indexes' ? (
          indexes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 space-y-2">
              <Layers className="w-10 h-10 opacity-30" />
              <span className="text-xs">No indexes found on this table.</span>
              <button
                type="button"
                onClick={() => {
                  const defaultCol = columns[0]?.name || '';
                  setNewIndexName(`idx_${tableName}_${defaultCol || 'col'}`);
                  setNewIndexCols(defaultCol ? [defaultCol] : []);
                  setNewIndexUnique(false);
                  setIsAddIndexModalOpen(true);
                }}
                className="mt-2 px-3 py-1.5 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white flex items-center space-x-1"
              >
                <Plus className="w-3 h-3" />
                <span>Create Index</span>
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
                    <th className="py-2.5 px-3">Index Name</th>
                    <th className="py-2.5 px-3">Indexed Columns</th>
                    <th className="py-2.5 px-3 w-28 text-center">Type</th>
                    <th className="py-2.5 px-3 w-28 text-center">Attributes</th>
                    <th className="py-2.5 px-3 w-24 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {indexes.map((idx, i) => (
                    <tr
                      key={idx.name}
                      data-testid={`index-row-${idx.name}`}
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
                        {idx.isPrimary ? (
                          <span title="Primary Key Index">
                            <Key className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                          </span>
                        ) : (
                          <Layers className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                        )}
                        <span className="font-mono text-xs">{idx.name}</span>
                      </td>

                      <td className="py-2 px-3 font-mono text-xs text-gray-300">
                        {idx.columns.join(', ')}
                      </td>

                      <td className="py-2 px-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-gray-800 text-gray-300 border border-gray-700">
                          {idx.indexType || 'BTREE'}
                        </span>
                      </td>

                      <td className="py-2 px-3 text-center space-x-1">
                        {idx.isPrimary && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800">
                            PK
                          </span>
                        )}
                        {idx.isUnique && !idx.isPrimary && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-950/80 text-blue-300 border border-blue-800">
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
                            className="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors"
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
          )
        ) : activeTab === 'foreign-keys' ? (
          foreignKeys.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 space-y-2">
              <Link2 className="w-10 h-10 opacity-30" />
              <span className="text-xs">No foreign keys defined on this table.</span>
              <button
                type="button"
                onClick={() => {
                  const defaultCol = columns[0]?.name || '';
                  setNewFkName(`fk_${tableName}_${defaultCol || 'col'}`);
                  setNewFkCol(defaultCol);
                  setNewFkForeignTable('');
                  setNewFkForeignCol('id');
                  setNewFkOnDelete('NO ACTION');
                  setNewFkOnUpdate('NO ACTION');
                  setIsAddFkModalOpen(true);
                }}
                className="mt-2 px-3 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white flex items-center space-x-1"
              >
                <Plus className="w-3 h-3" />
                <span>Add Foreign Key</span>
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
                    <th className="py-2.5 px-3">Local Column</th>
                    <th className="py-2.5 px-3">Referenced Table & Column</th>
                    <th className="py-2.5 px-3 w-28 text-center">On Delete</th>
                    <th className="py-2.5 px-3 w-28 text-center">On Update</th>
                    <th className="py-2.5 px-3 w-24 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {foreignKeys.map((fk, i) => (
                    <tr
                      key={fk.name}
                      data-testid={`fk-row-${fk.name}`}
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
                        <Link2 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                        <span className="font-mono text-xs">{fk.name}</span>
                      </td>
                      <td className="py-2 px-3 font-mono text-xs text-blue-300">
                        {fk.columnNames.join(', ')}
                      </td>
                      <td className="py-2 px-3 font-mono text-xs text-gray-300">
                        <span className="font-semibold text-emerald-400">{fk.foreignTableName}</span>
                        <span>({fk.foreignColumnNames.join(', ')})</span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-gray-800 text-gray-300 border border-gray-700">
                          {fk.onDelete || 'NO ACTION'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-gray-800 text-gray-300 border border-gray-700">
                          {fk.onUpdate || 'NO ACTION'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <button
                          type="button"
                          data-testid={`drop-fk-btn-${fk.name}`}
                          onClick={() => setDropFkTarget(fk)}
                          title="Drop Foreign Key"
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
          )
        ) : activeTab === 'constraints' ? (
          constraints.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 space-y-2">
              <ShieldAlert className="w-10 h-10 opacity-30" />
              <span className="text-xs">No custom constraints defined on this table.</span>
              <button
                type="button"
                onClick={() => {
                  const defaultCol = columns[0]?.name || '';
                  setNewConstraintName(`chk_${tableName}_valid`);
                  setNewConstraintType('CHECK');
                  setNewConstraintExpr(`${defaultCol} IS NOT NULL`);
                  setNewConstraintCols(defaultCol ? [defaultCol] : []);
                  setIsAddConstraintModalOpen(true);
                }}
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
          )
        ) : activeTab === 'security' ? (
          <div className="space-y-4">
            {/* RLS Status Card */}
            <div
              data-testid="rls-status-banner"
              className={`p-3.5 rounded-lg border flex items-center justify-between ${
                rlsEnabled
                  ? isDark ? 'bg-emerald-950/20 border-emerald-900/40 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : isDark ? 'bg-amber-950/20 border-amber-900/40 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Shield className={`w-5 h-5 flex-shrink-0 ${rlsEnabled ? 'text-emerald-400' : 'text-amber-400'}`} />
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-xs">Row-Level Security (RLS)</span>
                    <span
                      data-testid="rls-status-state"
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        rlsEnabled
                          ? 'bg-emerald-900/80 text-emerald-200 border border-emerald-700'
                          : 'bg-amber-900/80 text-amber-200 border border-amber-700'
                      }`}
                    >
                      {rlsEnabled ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </div>
                  <p className="text-[11px] opacity-80 mt-0.5">
                    {rlsEnabled
                      ? 'Row-level access policies are strictly enforced for queries on this table.'
                      : 'RLS is currently disabled. All rows are visible according to normal role permissions.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                data-testid="rls-toggle-status-btn"
                onClick={handleToggleRls}
                disabled={submitting}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  rlsEnabled
                    ? 'bg-amber-700/80 hover:bg-amber-600 text-white'
                    : 'bg-emerald-700/80 hover:bg-emerald-600 text-white'
                }`}
              >
                {rlsEnabled ? 'Disable RLS' : 'Enable RLS'}
              </button>
            </div>

            {/* Policies Section */}
            {rlsPolicies.length === 0 ? (
              <div
                data-testid="no-policies-view"
                className={`p-8 text-center border rounded-lg ${
                  isDark ? 'border-gray-800 bg-gray-900/40 text-gray-400' : 'border-gray-200 bg-white text-gray-500'
                }`}
              >
                <Shield className="w-8 h-8 mx-auto mb-2 text-rose-400/60" />
                <p className="text-sm font-medium">No Row-Level Security Policies</p>
                <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
                  {rlsEnabled
                    ? 'RLS is active, but no policies exist. By default in PostgreSQL, table owners and superusers have full access while other roles cannot access any rows.'
                    : 'Enable RLS and create security policies to restrict rows based on user role or session parameters.'}
                </p>
                {rlsEnabled && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewPolicyName(`policy_${tableName}_user`);
                      setNewPolicyCmd('ALL');
                      setNewPolicyRoles('PUBLIC');
                      setNewPolicyPermissive(true);
                      setNewPolicyUsingExpr('');
                      setNewPolicyCheckExpr('');
                      setIsAddPolicyModalOpen(true);
                    }}
                    className="mt-3 inline-flex items-center space-x-1 px-3 py-1.5 text-xs rounded bg-rose-600 hover:bg-rose-500 text-white font-medium shadow-sm transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create First Policy</span>
                  </button>
                )}
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
                      <th className="py-2.5 px-3">Policy Name</th>
                      <th className="py-2.5 px-3 w-24 text-center">Command</th>
                      <th className="py-2.5 px-3 w-28">Roles</th>
                      <th className="py-2.5 px-3 w-28 text-center">Type</th>
                      <th className="py-2.5 px-3">USING Expression</th>
                      <th className="py-2.5 px-3">WITH CHECK Expression</th>
                      <th className="py-2.5 px-3 w-20 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {rlsPolicies.map((p, i) => (
                      <tr
                        key={p.name}
                        data-testid={`policy-row-${p.name}`}
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
                          <Shield className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                          <span className="font-mono text-xs">{p.name}</span>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-950/80 text-rose-300 border border-rose-800">
                            {p.command}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-xs text-gray-300">
                          {p.roles.join(', ') || 'PUBLIC'}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className="text-[11px] text-gray-400">
                            {p.permissive ? 'PERMISSIVE' : 'RESTRICTIVE'}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-xs text-emerald-300/90 truncate max-w-[200px]" title={p.usingExpr}>
                          {p.usingExpr || '-'}
                        </td>
                        <td className="py-2 px-3 font-mono text-xs text-blue-300/90 truncate max-w-[200px]" title={p.checkExpr}>
                          {p.checkExpr || '-'}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <button
                            type="button"
                            data-testid={`drop-policy-btn-${p.name}`}
                            onClick={() => setDropPolicyTarget(p)}
                            title="Drop Policy"
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
          </div>
        ) : activeTab === 'ddl' ? (
          <div
            className={`border rounded-lg overflow-hidden shadow-sm flex flex-col ${
              isDark ? 'border-gray-800 bg-gray-900/60' : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 bg-gray-950/40 text-xs">
              <span className="font-mono text-gray-400 text-[11px]">SQL Schema Definition (DDL)</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(generateTableDdl({ driver, tableName, schemaName, columns }));
                  setCopiedDdl(true);
                  setTimeout(() => setCopiedDdl(false), 1500);
                }}
                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700"
              >
                {copiedDdl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedDdl ? 'Copied' : 'Copy SQL'}</span>
              </button>
            </div>
            <pre className="p-4 font-mono text-xs text-gray-200 overflow-x-auto select-text leading-relaxed whitespace-pre-wrap">
              {generateTableDdl({ driver, tableName, schemaName, columns })}
            </pre>
          </div>
        ) : null}
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

              <div>
                <label className="block text-gray-400 mb-1 font-medium">Index Type / Structure</label>
                <select
                  value={newIndexType}
                  onChange={(e) => setNewIndexType(e.target.value as IndexType)}
                  data-testid="new-index-type-select"
                  className={`w-full px-2.5 py-1.5 rounded border focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs ${
                    isDark ? 'bg-gray-950 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
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

              <div>
                <label className="block text-gray-400 mb-1 font-medium">Index Type / Structure</label>
                <select
                  value={newIndexType}
                  onChange={(e) => setNewIndexType(e.target.value as IndexType)}
                  data-testid="new-index-type-select"
                  className={`w-full px-2.5 py-1.5 rounded border focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs ${
                    isDark ? 'bg-gray-950 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
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

      {/* ========================================================================= */}
      {/* Modal: Add Index                                                         */}
      {/* ========================================================================= */}
      {isAddIndexModalOpen && (
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
                <h3 className="text-sm font-semibold">Add New Index</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddIndexModalOpen(false)}
                className="p-1 rounded text-gray-400 hover:text-gray-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddIndexSubmit} className="p-4 space-y-3.5 text-xs">
              <div>
                <label className="block text-gray-400 mb-1 font-medium">
                  Index Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. idx_users_email"
                  value={newIndexName}
                  onChange={(e) => setNewIndexName(e.target.value)}
                  data-testid="new-index-name-input"
                  className={`w-full px-2.5 py-1.5 rounded border font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                    isDark ? 'bg-gray-950 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1 font-medium">
                  Indexed Columns <span className="text-red-400">*</span>
                </label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border rounded border-gray-800 bg-gray-950/40">
                  {columns.map((col) => {
                    const isSelected = newIndexCols.includes(col.name);
                    return (
                      <label
                        key={col.name}
                        className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded cursor-pointer border text-xs transition-colors ${
                          isSelected
                            ? 'bg-blue-950 text-blue-300 border-blue-600 font-semibold'
                            : 'bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-600'
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
                <label className="block text-gray-400 mb-1 font-medium">Index Type / Structure</label>
                <select
                  value={newIndexType}
                  onChange={(e) => setNewIndexType(e.target.value as IndexType)}
                  data-testid="new-index-type-select"
                  className={`w-full px-2.5 py-1.5 rounded border focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs ${
                    isDark ? 'bg-gray-950 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
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
                  className="rounded border-gray-700 bg-gray-800 text-blue-500 focus:ring-0"
                />
                <label htmlFor="new-index-unique" className="text-gray-300 select-none cursor-pointer">
                  Unique Index (disallow duplicate values)
                </label>
              </div>

              {addIndexPreviewSql && (
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    SQL Preview
                  </div>
                  <pre
                    data-testid="add-index-preview-sql"
                    className={`p-2 rounded font-mono text-[11px] overflow-x-auto border ${
                      isDark ? 'bg-gray-950 border-gray-800 text-emerald-300' : 'bg-gray-100 border-gray-200 text-emerald-700'
                    }`}
                  >
                    {addIndexPreviewSql}
                  </pre>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsAddIndexModalOpen(false)}
                  className={`px-3 py-1.5 rounded transition-colors ${
                    isDark ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
                  }`}
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

      {/* ========================================================================= */}
      {/* Modal: Drop Index Confirmation                                           */}
      {/* ========================================================================= */}
      {dropIndexTarget && (
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
                <h3 className="text-sm font-semibold">Drop Index</h3>
              </div>

              <p className="text-gray-300">
                Are you sure you want to drop index{' '}
                <strong className="text-white font-mono bg-red-950/60 px-1 py-0.5 rounded border border-red-900/60">
                  {dropIndexTarget.name}
                </strong>{' '}
                from table <strong className="font-mono text-white">{tableName}</strong>?
              </p>

              <div className="p-2 rounded bg-gray-950 border border-gray-800 font-mono text-[11px] text-red-300">
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
                  className={`px-3 py-1.5 rounded transition-colors ${
                    isDark ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
                  }`}
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

      {/* ========================================================================= */}
      {/* Modal: Add Foreign Key                                                    */}
      {/* ========================================================================= */}
      {isAddFkModalOpen && (
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
                onClick={() => setIsAddFkModalOpen(false)}
                className="p-1 rounded text-gray-400 hover:text-gray-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddFkSubmit} className="p-4 space-y-3.5 text-xs">
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
                  onClick={() => setIsAddFkModalOpen(false)}
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

      {/* ========================================================================= */}
      {/* Modal: Drop Foreign Key Confirmation                                      */}
      {/* ========================================================================= */}
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
                {buildDropForeignKeySql({
                  tableName,
                  schemaName,
                  driver,
                  constraintName: dropFkTarget.name,
                })}
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

      {/* ========================================================================= */}
      {/* Modal: Add Constraint                                                     */}
      {/* ========================================================================= */}
      {isAddConstraintModalOpen && (
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
                onClick={() => setIsAddConstraintModalOpen(false)}
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
                  onClick={() => setIsAddConstraintModalOpen(false)}
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

      {/* ========================================================================= */}
      {/* Modal: Drop Constraint Confirmation                                       */}
      {/* ========================================================================= */}
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

      {/* ========================================================================= */}
      {/* Modal: Add RLS Policy                                                     */}
      {/* ========================================================================= */}
      {isAddPolicyModalOpen && (
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
                <Shield className="w-4 h-4 text-rose-400" />
                <h3 className="text-sm font-semibold">Add RLS Policy to {tableName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddPolicyModalOpen(false)}
                className="p-1 rounded text-gray-400 hover:text-gray-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddPolicySubmit} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-medium mb-1">
                  Policy Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  data-testid="new-policy-name-input"
                  placeholder="e.g. users_select_own, tenant_isolation"
                  value={newPolicyName}
                  onChange={(e) => setNewPolicyName(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded border text-xs font-mono outline-none focus:border-rose-500 ${
                    isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Command</label>
                  <select
                    data-testid="new-policy-cmd-select"
                    value={newPolicyCmd}
                    onChange={(e) => setNewPolicyCmd(e.target.value as PolicyCommand)}
                    className={`w-full px-2 py-1.5 rounded border text-xs outline-none focus:border-rose-500 ${
                      isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    <option value="ALL">ALL (Select, Insert, Update, Delete)</option>
                    <option value="SELECT">SELECT</option>
                    <option value="INSERT">INSERT</option>
                    <option value="UPDATE">UPDATE</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium mb-1">Target Roles</label>
                  <input
                    type="text"
                    data-testid="new-policy-roles-input"
                    placeholder="PUBLIC or role1, role2"
                    value={newPolicyRoles}
                    onChange={(e) => setNewPolicyRoles(e.target.value)}
                    className={`w-full px-2 py-1.5 rounded border text-xs font-mono outline-none focus:border-rose-500 ${
                      isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1">Policy Mode</label>
                <div className="flex items-center space-x-4">
                  <label className="inline-flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="policyPermissive"
                      checked={newPolicyPermissive}
                      onChange={() => setNewPolicyPermissive(true)}
                      className="text-rose-600 focus:ring-0"
                    />
                    <span>PERMISSIVE (OR with other policies)</span>
                  </label>
                  <label className="inline-flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="policyPermissive"
                      checked={!newPolicyPermissive}
                      onChange={() => setNewPolicyPermissive(false)}
                      className="text-rose-600 focus:ring-0"
                    />
                    <span>RESTRICTIVE (AND combined)</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1">
                  USING Expression (Row Visibility / Filter)
                </label>
                <textarea
                  rows={2}
                  data-testid="new-policy-using-input"
                  placeholder="e.g. user_id = current_user_id() or role = 'admin'"
                  value={newPolicyUsingExpr}
                  onChange={(e) => setNewPolicyUsingExpr(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded border text-xs font-mono outline-none focus:border-rose-500 ${
                    isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>

              <div>
                <label className="block font-medium mb-1">
                  WITH CHECK Expression (Allowed Inserts & Updates)
                </label>
                <textarea
                  rows={2}
                  data-testid="new-policy-check-input"
                  placeholder="Optional check expression for INSERT/UPDATE rows"
                  value={newPolicyCheckExpr}
                  onChange={(e) => setNewPolicyCheckExpr(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded border text-xs font-mono outline-none focus:border-rose-500 ${
                    isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>

              {addPolicyPreviewSql && (
                <div>
                  <label className="block font-medium mb-1 text-gray-400">SQL Preview</label>
                  <div
                    data-testid="add-policy-preview-sql"
                    className="p-2 rounded bg-gray-950 border border-gray-800 font-mono text-[11px] text-rose-300 select-text break-all"
                  >
                    {addPolicyPreviewSql}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsAddPolicyModalOpen(false)}
                  className={`px-3 py-1.5 rounded transition-colors ${
                    isDark ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="confirm-add-policy-btn"
                  disabled={submitting || !newPolicyName.trim()}
                  className="px-3.5 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium shadow-sm transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Modal: Drop RLS Policy Confirmation                                       */}
      {/* ========================================================================= */}
      {dropPolicyTarget && (
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
                <h3 className="text-sm font-semibold">Drop RLS Policy</h3>
              </div>

              <p className="text-gray-300">
                Are you sure you want to drop policy{' '}
                <strong className="text-white font-mono bg-red-950/60 px-1 py-0.5 rounded border border-red-900/60">
                  {dropPolicyTarget.name}
                </strong>{' '}
                from table <strong className="font-mono text-white">{tableName}</strong>?
              </p>

              <div className="p-2 rounded bg-gray-950 border border-gray-800 font-mono text-[11px] text-red-300">
                {buildDropPolicySql(dropPolicyTarget.name, tableName, schemaName, driver)}
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDropPolicyTarget(null)}
                  className={`px-3 py-1.5 rounded transition-colors ${
                    isDark ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="confirm-drop-policy-btn"
                  onClick={handleDropPolicyConfirm}
                  disabled={submitting}
                  className="px-3.5 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white font-medium shadow-sm transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Dropping...' : 'Drop Policy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Rename Table */}
      <RenameTableModal
        isOpen={isRenameTableModalOpen}
        tableName={tableName}
        schemaName={schemaName}
        connectionId={connectionId}
        driver={driver}
        onClose={() => setIsRenameTableModalOpen(false)}
        onSuccess={() => {
          onStructureChanged?.();
        }}
      />

      {/* Modal: Table Maintenance */}
      <TableMaintenanceModal
        isOpen={isMaintenanceModalOpen}
        tableName={tableName}
        schemaName={schemaName}
        connectionId={connectionId}
        driver={driver}
        onClose={() => setIsMaintenanceModalOpen(false)}
        onSuccess={() => {
          onStructureChanged?.();
        }}
      />

      {/* Modal: Table Partitions */}
      <TablePartitionsModal
        isOpen={isPartitionsModalOpen}
        tableName={tableName}
        schemaName={schemaName}
        connectionId={connectionId}
        driver={driver}
        onClose={() => setIsPartitionsModalOpen(false)}
      />

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
