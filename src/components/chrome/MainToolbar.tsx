import React, { useState, useEffect, useRef } from 'react';
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
  type LucideIcon,
} from 'lucide-react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useTabStore } from '../../stores/tabStore';
import { DbBadge } from '../sidebar/DbBadge';
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
  theme = 'dark',
  onToggleTheme,
  customItems,
}) => {
  const { connections, activeConnectionId } = useConnectionStore();
  const { tabs, activeTabId } = useTabStore();
  const [activeDropdown, setActiveDropdown] = useState<'import' | 'export' | null>(null);
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

  const defaultItems: ToolbarActionItem[] = [
    {
      id: 'connect',
      label: 'Connect',
      ariaLabel: 'New Connection',
      icon: Plug,
      onClick: handleConnectClick,
      title: 'Manage or add database connections (⌘N)',
      testId: 'toolbar-connect-btn',
    },
    {
      id: 'query',
      label: 'New Query',
      icon: Terminal,
      onClick: () => onNewQuery?.(),
      disabled: !activeConnection,
      title: activeConnection ? 'Open new SQL query editor (⌘T)' : 'Select a connection first',
      testId: 'toolbar-query-btn',
    },
    {
      id: 'table',
      label: 'Table',
      icon: Table,
      onClick: () => onOpenTable?.(),
      disabled: !activeConnection,
      title: activeConnection ? 'Open table list view or designer' : 'Select a connection first',
      testId: 'toolbar-table-btn',
    },
    {
      id: 'backup',
      label: 'Backup',
      icon: Archive,
      onClick: () => onBackup?.(),
      disabled: !activeConnection,
      title: activeConnection ? 'Backup / Dump database' : 'Select a connection first',
      testId: 'toolbar-backup-btn',
    },
    {
      id: 'import',
      label: 'Import',
      icon: Upload,
      onClick: handleImportClick,
      disabled: !activeConnection,
      title: activeConnection ? 'Import data or SQL script' : 'Select a connection first',
      testId: 'toolbar-import-btn',
    },
    {
      id: 'export',
      label: 'Export',
      icon: Download,
      onClick: handleExportClick,
      disabled: !activeConnection,
      title: activeConnection ? 'Export table or query results' : 'Select a connection first',
      testId: 'toolbar-export-btn',
    },
  ];

  const items = customItems ?? defaultItems;

  return (
    <header
      data-tauri-drag-region
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
                    <span>Import Table Data (CSV, JSON)...</span>
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
                    <span>Import SQL Dump / Script (.sql)...</span>
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
                    <span>Export Table Data (CSV, JSON)...</span>
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
                    <span>Export as SQL Dump / Backup (.sql)...</span>
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
