import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table as TableIcon,
  Plus,
  RefreshCw,
  Code,
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
  Split,
  Trash2,
} from 'lucide-react';
import {
  buildToggleRlsSql,
  buildGetRlsStatusSql,
  buildGetRlsPoliciesSql,
  type RlsPolicy,
} from '../../api/securityHelpers';
import { dbApi } from '../../api/db';
import {
  getFetchColumnsSql,
  parseColumnsFromQueryResult,
  generateTableDdl,
  getFetchTableDdlSql,
  parseTableDdlFromQueryResult,
  enrichColumnsFromSqliteDdl,
  enrichForeignKeysFromSqliteDdl,
  type TableColumnStructure,
} from './tableStructureHelpers';
import {
  getFetchIndexesSql,
  parseIndexesFromQueryResult,
  type TableIndexStructure,
  getFetchForeignKeysSql,
  parseForeignKeysFromQueryResult,
  type TableForeignKeyStructure,
  getFetchConstraintsSql,
  parseConstraintsFromQueryResult,
  getFetchTriggersSql,
  parseTriggersFromQueryResult,
  type TableConstraintStructure,
} from './tableManagementHelpers';
import type { TableTriggerDef } from '../../api/queryBuilder';
import { DropTableModal } from './DropTableModal';
import { RenameTableModal } from './RenameTableModal';
import { TableMaintenanceModal } from './TableMaintenanceModal';
import { TablePartitionsModal } from '../performance/TablePartitionsModal';
import { useAuditLogStore } from '../../stores/auditLogStore';
import { formatCellValue } from '../../utils/cellFormatter';
import { ColumnsTab } from './tabs/ColumnsTab';
import { IndexesTab } from './tabs/IndexesTab';
import { ForeignKeysTab } from './tabs/ForeignKeysTab';
import { ConstraintsTab } from './tabs/ConstraintsTab';
import { RlsSecurityTab } from './tabs/RlsSecurityTab';

export interface TableStructureEditorProps {
  tabId: string;
  connectionId: string;
  tableName: string;
  schemaName?: string;
  driver?: string;
  theme?: 'dark' | 'light';
  onStructureChanged?: () => void;
}

