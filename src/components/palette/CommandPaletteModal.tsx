import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Search,
  X,
  Terminal,
  Table2,
  Database,
  PlusCircle,
  Code2,
  Sliders,
  Sparkles,
  Layers,
  FileDown,
  FileUp,
  Activity,
  Lock,
  Shield,
  History,
  GitCompare,
  Users,
  Eye,
  Check,
  Copy,
  LayoutGrid,
} from 'lucide-react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useTabStore } from '../../stores/tabStore';
import { openTableTab } from '../sidebar/tabHelpers';
import { dbApi } from '../../api/db';
import type { SchemaNode } from '../../types/db';

export type CommandPaletteCategory = 'Actions' | 'Tables & Views' | 'Connections';

export interface TableItem {
  name: string;
  type: 'table' | 'view';
  schemaName?: string;
}

export interface CommandPaletteItem {
  id: string;
  title: string;
  subtitle?: string;
  category: CommandPaletteCategory;
  macKeys?: string[];
  winKeys?: string[];
  icon?: React.ReactNode;
  badge?: string;
  onSelect: () => void;
  keywords?: string[];
}

export interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Handlers for commands
  onNewConnection?: () => void;
  onNewQuery?: () => void;
  onOpenTable?: (tableName: string, schemaName?: string) => void;
  onOpenTableList?: () => void;
  onOpenERDiagram?: () => void;
  onOpenShortcuts?: () => void;
  onToggleTheme?: () => void;
  onToggleSidebar?: () => void;
  onDuplicateTab?: () => void;
  onExportData?: () => void;
  onImportData?: () => void;
  onExportSql?: () => void;
  onImportSql?: () => void;
  onOpenMetrics?: () => void;
  onOpenLocks?: () => void;
  onOpenAuditLog?: () => void;
  onOpenSecurity?: () => void;
  onOpenHistory?: () => void;
  onOpenSchemaDiff?: () => void;
  onOpenActivityMonitor?: () => void;
  onOpenUserManager?: () => void;
  onSelectConnection?: (connectionId: string) => void;
  // For testing / overrides
  initialTables?: TableItem[];
  platform?: 'mac' | 'windows';
}

/**
 * Recursively extracts tables and views from SchemaNode tree.
 */
export function extractTablesAndViews(nodes: SchemaNode[], currentSchema?: string): TableItem[] {
  const result: TableItem[] = [];
  if (!nodes || !Array.isArray(nodes)) return result;

  for (const node of nodes) {
    const schema =
      node.schema_name ||
      node.schema ||
      (node.node_type === 'schema' ? node.name : currentSchema);

    if (node.node_type === 'table') {
      result.push({
        name: node.name,
        type: 'table',
        schemaName: schema,
      });
    } else if (node.node_type === 'view') {
      result.push({
        name: node.name,
        type: 'view',
        schemaName: schema,
      });
    }

    if (node.children && node.children.length > 0) {
      result.push(...extractTablesAndViews(node.children, schema));
    }
  }

  return result;
}

