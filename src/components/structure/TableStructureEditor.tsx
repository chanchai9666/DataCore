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
  Search,
  FileQuestion,
} from 'lucide-react';
import {
  buildToggleRlsSql,
  buildGetRlsStatusSql,
  buildGetRlsPoliciesSql,
  type RlsPolicy,
} from '../../api/securityHelpers';
import { dbApi } from '../../api/db';
import { useTranslation } from 'react-i18next';
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
import { useTabStore } from '../../stores/tabStore';
import { useSchemaStore } from '../../stores/schemaStore';
import { detectErrorType } from '../../utils/sqlErrorParser';
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
  currentMode?: 'data' | 'structure';
  onModeChange?: (mode: 'data' | 'structure') => void;
  onCloseTab?: () => void;
}

export const TableStructureEditor: React.FC<TableStructureEditorProps> = ({
  tabId,
  connectionId,
  tableName,
  schemaName,
  driver = 'postgres',
  theme: propTheme,
  onStructureChanged,
  currentMode = 'structure',
  onModeChange,
  onCloseTab,
}) => {
  const { t } = useTranslation();
  const isDark = propTheme
    ? propTheme === 'dark'
    : typeof document !== 'undefined'
    ? document.documentElement.classList.contains('dark')
    : true;

  // Filter state
  const [filterText, setFilterText] = useState('');

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
      className="flex flex-col h-full bg-grid text-text"
    >
      {/* Tier 1: Table Master Bar (Table Identity & Global Operations) */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-line bg-panel select-none flex-shrink-0">
        {/* Left: Mode Switcher + Table Identity */}
        <div className="flex items-center space-x-3">
          {/* Mode Switcher (Data / Structure) */}
          <div className="flex items-center p-0.5 rounded-lg border border-line bg-sidebar">
            <button
              type="button"
              data-testid="table-mode-data-btn"
              onClick={() => onModeChange?.('data')}
              className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                currentMode === 'data'
                  ? 'bg-panel text-text shadow-xs'
                  : 'text-muted hover:text-text'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5 text-blue-500" />
              <span>{t('structure.dataMode', 'Data')}</span>
            </button>
            <button
              type="button"
              data-testid="table-mode-structure-btn"
              onClick={() => onModeChange?.('structure')}
              className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                currentMode === 'structure'
                  ? 'bg-panel text-text shadow-xs'
                  : 'text-muted hover:text-text'
              }`}
            >
              <Wrench className="w-3.5 h-3.5 text-amber-500" />
              <span>{t('structure.structureMode', 'Structure')}</span>
            </button>
          </div>

          <div className="h-4 w-px bg-line" />

          {/* Table Identity */}
          <div className="flex items-center space-x-2">
            <div className="p-1 rounded-md bg-blue-500/10 border border-blue-500/30">
              <TableIcon className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <div className="flex items-baseline space-x-1 font-mono text-xs">
              {schemaName && (
                <span className="text-muted font-normal">
                  {schemaName}.
                </span>
              )}
              <span className="font-semibold text-text text-sm tracking-tight">
                {tableName}
              </span>
            </div>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded-md font-semibold border border-line bg-sidebar text-muted">
              {driver}
            </span>
          </div>

          {statusMessage && (
            <div
              data-testid="structure-status-badge"
              className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-md text-xs font-medium border ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/30'
                  : 'bg-red-500/10 text-red-600 dark:text-red-300 border-red-500/30'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-red-500" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}
        </div>

        {/* Right: Table Operations Toolbar */}
        <div className="flex items-center space-x-1.5">
          <button
            type="button"
            data-testid="refresh-structure-btn"
            onClick={loadStructure}
            disabled={loading}
            title="Refresh Structure"
            className="p-1.5 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/10 text-muted hover:text-text"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-500' : ''}`} />
          </button>

          <button
            type="button"
            data-testid="view-ddl-btn"
            onClick={() => setIsDdlModalOpen(true)}
            title="View DDL / CREATE TABLE"
            className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-line bg-sidebar hover:bg-black/5 dark:hover:bg-white/10 text-text transition-colors shadow-xs"
          >
            <Code className="w-3.5 h-3.5 text-blue-500" />
            <span>{t('structure.ddlBtn', 'DDL')}</span>
          </button>

          <button
            type="button"
            data-testid="partitions-table-toolbar-btn"
            onClick={() => setIsPartitionsModalOpen(true)}
            title="Table Partitions & Ranges"
            className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-line bg-sidebar hover:bg-black/5 dark:hover:bg-white/10 text-text transition-colors shadow-xs"
          >
            <Split className="w-3.5 h-3.5 text-teal-500" />
            <span>{t('structure.partitionsBtn', 'Partitions')}</span>
          </button>

          <button
            type="button"
            data-testid="maintenance-table-toolbar-btn"
            onClick={() => setIsMaintenanceModalOpen(true)}
            title="Table Maintenance & Diagnostics"
            className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-line bg-sidebar hover:bg-black/5 dark:hover:bg-white/10 text-text transition-colors shadow-xs"
          >
            <Wrench className="w-3.5 h-3.5 text-emerald-500" />
            <span>{t('structure.maintenanceBtn', 'Maintain')}</span>
          </button>

          <button
            type="button"
            data-testid="rename-table-toolbar-btn"
            onClick={() => setIsRenameTableModalOpen(true)}
            title="Rename Table"
            className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-line bg-sidebar hover:bg-black/5 dark:hover:bg-white/10 text-text transition-colors shadow-xs"
          >
            <Pencil className="w-3.5 h-3.5 text-blue-500" />
            <span>{t('tableList.renameTable', 'Rename')}</span>
          </button>

          <div className="h-4 w-px bg-line mx-0.5" />

          <button
            type="button"
            data-testid="drop-table-toolbar-btn"
            onClick={() => setIsDropTableModalOpen(true)}
            title="Drop Table"
            className="inline-flex items-center space-x-1 px-2 py-1 text-xs font-medium rounded-md transition-colors border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-500"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t('tableList.dropTable', 'Drop')}</span>
          </button>
        </div>
      </div>

      {/* Tier 2: Sub-navigation Tabs & Contextual Action Toolbar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-line bg-sidebar select-none flex-shrink-0">
        {/* Left: Section Sub-navigation Tabs */}
        <div className="flex items-center p-0.5 rounded-lg border border-line bg-panel">
          {(
            [
              { id: 'columns', label: t('structure.columnsTab', 'Columns'), count: columns.length, icon: <TableIcon className="w-3 h-3 text-blue-500" /> },
              { id: 'indexes', label: t('structure.indexesTab', 'Indexes'), count: indexes.length, icon: <Layers className="w-3 h-3 text-emerald-500" /> },
              { id: 'foreign-keys', label: t('structure.foreignKeysTab', 'Foreign Keys'), count: foreignKeys.length, icon: <Link2 className="w-3 h-3 text-indigo-500" /> },
              { id: 'constraints', label: t('structure.constraintsTab', 'Constraints'), count: constraints.length, icon: <ShieldAlert className="w-3 h-3 text-purple-500" /> },
              { id: 'security', label: t('structure.rlsTab', 'Security / RLS'), count: rlsPolicies.length, icon: <Shield className="w-3 h-3 text-rose-500" /> },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              data-testid={`tab-${tab.id}-btn`}
              aria-label={`${tab.label} (${tab.count})`}
              onClick={() => setActiveTab(tab.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center space-x-1.5 ${
                activeTab === tab.id
                  ? 'bg-grid text-text shadow-xs'
                  : 'text-muted hover:text-text'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  activeTab === tab.id
                    ? 'bg-sidebar text-text'
                    : 'bg-grid text-muted'
                }`}
              >
                ({tab.count})
              </span>
            </button>
          ))}

          <button
            type="button"
            data-testid="tab-ddl-btn"
            onClick={() => setActiveTab('ddl')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center space-x-1.5 ${
              activeTab === 'ddl'
                ? 'bg-grid text-text shadow-xs'
                : 'text-muted hover:text-text'
            }`}
          >
            <Code className="w-3 h-3 text-blue-500" />
            <span>SQL Preview</span>
          </button>
        </div>

        {/* Right: Quick Filter & Contextual Actions */}
        <div className="flex items-center space-x-2.5">
          {/* Quick Search / Filter Box */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-2.5 text-muted pointer-events-none" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder={`Filter ${activeTab}...`}
              className="pl-8 pr-6 py-1 text-xs rounded-md border border-line bg-grid text-text placeholder:text-muted transition-all w-40 focus:w-52 focus:outline-none focus:border-blue-500"
            />
            {filterText && (
              <button
                type="button"
                onClick={() => setFilterText('')}
                className="absolute right-1.5 p-0.5 text-muted hover:text-text"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Primary Action Button - Unified Consistent Accent */}
          {activeTab === 'columns' ? (
            <button
              type="button"
              data-testid="add-column-btn"
              onClick={() => setIsAddColumnModalOpen(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Add Column</span>
            </button>
          ) : activeTab === 'indexes' ? (
            <button
              type="button"
              data-testid="add-index-btn"
              onClick={() => setIsAddIndexModalOpen(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Add Index</span>
            </button>
          ) : activeTab === 'foreign-keys' ? (
            <button
              type="button"
              data-testid="add-foreign-key-btn"
              onClick={() => setIsAddFkModalOpen(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Add Foreign Key</span>
            </button>
          ) : activeTab === 'constraints' ? (
            <button
              type="button"
              data-testid="add-constraint-btn"
              onClick={() => setIsAddConstraintModalOpen(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
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
                className={`inline-flex items-center space-x-1.5 px-3 py-1 text-xs font-medium rounded-md text-white shadow-xs transition-colors ${
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
                  className="inline-flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-xs transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Add Policy</span>
                </button>
              )}
            </div>
          ) : null}
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
          (() => {
            const isTableNotFound = Boolean(
              error && (
                detectErrorType(error) === 'Undefined Table' ||
                error.toLowerCase().includes('no such table') ||
                error.toLowerCase().includes('does not exist') ||
                error.toLowerCase().includes("doesn't exist")
              )
            );

            if (isTableNotFound) {
              return (
                <div
                  data-testid="table-not-found-screen"
                  className="max-w-xl mx-auto my-8 p-6 rounded-2xl border border-amber-500/30 bg-panel shadow-lg text-center flex flex-col items-center transition-colors text-text"
                >
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 bg-amber-500/10 text-amber-500 ring-8 ring-amber-500/5">
                    <FileQuestion className="w-7 h-7" />
                  </div>

                  <h3 className="text-lg font-semibold tracking-tight mb-2 text-text">
                    Table Not Found in Database
                  </h3>

                  <p className="text-xs max-w-md mb-4 leading-relaxed text-muted">
                    The table{' '}
                    <span className="font-mono font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-300">
                      &quot;{tableName}&quot;
                    </span>{' '}
                    does not exist in schema{' '}
                    <span className="font-mono font-medium">{schemaName || 'default'}</span>.
                    It may have been dropped or renamed by an external migration.
                  </p>

                  {/* Technical Database Error Details */}
                  <div className="w-full max-w-md p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300 font-mono text-[11px] text-left mb-6 break-all select-text">
                    <span className="font-semibold block mb-1 text-[10px] uppercase tracking-wider text-red-500">
                      Database error:
                    </span>
                    {error}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center justify-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (onCloseTab) {
                          onCloseTab();
                        } else {
                          useTabStore.getState().closeTab(tabId);
                        }
                      }}
                      className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-sm transition-colors flex items-center space-x-1.5"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Close Tab</span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await useSchemaStore.getState().fetchSchema(connectionId, driver, schemaName);
                          showStatus('success', 'Schema refreshed');
                        } catch (e) {
                          console.warn('Failed to refresh schema:', e);
                        }
                      }}
                      className="px-3.5 py-2 rounded-lg text-xs font-medium border border-line bg-sidebar hover:bg-black/5 dark:hover:bg-white/10 text-text shadow-xs transition-colors flex items-center space-x-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-blue-500" />
                      <span>Refresh Schema</span>
                    </button>

                    <button
                      type="button"
                      onClick={loadStructure}
                      className="px-3.5 py-2 rounded-lg text-xs font-medium border border-line bg-sidebar hover:bg-black/5 dark:hover:bg-white/10 text-text shadow-xs transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                data-testid="structure-error-alert"
                className={`p-4 rounded-xl border text-xs flex items-start space-x-3 transition-colors ${
                  !isDark
                    ? 'bg-red-50 border-red-200 text-red-900 shadow-xs'
                    : 'bg-red-950/40 border-red-900/50 text-red-200'
                }`}
              >
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                <div className="flex-1">
                  <div className="font-semibold text-sm mb-1 text-red-900 dark:text-red-100">
                    Failed to load structure
                  </div>
                  <div
                    className={`p-2.5 rounded-lg border font-mono text-xs my-2 select-text break-all ${
                      !isDark
                        ? 'bg-red-100/60 border-red-200 text-red-800'
                        : 'bg-red-950/60 border-red-900/60 text-red-300'
                    }`}
                  >
                    {error}
                  </div>
                  <button
                    type="button"
                    onClick={loadStructure}
                    className="mt-1 px-3.5 py-1.5 bg-red-600 hover:bg-red-500 rounded-lg text-white font-medium text-xs shadow-sm transition-colors"
                  >
                    Retry
                  </button>
                </div>
              </div>
            );
          })()
        ) : activeTab === 'columns' ? (
          <ColumnsTab
            tabId={tabId}
            connectionId={connectionId}
            tableName={tableName}
            schemaName={schemaName}
            driver={driver}
            isDark={isDark}
            columns={columns}
            filterText={filterText}
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
            filterText={filterText}
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
            filterText={filterText}
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
            filterText={filterText}
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
          <div className="border border-line bg-panel rounded-lg overflow-hidden flex flex-col h-full shadow-sm">
            <div className="flex items-center justify-between px-3 py-2 border-b border-line bg-sidebar text-text text-xs font-semibold">
              <span>SQL Schema Definition (DDL)</span>
              <button
                type="button"
                onClick={() => handleCopyDdl(false)}
                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] transition-colors border border-line bg-panel hover:bg-black/5 dark:hover:bg-white/10 text-text"
              >
                {copiedDdl ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-muted" />
                    <span>Copy SQL</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-4 font-mono text-xs overflow-auto flex-1 select-text bg-grid text-blue-600 dark:text-blue-300">
              {fullDdl}
            </pre>
          </div>
        ) : null}
      </div>

      {/* DDL Standalone Modal */}
      {isDdlModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-xl border border-line bg-panel text-text shadow-2xl flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-sidebar">
              <div className="flex items-center space-x-2">
                <Code className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-semibold">Table DDL — {tableName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDdlModalOpen(false)}
                className="p-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10 text-muted hover:text-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 p-4 overflow-auto">
              <pre className="p-4 rounded font-mono text-xs overflow-auto select-text border border-line bg-grid text-blue-600 dark:text-blue-300 leading-relaxed">
                {fullDdl}
              </pre>
            </div>

            <div className="flex items-center justify-end space-x-2 px-4 py-3 border-t border-line bg-sidebar">
              <button
                type="button"
                onClick={() => handleCopyDdl(true)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-medium border border-line bg-panel hover:bg-black/5 dark:hover:bg-white/10 text-text transition-colors"
              >
                {ddlModalCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-muted" />
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