export const TableStructureEditor: React.FC<TableStructureEditorProps> = ({
  tabId,
  connectionId,
  tableName,
  schemaName,
  driver = 'postgres',
  theme = 'dark',
  onStructureChanged,
}) => {
  const isDark = theme === 'dark';

  // Core table state
  const [columns, setColumns] = useState<TableColumnStructure[]>([]);
  const [indexes, setIndexes] = useState<TableIndexStructure[]>([]);
  const [triggers, setTriggers] = useState<TableTriggerDef[]>([]);
  const [foreignKeys, setForeignKeys] = useState<TableForeignKeyStructure[]>([]);
  const [constraints, setConstraints] = useState<TableConstraintStructure[]>([]);
  const [tableDdl, setTableDdl] = useState<string | null>(null);

  // Tab & loading state
  const [activeTab, setActiveTab] = useState<'columns' | 'indexes' | 'foreign-keys' | 'constraints' | 'security' | 'ddl'>('columns');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [copiedDdl, setCopiedDdl] = useState(false);
  const [ddlModalCopied, setDdlModalCopied] = useState(false);

  // RLS state
  const [rlsEnabled, setRlsEnabled] = useState(false);
  const [rlsPolicies, setRlsPolicies] = useState<RlsPolicy[]>([]);
  const [submittingRls, setSubmittingRls] = useState(false);

  // Sub-tabs add modal controllers
  const [isAddColumnModalOpen, setIsAddColumnModalOpen] = useState(false);
  const [isAddIndexModalOpen, setIsAddIndexModalOpen] = useState(false);
  const [isAddFkModalOpen, setIsAddFkModalOpen] = useState(false);
  const [isAddConstraintModalOpen, setIsAddConstraintModalOpen] = useState(false);
  const [isAddPolicyModalOpen, setIsAddPolicyModalOpen] = useState(false);

  // Table-level modal states
  const [isDdlModalOpen, setIsDdlModalOpen] = useState(false);
  const [isDropTableModalOpen, setIsDropTableModalOpen] = useState(false);
  const [isRenameTableModalOpen, setIsRenameTableModalOpen] = useState(false);
  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
  const [isPartitionsModalOpen, setIsPartitionsModalOpen] = useState(false);

  const showStatus = useCallback((type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    if (type === 'success') {
      setTimeout(() => {
        setStatusMessage(null);
      }, 4000);
    }
  }, []);

  // Load column structure & metadata
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

      if (parsedCols.length === 0) {
        const tableData = await dbApi.fetchTableData(tabId, tableName, schemaName, 1, 0);
        parsedCols = parseColumnsFromQueryResult(
          { columns: [], rows: [], execution_time_ms: 0 },
          driver,
          tableData.columns
        );
      }

      let parsedDdl: string | null = null;
      if ((driver || '').toLowerCase() === 'sqlite') {
        try {
          const ddlSql = getFetchTableDdlSql(driver, tableName, schemaName);
          if (ddlSql) {
            const ddlRes = await dbApi.executeQuery(tabId, ddlSql);
            parsedDdl = parseTableDdlFromQueryResult(ddlRes);
            parsedCols = enrichColumnsFromSqliteDdl(parsedCols, parsedDdl);
          }
        } catch (ddlErr) {
          console.warn('DDL load fallback error:', ddlErr);
        }
      }
      setTableDdl(parsedDdl);
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

      // Fetch triggers (SQLite only)
      try {
        const triggerSql = getFetchTriggersSql(driver, tableName);
        if (triggerSql) {
          const triggerRes = await dbApi.executeQuery(tabId, triggerSql);
          setTriggers(parseTriggersFromQueryResult(triggerRes, driver));
        } else {
          setTriggers([]);
        }
      } catch (triggerErr) {
        console.warn('Trigger load fallback error:', triggerErr);
      }

      // Fetch foreign keys
      try {
        const fkSql = getFetchForeignKeysSql(driver, tableName, schemaName);
        const fkRes = await dbApi.executeQuery(tabId, fkSql);
        let parsedFk = parseForeignKeysFromQueryResult(fkRes, driver);
        if ((driver || '').toLowerCase().includes('sqlite') && parsedDdl) {
          parsedFk = enrichForeignKeysFromSqliteDdl(parsedFk, parsedDdl);
        }
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
            const rawVal = rlsRes.rows[0][0];
            const strVal = formatCellValue(rawVal).toLowerCase();
            setRlsEnabled(strVal === 'true' || strVal === 't' || strVal === '1');
          }
        }
        const rlsPoliciesSql = buildGetRlsPoliciesSql(tableName, schemaName, driver);
        if (rlsPoliciesSql && !rlsPoliciesSql.startsWith('--')) {
          const policiesRes = await dbApi.executeQuery(tabId, rlsPoliciesSql);
          const parsedPolicies: RlsPolicy[] = (policiesRes.rows || []).map((r) => {
            const pVal = formatCellValue(r[1]).toLowerCase();
            return {
              name: formatCellValue(r[0]),
              permissive: pVal === 'true' || pVal === 't' || pVal === 'permissive' || pVal === '1',
              roles: formatCellValue(r[2] ?? 'PUBLIC').split(',').map((x) => x.trim()).filter(Boolean),
              command: (formatCellValue(r[3] ?? 'ALL').toUpperCase() || 'ALL') as any,
              usingExpr: r[4] ? formatCellValue(r[4]) : undefined,
              checkExpr: r[5] ? formatCellValue(r[5]) : undefined,
            };
          });
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

  // Toggle RLS handler
  const handleToggleRls = async () => {
    setSubmittingRls(true);
    try {
      const targetState = !rlsEnabled;
      const sql = buildToggleRlsSql(tableName, schemaName, targetState, driver);
      await dbApi.executeQuery(tabId, sql);

      useAuditLogStore.getState().addLog({
        connectionId,
        action: 'SECURITY',
        query: sql,
        status: 'SUCCESS',
      });

      setRlsEnabled(targetState);
      showStatus('success', `${targetState ? 'Enabled' : 'Disabled'} Row-Level Security successfully`);
      await loadStructure();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus('error', `Failed to toggle RLS: ${msg}`);
    } finally {
      setSubmittingRls(false);
    }
  };

  // Full table DDL
  const fullDdl = useMemo(() => {
    if ((driver || '').toLowerCase() === 'sqlite' && tableDdl) {
      return tableDdl;
    }
    return generateTableDdl({
      tableName,
      schemaName,
      driver,
      columns,
    });
  }, [tableName, schemaName, driver, columns, tableDdl]);

  const handleCopyDdl = (forModal = false) => {
    navigator.clipboard.writeText(fullDdl);
    if (forModal) {
      setDdlModalCopied(true);
      setTimeout(() => setDdlModalCopied(false), 2000);
    } else {
      setCopiedDdl(true);
      setTimeout(() => setCopiedDdl(false), 2000);
    }
  };

  return (
    <div
      data-testid="table-structure-editor"
      className={`flex flex-col h-full ${isDark ? 'bg-gray-950 text-gray-100' : 'bg-gray-50 text-gray-900'}`}
    >
      {/* Top Header Bar */}
      <div
        className={`flex items-center justify-between px-4 py-2.5 border-b select-none ${
          isDark ? 'border-gray-800 bg-gray-900/60' : 'border-gray-200 bg-white'
        }`}
      >
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <TableIcon className="w-4 h-4 text-accent" />
            <span className="font-semibold text-xs tracking-wide">
              {tableName}
            </span>
            {schemaName && (
              <span className="text-[10px] text-gray-500 font-mono">({schemaName})</span>
            )}
            <span
              className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border ${
                isDark ? 'border-gray-700 bg-gray-800 text-gray-400' : 'border-gray-300 bg-gray-100 text-gray-600'
              }`}
            >
              {driver}
            </span>
          </div>

          {/* Sub-tab Switchers */}
          <div className={`flex items-center p-0.5 rounded-lg border ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-gray-100'}`}>
            <button
              type="button"
              data-testid="tab-columns-btn"
              onClick={() => setActiveTab('columns')}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center space-x-1 ${
                activeTab === 'columns'
                  ? isDark ? 'bg-gray-800 text-white' : 'bg-white text-gray-900 shadow-sm'
                  : isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <TableIcon className="w-3 h-3" />
              <span>Columns ({columns.length})</span>
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

        {/* Action Buttons & Toolbar */}
        <div className="flex items-center space-x-2">
          {activeTab === 'columns' ? (
            <button
              type="button"
              data-testid="add-column-btn"
              onClick={() => setIsAddColumnModalOpen(true)}
              className="inline-flex items-center space-x-1.5 px-2.5 h-btn text-xs font-medium rounded bg-accent hover:bg-accent-hover text-white shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Column</span>
            </button>
          ) : activeTab === 'indexes' ? (
            <button
              type="button"
              data-testid="add-index-btn"
              onClick={() => setIsAddIndexModalOpen(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Index</span>
            </button>
          ) : activeTab === 'foreign-keys' ? (
            <button
              type="button"
              data-testid="add-foreign-key-btn"
              onClick={() => setIsAddFkModalOpen(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Foreign Key</span>
            </button>
          ) : activeTab === 'constraints' ? (
            <button
              type="button"
              data-testid="add-constraint-btn"
              onClick={() => setIsAddConstraintModalOpen(true)}
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
                disabled={submittingRls || driver !== 'postgres'}
                title={driver !== 'postgres' ? 'RLS is only supported on PostgreSQL' : undefined}
                className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded text-white shadow-sm transition-colors ${
                  driver !== 'postgres'
                    ? 'bg-gray-700 opacity-50 cursor-not-allowed'
                    : rlsEnabled
                      ? 'bg-amber-600 hover:bg-amber-500'
                      : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>{rlsEnabled ? 'Disable RLS' : 'Enable RLS'}</span>
              </button>
              {rlsEnabled && (
                <button
                  type="button"
                  data-testid="add-policy-btn"
                  onClick={() => setIsAddPolicyModalOpen(true)}
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
          <ColumnsTab
            tabId={tabId}
            connectionId={connectionId}
            tableName={tableName}
            schemaName={schemaName}
            driver={driver}
            isDark={isDark}
            columns={columns}
            loadStructure={loadStructure}
            showStatus={showStatus}
            onStructureChanged={onStructureChanged}
            isAddModalOpen={isAddColumnModalOpen}
            onCloseAddModal={() => setIsAddColumnModalOpen(false)}
            onOpenAddModal={() => setIsAddColumnModalOpen(true)}
          />
        ) : activeTab === 'indexes' ? (
          <IndexesTab
            tabId={tabId}
            tableName={tableName}
            schemaName={schemaName}
            driver={driver}
            isDark={isDark}
            indexes={indexes}
            columns={columns}
            loadStructure={loadStructure}
            showStatus={showStatus}
            onStructureChanged={onStructureChanged}
            isAddModalOpen={isAddIndexModalOpen}
            onCloseAddModal={() => setIsAddIndexModalOpen(false)}
            onOpenAddModal={() => setIsAddIndexModalOpen(true)}
          />
        ) : activeTab === 'foreign-keys' ? (
          <ForeignKeysTab
            tabId={tabId}
            tableName={tableName}
            schemaName={schemaName}
            driver={driver}
            isDark={isDark}
            foreignKeys={foreignKeys}
            columns={columns}
            indexes={indexes}
            triggers={triggers}
            tableDdl={tableDdl}
            loadStructure={loadStructure}
            showStatus={showStatus}
            onStructureChanged={onStructureChanged}
            isAddModalOpen={isAddFkModalOpen}
            onCloseAddModal={() => setIsAddFkModalOpen(false)}
            onOpenAddModal={() => setIsAddFkModalOpen(true)}
          />
        ) : activeTab === 'constraints' ? (
          <ConstraintsTab
            tabId={tabId}
            tableName={tableName}
            schemaName={schemaName}
            driver={driver}
            isDark={isDark}
            constraints={constraints}
            columns={columns}
            loadStructure={loadStructure}
            showStatus={showStatus}
            onStructureChanged={onStructureChanged}
            isAddModalOpen={isAddConstraintModalOpen}
            onCloseAddModal={() => setIsAddConstraintModalOpen(false)}
            onOpenAddModal={() => setIsAddConstraintModalOpen(true)}
          />
        ) : activeTab === 'security' ? (
          <RlsSecurityTab
            tabId={tabId}
            connectionId={connectionId}
            tableName={tableName}
            schemaName={schemaName}
            driver={driver}
            isDark={isDark}
            rlsEnabled={rlsEnabled}
            rlsPolicies={rlsPolicies}
            loadStructure={loadStructure}
            showStatus={showStatus}
            isAddModalOpen={isAddPolicyModalOpen}
            onCloseAddModal={() => setIsAddPolicyModalOpen(false)}
            onOpenAddModal={() => setIsAddPolicyModalOpen(true)}
            onToggleRls={handleToggleRls}
          />
        ) : activeTab === 'ddl' ? (
          <div
            className={`border rounded-lg overflow-hidden flex flex-col h-full shadow-sm ${
              isDark ? 'border-gray-800 bg-gray-900/50' : 'border-gray-200 bg-white'
            }`}
          >
            <div
              className={`flex items-center justify-between px-3 py-2 border-b text-xs font-semibold ${
                isDark ? 'bg-gray-900 border-gray-800 text-gray-300' : 'bg-gray-100 border-gray-200 text-gray-700'
              }`}
            >
              <span>SQL Schema Definition (DDL)</span>
              <button
                type="button"
                onClick={() => handleCopyDdl(false)}
                className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] transition-colors border ${
                  isDark
                    ? 'border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-200'
                    : 'border-gray-300 bg-white hover:bg-gray-50 text-gray-700'
                }`}
              >
                {copiedDdl ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-gray-400" />
                    <span>Copy SQL</span>
                  </>
                )}
              </button>
            </div>
            <pre
              className={`p-4 font-mono text-xs overflow-auto flex-1 select-text ${
                isDark ? 'text-blue-300 bg-gray-950/60' : 'text-blue-900 bg-gray-50'
              }`}
            >
              {fullDdl}
            </pre>
          </div>
        ) : null}
      </div>

      {/* DDL Standalone Modal */}
      {isDdlModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className={`w-full max-w-2xl rounded-xl border shadow-2xl flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150 ${
              isDark ? 'bg-gray-900 border-gray-800 text-gray-100' : 'bg-white border-gray-200 text-gray-900'
            }`}
          >
            <div
              className={`flex items-center justify-between px-4 py-3 border-b ${
                isDark ? 'border-gray-800' : 'border-gray-200'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Code className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold">Table DDL — {tableName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDdlModalOpen(false)}
                className={`p-1 rounded transition-colors ${
                  isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 p-4 overflow-auto">
              <pre
                className={`p-4 rounded font-mono text-xs overflow-auto select-text border leading-relaxed ${
                  isDark ? 'bg-gray-950 border-gray-800 text-blue-300' : 'bg-gray-50 border-gray-200 text-blue-900'
                }`}
              >
                {fullDdl}
              </pre>
            </div>

            <div
              className={`flex items-center justify-end space-x-2 px-4 py-3 border-t ${
                isDark ? 'border-gray-800 bg-gray-900/80' : 'border-gray-200 bg-gray-50'
              }`}
            >
              <button
                type="button"
                onClick={() => handleCopyDdl(true)}
                className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                  isDark
                    ? 'border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-200'
                    : 'border-gray-300 bg-white hover:bg-gray-100 text-gray-700'
                }`}
              >
                {ddlModalCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-gray-400" />
                    <span>Copy SQL</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsDdlModalOpen(false)}
                className="px-3 py-1.5 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table-level Modals */}
      <DropTableModal
        isOpen={isDropTableModalOpen}
        onClose={() => setIsDropTableModalOpen(false)}
        connectionId={connectionId}
        tableName={tableName}
        schemaName={schemaName}
        driver={driver}
        onSuccess={() => {
          onStructureChanged?.();
        }}
      />

      <RenameTableModal
        isOpen={isRenameTableModalOpen}
        onClose={() => setIsRenameTableModalOpen(false)}
        connectionId={connectionId}
        tableName={tableName}
        schemaName={schemaName}
        driver={driver}
        onSuccess={() => {
          onStructureChanged?.();
        }}
      />

      <TableMaintenanceModal
        isOpen={isMaintenanceModalOpen}
        onClose={() => setIsMaintenanceModalOpen(false)}
        connectionId={connectionId}
        tableName={tableName}
        schemaName={schemaName}
        driver={driver}
      />

      <TablePartitionsModal
        isOpen={isPartitionsModalOpen}
        onClose={() => setIsPartitionsModalOpen(false)}
        connectionId={connectionId}
        tableName={tableName}
        schemaName={schemaName}
        driver={driver}
      />
    </div>
  );
};
