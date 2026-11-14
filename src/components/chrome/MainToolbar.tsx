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
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useConnectionStore } from '../../stores/connectionStore';
import { useTabStore } from '../../stores/tabStore';
import { DbBadge } from '../sidebar/DbBadge';
import { changeLanguage } from '../../i18n';
import type { ConnectionConfig } from '../../types/db';

export interface ToolbarActionItem {
  id: string;
  label: string;
  ariaLabel?: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  testId?: string;
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
  onOpenUserManager?: () => void;
  onOpenShortcuts?: () => void;
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
  onOpenUserManager,
  onOpenShortcuts,
  theme = 'dark',
  onToggleTheme,
  customItems,
}) => {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language?.startsWith('th') ? 'th' : 'en';
  const { connections, activeConnectionId } = useConnectionStore();
  const { tabs, activeTabId } = useTabStore();
  const [activeDropdown, setActiveDropdown] = useState<'import' | 'export' | 'tools' | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const resolvedConnectionId = activeTab?.connectionId ?? activeConnectionId;
  const activeConnection = connections.find((c) => c.id === resolvedConnectionId);

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
    },
    {
      id: 'query',
      label: t('toolbar.newQuery', 'New Query'),
      icon: Terminal,
      onClick: () => onNewQuery?.(),
      disabled: !activeConnection,
      title: activeConnection
        ? t('toolbar.newQueryTitle', 'Open new SQL query editor (⌘T)')
        : t('toolbar.selectConnectionFirst', 'Select a connection first'),
      testId: 'toolbar-query-btn',
    },
    {
      id: 'table',
      label: t('toolbar.table', 'Table'),
      icon: Table,
      onClick: () => onOpenTable?.(),
      disabled: !activeConnection,
      title: activeConnection
        ? t('toolbar.tableTitle', 'Open table list view or designer')
        : t('toolbar.selectConnectionFirst', 'Select a connection first'),
      testId: 'toolbar-table-btn',
    },
    {
      id: 'tools',
      label: t('toolbar.tools', 'Tools'),
      icon: Wrench,
      onClick: handleToolsClick,
      disabled: !activeConnection,
      title: activeConnection
        ? t('toolbar.toolsTitle', 'Database tools, performance metrics & audit logs')
        : t('toolbar.selectConnectionFirst', 'Select a connection first'),
      testId: 'toolbar-tools-btn',
    },
    {
      id: 'backup',
      label: t('toolbar.backup', 'Backup'),
      icon: Archive,
      onClick: () => onBackup?.(),
      disabled: !activeConnection,
      title: activeConnection
        ? t('toolbar.backupTitle', 'Backup / Dump database')
        : t('toolbar.selectConnectionFirst', 'Select a connection first'),
      testId: 'toolbar-backup-btn',
    },
    {
      id: 'import',
      label: t('toolbar.import', 'Import'),
      icon: Upload,
      onClick: handleImportClick,
      disabled: !activeConnection,
      title: activeConnection
        ? t('toolbar.importTitle', 'Import data or SQL script')
        : t('toolbar.selectConnectionFirst', 'Select a connection first'),
      testId: 'toolbar-import-btn',
    },
    {
      id: 'export',
      label: t('toolbar.export', 'Export'),
      icon: Download,
      onClick: handleExportClick,
      disabled: !activeConnection,
      title: activeConnection
        ? t('toolbar.exportTitle', 'Export table or query results')
        : t('toolbar.selectConnectionFirst', 'Select a connection first'),
      testId: 'toolbar-export-btn',
    },
  ];

  const items = customItems ?? defaultItems;

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

        {items.map(({ id, label, ariaLabel, icon: Icon, onClick, disabled, title, testId }) => (
          <div key={id} className="relative h-full flex items-center">
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
              <span className="text-[10px] text-muted leading-tight whitespace-nowrap">{label}</span>
            </button>

            {/* Dropdown Menu for Import */}
            {id === 'import' && activeDropdown === 'import' && (
              <div
                data-testid="toolbar-import-dropdown"
                className="absolute top-full left-0 mt-1 min-w-[210px] bg-panel border border-line rounded shadow-lg z-50 py-1 text-xs animate-in fade-in zoom-in-95 duration-100"
              >
                {onImportData && (
                  <button
                    type="button"
                    data-testid="toolbar-import-data-btn"
                    onClick={() => {
                      setActiveDropdown(null);
                      onImportData();
                    }}
                    className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/10 text-text"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{t('toolbar.importData', 'Import Table Data (CSV, JSON)...')}</span>
                  </button>
                )}
                {onImportSql && (
                  <button
                    type="button"
                    data-testid="toolbar-import-sql-btn"
                    onClick={() => {
                      setActiveDropdown(null);
                      onImportSql();
                    }}
                    className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/10 text-text"
                  >
                    <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>{t('toolbar.importSql', 'Import SQL Dump / Script (.sql)...')}</span>
                  </button>
                )}
              </div>
            )}

            {/* Dropdown Menu for Export */}
            {id === 'export' && activeDropdown === 'export' && (
              <div
                data-testid="toolbar-export-dropdown"
                className="absolute top-full left-0 mt-1 min-w-[210px] bg-panel border border-line rounded shadow-lg z-50 py-1 text-xs animate-in fade-in zoom-in-95 duration-100"
              >
                {onExportData && (
                  <button
                    type="button"
                    data-testid="toolbar-export-data-btn"
                    onClick={() => {
                      setActiveDropdown(null);
                      onExportData();
                    }}
                    className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/10 text-text"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{t('toolbar.exportData', 'Export Table Data (CSV, JSON)...')}</span>
                  </button>
                )}
                {onExportSql && (
                  <button
                    type="button"
                    data-testid="toolbar-export-sql-btn"
                    onClick={() => {
                      setActiveDropdown(null);
                      onExportSql();
                    }}
                    className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/10 text-text"
                  >
                    <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>{t('toolbar.exportSql', 'Export as SQL Dump / Backup (.sql)...')}</span>
                  </button>
                )}
              </div>
            )}

            {/* Dropdown Menu for Tools */}
            {id === 'tools' && activeDropdown === 'tools' && (
              <div
                data-testid="toolbar-tools-dropdown"
                className="absolute top-full left-0 mt-1 min-w-[340px] max-w-[380px] bg-panel border border-line rounded-lg shadow-xl z-50 p-1.5 text-xs animate-in fade-in zoom-in-95 duration-100 max-h-[85vh] overflow-y-auto"
              >
                {/* Category 1: Performance & Monitoring */}
                <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold text-muted uppercase tracking-wider">
                  {t('toolbar.categoryPerformance', 'Performance & Monitoring')}
                </div>
                {onOpenMetrics && (
                  <button
                    type="button"
                    data-testid="toolbar-tools-metrics-btn"
                    onClick={() => {
                      setActiveDropdown(null);
                      onOpenMetrics();
                    }}
                    className="w-full text-left px-2.5 py-1.5 flex items-start gap-2.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-text transition-colors"
                  >
                    <Cpu className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-xs">{t('toolbar.metrics', 'Database Metrics & Health')}</span>
                      <span className="text-[10.5px] text-muted leading-tight">CPU, Memory, Cache Hit & Slow Queries</span>
                    </div>
                  </button>
                )}
                {onOpenActivityMonitor && (
                  <button
                    type="button"
                    data-testid="toolbar-tools-activity-monitor-btn"
                    onClick={() => {
                      setActiveDropdown(null);
                      onOpenActivityMonitor();
                    }}
                    className="w-full text-left px-2.5 py-1.5 flex items-start gap-2.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-text transition-colors"
                  >
                    <Activity className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-xs">{t('toolbar.activityMonitor', 'Activity & Process Monitor')}</span>
                      <span className="text-[10.5px] text-muted leading-tight">Live sessions, running queries & kill process</span>
                    </div>
                  </button>
                )}
                {onOpenLocks && (
                  <button
                    type="button"
                    data-testid="toolbar-tools-locks-btn"
                    onClick={() => {
                      setActiveDropdown(null);
                      onOpenLocks();
                    }}
                    className="w-full text-left px-2.5 py-1.5 flex items-start gap-2.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-text transition-colors"
                  >
                    <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-xs">{t('toolbar.locks', 'Lock Inspector & Deadlocks')}</span>
                      <span className="text-[10.5px] text-muted leading-tight">Detect blocking transactions & lock chains</span>
                    </div>
                  </button>
                )}

                <div className="h-px bg-line my-1 mx-2" />

                {/* Category 2: Design & Schema Modeling */}
                <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold text-muted uppercase tracking-wider">
                  {t('toolbar.categoryModeling', 'Design & Modeling')}
                </div>
                {onOpenERDiagram && (
                  <button
                    type="button"
                    data-testid="toolbar-tools-er-diagram-btn"
                    onClick={() => {
                      setActiveDropdown(null);
                      onOpenERDiagram();
                    }}
                    className="w-full text-left px-2.5 py-1.5 flex items-start gap-2.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-text transition-colors"
                  >
                    <Network className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-xs">{t('toolbar.erDiagram', 'Visual ER Diagram')}</span>
                      <span className="text-[10.5px] text-muted leading-tight">Entity relationship graphs & schema relations</span>
                    </div>
                  </button>
                )}
                {onOpenQueryBuilder && (
                  <button
                    type="button"
                    data-testid="toolbar-tools-query-builder-btn"
                    onClick={() => {
                      setActiveDropdown(null);
                      onOpenQueryBuilder();
                    }}
                    className="w-full text-left px-2.5 py-1.5 flex items-start gap-2.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-text transition-colors"
                  >
                    <Wand2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-xs">{t('toolbar.queryBuilder', 'Visual Query Builder')}</span>
                      <span className="text-[10.5px] text-muted leading-tight">Build SELECT queries visually without code</span>
                    </div>
                  </button>
                )}
                {onOpenSchemaDiff && (
                  <button
                    type="button"
                    data-testid="toolbar-tools-schema-diff-btn"
                    onClick={() => {
                      setActiveDropdown(null);
                      onOpenSchemaDiff();
                    }}
                    className="w-full text-left px-2.5 py-1.5 flex items-start gap-2.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-text transition-colors"
                  >
                    <GitCompare className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-xs">{t('toolbar.schemaDiff', 'Schema Compare & Diff')}</span>
                      <span className="text-[10.5px] text-muted leading-tight">Compare structures & generate migration SQL</span>
                    </div>
                  </button>
                )}

                <div className="h-px bg-line my-1 mx-2" />

                {/* Category 3: Security & Governance */}
                <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold text-muted uppercase tracking-wider">
                  {t('toolbar.categorySecurity', 'Security & Administration')}
                </div>
                {onOpenAuditLog && (
                  <button
                    type="button"
                    data-testid="toolbar-tools-audit-btn"
                    onClick={() => {
                      setActiveDropdown(null);
                      onOpenAuditLog();
                    }}
                    className="w-full text-left px-2.5 py-1.5 flex items-start gap-2.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-text transition-colors"
                  >
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-xs">{t('toolbar.auditLog', 'Security Audit Log')}</span>
                      <span className="text-[10.5px] text-muted leading-tight">Tamper-evident logs of mutations & queries</span>
                    </div>
                  </button>
                )}
                {onOpenSecurity && (
                  <button
                    type="button"
                    data-testid="toolbar-tools-security-btn"
                    onClick={() => {
                      setActiveDropdown(null);
                      onOpenSecurity();
                    }}
                    className="w-full text-left px-2.5 py-1.5 flex items-start gap-2.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-text transition-colors"
                  >
                    <Key className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-xs">{t('toolbar.connectionSecurity', 'Connection SSL & Security')}</span>
                      <span className="text-[10.5px] text-muted leading-tight">TLS certificates, encrypted vault & key lock</span>
                    </div>
                  </button>
                )}
                {onOpenUserManager && (
                  <button
                    type="button"
                    data-testid="toolbar-tools-user-manager-btn"
                    onClick={() => {
                      setActiveDropdown(null);
                      onOpenUserManager();
                    }}
                    className="w-full text-left px-2.5 py-1.5 flex items-start gap-2.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-text transition-colors"
                  >
                    <Users className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-xs">{t('toolbar.userManagement', 'User & Privilege Manager')}</span>
                      <span className="text-[10.5px] text-muted leading-tight">Database users, roles and table permissions</span>
                    </div>
                  </button>
                )}

                <div className="h-px bg-line my-1 mx-2" />

                {/* Category 4: Productivity */}
                <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold text-muted uppercase tracking-wider">
                  {t('toolbar.categoryProductivity', 'Productivity')}
                </div>
                {(onOpenHistory || onOpenSnippets) && (
                  <button
                    type="button"
                    data-testid="toolbar-tools-history-btn"
                    onClick={() => {
                      setActiveDropdown(null);
                      (onOpenHistory || onOpenSnippets)?.();
                    }}
                    className="w-full text-left px-2.5 py-1.5 flex items-start gap-2.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-text transition-colors"
                  >
                    <History className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-xs">{t('toolbar.queryHistory', 'Query History & Snippets')}</span>
                      <span className="text-[10.5px] text-muted leading-tight">Executed statements history & reusable code snippets</span>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Middle/Right: Active Connection Info & Theme Controls */}
      <div className="flex items-center gap-2.5">
        {activeConnection ? (
          <button
            type="button"
            onClick={() => onEditConnection?.(activeConnection)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-panel border border-line text-xs hover:border-accent transition-all cursor-pointer shadow-sm"
            title={`Active connection: ${activeConnection.name} (${activeConnection.driver}). Click to edit.`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <DbBadge driver={activeConnection.driver} />
            <span className="font-medium text-text max-w-[150px] truncate">
              {activeConnection.name}
            </span>
          </button>
        ) : (
          <span className="text-xs text-muted/70 italic hidden sm:inline">No connection selected</span>
        )}

        {/* Language switch button in toolbar */}
        <button
          type="button"
          onClick={() => changeLanguage(currentLang === 'th' ? 'en' : 'th')}
          data-testid="toolbar-language-btn"
          aria-label={currentLang === 'th' ? 'Switch to English' : 'Switch to Thai'}
          title={currentLang === 'th' ? t('toolbar.switchToEnglish', 'Switch to English') : t('toolbar.switchToThai', 'Switch to Thai')}
          className="h-7 px-2 flex items-center gap-1 rounded text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-xs font-medium"
        >
          <Languages size={14} className="shrink-0" />
          <span>{currentLang === 'th' ? 'ไทย' : 'EN'}</span>
        </button>

        {onOpenShortcuts && (
          <button
            type="button"
            onClick={onOpenShortcuts}
            data-testid="toolbar-shortcuts-btn"
            aria-label="Keyboard Shortcuts (⌘/)"
            title="Keyboard Shortcuts (⌘/)"
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
