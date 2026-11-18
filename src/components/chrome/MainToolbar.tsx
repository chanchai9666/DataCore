import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  Database,
  Plug,
  Terminal,
  Table,
  Upload,
  Download,
  Archive,
  FileSpreadsheet,
  FileCode,
  Sun,
  Moon,
  Wrench,
  Cpu,
  Lock,
  ShieldCheck,
  History,
  Key,
  Network,
  GitCompare,
  Activity,
  Users,
  Keyboard,
  Languages,
  Wand2,
  RefreshCw,
  FileJson,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useConnectionStore } from '../../stores/connectionStore';
import { useTabStore } from '../../stores/tabStore';
import { DbBadge } from '../sidebar/DbBadge';
import { changeLanguage } from '../../i18n';
import type { ConnectionConfig } from '../../types/db';

export type ToolbarGroup = 'connection' | 'workspace' | 'transfer' | 'tools';

export interface ToolbarActionItem {
  id: string;
  label: string;
  ariaLabel?: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  testId?: string;
  group?: ToolbarGroup;
  hasDropdown?: boolean;
}

interface DropdownMenuItemConfig {
  show: boolean;
  testId: string;
  icon: LucideIcon;
  iconColor: string;
  label: string;
  description: string;
  disabled?: boolean;
  onClick?: () => void;
}

export interface MainToolbarProps {
  onConnect?: () => void;
  onNewConnection?: () => void;
  onEditConnection?: (connection: ConnectionConfig) => void;
  onNewQuery?: () => void;
  onOpenTable?: () => void;
  onBackup?: () => void;
  onImport?: () => void;
  onExport?: () => void;
  onImportData?: () => void;
  onImportSql?: () => void;
  onExportData?: () => void;
  onExportSql?: () => void;
  onOpenMetrics?: () => void;
  onOpenLocks?: () => void;
  onOpenAuditLog?: () => void;
  onOpenSecurity?: () => void;
  onOpenHistory?: () => void;
  onOpenSnippets?: () => void;
  onOpenERDiagram?: () => void;
  onOpenQueryBuilder?: () => void;
  onOpenSchemaDiff?: () => void;
  onOpenActivityMonitor?: () => void;
  onOpenTransferMonitor?: () => void;
  onOpenUserManager?: () => void;
  onOpenShortcuts?: () => void;
  onCheckUpdates?: () => void;
  onExportDiagnosticBundle?: () => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  customItems?: ToolbarActionItem[];
}

