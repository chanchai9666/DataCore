import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  RefreshCw,
  Table as TableIcon,
  Copy,
  ExternalLink,
  Wrench,
  Database,
  ArrowUpDown,
  Download,
  Upload,
  FileCode,
  Trash2,
  ArrowRightLeft,
  Pencil,
  Wand2,
  List,
  LayoutGrid,
  FolderTree,
  HardDrive,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { dbApi } from '../../api/db';
import { useConnectionStore } from '../../stores/connectionStore';
import { useTabStore } from '../../stores/tabStore';
import {
  useTableListCacheStore,
  getTableListCacheKey,
} from '../../stores/tableListCacheStore';
import { buildDropTableSql, qualifyTable } from '../../api/queryBuilder';
import { showConfirmDialog } from '../../utils/dialog';
import type { TableMetadata } from '../../types/dataTransfer';
import {
  openTableTab,
  openQueryTab,
  openQueryBuilderTab,
} from '../sidebar/tabHelpers';
import { SketchTableIcon } from '../sidebar/ConnectionTreeNode';
import { DuplicateTableModal } from '../transfer/DuplicateTableModal';
import { CrossDbCopyModal } from '../transfer/CrossDbCopyModal';
import { ExportSqlModal } from '../transfer/ExportSqlModal';
import { ExportModal } from '../transfer/ExportModal';
import { ImportModal } from '../transfer/ImportModal';
import { ImportSqlModal } from '../transfer/ImportSqlModal';
import { DropTableModal } from '../structure/DropTableModal';
import { RenameTableModal } from '../structure/RenameTableModal';
import { TableMaintenanceModal } from '../structure/TableMaintenanceModal';
import { useContextMenuPosition } from '../../hooks/useContextMenuPosition';

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatApproxRows(count: number): string {
  if (count < 0) return '-';
  if (count >= 1_000_000) {
    return `~${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `~${(count / 1_000).toFixed(1)}K`;
  }
  return `~${count}`;
}

export interface TableListTabProps {
  connectionId: string;
  schemaName?: string;
  driver?: string;
  theme?: import('../../types/theme').AppTheme;
  onOpenTable?: (tableName: string) => void;
  onOpenStructure?: (tableName: string) => void;
  onDuplicateTable?: (tableName: string) => void;
  onCopyTableToDb?: (tableName: string) => void;
  onExportSql?: (tableName: string) => void;
  onExportData?: (tableName: string) => void;
  onImportSql?: (tableName: string) => void;
  onImportData?: (tableName: string) => void;
  onDropTable?: (tableName: string) => void;
}

type SortField = 'name' | 'approxRowCount' | 'totalSizeBytes' | 'engine';
type SortOrder = 'asc' | 'desc';
export type TableListViewMode = 'table' | 'grid' | 'grouped' | 'storage';
export type TableHealthStatus = 'needs_analyze' | 'index_heavy' | 'healthy';

const VIEW_MODE_STORAGE_KEY = 'datacore-table-list-view-mode';
const GROUP_IN_LIST_STORAGE_KEY = 'datacore-table-list-group-in-list';

const GROUP_BOARD_PALETTES = {
  light: [
    { card: 'bg-orange-50/90 border-orange-200/80', header: 'text-orange-950', badge: 'bg-orange-200/70 text-orange-900', itemHover: 'hover:bg-orange-100/70' },
    { card: 'bg-lime-50/90 border-lime-200/80', header: 'text-lime-950', badge: 'bg-lime-200/70 text-lime-900', itemHover: 'hover:bg-lime-100/70' },
    { card: 'bg-sky-50/90 border-sky-200/80', header: 'text-sky-950', badge: 'bg-sky-200/70 text-sky-900', itemHover: 'hover:bg-sky-100/70' },
    { card: 'bg-rose-50/90 border-rose-200/80', header: 'text-rose-950', badge: 'bg-rose-200/70 text-rose-900', itemHover: 'hover:bg-rose-100/70' },
    { card: 'bg-amber-50/90 border-amber-200/80', header: 'text-amber-950', badge: 'bg-amber-200/70 text-amber-900', itemHover: 'hover:bg-amber-100/70' },
    { card: 'bg-teal-50/90 border-teal-200/80', header: 'text-teal-950', badge: 'bg-teal-200/70 text-teal-900', itemHover: 'hover:bg-teal-100/70' },
    { card: 'bg-purple-50/90 border-purple-200/80', header: 'text-purple-950', badge: 'bg-purple-200/70 text-purple-900', itemHover: 'hover:bg-purple-100/70' },
    { card: 'bg-indigo-50/90 border-indigo-200/80', header: 'text-indigo-950', badge: 'bg-indigo-200/70 text-indigo-900', itemHover: 'hover:bg-indigo-100/70' },
  ],
  dark: [
    { card: 'bg-orange-950/30 border-orange-800/40', header: 'text-orange-100', badge: 'bg-orange-900/60 text-orange-200', itemHover: 'hover:bg-orange-900/30' },
    { card: 'bg-lime-950/30 border-lime-800/40', header: 'text-lime-100', badge: 'bg-lime-900/60 text-lime-200', itemHover: 'hover:bg-lime-900/30' },
    { card: 'bg-sky-950/30 border-sky-800/40', header: 'text-sky-100', badge: 'bg-sky-900/60 text-sky-200', itemHover: 'hover:bg-sky-900/30' },
    { card: 'bg-rose-950/30 border-rose-800/40', header: 'text-rose-100', badge: 'bg-rose-900/60 text-rose-200', itemHover: 'hover:bg-rose-900/30' },
    { card: 'bg-amber-950/30 border-amber-800/40', header: 'text-amber-100', badge: 'bg-amber-900/60 text-amber-200', itemHover: 'hover:bg-amber-900/30' },
    { card: 'bg-teal-950/30 border-teal-800/40', header: 'text-teal-100', badge: 'bg-teal-900/60 text-teal-200', itemHover: 'hover:bg-teal-900/30' },
    { card: 'bg-purple-950/30 border-purple-800/40', header: 'text-purple-100', badge: 'bg-purple-900/60 text-purple-200', itemHover: 'hover:bg-purple-900/30' },
    { card: 'bg-indigo-950/30 border-indigo-800/40', header: 'text-indigo-100', badge: 'bg-indigo-900/60 text-indigo-200', itemHover: 'hover:bg-indigo-900/30' },
  ],
};

function loadInitialGroupInList(): boolean {
  try {
    return localStorage.getItem(GROUP_IN_LIST_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function loadInitialViewMode(): TableListViewMode {
  try {
    const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (saved === 'table' || saved === 'grid' || saved === 'grouped' || saved === 'storage') {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return 'table';
}

export function getTablePrefix(tableName: string): string {
  const idx = tableName.indexOf('_');
  if (idx <= 0) return '';
  return tableName.slice(0, idx);
}

export interface TablePrefixGroup {
  key: string;
  label: string;
  isOther: boolean;
  tables: TableMetadata[];
  totalRows: number;
  totalSizeBytes: number;
}

export function groupTablesByPrefix(tables: TableMetadata[]): TablePrefixGroup[] {
  const prefixMap = new Map<string, TableMetadata[]>();
  for (const table of tables) {
    const prefix = getTablePrefix(table.name);
    const list = prefixMap.get(prefix) || [];
    list.push(table);
    prefixMap.set(prefix, list);
  }

  const groups: TablePrefixGroup[] = [];
  const otherTables: TableMetadata[] = [];

  for (const [prefix, list] of prefixMap.entries()) {
    if (prefix && list.length >= 2) {
      groups.push({
        key: prefix,
        label: `${prefix}_*`,
        isOther: false,
        tables: list,
        totalRows: list.reduce((sum, t) => sum + Math.max(0, t.approxRowCount || 0), 0),
        totalSizeBytes: list.reduce((sum, t) => sum + (t.totalSizeBytes || 0), 0),
      });
    } else {
      otherTables.push(...list);
    }
  }

  groups.sort((a, b) => a.key.localeCompare(b.key));

  if (otherTables.length > 0) {
    groups.push({
      key: '__other__',
      label: 'Other / Ungrouped',
      isOther: true,
      tables: otherTables,
      totalRows: otherTables.reduce((sum, t) => sum + Math.max(0, t.approxRowCount || 0), 0),
      totalSizeBytes: otherTables.reduce((sum, t) => sum + (t.totalSizeBytes || 0), 0),
    });
  }

  return groups;
}

export function getTableHealthStatus(table: TableMetadata): TableHealthStatus {
  if ((table.totalSizeBytes || 0) > 0 && (table.approxRowCount || 0) === 0) {
    return 'needs_analyze';
  }
  if ((table.dataSizeBytes || 0) > 0 && (table.indexSizeBytes || 0) > (table.dataSizeBytes || 0)) {
    return 'index_heavy';
  }
  return 'healthy';
}

export const TableListTab: React.FC<TableListTabProps> = ({
  connectionId,
  schemaName,
  driver,
  theme: propTheme,
  onOpenTable,
  onOpenStructure,
  onDuplicateTable,
  onCopyTableToDb,
  onExportSql,
  onExportData,
  onImportSql,
  onImportData,
  onDropTable,
}) => {
  const { t } = useTranslation();
  const connectionName = useConnectionStore(
    (s) => s.connections?.find((c) => c.id === connectionId)?.name
  );
  const isDark = propTheme
    ? propTheme === 'dark'
    : typeof document !== 'undefined'
    ? document.documentElement.classList.contains('dark')
    : true;
  const isWarmPaper =
    propTheme === 'warm-paper' ||
    (typeof document !== 'undefined' &&
      document.documentElement.getAttribute('data-theme') === 'warm-paper');
  const theme = isDark ? 'dark' : 'light';

  const renderTableIcon = (name: string, selected = false) => {
    if (isWarmPaper) {
      return <SketchTableIcon name={name} />;
    }
    return (
      <TableIcon
        className={`w-4 h-4 shrink-0 ${selected ? 'text-white' : 'text-emerald-400'}`}
      />
    );
  };

  const cacheKey = getTableListCacheKey(connectionId, schemaName);
  const cachedEntry = useTableListCacheStore((s) => s.entries[cacheKey]);
  const setCachedTables = useTableListCacheStore((s) => s.setCachedTables);

  const [tables, setTables] = useState<TableMetadata[]>(() => cachedEntry?.tables ?? []);
  const [loading, setLoading] = useState<boolean>(() => !cachedEntry);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [viewMode, setViewMode] = useState<TableListViewMode>(loadInitialViewMode);
  const [groupInList, setGroupInList] = useState<boolean>(loadInitialGroupInList);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [anchorTable, setAnchorTable] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    table: TableMetadata | null;
  } | null>(null);

  // Active modals state
  const [activeDuplicateTable, setActiveDuplicateTable] = useState<string | null>(null);
  const [activeCopyTableToDb, setActiveCopyTableToDb] = useState<string | null>(null);
  const [activeExportSqlTarget, setActiveExportSqlTarget] = useState<{
    tableName?: string;
    tableNames?: string[];
  } | null>(null);
  const [activeExportDataTable, setActiveExportDataTable] = useState<string | null>(null);
  const [activeImportSqlTable, setActiveImportSqlTable] = useState<string | null>(null);
  const [activeImportDataTarget, setActiveImportDataTarget] = useState<{
    tableName: string;
    columns: { name: string; dataType: string }[];
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const menuPosition = useContextMenuPosition(contextMenu, contextMenuRef);
  const [activeRenameTable, setActiveRenameTable] = useState<string | null>(null);
  const [activeMaintenanceTable, setActiveMaintenanceTable] = useState<string | null>(null);
  const [activeDropTable, setActiveDropTable] = useState<string | null>(null);

  useEffect(() => {
    if (!contextMenu) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };

    window.addEventListener('mousedown', handlePointerDown, true);
    window.addEventListener('contextmenu', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown, true);
      window.removeEventListener('contextmenu', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  const handleOpenData = (tableName: string) => {
    if (onOpenTable) {
      onOpenTable(tableName);
    } else {
      openTableTab({
        connectionId,
        tableName,
        schemaName,
        viewMode: 'data',
      });
    }
  };

  const handleOpenStructure = (tableName: string) => {
    if (onOpenStructure) {
      onOpenStructure(tableName);
    } else {
      openTableTab({
        connectionId,
        tableName,
        schemaName,
        viewMode: 'structure',
      });
    }
  };

  const handleTriggerDuplicate = (tableName: string) => {
    if (onDuplicateTable) {
      onDuplicateTable(tableName);
    } else {
      setActiveDuplicateTable(tableName);
    }
    setContextMenu(null);
  };

  const handleTriggerCopyTableToDb = (tableName: string) => {
    if (onCopyTableToDb) {
      onCopyTableToDb(tableName);
    } else {
      setActiveCopyTableToDb(tableName);
    }
    setContextMenu(null);
  };

  const handleTriggerExportSql = (tableName: string) => {
    if (onExportSql) {
      onExportSql(tableName);
    } else {
      setActiveExportSqlTarget({ tableName });
    }
    setContextMenu(null);
  };

  const handleTriggerExportSelectedSql = (names: string[]) => {
    setActiveExportSqlTarget({ tableNames: names });
    setContextMenu(null);
  };

  const handleTriggerExportData = (tableName: string) => {
    if (onExportData) {
      onExportData(tableName);
    } else {
      setActiveExportDataTable(tableName);
    }
    setContextMenu(null);
  };

  const handleTriggerImportSql = (tableName: string) => {
    if (onImportSql) {
      onImportSql(tableName);
    } else {
      setActiveImportSqlTable(tableName);
    }
    setContextMenu(null);
  };

  const handleTriggerImportData = async (tableName: string) => {
    setContextMenu(null);
    if (onImportData) {
      onImportData(tableName);
      return;
    }
    try {
      const res = await dbApi.executeDirectQuery(
        connectionId,
        `SELECT * FROM ${tableName} LIMIT 0`
      );
      const cols = (res.columns || []).map((c) => ({
        name: c.name,
        dataType: c.data_type,
      }));
      setActiveImportDataTarget({
        tableName,
        columns: cols,
      });
    } catch {
      setActiveImportDataTarget({
        tableName,
        columns: [],
      });
    }
  };

  const handleTriggerRenameTable = (tableName: string) => {
    setActiveRenameTable(tableName);
    setContextMenu(null);
  };

  const handleTriggerMaintenance = (tableName: string) => {
    setActiveMaintenanceTable(tableName);
    setContextMenu(null);
  };

  const handleTriggerDropTable = (tableName: string) => {
    if (onDropTable) {
      onDropTable(tableName);
    } else {
      setActiveDropTable(tableName);
    }
    setContextMenu(null);
  };

  const handleQueryTable = (tableName: string) => {
    openQueryTab({
      connectionId,
      connectionName: connectionName || tableName,
      schemaName,
      tableName,
      driver,
    });
    setContextMenu(null);
  };

  const handleOpenQueryBuilder = (tableName: string) => {
    openQueryBuilderTab({
      connectionId,
      tableName,
      schemaName,
    });
    setContextMenu(null);
  };

  const handleViewObjectDdl = async (tableName: string) => {
    setContextMenu(null);
    try {
      const ddl = await dbApi.getObjectDdl(connectionId, schemaName, tableName, 'table');
      openQueryTab({
        connectionId,
        connectionName: connectionName || tableName,
        schemaName,
        tableName,
        driver,
        initialQuery: ddl,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to load DDL: ${msg}`);
    }
  };

  const handleCopyName = (name: string) => {
    navigator.clipboard?.writeText(name);
    toast.success(`Copied "${name}" to clipboard`);
    setContextMenu(null);
  };

  const fetchTables = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await dbApi.getTableListMetadata(connectionId, schemaName);
      setTables(data);
      setCachedTables(connectionId, schemaName, data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const existing = useTableListCacheStore.getState().entries[cacheKey];
    if (existing) {
      setTables(existing.tables);
      setLoading(false);
      setError(null);
      return;
    }
    fetchTables();
  }, [connectionId, schemaName, cacheKey]);

  const handleChangeViewMode = (mode: TableListViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // ignore storage errors
    }
  };

  const handleToggleGroupInList = () => {
    setGroupInList((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(GROUP_IN_LIST_STORAGE_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const toggleGroupCollapsed = (groupKey: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const filteredAndSortedTables = useMemo(() => {
    if (!tables) return [];
    return tables
      .filter((table) =>
        table.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
      )
      .sort((a, b) => {
        let cmp = 0;
        if (sortField === 'name') {
          cmp = a.name.localeCompare(b.name);
        } else if (sortField === 'approxRowCount') {
          cmp = (a.approxRowCount || 0) - (b.approxRowCount || 0);
        } else if (sortField === 'totalSizeBytes') {
          cmp = (a.totalSizeBytes || 0) - (b.totalSizeBytes || 0);
        } else if (sortField === 'engine') {
          cmp = (a.engine || '').localeCompare(b.engine || '');
        }
        return sortOrder === 'asc' ? cmp : -cmp;
      });
  }, [tables, searchQuery, sortField, sortOrder]);

  const groupedTables = useMemo(
    () => groupTablesByPrefix(filteredAndSortedTables),
    [filteredAndSortedTables]
  );

  const storageSummary = useMemo(() => {
    let totalStorageBytes = 0;
    let totalDataBytes = 0;
    let totalIndexBytes = 0;
    let largestTable: TableMetadata | null = null;
    let alertCount = 0;

    for (const table of filteredAndSortedTables) {
      const total = table.totalSizeBytes || 0;
      totalStorageBytes += total;
      totalDataBytes += table.dataSizeBytes || 0;
      totalIndexBytes += table.indexSizeBytes || 0;
      if (!largestTable || total > (largestTable.totalSizeBytes || 0)) {
        largestTable = table;
      }
      if (getTableHealthStatus(table) !== 'healthy') {
        alertCount += 1;
      }
    }

    return {
      totalStorageBytes,
      totalDataBytes,
      totalIndexBytes,
      largestTable,
      alertCount,
    };
  }, [filteredAndSortedTables]);

  const handleRowClick = (tableName: string, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      setSelectedTables((prev) =>
        prev.includes(tableName) ? prev.filter((t) => t !== tableName) : [...prev, tableName]
      );
      setAnchorTable(tableName);
    } else if (e.shiftKey) {
      const names = filteredAndSortedTables.map((t) => t.name);
      const targetIdx = names.indexOf(tableName);
      const anchorIdx = anchorTable ? names.indexOf(anchorTable) : 0;
      const start = Math.min(anchorIdx === -1 ? 0 : anchorIdx, targetIdx);
      const end = Math.max(anchorIdx === -1 ? 0 : anchorIdx, targetIdx);
      if (targetIdx !== -1) {
        setSelectedTables(names.slice(start, end + 1));
      }
    } else {
      setSelectedTables([tableName]);
      setAnchorTable(tableName);
    }
  };

  const handleCopySelectedNames = (namesToCopy: string[]) => {
    if (namesToCopy.length === 0) return;
    const text = namesToCopy.join('\n');
    navigator.clipboard?.writeText(text);
    if (namesToCopy.length === 1) {
      toast.success(`Copied table name "${namesToCopy[0]}" to clipboard`);
    } else {
      toast.success(
        t('tableList.copiedMultipleNames', 'Copied {{count}} table names to clipboard', {
          count: namesToCopy.length,
        })
      );
    }
    setContextMenu(null);
  };

  const handleOpenSelectedTables = (namesToOpen: string[]) => {
    for (const name of namesToOpen) {
      handleOpenData(name);
    }
    setContextMenu(null);
  };

  const handleEditSelectedStructures = (namesToEdit: string[]) => {
    for (const name of namesToEdit) {
      handleOpenStructure(name);
    }
    setContextMenu(null);
  };

  const handleQuerySelectedTables = (namesToQuery: string[]) => {
    const sql = namesToQuery
      .map((name) => `SELECT * FROM ${qualifyTable(name, schemaName, driver)} LIMIT 100;`)
      .join('\n');
    openQueryTab({
      connectionId,
      connectionName: connectionName || `${namesToQuery.length} Tables`,
      schemaName,
      driver,
      initialQuery: `${sql}\n`,
    });
    setContextMenu(null);
  };

  const handleViewSelectedDdl = async (namesToView: string[]) => {
    setContextMenu(null);
    try {
      const ddls = await Promise.all(
        namesToView.map((name) => dbApi.getObjectDdl(connectionId, schemaName, name, 'table'))
      );
      openQueryTab({
        connectionId,
        connectionName: connectionName || `${namesToView.length} Tables`,
        schemaName,
        driver,
        initialQuery: ddls.filter(Boolean).join('\n\n'),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to load DDL: ${msg}`);
    }
  };

  const handleTriggerDropSelectedTables = async (namesToDrop: string[]) => {
    setContextMenu(null);
    const confirmed = await showConfirmDialog(
      t(
        'tableList.confirmDropMultipleMessage',
        'Are you sure you want to drop {{count}} selected tables ({{tables}})? This action cannot be undone.',
        { count: namesToDrop.length, tables: namesToDrop.join(', ') }
      ),
      {
        title: t('tableList.confirmDropMultipleTitle', 'Drop Selected Tables'),
        kind: 'warning',
      }
    );
    if (!confirmed) return;

    try {
      for (const name of namesToDrop) {
        const sql = buildDropTableSql(name, schemaName, driver);
        await dbApi.executeDirectQuery(connectionId, sql);
      }
      const { tabs, closeTab } = useTabStore.getState();
      const droppedSet = new Set(namesToDrop);
      const openTabs = tabs.filter(
        (tab) =>
          tab.connectionId === connectionId &&
          tab.tableName &&
          droppedSet.has(tab.tableName) &&
          (!schemaName || tab.schemaName === schemaName)
      );
      for (const tab of openTabs) {
        await closeTab(tab.id);
      }
      toast.success(
        t('tableList.droppedMultipleSuccess', 'Dropped {{count}} tables successfully', {
          count: namesToDrop.length,
        })
      );
      setSelectedTables([]);
      setAnchorTable(null);
      fetchTables();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(t('structure.failedToDrop', 'Failed to drop table: {{error}}', { error: msg }));
    }
  };

  const handleContainerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    const isInput =
      target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
      return;
    }

    if (isInput) {
      if (e.key === 'Escape') {
        (target as HTMLElement).blur();
        containerRef.current?.focus();
      }
      return;
    }

    if (e.key === 'Escape') {
      if (contextMenu) {
        setContextMenu(null);
      } else if (selectedTables.length > 0) {
        setSelectedTables([]);
      }
      return;
    }

    const names = filteredAndSortedTables.map((t) => t.name);
    if (names.length === 0) return;

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setSelectedTables(names);
      setAnchorTable(names[0]);
      return;
    }

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
      if (selectedTables.length > 0) {
        e.preventDefault();
        handleCopySelectedNames(selectedTables);
      }
      return;
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const currentLast = selectedTables[selectedTables.length - 1];
      const currentIdx = currentLast ? names.indexOf(currentLast) : -1;
      const nextIdx =
        e.key === 'ArrowDown'
          ? currentIdx < names.length - 1
            ? currentIdx + 1
            : 0
          : currentIdx > 0
          ? currentIdx - 1
          : names.length - 1;
      const nextName = names[nextIdx];
      if (e.shiftKey && anchorTable) {
        const anchorIdx = names.indexOf(anchorTable);
        const start = Math.min(anchorIdx === -1 ? 0 : anchorIdx, nextIdx);
        const end = Math.max(anchorIdx === -1 ? 0 : anchorIdx, nextIdx);
        setSelectedTables(names.slice(start, end + 1));
      } else {
        setSelectedTables([nextName]);
        setAnchorTable(nextName);
      }
      return;
    }

    if (e.key === 'Enter' && selectedTables.length > 0) {
      e.preventDefault();
      handleOpenSelectedTables(selectedTables);
      return;
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedTables.length === 1) {
      e.preventDefault();
      handleTriggerDropTable(selectedTables[0]);
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleContainerKeyDown}
      data-testid="table-list-container"
      className="flex flex-col h-full font-sans select-none outline-none bg-[var(--bg-grid)] text-[var(--text)]"
    >
      {/* Top Action & Search Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b gap-4 transition-colors bg-[var(--bg-panel)] border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-[var(--accent)]" />
          <span className="font-semibold text-xs text-[var(--text)]">
            {schemaName ? `${schemaName} Tables` : 'Tables'}
          </span>
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--bg-toolbar)] text-[var(--text-muted)] font-medium">
            {filteredAndSortedTables.length === 1
              ? t('tableList.tableCount', { count: 1 })
              : t('tableList.tableCount_plural', { count: filteredAndSortedTables.length })}
          </span>
          {selectedTables.length > 0 && (
            <span
              data-testid="table-list-selected-badge"
              className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--sel)] text-[var(--text)] font-medium"
            >
              {t('tableList.selectedCount', '{{count}} selected', { count: selectedTables.length })}
            </span>
          )}
          <span className="hidden xl:inline text-[11px] text-[var(--text-muted)] ml-2">
            {t('tableList.shortcutsHint', '⌘A Select All · ⌘C Copy · ↑↓ Navigate · Enter Open')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Group-in-list option when in List view */}
          {viewMode === 'table' && (
            <button
              type="button"
              data-testid="toggle-group-in-list"
              aria-pressed={groupInList}
              onClick={handleToggleGroupInList}
              title={t('tableList.groupInListTooltip', 'Group tables by prefix in list view')}
              className={`flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-medium transition-colors ${
                groupInList
                  ? 'bg-[var(--sel)] border-[var(--accent)] text-[var(--text)]'
                  : 'bg-[var(--bg-grid)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--row-alt)]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('tableList.groupToggle', 'Group')}</span>
            </button>
          )}

          {/* View Mode Switcher */}
          <div
            role="group"
            aria-label={t('tableList.viewModeLabel', 'View Mode')}
            className="flex items-center rounded border p-0.5 bg-[var(--bg-toolbar)] border-[var(--border)]"
          >
            {([
              { id: 'table', icon: List, label: t('tableList.viewTable', 'List') },
              { id: 'grid', icon: LayoutGrid, label: t('tableList.viewGrid', 'Grid') },
              { id: 'grouped', icon: FolderTree, label: t('tableList.viewGrouped', 'Categories') },
              { id: 'storage', icon: HardDrive, label: t('tableList.viewStorage', 'Storage') },
            ] as const).map(({ id, icon: Icon, label }) => {
              const active = viewMode === id;
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`view-mode-${id}`}
                  aria-pressed={active}
                  onClick={() => handleChangeViewMode(id)}
                  title={label}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    active
                      ? 'bg-[var(--bg-grid)] text-[var(--accent)] shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">{label}</span>
                </button>
              );
            })}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t('tableList.searchPlaceholder', 'Search tables...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs pl-8 pr-3 py-1 rounded border focus:outline-none focus:border-[var(--accent)] w-44 sm:w-52 transition-colors bg-[var(--bg-input)] text-[var(--text)] border-[var(--border)] placeholder-[var(--text-muted)]"
            />
          </div>

          <button
            onClick={fetchTables}
            disabled={loading}
            title={t('tableList.refreshTooltip', 'Refresh tables metadata')}
            className="p-1 rounded transition-colors disabled:opacity-50 hover:bg-[var(--row-alt)] text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div
        className="flex-1 overflow-auto"
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, table: null });
        }}
      >
        {loading && tables.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-[var(--text-muted)] gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-[var(--accent)]" />
            <span>{t('tableList.loading', 'Loading tables metadata...')}</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <p className="text-xs text-[var(--danger)] mb-2">{t('tableList.failedToLoad', 'Failed to load tables: {{error}}', { error })}</p>
            <button
              onClick={fetchTables}
              className="px-3 py-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs rounded transition-colors"
            >
              {t('tableList.retry', 'Retry')}
            </button>
          </div>
        ) : filteredAndSortedTables.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-xs text-[var(--text-muted)] p-4">
            <TableIcon className="w-8 h-8 text-[var(--text-muted)] opacity-50 mb-2 stroke-1" />
            <p>{searchQuery ? t('tableList.noTablesMatch', 'No tables match your search.') : t('tableList.noTablesFound', 'No tables found in this schema.')}</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div
            data-testid="table-list-grid-view"
            className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
          >
            {filteredAndSortedTables.map((table) => {
              const isSelected = selectedTables.includes(table.name);
              return (
                <div
                  key={table.name}
                  data-testid={`table-card-${table.name}`}
                  aria-selected={isSelected}
                  onClick={(e) => handleRowClick(table.name, e)}
                  onDoubleClick={() => handleOpenData(table.name)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!selectedTables.includes(table.name)) {
                      setSelectedTables([table.name]);
                      setAnchorTable(table.name);
                    }
                    setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, table });
                  }}
                  className={`rounded-lg border p-3 transition-colors cursor-pointer flex flex-col justify-between gap-2.5 ${
                    isSelected
                      ? 'bg-[var(--sel)] border-[var(--accent)] ring-1 ring-[var(--accent)]/40'
                      : 'bg-[var(--bg-card)] border-[var(--border)] hover:bg-[var(--row-alt)]'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {renderTableIcon(table.name)}
                        <span
                          className="font-mono text-xs font-semibold truncate text-[var(--text)]"
                          title={table.name}
                        >
                          {table.name}
                        </span>
                      </div>
                      {table.engine && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0 bg-[var(--bg-toolbar)] text-[var(--text-muted)]">
                          {table.engine}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded px-2 py-1 bg-[var(--bg-grid)]">
                        <div className="text-[10px] text-[var(--text-muted)]">
                          {t('tableList.approxRowsHeader', 'Approx Rows')}
                        </div>
                        <div className="font-mono font-medium text-[var(--text)]">
                          {formatApproxRows(table.approxRowCount)}
                        </div>
                      </div>
                      <div className="rounded px-2 py-1 bg-[var(--bg-grid)]">
                        <div className="text-[10px] text-[var(--text-muted)]">
                          {t('tableList.totalSizeHeader', 'Total Size')}
                        </div>
                        <div className="font-mono font-medium text-[var(--text)]">
                          {formatBytes(table.totalSizeBytes)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--text-muted)] font-mono">
                      <span>{t('tableList.dataShort', 'Data')}: {formatBytes(table.dataSizeBytes)}</span>
                      <span>{t('tableList.indexShort', 'Index')}: {formatBytes(table.indexSizeBytes)}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t flex items-center justify-end gap-1 border-[var(--border-subtle,var(--border))]">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenData(table.name);
                      }}
                      title={t('tableList.openData', 'Open Table Data')}
                      className="p-1 rounded transition-colors hover:bg-[var(--bg-toolbar)] text-[var(--text-muted)] hover:text-[var(--text)]"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenStructure(table.name);
                      }}
                      title={t('tableList.designStructure', 'Design Table Structure')}
                      className="p-1 rounded transition-colors hover:bg-[var(--bg-toolbar)] text-[var(--text-muted)] hover:text-[var(--text)]"
                    >
                      <Wrench className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTriggerDuplicate(table.name);
                      }}
                      title={t('tableList.duplicateTable', 'Duplicate Table...')}
                      className="p-1 rounded transition-colors hover:bg-[var(--bg-toolbar)] text-[var(--text-muted)] hover:text-[var(--text)]"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTriggerRenameTable(table.name);
                      }}
                      title={t('sidebar.contextMenu.renameTable', 'Rename Table...')}
                      className="p-1 rounded transition-colors hover:bg-[var(--bg-toolbar)] text-[var(--text-muted)] hover:text-[var(--text)]"
                    >
                      <Pencil className="w-3 h-3 text-blue-500" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTriggerMaintenance(table.name);
                      }}
                      title={t('tableList.maintenance', 'Table Maintenance & Diagnostics...')}
                      className="p-1 rounded transition-colors hover:bg-[var(--bg-toolbar)] text-[var(--text-muted)] hover:text-[var(--text)]"
                    >
                      <Wrench className="w-3.5 h-3.5 text-emerald-500" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : viewMode === 'grouped' ? (
          <div
            data-testid="table-list-grouped-view"
            className="p-4 columns-1 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-3"
          >
            {groupedTables.map((group, idx) => {
              const paletteList = theme === 'light' ? GROUP_BOARD_PALETTES.light : GROUP_BOARD_PALETTES.dark;
              const palette = paletteList[idx % paletteList.length];
              return (
                <div
                  key={group.key}
                  data-testid={`board-group-${group.key}`}
                  className={`break-inside-avoid mb-3 rounded-lg border p-3 ${palette.card}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className={`font-sans text-xs font-bold tracking-tight truncate ${palette.header}`}>
                      {group.isOther ? t('tableList.otherGroup', 'Other / Ungrouped') : group.label}
                    </span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${palette.badge}`}>
                      {group.tables.length}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    {group.tables.map((table) => {
                      const isSelected = selectedTables.includes(table.name);
                      return (
                        <div
                          key={table.name}
                          data-testid={`board-item-${table.name}`}
                          aria-selected={isSelected}
                          onClick={(e) => handleRowClick(table.name, e)}
                          onDoubleClick={() => handleOpenData(table.name)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!selectedTables.includes(table.name)) {
                              setSelectedTables([table.name]);
                              setAnchorTable(table.name);
                            }
                            setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, table });
                          }}
                          className={`flex items-center justify-between gap-2 px-1.5 py-1 rounded text-xs cursor-pointer transition-colors group ${
                            isSelected
                              ? 'bg-[var(--accent)] text-white'
                              : `${palette.itemHover} text-[var(--text)]`
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            {renderTableIcon(table.name, isSelected)}
                            <span className="font-mono text-[11px] truncate" title={table.name}>
                              {table.name}
                            </span>
                          </div>
                          <span
                            className={`text-[10px] font-mono shrink-0 ${
                              isSelected ? 'text-blue-100' : 'opacity-60'
                            }`}
                          >
                            {formatApproxRows(table.approxRowCount)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : viewMode === 'storage' ? (
          <div data-testid="table-list-storage-view" className="p-4 space-y-4">
            {/* KPI Summary Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3 bg-[var(--bg-card)] border-[var(--border)]">
                <div className="text-[11px] text-[var(--text-muted)]">
                  {t('tableList.kpiTotalTables', 'Total Tables')}
                </div>
                <div className="text-base font-semibold font-mono mt-0.5 text-[var(--text)]">
                  {filteredAndSortedTables.length}
                </div>
              </div>

              <div className="rounded-lg border p-3 bg-[var(--bg-card)] border-[var(--border)]">
                <div className="text-[11px] text-[var(--text-muted)]">
                  {t('tableList.kpiTotalStorage', 'Total Storage')}
                </div>
                <div className="text-base font-semibold font-mono mt-0.5 text-[var(--text)]">
                  {formatBytes(storageSummary.totalStorageBytes)}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5">
                  {t('tableList.dataShort', 'Data')}: {formatBytes(storageSummary.totalDataBytes)} · {t('tableList.indexShort', 'Index')}: {formatBytes(storageSummary.totalIndexBytes)}
                </div>
              </div>

              <div className="rounded-lg border p-3 bg-[var(--bg-card)] border-[var(--border)]">
                <div className="text-[11px] text-[var(--text-muted)]">
                  {t('tableList.kpiLargestTable', 'Largest Table')}
                </div>
                <div
                  className="text-sm font-semibold font-mono truncate mt-0.5 text-[var(--text)]"
                  title={storageSummary.largestTable?.name}
                >
                  {storageSummary.largestTable ? storageSummary.largestTable.name : '-'}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5">
                  {storageSummary.largestTable ? formatBytes(storageSummary.largestTable.totalSizeBytes) : '-'}
                </div>
              </div>

              <div className="rounded-lg border p-3 bg-[var(--bg-card)] border-[var(--border)]">
                <div className="text-[11px] text-[var(--text-muted)]">
                  {t('tableList.kpiHealthAlerts', 'Health Alerts')}
                </div>
                <div
                  className={`text-base font-semibold font-mono mt-0.5 flex items-center gap-1.5 ${
                    storageSummary.alertCount > 0 ? 'text-amber-500' : 'text-emerald-500'
                  }`}
                >
                  {storageSummary.alertCount > 0 ? (
                    <AlertTriangle className="w-4 h-4" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>{storageSummary.alertCount}</span>
                </div>
              </div>
            </div>

            {/* Storage & Health Breakdown Table */}
            <div className="rounded-lg border overflow-hidden border-[var(--border)]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="border-b bg-[var(--grid-header-bg,var(--bg-panel))] text-[var(--text-muted)] border-[var(--border)]">
                  <tr>
                    <th
                      onClick={() => handleSort('name')}
                      className="py-2 px-3 font-medium cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-1">
                        <span>{t('tableList.nameHeader', 'Name')}</span>
                        <ArrowUpDown className="w-3 h-3 text-[var(--text-muted)]" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('totalSizeBytes')}
                      className="py-2 px-3 font-medium cursor-pointer select-none text-right"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>{t('tableList.totalSizeHeader', 'Total Size')}</span>
                        <ArrowUpDown className="w-3 h-3 text-[var(--text-muted)]" />
                      </div>
                    </th>
                    <th className="py-2 px-3 font-medium w-48">
                      {t('tableList.storageDistribution', 'Data / Index Split')}
                    </th>
                    <th
                      onClick={() => handleSort('approxRowCount')}
                      className="py-2 px-3 font-medium cursor-pointer select-none text-right"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>{t('tableList.approxRowsHeader', 'Approx Rows')}</span>
                        <ArrowUpDown className="w-3 h-3 text-[var(--text-muted)]" />
                      </div>
                    </th>
                    <th className="py-2 px-3 font-medium">{t('tableList.healthStatus', 'Health')}</th>
                    <th className="py-2 px-3 font-medium text-right">{t('tableList.actionsHeader', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle,var(--border))]">
                  {filteredAndSortedTables.map((table) => {
                    const isSelected = selectedTables.includes(table.name);
                    const total = table.totalSizeBytes || 0;
                    const dataPct = total > 0 ? Math.min(100, Math.round(((table.dataSizeBytes || 0) / total) * 100)) : 0;
                    const indexPct = total > 0 ? Math.max(0, 100 - dataPct) : 0;
                    const health = getTableHealthStatus(table);
                    return (
                      <tr
                        key={table.name}
                        aria-selected={isSelected}
                        onClick={(e) => handleRowClick(table.name, e)}
                        onDoubleClick={() => handleOpenData(table.name)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!selectedTables.includes(table.name)) {
                            setSelectedTables([table.name]);
                            setAnchorTable(table.name);
                          }
                          setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, table });
                        }}
                        className={`transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[var(--sel)]'
                            : 'hover:bg-[var(--row-alt)]'
                        }`}
                      >
                        <td className="py-2 px-3 font-mono text-[var(--text)] font-medium">
                          <div className="flex items-center gap-2">
                            {renderTableIcon(table.name)}
                            <span className="truncate max-w-[180px]" title={table.name}>
                              {table.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-[var(--text-muted)]">
                          {formatBytes(total)}
                        </td>
                        <td className="py-2 px-3">
                          <div
                            className="w-full h-2 rounded-full overflow-hidden flex bg-[var(--bg-toolbar)]"
                            title={`${t('tableList.dataShort', 'Data')}: ${formatBytes(table.dataSizeBytes)} (${dataPct}%) · ${t('tableList.indexShort', 'Index')}: ${formatBytes(table.indexSizeBytes)} (${indexPct}%)`}
                          >
                            {total > 0 && (
                              <>
                                <div className="bg-blue-500 h-full" style={{ width: `${dataPct}%` }} />
                                <div className="bg-purple-500 h-full" style={{ width: `${indexPct}%` }} />
                              </>
                            )}
                          </div>
                          <div className="flex justify-between text-[10px] text-[var(--text-muted)] font-mono mt-0.5">
                            <span>{formatBytes(table.dataSizeBytes)}</span>
                            <span>{formatBytes(table.indexSizeBytes)}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-[var(--text-muted)]">
                          {formatApproxRows(table.approxRowCount)}
                        </td>
                        <td className="py-2 px-3">
                          {health === 'needs_analyze' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-500">
                              <AlertTriangle className="w-3 h-3" />
                              {t('tableList.healthNeedsAnalyze', 'Needs ANALYZE')}
                            </span>
                          ) : health === 'index_heavy' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/15 text-purple-400">
                              <AlertTriangle className="w-3 h-3" />
                              {t('tableList.healthIndexHeavy', 'Index > Data')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-500">
                              <CheckCircle2 className="w-3 h-3" />
                              {t('tableList.healthOk', 'Healthy')}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTriggerMaintenance(table.name);
                              }}
                              title={t('tableList.maintenance', 'Table Maintenance & Diagnostics...')}
                              className="p-1 rounded transition-colors hover:bg-[var(--bg-toolbar)] text-[var(--text-muted)] hover:text-[var(--text)]"
                            >
                              <Wrench className="w-3.5 h-3.5 text-emerald-500" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenData(table.name);
                              }}
                              title={t('tableList.openData', 'Open Table Data')}
                              className="p-1 rounded transition-colors hover:bg-[var(--bg-toolbar)] text-[var(--text-muted)] hover:text-[var(--text)]"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : groupInList ? (
          <div data-testid="table-list-grouped-list" className="p-3 space-y-2">
            {groupedTables.map((group) => {
              const isCollapsed = !!collapsedGroups[group.key];
              return (
                <div
                  key={group.key}
                  className="rounded-lg border overflow-hidden border-[var(--border)] bg-[var(--bg-grid)]"
                >
                  <button
                    type="button"
                    data-testid={`prefix-group-${group.key}`}
                    onClick={() => toggleGroupCollapsed(group.key)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs transition-colors bg-[var(--bg-panel)] hover:bg-[var(--row-alt)] text-[var(--text)]"
                  >
                    <div className="flex items-center gap-2">
                      {isCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                      )}
                      <FolderTree className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span className="font-mono font-semibold">
                        {group.isOther ? t('tableList.otherGroup', 'Other / Ungrouped') : group.label}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-toolbar)] text-[var(--text-muted)]">
                        {group.tables.length === 1
                          ? t('tableList.tableCount', { count: 1 })
                          : t('tableList.tableCount_plural', { count: group.tables.length })}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-mono text-[var(--text-muted)]">
                      <span>{formatApproxRows(group.totalRows)}</span>
                      <span>{formatBytes(group.totalSizeBytes)}</span>
                    </div>
                  </button>

                  {!isCollapsed && (
                    <div className="divide-y divide-[var(--border-subtle,var(--border))]">
                      {group.tables.map((table) => {
                        const isSelected = selectedTables.includes(table.name);
                        return (
                          <div
                            key={table.name}
                            aria-selected={isSelected}
                            onClick={(e) => handleRowClick(table.name, e)}
                            onDoubleClick={() => handleOpenData(table.name)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!selectedTables.includes(table.name)) {
                                setSelectedTables([table.name]);
                                setAnchorTable(table.name);
                              }
                              setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, table });
                            }}
                            className={`flex items-center justify-between px-4 py-1.5 text-xs cursor-pointer transition-colors group ${
                              isSelected
                                ? 'bg-[var(--sel)]'
                                : 'bg-[var(--bg-grid)] hover:bg-[var(--row-alt)]'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {renderTableIcon(table.name)}
                              <span
                                className="font-mono truncate text-[var(--text)] font-medium"
                                title={table.name}
                              >
                                {table.name}
                              </span>
                              {table.engine && (
                                <span className="text-[10px] text-[var(--text-muted)] hidden sm:inline">
                                  {table.engine}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-4 shrink-0">
                              <span className="font-mono text-[11px] w-16 text-right text-[var(--text-muted)]">
                                {formatApproxRows(table.approxRowCount)}
                              </span>
                              <span className="font-mono text-[11px] w-16 text-right text-[var(--text-muted)]">
                                {formatBytes(table.totalSizeBytes)}
                              </span>
                              <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenData(table.name);
                                  }}
                                  title={t('tableList.openData', 'Open Table Data')}
                                  className="p-1 rounded transition-colors hover:bg-[var(--bg-toolbar)] text-[var(--text-muted)] hover:text-[var(--text)]"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenStructure(table.name);
                                  }}
                                  title={t('tableList.designStructure', 'Design Table Structure')}
                                  className="p-1 rounded transition-colors hover:bg-[var(--bg-toolbar)] text-[var(--text-muted)] hover:text-[var(--text)]"
                                >
                                  <Wrench className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleTriggerMaintenance(table.name);
                                  }}
                                  title={t('tableList.maintenance', 'Table Maintenance & Diagnostics...')}
                                  className="p-1 rounded transition-colors hover:bg-[var(--bg-toolbar)] text-[var(--text-muted)] hover:text-[var(--text)]"
                                >
                                  <Wrench className="w-3.5 h-3.5 text-emerald-500" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-10 border-b transition-colors bg-[var(--grid-header-bg,var(--bg-panel))] text-[var(--text-muted)] border-[var(--border)]">
              <tr>
                <th
                  onClick={() => handleSort('name')}
                  className="py-2 px-3 font-medium cursor-pointer hover:text-[var(--text)] select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>{t('tableList.nameHeader', 'Name')}</span>
                    <ArrowUpDown className="w-3 h-3 text-[var(--text-muted)]" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('approxRowCount')}
                  className="py-2 px-3 font-medium cursor-pointer hover:text-[var(--text)] select-none text-right"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>{t('tableList.approxRowsHeader', 'Approx Rows')}</span>
                    <ArrowUpDown className="w-3 h-3 text-[var(--text-muted)]" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('totalSizeBytes')}
                  className="py-2 px-3 font-medium cursor-pointer hover:text-[var(--text)] select-none text-right"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>{t('tableList.totalSizeHeader', 'Total Size')}</span>
                    <ArrowUpDown className="w-3 h-3 text-[var(--text-muted)]" />
                  </div>
                </th>
                <th className="py-2 px-3 font-medium text-right">{t('tableList.dataSizeHeader', 'Data Size')}</th>
                <th className="py-2 px-3 font-medium text-right">{t('tableList.indexSizeHeader', 'Index Size')}</th>
                <th
                  onClick={() => handleSort('engine')}
                  className="py-2 px-3 font-medium cursor-pointer hover:text-[var(--text)] select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>{t('tableList.engine', 'Engine')}</span>
                    <ArrowUpDown className="w-3 h-3 text-[var(--text-muted)]" />
                  </div>
                </th>
                <th className="py-2 px-3 font-medium">{t('tableList.collation', 'Collation')}</th>
                <th className="py-2 px-3 font-medium text-right">{t('tableList.actionsHeader', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle,var(--border))]">
              {filteredAndSortedTables.map((table) => {
                const isSelected = selectedTables.includes(table.name);
                return (
                <tr
                  key={table.name}
                  aria-selected={isSelected}
                  onClick={(e) => handleRowClick(table.name, e)}
                  onDoubleClick={() => handleOpenData(table.name)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!selectedTables.includes(table.name)) {
                      setSelectedTables([table.name]);
                      setAnchorTable(table.name);
                    }
                    setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, table });
                  }}
                  className={`transition-colors group cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--sel)]'
                      : 'hover:bg-[var(--row-alt)]'
                  }`}
                >
                  <td className="py-2 px-3 flex items-center gap-2 font-mono text-[var(--text)] font-medium">
                    {renderTableIcon(table.name)}
                    <span className="truncate max-w-[200px]" title={table.name}>
                      {table.name}
                    </span>
                  </td>
                  <td
                    className="py-2 px-3 text-right font-mono text-[var(--text-muted)]"
                    title="Approximate row count from database catalog"
                  >
                    {formatApproxRows(table.approxRowCount)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-[var(--text-muted)]">
                    {formatBytes(table.totalSizeBytes)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-[var(--text-muted)]">
                    {formatBytes(table.dataSizeBytes)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-[var(--text-muted)]">
                    {formatBytes(table.indexSizeBytes)}
                  </td>
                  <td className="py-2 px-3 text-[var(--text-muted)]">
                    {table.engine || '-'}
                  </td>
                  <td className="py-2 px-3 truncate max-w-[120px] text-[var(--text-muted)]" title={table.collation}>
                    {table.collation || '-'}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenData(table.name);
                        }}
                        title={t('tableList.openData', 'Open Table Data')}
                        className="p-1 rounded transition-colors hover:bg-[var(--bg-toolbar)] text-[var(--text-muted)] hover:text-[var(--text)]"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenStructure(table.name);
                        }}
                        title={t('tableList.designStructure', 'Design Table Structure')}
                        className="p-1 rounded transition-colors hover:bg-[var(--bg-toolbar)] text-[var(--text-muted)] hover:text-[var(--text)]"
                      >
                        <Wrench className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTriggerDuplicate(table.name);
                        }}
                        title={t('tableList.duplicateTable', 'Duplicate Table...')}
                        className="p-1 rounded transition-colors hover:bg-[var(--bg-toolbar)] text-[var(--text-muted)] hover:text-[var(--text)]"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTriggerRenameTable(table.name);
                        }}
                        title={t('sidebar.contextMenu.renameTable', 'Rename Table...')}
                        className="p-1 rounded transition-colors hover:bg-[var(--bg-toolbar)] text-[var(--text-muted)] hover:text-[var(--text)]"
                      >
                        <Pencil className="w-3 h-3 text-blue-500" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTriggerMaintenance(table.name);
                        }}
                        title={t('tableList.maintenance', 'Table Maintenance & Diagnostics...')}
                        className="p-1 rounded transition-colors hover:bg-[var(--bg-toolbar)] text-[var(--text-muted)] hover:text-[var(--text)]"
                      >
                        <Wrench className="w-3.5 h-3.5 text-emerald-500" />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Table Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          role="menu"
          data-testid="table-list-context-menu"
          className="fixed z-50 rounded-md shadow-2xl py-1 text-xs min-w-[190px] max-h-[calc(100vh-16px)] overflow-y-auto select-none border bg-[var(--bg-panel)] border-[var(--border)] text-[var(--text)]"
          style={{ top: menuPosition.top, left: menuPosition.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-[11px] font-mono border-b flex items-center gap-1.5 truncate text-[var(--text-muted)] border-[var(--border-subtle,var(--border))]">
            <TableIcon className="w-3 h-3 text-[var(--accent)] shrink-0" />
            <span className="truncate font-semibold text-[var(--text)]">
              {!contextMenu.table
                ? schemaName
                  ? `${schemaName} Tables`
                  : 'Tables'
                : selectedTables.length > 1
                ? t('tableList.selectedCount', '{{count}} selected', { count: selectedTables.length })
                : contextMenu.table.name}
            </span>
          </div>

          {!contextMenu.table ? (
            <button
              type="button"
              data-testid="ctx-refresh-tables"
              className="w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors hover:bg-[var(--row-alt)] text-[var(--text)]"
              onClick={() => {
                setContextMenu(null);
                fetchTables();
              }}
            >
              <RefreshCw className="w-3.5 h-3.5 text-emerald-500" />
              <span>{t('tableList.refreshContextMenu', 'Refresh Tables')}</span>
            </button>
          ) : selectedTables.length > 1 ? (
            <>
              <button
                type="button"
                data-testid="ctx-open-selected-tables"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors hover:bg-[var(--row-alt)] text-[var(--text)]"
                onClick={() => handleOpenSelectedTables(selectedTables)}
              >
                <TableIcon className="w-3.5 h-3.5 text-emerald-500" />
                <span>{t('tableList.openSelectedTables', 'Open {{count}} Selected Tables', { count: selectedTables.length })}</span>
              </button>
              <button
                type="button"
                data-testid="ctx-design-selected-tables"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors hover:bg-[var(--row-alt)] text-[var(--text)]"
                onClick={() => handleEditSelectedStructures(selectedTables)}
              >
                <Wrench className="w-3.5 h-3.5 text-amber-500" />
                <span>{t('tableList.editSelectedStructures', 'Edit Structure ({{count}} Tables)', { count: selectedTables.length })}</span>
              </button>
              <button
                type="button"
                data-testid="ctx-export-selected-sql"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors hover:bg-[var(--row-alt)] text-[var(--text)]"
                onClick={() => handleTriggerExportSelectedSql(selectedTables)}
              >
                <Download className="w-3.5 h-3.5 text-indigo-500" />
                <span>{t('tableList.exportSelectedSql', 'Export {{count}} Tables as SQL Dump...', { count: selectedTables.length })}</span>
              </button>
              <button
                type="button"
                data-testid="ctx-import-sql"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors hover:bg-[var(--row-alt)] text-[var(--text)]"
                onClick={() => handleTriggerImportSql(contextMenu.table!.name)}
              >
                <Upload className="w-3.5 h-3.5 text-emerald-500" />
                <span>{t('sidebar.contextMenu.runSqlScript', 'Run SQL Script...')}</span>
              </button>
              <button
                type="button"
                data-testid="ctx-query-selected-tables"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors hover:bg-[var(--row-alt)] text-[var(--text)]"
                onClick={() => handleQuerySelectedTables(selectedTables)}
              >
                <FileCode className="w-3.5 h-3.5 text-blue-500" />
                <span>{t('tableList.querySelectedTables', 'Query {{count}} Selected Tables', { count: selectedTables.length })}</span>
              </button>
              <button
                type="button"
                data-testid="ctx-query-builder"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors font-medium hover:bg-[var(--row-alt)] text-[var(--warn)]"
                onClick={() => handleOpenQueryBuilder(contextMenu.table!.name)}
              >
                <Wand2 className="w-3.5 h-3.5 text-amber-500" />
                <span>{t('sidebar.contextMenu.visualQueryBuilder', 'Visual Query Builder')}</span>
              </button>
              <button
                type="button"
                data-testid="ctx-view-selected-ddl"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors hover:bg-[var(--row-alt)] text-[var(--text)]"
                onClick={() => handleViewSelectedDdl(selectedTables)}
              >
                <FileCode className="w-3.5 h-3.5 text-blue-500" />
                <span>{t('tableList.viewSelectedDdl', 'View DDL / Source ({{count}} Tables)', { count: selectedTables.length })}</span>
              </button>
              <button
                type="button"
                data-testid="ctx-copy-selected-names"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors hover:bg-[var(--row-alt)] text-[var(--text)]"
                onClick={() => handleCopySelectedNames(selectedTables)}
              >
                <Copy className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span>{t('tableList.copySelectedNames', 'Copy {{count}} Table Names', { count: selectedTables.length })}</span>
              </button>
              <div className="border-t my-1 border-[var(--border-subtle,var(--border))]" />
              <button
                type="button"
                data-testid="ctx-refresh-tables"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors hover:bg-[var(--row-alt)] text-[var(--text)]"
                onClick={() => {
                  setContextMenu(null);
                  fetchTables();
                }}
              >
                <RefreshCw className="w-3.5 h-3.5 text-emerald-500" />
                <span>{t('tableList.refreshContextMenu', 'Refresh Tables')}</span>
              </button>
              <div className="border-t my-1 border-[var(--border-subtle,var(--border))]" />
              <button
                type="button"
                data-testid="ctx-drop-selected-tables"
                className={`w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors ${
                  theme === 'light' ? 'hover:bg-red-50 text-red-600' : 'hover:bg-red-950/40 text-red-400'
                }`}
                onClick={() => handleTriggerDropSelectedTables(selectedTables)}
              >
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                <span>{t('tableList.dropSelectedTables', 'Drop {{count}} Selected Tables', { count: selectedTables.length })}</span>
              </button>
            </>
          ) : (
            <>
          <button
            type="button"
            data-testid="ctx-open-table"
            className="w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors hover:bg-[var(--row-alt)] text-[var(--text)]"
            onClick={() => {
              handleOpenData(contextMenu.table!.name);
              setContextMenu(null);
            }}
          >
            <TableIcon className="w-3.5 h-3.5 text-emerald-500" />
            <span>{t('sidebar.contextMenu.openTable', 'Open Table')}</span>
          </button>

          <button
            type="button"
            data-testid="ctx-design-table"
            className="w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors hover:bg-[var(--row-alt)] text-[var(--text)]"
            onClick={() => {
              handleOpenStructure(contextMenu.table!.name);
              setContextMenu(null);
            }}
          >
            <Wrench className="w-3.5 h-3.5 text-amber-500" />
            <span>{t('sidebar.contextMenu.editStructure', 'Edit Structure')}</span>
          </button>

          <button
            type="button"
            data-testid="ctx-import-data"
            className="w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors hover:bg-[var(--row-alt)] text-[var(--text)]"
            onClick={() => handleTriggerImportData(contextMenu.table!.name)}
          >
            <Upload className="w-3.5 h-3.5 text-emerald-500" />
            <span>{t('sidebar.contextMenu.importData', 'Import Data...')}</span>
          </button>

          <button
            type="button"
            data-testid="ctx-export-data"
            className="w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors hover:bg-[var(--row-alt)] text-[var(--text)]"
            onClick={() => handleTriggerExportData(contextMenu.table!.name)}
          >
            <Download className="w-3.5 h-3.5 text-blue-500" />
            <span>{t('sidebar.contextMenu.exportTableData', 'Export Table Data...')}</span>
          </button>

          <button
            type="button"
            data-testid="ctx-duplicate-table"
            className="w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors hover:bg-[var(--row-alt)] text-[var(--text)]"
            onClick={() => handleTriggerDuplicate(contextMenu.table!.name)}
          >
            <Copy className="w-3.5 h-3.5 text-purple-500" />
            <span>{t('sidebar.contextMenu.duplicateTable', 'Duplicate Table...')}</span>
          </button>

          <button
            type="button"
            data-testid="ctx-copy-to-db"
            className="w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors hover:bg-[var(--row-alt)] text-[var(--text)]"
            onClick={() => handleTriggerCopyTableToDb(contextMenu.table!.name)}
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-blue-500" />
            <span>{t('sidebar.contextMenu.copyTableCrossDb', 'Copy Table to Database...')}</span>
          </button>

          <button
            type="button"
            data-testid="ctx-export-sql"
            className="w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors hover:bg-[var(--row-alt)] text-[var(--text)]"
            onClick={() => handleTriggerExportSql(contextMenu.table!.name)}
          >
            <Download className="w-3.5 h-3.5 text-indigo-500" />
            <span>{t('sidebar.contextMenu.exportSqlDump', 'Export as SQL Dump...')}</span>
          </button>

          <button
            type="button"
            data-testid="ctx-import-sql"
            className="w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors hover:bg-[var(--row-alt)] text-[var(--text)]"
            onClick={() => handleTriggerImportSql(contextMenu.table!.name)}
          >
            <Upload className="w-3.5 h-3.5 text-emerald-500" />
            <span>{t('sidebar.contextMenu.runSqlScript', 'Run SQL Script...')}</span>
          </button>

          <button
            type="button"
            data-testid="ctx-query-table"
            className="w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors hover:bg-[var(--row-alt)] text-[var(--text)]"
            onClick={() => handleQueryTable(contextMenu.table!.name)}
          >
            <FileCode className="w-3.5 h-3.5 text-blue-500" />
            <span>{t('sidebar.contextMenu.queryTable', 'Query Table')}</span>
          </button>

          <button
            type="button"
            data-testid="ctx-query-builder"
            className="w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors font-medium hover:bg-[var(--row-alt)] text-[var(--warn)]"
            onClick={() => handleOpenQueryBuilder(contextMenu.table!.name)}
          >
            <Wand2 className="w-3.5 h-3.5 text-amber-500" />
            <span>{t('sidebar.contextMenu.visualQueryBuilder', 'Visual Query Builder')}</span>
          </button>

          <button
            type="button"
            data-testid="ctx-view-ddl"
            className="w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors hover:bg-[var(--row-alt)] text-[var(--text)]"
            onClick={() => handleViewObjectDdl(contextMenu.table!.name)}
          >
            <FileCode className="w-3.5 h-3.5 text-blue-500" />
            <span>{t('sidebar.contextMenu.viewObjectDdl', 'View DDL / Source')}</span>
          </button>

          <button
            type="button"
            data-testid="ctx-copy-name"
            className="w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors hover:bg-[var(--row-alt)] text-[var(--text)]"
            onClick={() => handleCopyName(contextMenu.table!.name)}
          >
            <Copy className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span>{t('sidebar.contextMenu.copyName', 'Copy Name')}</span>
          </button>

          <div className="border-t my-1 border-[var(--border-subtle,var(--border))]" />

          <button
            type="button"
            data-testid="ctx-rename-table"
            className="w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors hover:bg-[var(--row-alt)] text-[var(--text)]"
            onClick={() => handleTriggerRenameTable(contextMenu.table!.name)}
          >
            <Pencil className="w-3.5 h-3.5 text-blue-500" />
            <span>{t('sidebar.contextMenu.renameTable', 'Rename Table...')}</span>
          </button>

          <button
            type="button"
            data-testid="ctx-maintenance-table"
            className="w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors hover:bg-[var(--row-alt)] text-[var(--text)]"
            onClick={() => handleTriggerMaintenance(contextMenu.table!.name)}
          >
            <Wrench className="w-3.5 h-3.5 text-emerald-500" />
            <span>{t('sidebar.contextMenu.maintenanceTable', 'Maintenance & Diagnostics...')}</span>
          </button>

          <button
            type="button"
            data-testid="ctx-refresh-tables"
            className="w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors hover:bg-[var(--row-alt)] text-[var(--text)]"
            onClick={() => {
              setContextMenu(null);
              fetchTables();
            }}
          >
            <RefreshCw className="w-3.5 h-3.5 text-emerald-500" />
            <span>{t('tableList.refreshContextMenu', 'Refresh Tables')}</span>
          </button>

          <div className="border-t my-1 border-[var(--border-subtle,var(--border))]" />

          <button
            type="button"
            data-testid="ctx-drop-table"
            className={`w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors ${
              theme === 'light' ? 'hover:bg-red-50 text-red-600' : 'hover:bg-red-950/40 text-red-400'
            }`}
            onClick={() => handleTriggerDropTable(contextMenu.table!.name)}
          >
            <Trash2 className="w-3.5 h-3.5 text-red-500" />
            <span>{t('sidebar.contextMenu.dropTable', 'Drop Table')}</span>
          </button>
            </>
          )}
        </div>
      )}

      {/* Internal Modals */}
      {activeDuplicateTable && (
        <DuplicateTableModal
          isOpen={true}
          connectionId={connectionId}
          sourceTableName={activeDuplicateTable}
          schemaName={schemaName}
          onClose={() => setActiveDuplicateTable(null)}
          onSuccess={() => {
            fetchTables();
          }}
        />
      )}

      {activeCopyTableToDb && (
        <CrossDbCopyModal
          isOpen={true}
          sourceConnectionId={connectionId}
          sourceTableName={activeCopyTableToDb}
          sourceSchemaName={schemaName}
          onClose={() => setActiveCopyTableToDb(null)}
          onSuccess={() => {
            fetchTables();
          }}
        />
      )}

      {activeExportSqlTarget && (
        <ExportSqlModal
          isOpen={true}
          connectionId={connectionId}
          tableName={activeExportSqlTarget.tableName}
          tableNames={activeExportSqlTarget.tableNames}
          schemaName={schemaName}
          onClose={() => setActiveExportSqlTarget(null)}
        />
      )}

      {activeExportDataTable && (
        <ExportModal
          isOpen={true}
          tableName={activeExportDataTable}
          connectionId={connectionId}
          onClose={() => setActiveExportDataTable(null)}
        />
      )}

      {activeImportSqlTable && (
        <ImportSqlModal
          isOpen={true}
          connectionId={connectionId}
          schemaName={schemaName}
          onClose={() => setActiveImportSqlTable(null)}
          onSuccess={() => {
            fetchTables();
          }}
        />
      )}

      {activeImportDataTarget && (
        <ImportModal
          isOpen={true}
          connectionId={connectionId}
          tableName={activeImportDataTarget.tableName}
          tableColumns={activeImportDataTarget.columns}
          onClose={() => setActiveImportDataTarget(null)}
          onImportSuccess={() => {
            fetchTables();
          }}
        />
      )}

      {activeRenameTable && (
        <RenameTableModal
          isOpen={true}
          tableName={activeRenameTable}
          schemaName={schemaName}
          connectionId={connectionId}
          driver={driver}
          onClose={() => setActiveRenameTable(null)}
          onSuccess={() => {
            fetchTables();
          }}
        />
      )}

      {activeMaintenanceTable && (
        <TableMaintenanceModal
          isOpen={true}
          tableName={activeMaintenanceTable}
          schemaName={schemaName}
          connectionId={connectionId}
          driver={driver}
          onClose={() => setActiveMaintenanceTable(null)}
          onSuccess={() => {
            fetchTables();
          }}
        />
      )}

      {activeDropTable && (
        <DropTableModal
          isOpen={true}
          tableName={activeDropTable}
          schemaName={schemaName}
          connectionId={connectionId}
          driver={driver}
          onClose={() => setActiveDropTable(null)}
          onSuccess={() => {
            fetchTables();
          }}
        />
      )}
    </div>
  );
};