export function detectIsMac(platformOverride?: 'mac' | 'windows'): boolean {
  if (platformOverride) return platformOverride === 'mac';
  if (typeof navigator === 'undefined') return true;
  const platform = navigator.platform || '';
  const ua = navigator.userAgent || '';
  return /Mac|iPod|iPhone|iPad/i.test(platform) || /Mac/i.test(ua);
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  onNewConnection,
  onNewQuery,
  onOpenTable,
  onOpenTableList,
  onOpenERDiagram,
  onOpenShortcuts,
  onToggleTheme,
  onToggleSidebar,
  onDuplicateTab,
  onExportData,
  onImportData,
  onExportSql,
  onImportSql,
  onOpenMetrics,
  onOpenLocks,
  onOpenAuditLog,
  onOpenSecurity,
  onOpenHistory,
  onOpenSchemaDiff,
  onOpenActivityMonitor,
  onOpenUserManager,
  onSelectConnection,
  initialTables,
  platform,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [tables, setTables] = useState<TableItem[]>(initialTables || []);
  const [isLoadingTables, setIsLoadingTables] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const isMac = useMemo(() => detectIsMac(platform), [platform]);

  const { connections, activeConnectionId, setActiveConnection } = useConnectionStore();
  const { tabs, activeTabId } = useTabStore();

  const resolvedConnectionId = useMemo(() => {
    const activeTab = tabs.find((t) => t.id === activeTabId);
    return activeTab?.connectionId ?? activeConnectionId;
  }, [tabs, activeTabId, activeConnectionId]);

  const activeConnection = useMemo(() => {
    return connections.find((c) => c.id === resolvedConnectionId);
  }, [connections, resolvedConnectionId]);

  // Fetch tables & views when modal opens and connection is active
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setSelectedIndex(0);
      return;
    }

    if (initialTables) {
      setTables(initialTables);
      return;
    }

    if (!resolvedConnectionId) {
      setTables([]);
      return;
    }

    let isMounted = true;
    setIsLoadingTables(true);

    dbApi
      .getSchemaTree(resolvedConnectionId)
      .then((tree) => {
        if (isMounted) {
          setTables(extractTablesAndViews(tree));
        }
      })
      .catch(() => {
        if (isMounted) {
          setTables([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingTables(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, resolvedConnectionId, initialTables]);

  // Focus input automatically on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Construct all raw items
  const allItems: CommandPaletteItem[] = useMemo(() => {
    const items: CommandPaletteItem[] = [];

    // 1. Actions / Commands
    items.push({
      id: 'action-new-query',
      title: 'New SQL Query Tab',
      subtitle: activeConnection ? `Editor for ${activeConnection.name}` : 'Open SQL query editor',
      category: 'Actions',
      macKeys: ['⌘', 'T'],
      winKeys: ['Ctrl', 'T'],
      icon: <Code2 className="w-4 h-4 text-accent" />,
      keywords: ['sql', 'query', 'tab', 'editor', 'script', 'console'],
      onSelect: () => {
        onNewQuery?.();
      },
    });

    items.push({
      id: 'action-new-connection',
      title: 'New Database Connection',
      subtitle: 'Connect to SQLite, PostgreSQL, or MySQL',
      category: 'Actions',
      macKeys: ['⌘', 'N'],
      winKeys: ['Ctrl', 'N'],
      icon: <PlusCircle className="w-4 h-4 text-emerald-500" />,
      keywords: ['connect', 'add', 'database', 'host', 'new', 'server'],
      onSelect: () => {
        onNewConnection?.();
      },
    });

    items.push({
      id: 'action-shortcuts',
      title: 'Keyboard Shortcuts Cheat Sheet',
      subtitle: 'View all shortcut keys and keybindings',
      category: 'Actions',
      macKeys: ['⌘', '/'],
      winKeys: ['Ctrl', '/'],
      icon: <Terminal className="w-4 h-4 text-purple-400" />,
      keywords: ['help', 'keys', 'cheat', 'hotkeys', 'shortcuts', 'bindings'],
      onSelect: () => {
        onOpenShortcuts?.();
      },
    });

    items.push({
      id: 'action-toggle-theme',
      title: 'Toggle Color Theme',
      subtitle: 'Switch between Dark and Light appearance',
      category: 'Actions',
      macKeys: ['⌘', '⇧', 'T'],
      winKeys: ['Ctrl', 'Shift', 'T'],
      icon: <Sparkles className="w-4 h-4 text-amber-400" />,
      keywords: ['dark', 'light', 'appearance', 'mode', 'theme', 'color'],
      onSelect: () => {
        onToggleTheme?.();
      },
    });

    items.push({
      id: 'action-toggle-sidebar',
      title: 'Toggle Sidebar Visibility',
      subtitle: 'Show or hide the database tree sidebar',
      category: 'Actions',
      macKeys: ['⌘', 'B'],
      winKeys: ['Ctrl', 'B'],
      icon: <Sliders className="w-4 h-4 text-blue-400" />,
      keywords: ['sidebar', 'navigation', 'hide', 'show', 'toggle', 'panel', 'tree'],
      onSelect: () => {
        if (onToggleSidebar) {
          onToggleSidebar();
        } else if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('datacore:toggle-sidebar'));
        }
      },
    });

    items.push({
      id: 'action-duplicate-tab',
      title: 'Duplicate Active Tab',
      subtitle: 'Clone current query editor or table tab',
      category: 'Actions',
      macKeys: ['⌘', 'D'],
      winKeys: ['Ctrl', 'D'],
      icon: <Copy className="w-4 h-4 text-sky-400" />,
      keywords: ['clone', 'copy', 'duplicate', 'tab'],
      onSelect: () => {
        onDuplicateTab?.();
      },
    });

    items.push({
      id: 'action-table-list',
      title: 'Table Management & Summary',
      subtitle: 'Inspect table sizes, row counts, and structural metadata',
      category: 'Actions',
      icon: <LayoutGrid className="w-4 h-4 text-teal-400" />,
      keywords: ['tables', 'views', 'metadata', 'statistics', 'sizes', 'summary'],
      onSelect: () => {
        onOpenTableList?.();
      },
    });

    items.push({
      id: 'action-er-diagram',
      title: 'ER Diagram & Visual Schema',
      subtitle: 'Interactive database entity-relationship visualizer',
      category: 'Actions',
      icon: <Layers className="w-4 h-4 text-indigo-400" />,
      keywords: ['diagram', 'erd', 'canvas', 'relationship', 'foreign', 'keys', 'visual'],
      onSelect: () => {
        onOpenERDiagram?.();
      },
    });

    items.push({
      id: 'action-export-data',
      title: 'Export Data Wizard',
      subtitle: 'Export tables or query results to CSV, JSON, NDJSON, or Excel',
      category: 'Actions',
      icon: <FileDown className="w-4 h-4 text-green-500" />,
      keywords: ['export', 'csv', 'json', 'excel', 'save', 'download', 'dump', 'wizard'],
      onSelect: () => {
        onExportData?.();
      },
    });

    items.push({
      id: 'action-import-data',
      title: 'Import Data Wizard',
      subtitle: 'Load CSV or JSON files into database with column mappings',
      category: 'Actions',
      icon: <FileUp className="w-4 h-4 text-cyan-500" />,
      keywords: ['import', 'csv', 'json', 'upload', 'load', 'wizard'],
      onSelect: () => {
        onImportData?.();
      },
    });

    items.push({
      id: 'action-export-sql',
      title: 'Export SQL Backup',
      subtitle: 'Generate SQL DDL and INSERT statements dump',
      category: 'Actions',
      icon: <Database className="w-4 h-4 text-blue-500" />,
      keywords: ['backup', 'dump', 'sql', 'export', 'archive', 'ddl'],
      onSelect: () => {
        onExportSql?.();
      },
    });

    items.push({
      id: 'action-import-sql',
      title: 'Import SQL Script',
      subtitle: 'Execute SQL dump files or migration scripts',
      category: 'Actions',
      icon: <FileUp className="w-4 h-4 text-indigo-400" />,
      keywords: ['restore', 'import', 'sql', 'script', 'migration', 'run'],
      onSelect: () => {
        onImportSql?.();
      },
    });

    items.push({
      id: 'action-db-metrics',
      title: 'Database Performance Metrics',
      subtitle: 'Monitor CPU, active connections, cache hit ratio, and queries',
      category: 'Actions',
      icon: <Activity className="w-4 h-4 text-amber-500" />,
      keywords: ['performance', 'metrics', 'stats', 'cpu', 'memory', 'cache', 'speed'],
      onSelect: () => {
        onOpenMetrics?.();
      },
    });

    items.push({
      id: 'action-lock-inspector',
      title: 'Lock Inspector & Deadlocks',
      subtitle: 'View active locks, blocking transactions, and deadlock traces',
      category: 'Actions',
      icon: <Lock className="w-4 h-4 text-rose-500" />,
      keywords: ['locks', 'blocking', 'deadlock', 'transactions', 'sessions', 'waits'],
      onSelect: () => {
        onOpenLocks?.();
      },
    });

    items.push({
      id: 'action-audit-log',
      title: 'Audit Log & Query History',
      subtitle: 'Review executed queries, duration, rows, and errors',
      category: 'Actions',
      icon: <History className="w-4 h-4 text-slate-400" />,
      keywords: ['audit', 'history', 'log', 'queries', 'security', 'execution'],
      onSelect: () => {
        onOpenAuditLog?.();
      },
    });

    items.push({
      id: 'action-connection-security',
      title: 'Connection Security & TLS',
      subtitle: 'Inspect SSL/TLS cipher suites, certificates, and vault encryption',
      category: 'Actions',
      icon: <Shield className="w-4 h-4 text-emerald-400" />,
      keywords: ['tls', 'ssl', 'security', 'cipher', 'certificate', 'encryption', 'vault'],
      onSelect: () => {
        onOpenSecurity?.();
      },
    });

    items.push({
      id: 'action-query-history',
      title: 'SQL History & Snippets',
      subtitle: 'Search recent SQL executions and reusable snippet templates',
      category: 'Actions',
      icon: <History className="w-4 h-4 text-cyan-400" />,
      keywords: ['snippets', 'history', 'templates', 'sql', 'queries', 'favorite'],
      onSelect: () => {
        onOpenHistory?.();
      },
    });

    items.push({
      id: 'action-schema-diff',
      title: 'Schema Diff & Synchronization',
      subtitle: 'Compare schemas across databases and generate migration script',
      category: 'Actions',
      icon: <GitCompare className="w-4 h-4 text-orange-400" />,
      keywords: ['diff', 'compare', 'schema', 'sync', 'drift', 'migration'],
      onSelect: () => {
        onOpenSchemaDiff?.();
      },
    });

    items.push({
      id: 'action-activity-monitor',
      title: 'Server Activity Monitor',
      subtitle: 'Inspect live process list and terminate runaway queries',
      category: 'Actions',
      icon: <Activity className="w-4 h-4 text-red-400" />,
      keywords: ['processes', 'activity', 'monitor', 'kill', 'threads', 'server'],
      onSelect: () => {
        onOpenActivityMonitor?.();
      },
    });

    items.push({
      id: 'action-user-manager',
      title: 'User & Privilege Manager',
      subtitle: 'Manage database users, grant permissions, and configure roles',
      category: 'Actions',
      icon: <Users className="w-4 h-4 text-violet-400" />,
      keywords: ['users', 'roles', 'privileges', 'permissions', 'grants', 'security'],
      onSelect: () => {
        onOpenUserManager?.();
      },
    });

    // 2. Tables & Views
    for (const table of tables) {
      const isView = table.type === 'view';
      const schemaPrefix = table.schemaName ? `${table.schemaName}.` : '';
      const displayTitle = `${schemaPrefix}${table.name}`;

      items.push({
        id: `table-${table.schemaName || 'default'}-${table.name}`,
        title: displayTitle,
        subtitle: isView
          ? `View${table.schemaName ? ` in ${table.schemaName}` : ''} • Press Enter to open`
          : `Table${table.schemaName ? ` in ${table.schemaName}` : ''} • Press Enter to view records`,
        category: 'Tables & Views',
        icon: isView ? (
          <Eye className="w-4 h-4 text-purple-400" />
        ) : (
          <Table2 className="w-4 h-4 text-blue-400" />
        ),
        badge: isView ? 'VIEW' : 'TABLE',
        keywords: [table.name, table.schemaName || '', table.type, 'table', 'grid', 'data'],
        onSelect: () => {
          if (onOpenTable) {
            onOpenTable(table.name, table.schemaName);
          } else if (resolvedConnectionId) {
            openTableTab({
              connectionId: resolvedConnectionId,
              tableName: table.name,
              schemaName: table.schemaName,
            });
          }
        },
      });
    }

    // 3. Connections
    for (const conn of connections) {
      const isActive = conn.id === resolvedConnectionId;
      items.push({
        id: `conn-${conn.id}`,
        title: conn.name,
        subtitle: `${conn.driver.toUpperCase()} • ${conn.database || 'database'}${
          conn.host ? ` @ ${conn.host}` : ''
        }`,
        category: 'Connections',
        icon: (
          <Database
            className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-muted'}`}
          />
        ),
        badge: isActive ? 'ACTIVE' : conn.driver.toUpperCase(),
        keywords: [conn.name, conn.driver, conn.database || '', conn.host || '', 'database', 'connection'],
        onSelect: () => {
          if (onSelectConnection) {
            onSelectConnection(conn.id);
          } else {
            setActiveConnection(conn.id);
          }
        },
      });
    }

    return items;
  }, [
    activeConnection,
    connections,
    resolvedConnectionId,
    tables,
    onNewQuery,
    onNewConnection,
    onOpenShortcuts,
    onToggleTheme,
    onToggleSidebar,
    onDuplicateTab,
    onOpenTableList,
    onOpenERDiagram,
    onExportData,
    onImportData,
    onExportSql,
    onImportSql,
    onOpenMetrics,
    onOpenLocks,
    onOpenAuditLog,
    onOpenSecurity,
    onOpenHistory,
    onOpenSchemaDiff,
    onOpenActivityMonitor,
    onOpenUserManager,
    onOpenTable,
    onSelectConnection,
    setActiveConnection,
  ]);

  // Filtering & Search
  const { filteredItems, categoriesWithItems } = useMemo(() => {
    let cleanQuery = query.trim().toLowerCase();
    let categoryFilter: CommandPaletteCategory | null = null;

    // Check query prefix commands
    if (cleanQuery.startsWith('>')) {
      categoryFilter = 'Actions';
      cleanQuery = cleanQuery.slice(1).trim();
    } else if (cleanQuery.startsWith('@') || cleanQuery.startsWith('#')) {
      categoryFilter = 'Tables & Views';
      cleanQuery = cleanQuery.slice(1).trim();
    } else if (cleanQuery.startsWith('/') || cleanQuery.startsWith(':')) {
      categoryFilter = 'Connections';
      cleanQuery = cleanQuery.slice(1).trim();
    }

    let results = allItems;
    if (categoryFilter) {
      results = results.filter((item) => item.category === categoryFilter);
    }

    if (cleanQuery) {
      results = results.filter((item) => {
        const titleMatch = item.title.toLowerCase().includes(cleanQuery);
        const subMatch = item.subtitle?.toLowerCase().includes(cleanQuery);
        const keyMatch = item.keywords?.some((k) => k.toLowerCase().includes(cleanQuery));
        const catMatch = item.category.toLowerCase().includes(cleanQuery);
        return titleMatch || subMatch || keyMatch || catMatch;
      });
    }

    // Group by category order
    const categoryOrder: CommandPaletteCategory[] = [
      'Actions',
      'Tables & Views',
      'Connections',
    ];

    const grouped: { category: CommandPaletteCategory; items: CommandPaletteItem[] }[] = [];
    const flat: CommandPaletteItem[] = [];

    for (const cat of categoryOrder) {
      const itemsInCat = results.filter((i) => i.category === cat);
      if (itemsInCat.length > 0) {
        grouped.push({ category: cat, items: itemsInCat });
        flat.push(...itemsInCat);
      }
    }

    return {
      filteredItems: flat,
      categoriesWithItems: grouped,
    };
  }, [allItems, query]);

  // Scroll active item into view
  useEffect(() => {
    const activeEl = itemRefs.current[selectedIndex];
    if (activeEl && typeof activeEl.scrollIntoView === 'function') {
      activeEl.scrollIntoView({
        block: 'nearest',
      });
    }
  }, [selectedIndex]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filteredItems.length === 0 ? 0 : (prev + 1) % filteredItems.length
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filteredItems.length === 0
            ? 0
            : (prev - 1 + filteredItems.length) % filteredItems.length
        );
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selectedItem = filteredItems[selectedIndex];
        if (selectedItem) {
          selectedItem.onSelect();
          onClose();
        }
      }
    },
    [filteredItems, selectedIndex, onClose]
  );

  const renderKeyBadges = (item: CommandPaletteItem) => {
    const keys = isMac ? item.macKeys : item.winKeys;
    if (!keys || keys.length === 0) return null;

    return (
      <div className="flex items-center gap-1 shrink-0">
        {keys.map((k, i) => (
          <kbd
            key={i}
            className="px-1.5 py-0.5 min-w-[18px] text-center text-[10px] font-mono font-medium rounded bg-panel/80 text-muted border border-line shadow-2xs"
          >
            {k}
          </kbd>
        ))}
      </div>
    );
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          data-testid="command-palette-overlay"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity"
        />
        <Dialog.Content
          data-testid="command-palette-modal"
          role="dialog"
          aria-label="Command Palette"
          onKeyDown={handleKeyDown}
          className="fixed left-1/2 top-[15%] -translate-x-1/2 z-50 w-full max-w-2xl flex flex-col rounded-xl border border-line bg-panel text-text shadow-2xl focus:outline-none overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Header Search Box */}
          <div className="flex items-center px-3.5 py-2.5 border-b border-line gap-2.5 bg-sidebar/40">
            <Search className="w-4 h-4 text-muted shrink-0" />
            <input
              ref={inputRef}
              data-testid="command-palette-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a command, table name, or database..."
              className="w-full bg-transparent text-sm text-text placeholder:text-muted/60 focus:outline-none"
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
            />
            {query ? (
              <button
                type="button"
                data-testid="command-palette-clear-btn"
                onClick={() => setQuery('')}
                className="p-1 rounded text-muted hover:text-text hover:bg-sel/40 transition-colors"
                title="Clear input"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-muted rounded bg-panel border border-line shrink-0">
                ESC
              </kbd>
            )}
          </div>

          {/* Quick Filter Filter Pills */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-line/60 bg-sidebar/20 text-[11px] overflow-x-auto select-none">
            <span className="text-muted/70 text-[10px] font-medium mr-1 uppercase tracking-wider">
              Filter:
            </span>
            <button
              type="button"
              data-testid="filter-pill-all"
              onClick={() => setQuery('')}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                !query.startsWith('>') && !query.startsWith('@') && !query.startsWith('/')
                  ? 'bg-accent/15 text-accent font-medium'
                  : 'text-muted hover:text-text hover:bg-panel'
              }`}
            >
              All
            </button>
            <button
              type="button"
              data-testid="filter-pill-actions"
              onClick={() => setQuery('> ')}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                query.startsWith('>')
                  ? 'bg-accent/15 text-accent font-medium'
                  : 'text-muted hover:text-text hover:bg-panel'
              }`}
            >
              &gt; Actions
            </button>
            <button
              type="button"
              data-testid="filter-pill-tables"
              onClick={() => setQuery('@ ')}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                query.startsWith('@') || query.startsWith('#')
                  ? 'bg-accent/15 text-accent font-medium'
                  : 'text-muted hover:text-text hover:bg-panel'
              }`}
            >
              @ Tables
            </button>
            <button
              type="button"
              data-testid="filter-pill-connections"
              onClick={() => setQuery('/ ')}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                query.startsWith('/') || query.startsWith(':')
                  ? 'bg-accent/15 text-accent font-medium'
                  : 'text-muted hover:text-text hover:bg-panel'
              }`}
            >
              / Connections
            </button>
          </div>

          {/* Results List Area */}
          <div
            ref={listRef}
            data-testid="command-palette-results"
            className="max-h-[55vh] overflow-y-auto p-1.5 space-y-3 focus:outline-none"
          >
            {isLoadingTables && (
              <div className="px-3 py-1.5 text-xs text-muted/70 animate-pulse flex items-center gap-1.5">
                <Table2 className="w-3.5 h-3.5 animate-spin" />
                <span>Loading tables from active database...</span>
              </div>
            )}

            {filteredItems.length === 0 ? (
              <div
                data-testid="command-palette-empty"
                className="py-10 px-4 text-center select-none"
              >
                <Search className="w-8 h-8 mx-auto mb-2 text-muted/30 stroke-1" />
                <p className="text-sm font-medium text-text">
                  No matching commands or tables found
                </p>
                <p className="text-xs text-muted mt-1">
                  Try searching for another keyword or check active connection
                </p>
              </div>
            ) : (
              categoriesWithItems.map((group) => {
                return (
                  <div key={group.category} data-testid={`palette-category-${group.category}`}>
                    <div className="px-2.5 py-1 text-[10px] font-semibold text-muted/80 uppercase tracking-wider flex items-center justify-between">
                      <span>{group.category}</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-sidebar border border-line text-muted">
                        {group.items.length}
                      </span>
                    </div>

                    <div className="space-y-0.5 mt-0.5">
                      {group.items.map((item) => {
                        const globalIndex = filteredItems.findIndex((fi) => fi.id === item.id);
                        const isSelected = globalIndex === selectedIndex;

                        return (
                          <button
                            key={item.id}
                            ref={(el) => {
                              itemRefs.current[globalIndex] = el;
                            }}
                            type="button"
                            data-testid={`palette-item-${item.id}`}
                            aria-selected={isSelected}
                            onClick={() => {
                              item.onSelect();
                              onClose();
                            }}
                            onMouseEnter={() => setSelectedIndex(globalIndex)}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors cursor-pointer group ${
                              isSelected
                                ? 'bg-sel text-text font-medium shadow-2xs'
                                : 'hover:bg-sel/40 text-text'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                              <span className="shrink-0">{item.icon}</span>
                              <div className="flex flex-col min-w-0">
                                <span className="text-sm truncate leading-snug">{item.title}</span>
                                {item.subtitle && (
                                  <span className="text-xs text-muted truncate leading-tight">
                                    {item.subtitle}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {item.badge && (
                                <span
                                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                                    item.badge === 'ACTIVE'
                                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500 font-semibold flex items-center gap-1'
                                      : 'border-line bg-sidebar/80 text-muted'
                                  }`}
                                >
                                  {item.badge === 'ACTIVE' && <Check className="w-2.5 h-2.5" />}
                                  {item.badge}
                                </span>
                              )}
                              {renderKeyBadges(item)}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Bar with Keyboard Navigation Hints */}
          <div className="flex items-center justify-between px-3.5 py-2 border-t border-line bg-sidebar/50 text-[11px] text-muted select-none">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded bg-panel border border-line font-mono text-[10px]">
                  ↑
                </kbd>
                <kbd className="px-1 py-0.5 rounded bg-panel border border-line font-mono text-[10px]">
                  ↓
                </kbd>
                <span>to navigate</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded bg-panel border border-line font-mono text-[10px]">
                  ↵
                </kbd>
                <span>to select</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded bg-panel border border-line font-mono text-[10px]">
                  esc
                </kbd>
                <span>to close</span>
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted/80">
                {activeConnection ? `Active: ${activeConnection.name}` : 'No connection active'}
              </span>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default CommandPaletteModal;