export const MainToolbar: React.FC<MainToolbarProps> = ({
  onConnect,
  onNewConnection,
  onEditConnection,
  onNewQuery,
  onOpenTable,
  onBackup,
  onImport,
  onExport,
  onImportData,
  onImportSql,
  onExportData,
  onExportSql,
  onOpenMetrics,
  onOpenLocks,
  onOpenAuditLog,
  onOpenSecurity,
  onOpenHistory,
  onOpenSnippets,
  onOpenERDiagram,
  onOpenQueryBuilder,
  onOpenSchemaDiff,
  onOpenActivityMonitor,
  onOpenTransferMonitor,
  onOpenUserManager,
  onOpenShortcuts,
  onCheckUpdates,
  onExportDiagnosticBundle,
  theme = 'dark',
  onToggleTheme,
  customItems,
}) => {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language?.startsWith('th') ? 'th' : 'en';
  const { connections, activeConnectionId, connectedConnectionIds } = useConnectionStore();
  const { tabs, activeTabId } = useTabStore();
  const [activeDropdown, setActiveDropdown] = useState<'import' | 'export' | 'tools' | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const resolvedConnectionId = activeTab?.connectionId ?? activeConnectionId;
  const activeConnection = connections.find((c) => c.id === resolvedConnectionId);
  const isConnected = Boolean(
    resolvedConnectionId && connectedConnectionIds.includes(resolvedConnectionId)
  );

  // Close dropdown on click outside or escape
  useEffect(() => {
    if (!activeDropdown) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveDropdown(null);
      }
    };

    window.addEventListener('click', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeDropdown]);

  const handleConnectClick = () => {
    if (onConnect) {
      onConnect();
    } else if (onNewConnection) {
      onNewConnection();
    }
  };

  const handleImportClick = () => {
    if (onImportData || onImportSql) {
      setActiveDropdown((prev) => (prev === 'import' ? null : 'import'));
    } else {
      onImport?.();
    }
  };

  const handleExportClick = () => {
    if (onExportData || onExportSql) {
      setActiveDropdown((prev) => (prev === 'export' ? null : 'export'));
    } else {
      onExport?.();
    }
  };

  const handleToolsClick = () => {
    setActiveDropdown((prev) => (prev === 'tools' ? null : 'tools'));
  };

  const defaultItems: ToolbarActionItem[] = [
    {
      id: 'connect',
      label: t('toolbar.connect', 'Connect'),
      ariaLabel: t('toolbar.connectAria', 'New Connection'),
      icon: Plug,
      onClick: handleConnectClick,
      title: t('toolbar.connectTitle', 'Manage or add database connections (⌘N)'),
      testId: 'toolbar-connect-btn',
      group: 'connection',
    },
    {
      id: 'query',
      label: t('toolbar.newQuery', 'New Query'),
      icon: Terminal,
      onClick: () => onNewQuery?.(),
      disabled: !isConnected,
      title: isConnected
        ? t('toolbar.newQueryTitle', 'Open new SQL query editor (⌘T)')
        : t('toolbar.selectConnectionFirst', 'Connect to a database first'),
      testId: 'toolbar-query-btn',
      group: 'workspace',
    },
    {
      id: 'table',
      label: t('toolbar.table', 'Table'),
      icon: Table,
      onClick: () => onOpenTable?.(),
      disabled: !isConnected,
      title: isConnected
        ? t('toolbar.tableTitle', 'Open table list view or designer')
        : t('toolbar.selectConnectionFirst', 'Connect to a database first'),
      testId: 'toolbar-table-btn',
      group: 'workspace',
    },
    {
      id: 'import',
      label: t('toolbar.import', 'Import'),
      icon: Upload,
      onClick: handleImportClick,
      disabled: !isConnected,
      title: isConnected
        ? t('toolbar.importTitle', 'Import data or SQL script')
        : t('toolbar.selectConnectionFirst', 'Connect to a database first'),
      testId: 'toolbar-import-btn',
      group: 'transfer',
      hasDropdown: Boolean(onImportData || onImportSql),
    },
    {
      id: 'export',
      label: t('toolbar.export', 'Export'),
      icon: Download,
      onClick: handleExportClick,
      disabled: !isConnected,
      title: isConnected
        ? t('toolbar.exportTitle', 'Export table or query results')
        : t('toolbar.selectConnectionFirst', 'Connect to a database first'),
      testId: 'toolbar-export-btn',
      group: 'transfer',
      hasDropdown: Boolean(onExportData || onExportSql),
    },
    {
      id: 'backup',
      label: t('toolbar.backup', 'Backup'),
      icon: Archive,
      onClick: () => onBackup?.(),
      disabled: !isConnected,
      title: isConnected
        ? t('toolbar.backupTitle', 'Backup / Dump database')
        : t('toolbar.selectConnectionFirst', 'Connect to a database first'),
      testId: 'toolbar-backup-btn',
      group: 'transfer',
    },
    {
      id: 'tools',
      label: t('toolbar.tools', 'Tools'),
      icon: Wrench,
      onClick: handleToolsClick,
      disabled: false,
      title: t('toolbar.toolsTitle', 'Database tools, performance metrics & audit logs'),
      testId: 'toolbar-tools-btn',
      group: 'tools',
      hasDropdown: true,
    },
  ];

  const items = customItems ?? defaultItems;

  const renderMenuCardItem = ({
    show,
    testId,
    icon: ItemIcon,
    iconColor,
    label,
    description,
    disabled,
    onClick,
  }: DropdownMenuItemConfig) => {
    if (!show || !onClick) return null;
    return (
      <button
        key={testId}
        type="button"
        data-testid={testId}
        disabled={disabled}
        onClick={() => {
          setActiveDropdown(null);
          onClick();
        }}
        className="w-full text-left px-2 py-1.5 flex items-start gap-2.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40 disabled:pointer-events-none text-text transition-colors group"
      >
        <span className="w-7 h-7 rounded-md bg-black/5 dark:bg-white/5 border border-line/40 flex items-center justify-center shrink-0 mt-0.5 group-hover:border-line transition-colors">
          <ItemIcon className={`w-4 h-4 ${iconColor}`} />
        </span>
        <div className="flex flex-col min-w-0">
          <span className="font-medium text-xs leading-snug">{label}</span>
          <span className="text-[10.5px] text-muted leading-tight">{description}</span>
        </div>
      </button>
    );
  };

  const performanceItems: DropdownMenuItemConfig[] = [
    {
      show: Boolean(onOpenMetrics),
      testId: 'toolbar-tools-metrics-btn',
      icon: Cpu,
      iconColor: 'text-indigo-400',
      label: t('toolbar.metrics', 'Database Metrics & Health'),
      description: t('toolbar.metricsDesc', 'CPU, Memory, Cache Hit & Slow Queries'),
      disabled: !isConnected,
      onClick: onOpenMetrics,
    },
    {
      show: Boolean(onOpenActivityMonitor),
      testId: 'toolbar-tools-activity-monitor-btn',
      icon: Activity,
      iconColor: 'text-teal-400',
      label: t('toolbar.activityMonitor', 'Activity & Process Monitor'),
      description: t('toolbar.activityMonitorDesc', 'Live sessions, running queries & kill process'),
      disabled: !isConnected,
      onClick: onOpenActivityMonitor,
    },
    {
      show: Boolean(onOpenTransferMonitor),
      testId: 'toolbar-tools-transfer-monitor-btn',
      icon: RefreshCw,
      iconColor: 'text-blue-400',
      label: t('toolbar.transferMonitor', 'Transfer Monitor Dashboard'),
      description: t('toolbar.transferMonitorDesc', 'Live throughput, ETA & cancel active transfers'),
      onClick: onOpenTransferMonitor,
    },
    {
      show: Boolean(onOpenLocks),
      testId: 'toolbar-tools-locks-btn',
      icon: Lock,
      iconColor: 'text-amber-400',
      label: t('toolbar.locks', 'Lock Inspector & Deadlocks'),
      description: t('toolbar.locksDesc', 'Detect blocking transactions & lock chains'),
      disabled: !isConnected,
      onClick: onOpenLocks,
    },
  ];

  const modelingItems: DropdownMenuItemConfig[] = [
    {
      show: Boolean(onOpenERDiagram),
      testId: 'toolbar-tools-er-diagram-btn',
      icon: Network,
      iconColor: 'text-emerald-400',
      label: t('toolbar.erDiagram', 'Visual ER Diagram'),
      description: t('toolbar.erDiagramDesc', 'Entity relationship graphs & schema relations'),
      disabled: !isConnected,
      onClick: onOpenERDiagram,
    },
    {
      show: Boolean(onOpenQueryBuilder),
      testId: 'toolbar-tools-query-builder-btn',
      icon: Wand2,
      iconColor: 'text-amber-400',
      label: t('toolbar.queryBuilder', 'Visual Query Builder'),
      description: t('toolbar.queryBuilderDesc', 'Build SELECT queries visually without code'),
      disabled: !isConnected,
      onClick: onOpenQueryBuilder,
    },
    {
      show: Boolean(onOpenSchemaDiff),
      testId: 'toolbar-tools-schema-diff-btn',
      icon: GitCompare,
      iconColor: 'text-purple-400',
      label: t('toolbar.schemaDiff', 'Schema Compare & Diff'),
      description: t('toolbar.schemaDiffDesc', 'Compare structures & generate migration SQL'),
      disabled: !isConnected,
      onClick: onOpenSchemaDiff,
    },
  ];

  const securityItems: DropdownMenuItemConfig[] = [
    {
      show: Boolean(onOpenAuditLog),
      testId: 'toolbar-tools-audit-btn',
      icon: ShieldCheck,
      iconColor: 'text-emerald-400',
      label: t('toolbar.auditLog', 'Security Audit Log'),
      description: t('toolbar.auditLogDesc', 'Tamper-evident logs of mutations & queries'),
      onClick: onOpenAuditLog,
    },
    {
      show: Boolean(onOpenSecurity),
      testId: 'toolbar-tools-security-btn',
      icon: Key,
      iconColor: 'text-rose-400',
      label: t('toolbar.connectionSecurity', 'Connection SSL & Security'),
      description: t('toolbar.connectionSecurityDesc', 'TLS certificates, encrypted vault & key lock'),
      onClick: onOpenSecurity,
    },
    {
      show: Boolean(onOpenUserManager),
      testId: 'toolbar-tools-user-manager-btn',
      icon: Users,
      iconColor: 'text-indigo-400',
      label: t('toolbar.userManagement', 'User & Privilege Manager'),
      description: t('toolbar.userManagementDesc', 'Database users, roles and table permissions'),
      disabled: !isConnected,
      onClick: onOpenUserManager,
    },
  ];

  const productivityItems: DropdownMenuItemConfig[] = [
    {
      show: Boolean(onOpenHistory || onOpenSnippets),
      testId: 'toolbar-tools-history-btn',
      icon: History,
      iconColor: 'text-blue-400',
      label: t('toolbar.queryHistory', 'Query History & Snippets'),
      description: t('toolbar.queryHistoryDesc', 'Executed statements history & reusable code snippets'),
      onClick: onOpenHistory || onOpenSnippets,
    },
  ];

  const systemItems: DropdownMenuItemConfig[] = [
    {
      show: Boolean(onCheckUpdates),
      testId: 'toolbar-tools-check-updates-btn',
      icon: RefreshCw,
      iconColor: 'text-sky-400',
      label: t('toolbar.checkUpdates', 'Check for Updates...'),
      description: t('toolbar.checkUpdatesDesc', 'Check for new releases & auto-update'),
      onClick: onCheckUpdates,
    },
    {
      show: Boolean(onExportDiagnosticBundle),
      testId: 'toolbar-tools-diagnostic-bundle-btn',
      icon: FileJson,
      iconColor: 'text-indigo-400',
      label: t('toolbar.diagnosticBundle', 'Export Diagnostic Bundle...'),
      description: t('toolbar.diagnosticBundleDesc', 'Sanitized system info for bug reporting'),
      onClick: onExportDiagnosticBundle,
    },
  ];

  const handleTitleBarDoubleClick = useCallback(async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[role="menu"]') || target.closest('select') || target.closest('input')) {
      return;
    }
    try {
      await getCurrentWindow().toggleMaximize();
    } catch {
      // In web or tests, ignore
    }
  }, []);

  return (
    <header
      data-tauri-drag-region
      onDoubleClick={handleTitleBarDoubleClick}
      className="h-toolbar bg-toolbar border-b border-line flex items-center justify-between pl-[78px] pr-3 select-none flex-shrink-0 transition-colors relative"
    >
      {/* Left: Branding & Primary Desktop Action Icons */}
      <div className="flex items-center gap-1.5 h-full py-1" data-tauri-drag-region ref={dropdownRef}>
        <div className="flex items-center text-accent font-bold tracking-wide mr-2 select-none" data-tauri-drag-region>
          <Database className="w-4 h-4 mr-1.5 shrink-0" />
          <span className="text-xs font-semibold text-text">DataCore</span>
        </div>

        <div className="h-5 w-px bg-line mx-1" />

        {items.map(({ id, label, ariaLabel, icon: Icon, onClick, disabled, title, testId, group, hasDropdown }, idx) => {
          const showDivider = Boolean(
            idx > 0 && group && items[idx - 1]?.group && group !== items[idx - 1]?.group
          );
          return (
            <React.Fragment key={id}>
              {showDivider && (
                <div
                  data-testid={`toolbar-divider-${idx}`}
                  className="h-5 w-px bg-line mx-0.5 shrink-0"
                />
              )}
              <div className="relative h-full flex items-center">
                <button
                  type="button"
                  onClick={onClick}
                  disabled={disabled}
                  title={title ?? label}
                  aria-label={ariaLabel ?? label}
                  data-testid={testId}
                  className={`flex flex-col items-center justify-center gap-0.5 px-2.5 h-full rounded hover:bg-black/5 dark:hover:bg-white/10 active:bg-black/10 dark:active:bg-white/15 disabled:opacity-40 disabled:pointer-events-none transition-colors text-text ${
                    activeDropdown === id ? 'bg-black/10 dark:bg-white/15' : ''
                  }`}
                >
                  <Icon size={19} strokeWidth={1.5} className="shrink-0" />
                  <span className="text-[10px] text-muted leading-tight whitespace-nowrap flex items-center gap-0.5">
                    <span>{label}</span>
                    {hasDropdown && <ChevronDown size={10} className="opacity-70 shrink-0" />}
                  </span>
                </button>

                {/* Dropdown Menu for Import */}
                {id === 'import' && activeDropdown === 'import' && (
                  <div
                    data-testid="toolbar-import-dropdown"
                    className="absolute top-full left-0 mt-1.5 min-w-[290px] max-w-[320px] bg-panel border border-line rounded-lg shadow-xl z-50 p-1.5 text-xs animate-in fade-in zoom-in-95 duration-100"
                  >
                    {renderMenuCardItem({
                      show: Boolean(onImportData),
                      testId: 'toolbar-import-data-btn',
                      icon: FileSpreadsheet,
                      iconColor: 'text-emerald-400',
                      label: t('toolbar.importData', 'Import Table Data (CSV, JSON)...'),
                      description: t(
                        'toolbar.importDataDesc',
                        'Import rows from CSV, TSV, or JSON files into a table'
                      ),
                      onClick: onImportData,
                    })}
                    {renderMenuCardItem({
                      show: Boolean(onImportSql),
                      testId: 'toolbar-import-sql-btn',
                      icon: FileCode,
                      iconColor: 'text-blue-400',
                      label: t('toolbar.importSql', 'Import SQL Dump / Script (.sql)...'),
                      description: t('toolbar.importSqlDesc', 'Execute SQL dump or script files (.sql)'),
                      onClick: onImportSql,
                    })}
                  </div>
                )}

                {/* Dropdown Menu for Export */}
                {id === 'export' && activeDropdown === 'export' && (
                  <div
                    data-testid="toolbar-export-dropdown"
                    className="absolute top-full left-0 mt-1.5 min-w-[290px] max-w-[320px] bg-panel border border-line rounded-lg shadow-xl z-50 p-1.5 text-xs animate-in fade-in zoom-in-95 duration-100"
                  >
                    {renderMenuCardItem({
                      show: Boolean(onExportData),
                      testId: 'toolbar-export-data-btn',
                      icon: FileSpreadsheet,
                      iconColor: 'text-emerald-400',
                      label: t('toolbar.exportData', 'Export Table Data (CSV, JSON)...'),
                      description: t(
                        'toolbar.exportDataDesc',
                        'Export table or query rows to CSV, JSON, Gzip/Zstd'
                      ),
                      onClick: onExportData,
                    })}
                    {renderMenuCardItem({
                      show: Boolean(onExportSql),
                      testId: 'toolbar-export-sql-btn',
                      icon: FileCode,
                      iconColor: 'text-blue-400',
                      label: t('toolbar.exportSql', 'Export as SQL Dump / Backup (.sql)...'),
                      description: t(
                        'toolbar.exportSqlDesc',
                        'Dump table DDL structure and data to a .sql script'
                      ),
                      onClick: onExportSql,
                    })}
                  </div>
                )}

                {/* 2-Column Categorized Bento Dropdown Menu for Tools */}
                {id === 'tools' && activeDropdown === 'tools' && (
                  <div
                    data-testid="toolbar-tools-dropdown"
                    className="absolute top-full left-0 mt-1.5 w-[580px] max-w-[92vw] bg-panel border border-line rounded-xl shadow-2xl z-50 overflow-hidden text-xs animate-in fade-in zoom-in-95 duration-100"
                  >
                    <div
                      data-testid="toolbar-tools-bento-grid"
                      className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-line/70 max-h-[75vh] overflow-y-auto"
                    >
                      {/* Left Column: Performance & Schema Modeling */}
                      <div className="p-2 space-y-2">
                        <div>
                          <div className="px-2 pt-1 pb-1 text-[11px] font-semibold text-muted">
                            {t('toolbar.categoryPerformance', 'Performance & Monitoring')}
                          </div>
                          <div className="space-y-0.5">
                            {performanceItems.map(renderMenuCardItem)}
                          </div>
                        </div>

                        <div className="h-px bg-line/60 mx-2 my-1" />

                        <div>
                          <div className="px-2 pt-1 pb-1 text-[11px] font-semibold text-muted">
                            {t('toolbar.categoryModeling', 'Design & Modeling')}
                          </div>
                          <div className="space-y-0.5">
                            {modelingItems.map(renderMenuCardItem)}
                          </div>
                        </div>
                      </div>

                      {/* Right Column: Security & Productivity */}
                      <div className="p-2 space-y-2">
                        <div>
                          <div className="px-2 pt-1 pb-1 text-[11px] font-semibold text-muted">
                            {t('toolbar.categorySecurity', 'Security & Administration')}
                          </div>
                          <div className="space-y-0.5">
                            {securityItems.map(renderMenuCardItem)}
                          </div>
                        </div>

                        <div className="h-px bg-line/60 mx-2 my-1" />

                        <div>
                          <div className="px-2 pt-1 pb-1 text-[11px] font-semibold text-muted">
                            {t('toolbar.categoryProductivity', 'Productivity')}
                          </div>
                          <div className="space-y-0.5">
                            {productivityItems.map(renderMenuCardItem)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Footer Bar: System & Diagnostics */}
                    {(onCheckUpdates || onExportDiagnosticBundle) && (
                      <div className="border-t border-line bg-black/[0.02] dark:bg-white/[0.02] p-2">
                        <div className="px-2 pb-1 text-[11px] font-semibold text-muted">
                          {t('toolbar.categorySystem', 'System & Diagnostics')}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                          {systemItems.map(renderMenuCardItem)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Middle/Right: Active Connection Info & Theme Controls */}
      <div className="flex items-center gap-2.5">
        {activeConnection ? (
          <button
            type="button"
            onClick={() => onEditConnection?.(activeConnection)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-panel border border-line text-xs hover:border-accent transition-all cursor-pointer shadow-sm min-h-[26px]"
            title={t('toolbar.activeConnectionTitle', 'Active connection: {{name}} ({{driver}}). Click to edit.', {
              name: activeConnection.name,
              driver: activeConnection.driver,
            })}
          >
            <span
              data-testid="toolbar-connection-status-dot"
              className={`w-2 h-2 rounded-full shrink-0 ${
                isConnected ? 'bg-emerald-500' : 'bg-muted/40'
              }`}
            />
            <DbBadge driver={activeConnection.driver} />
            <span className="font-medium text-text max-w-[150px] truncate">
              {activeConnection.name}
            </span>
            {!isConnected && (
              <span className="text-[10px] text-muted italic ml-1">
                ({t('status.disconnected', 'Disconnected')})
              </span>
            )}
          </button>
        ) : (
          <span className="text-xs text-muted/70 italic hidden sm:inline">
            {t('toolbar.noConnectionSelected', 'No connection selected')}
          </span>
        )}

        {/* Language switch button in toolbar */}
        <button
          type="button"
          onClick={() => changeLanguage(currentLang === 'th' ? 'en' : 'th')}
          data-testid="toolbar-language-btn"
          aria-label={currentLang === 'th' ? t('toolbar.switchToEnglish', 'Switch to English') : t('toolbar.switchToThai', 'Switch to Thai')}
          title={currentLang === 'th' ? t('toolbar.switchToEnglish', 'Switch to English') : t('toolbar.switchToThai', 'Switch to Thai')}
          className="h-7 px-2 flex items-center gap-1 rounded text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-xs font-medium min-h-[26px] py-0.5"
        >
          <Languages size={14} className="shrink-0" />
          <span>{currentLang === 'th' ? 'ไทย' : 'EN'}</span>
        </button>

        {onOpenShortcuts && (
          <button
            type="button"
            onClick={onOpenShortcuts}
            data-testid="toolbar-shortcuts-btn"
            aria-label="Keyboard Shortcuts (⌘?)"
            title="Keyboard Shortcuts (⌘?)"
            className="h-7 w-7 flex items-center justify-center rounded text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <Keyboard size={15} />
          </button>
        )}

        {onToggleTheme && (
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="h-7 w-7 flex items-center justify-center rounded text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        )}
      </div>
    </header>
  );
};

export default MainToolbar;
