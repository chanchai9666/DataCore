import React, { useState, useEffect, useMemo } from 'react';
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
  Share2,
  FileSpreadsheet,
  Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { dbApi } from '../../api/db';
import type { TableMetadata } from '../../types/dataTransfer';
import { openTableTab } from '../sidebar/tabHelpers';
import { DuplicateTableModal } from '../transfer/DuplicateTableModal';
import { CrossDbCopyModal } from '../transfer/CrossDbCopyModal';
import { ExportSqlModal } from '../transfer/ExportSqlModal';
import { ExportModal } from '../transfer/ExportModal';
import { ImportModal } from '../transfer/ImportModal';
import { ImportSqlModal } from '../transfer/ImportSqlModal';
import { DropTableModal } from '../structure/DropTableModal';
import { RenameTableModal } from '../structure/RenameTableModal';
import { TableMaintenanceModal } from '../structure/TableMaintenanceModal';

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
  theme?: 'dark' | 'light';
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
  const isDark = propTheme
    ? propTheme === 'dark'
    : typeof document !== 'undefined'
    ? document.documentElement.classList.contains('dark')
    : true;
  const theme = isDark ? 'dark' : 'light';

  const [tables, setTables] = useState<TableMetadata[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    table: TableMetadata;
  } | null>(null);

  // Active modals state
  const [activeDuplicateTable, setActiveDuplicateTable] = useState<string | null>(null);
  const [activeCopyTableToDb, setActiveCopyTableToDb] = useState<string | null>(null);
  const [activeExportSqlTable, setActiveExportSqlTable] = useState<string | null>(null);
  const [activeExportDataTable, setActiveExportDataTable] = useState<string | null>(null);
  const [activeImportSqlTable, setActiveImportSqlTable] = useState<string | null>(null);
  const [activeImportDataTarget, setActiveImportDataTarget] = useState<{
    tableName: string;
    columns: { name: string; dataType: string }[];
  } | null>(null);
  const [activeRenameTable, setActiveRenameTable] = useState<string | null>(null);
  const [activeMaintenanceTable, setActiveMaintenanceTable] = useState<string | null>(null);
  const [activeDropTable, setActiveDropTable] = useState<string | null>(null);

  useEffect(() => {
    const handleOutsideClick = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('click', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

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
      setActiveExportSqlTable(tableName);
    }
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

  const handleCopyName = (name: string) => {
    navigator.clipboard.writeText(name);
    toast.success(`Copied table name "${name}" to clipboard`);
    setContextMenu(null);
  };

  const fetchTables = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await dbApi.getTableListMetadata(connectionId, schemaName);
      setTables(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTables();
  }, [connectionId, schemaName]);

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

  return (
    <div
      className={`flex flex-col h-full font-sans select-none ${
        theme === 'light' ? 'bg-white text-gray-800' : 'bg-[#1e1e1e] text-[#cccccc]'
      }`}
    >
      {/* Top Action & Search Bar */}
      <div className={`flex items-center justify-between px-4 py-2 border-b gap-4 transition-colors ${
        theme === 'light' ? 'bg-gray-50 border-gray-200' : 'bg-[#252526] border-[#333333]'
      }`}>
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-blue-500" />
          <span className={`font-semibold text-xs ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
            {schemaName ? `${schemaName} Tables` : 'Tables'}
          </span>
          <span className={`text-[11px] px-1.5 py-0.5 rounded ${
            theme === 'light' ? 'bg-gray-200 text-gray-700 font-medium' : 'bg-[#333333] text-gray-300'
          }`}>
            {filteredAndSortedTables.length} {filteredAndSortedTables.length === 1 ? 'table' : 'tables'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search tables..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`text-xs pl-8 pr-3 py-1 rounded border focus:outline-none focus:border-blue-500 w-52 transition-colors ${
                theme === 'light'
                  ? 'bg-white text-gray-900 border-gray-300 placeholder-gray-400'
                  : 'bg-[#1e1e1e] text-white border-[#3c3c3c] placeholder-gray-500'
              }`}
            />
          </div>

          <button
            onClick={fetchTables}
            disabled={loading}
            title="Refresh tables metadata"
            className={`p-1 rounded transition-colors disabled:opacity-50 ${
              theme === 'light'
                ? 'hover:bg-gray-200 text-gray-600 hover:text-gray-900'
                : 'hover:bg-[#333333] text-gray-300 hover:text-white'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto">
        {loading && tables.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-400 gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
            <span>Loading tables metadata...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <p className="text-xs text-red-400 mb-2">Failed to load tables: {error}</p>
            <button
              onClick={fetchTables}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded transition-colors"
            >
              Retry
            </button>
          </div>
        ) : filteredAndSortedTables.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-xs text-gray-400 p-4">
            <TableIcon className="w-8 h-8 text-gray-600 mb-2 stroke-1" />
            <p>{searchQuery ? 'No tables match your search.' : 'No tables found in this schema.'}</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead className={`sticky top-0 z-10 border-b transition-colors ${
              theme === 'light'
                ? 'bg-gray-100 text-gray-600 border-gray-200'
                : 'bg-[#252526] text-gray-400 border-[#333333]'
            }`}>
              <tr>
                <th
                  onClick={() => handleSort('name')}
                  className={`py-2 px-3 font-medium cursor-pointer ${theme === 'light' ? 'hover:text-gray-900' : 'hover:text-white'} select-none`}
                >
                  <div className="flex items-center gap-1">
                    <span>Name</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('approxRowCount')}
                  className={`py-2 px-3 font-medium cursor-pointer ${theme === 'light' ? 'hover:text-gray-900' : 'hover:text-white'} select-none text-right`}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Approx Rows</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('totalSizeBytes')}
                  className={`py-2 px-3 font-medium cursor-pointer ${theme === 'light' ? 'hover:text-gray-900' : 'hover:text-white'} select-none text-right`}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Total Size</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th className="py-2 px-3 font-medium text-right">Data Size</th>
                <th className="py-2 px-3 font-medium text-right">Index Size</th>
                <th
                  onClick={() => handleSort('engine')}
                  className={`py-2 px-3 font-medium cursor-pointer ${theme === 'light' ? 'hover:text-gray-900' : 'hover:text-white'} select-none`}
                >
                  <div className="flex items-center gap-1">
                    <span>Engine</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th className="py-2 px-3 font-medium">Collation</th>
                <th className="py-2 px-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${theme === 'light' ? 'divide-gray-100' : 'divide-[#2a2a2a]'}`}>
              {filteredAndSortedTables.map((table) => (
                <tr
                  key={table.name}
                  onDoubleClick={() => handleOpenData(table.name)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, table });
                  }}
                  className={`transition-colors group cursor-pointer ${
                    theme === 'light' ? 'hover:bg-gray-50' : 'hover:bg-[#2a2d2e]'
                  }`}
                >
                  <td className={`py-2 px-3 flex items-center gap-2 font-mono ${
                    theme === 'light' ? 'text-gray-900 font-medium' : 'text-white'
                  }`}>
                    <TableIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="truncate max-w-[200px]" title={table.name}>
                      {table.name}
                    </span>
                  </td>
                  <td
                    className={`py-2 px-3 text-right font-mono ${theme === 'light' ? 'text-gray-700' : 'text-gray-300'}`}
                    title="Approximate row count from database catalog"
                  >
                    {formatApproxRows(table.approxRowCount)}
                  </td>
                  <td className={`py-2 px-3 text-right font-mono ${theme === 'light' ? 'text-gray-700' : 'text-gray-300'}`}>
                    {formatBytes(table.totalSizeBytes)}
                  </td>
                  <td className={`py-2 px-3 text-right font-mono ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>
                    {formatBytes(table.dataSizeBytes)}
                  </td>
                  <td className={`py-2 px-3 text-right font-mono ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>
                    {formatBytes(table.indexSizeBytes)}
                  </td>
                  <td className={`py-2 px-3 ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
                    {table.engine || '-'}
                  </td>
                  <td className={`py-2 px-3 truncate max-w-[120px] ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`} title={table.collation}>
                    {table.collation || '-'}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenData(table.name);
                        }}
                        title="Open Table Data"
                        className={`p-1 rounded transition-colors ${
                          theme === 'light'
                            ? 'hover:bg-gray-200 text-gray-500 hover:text-gray-900'
                            : 'hover:bg-[#383838] text-gray-400 hover:text-white'
                        }`}
                      >
                        <ExternalLink className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenStructure(table.name);
                        }}
                        title="Design Table Structure"
                        className={`p-1 rounded transition-colors ${
                          theme === 'light'
                            ? 'hover:bg-gray-200 text-gray-500 hover:text-gray-900'
                            : 'hover:bg-[#383838] text-gray-400 hover:text-white'
                        }`}
                      >
                        <Wrench className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTriggerDuplicate(table.name);
                        }}
                        title="Duplicate Table"
                        className={`p-1 rounded transition-colors ${
                          theme === 'light'
                            ? 'hover:bg-gray-200 text-gray-500 hover:text-gray-900'
                            : 'hover:bg-[#383838] text-gray-400 hover:text-white'
                        }`}
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTriggerRenameTable(table.name);
                        }}
                        title="Rename Table"
                        className={`p-1 rounded transition-colors ${
                          theme === 'light'
                            ? 'hover:bg-gray-200 text-gray-500 hover:text-gray-900'
                            : 'hover:bg-[#383838] text-gray-400 hover:text-white'
                        }`}
                      >
                        <Pencil className="w-3 h-3 text-blue-500" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTriggerMaintenance(table.name);
                        }}
                        title="Table Maintenance & Diagnostics"
                        className={`p-1 rounded transition-colors ${
                          theme === 'light'
                            ? 'hover:bg-gray-200 text-gray-500 hover:text-gray-900'
                            : 'hover:bg-[#383838] text-gray-400 hover:text-white'
                        }`}
                      >
                        <Wrench className="w-3.5 h-3.5 text-emerald-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Table Context Menu */}
      {contextMenu && (
        <div
          role="menu"
          data-testid="table-list-context-menu"
          className={`fixed z-50 rounded-md shadow-2xl py-1 text-xs min-w-[190px] select-none animate-in fade-in duration-100 border ${
            theme === 'light'
              ? 'bg-white border-gray-200 text-gray-800'
              : 'bg-[#1e1e1e] border-[#333333] text-gray-200'
          }`}
          style={{ top: contextMenu.mouseY, left: contextMenu.mouseX }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`px-3 py-1.5 text-[11px] font-mono border-b flex items-center gap-1.5 truncate ${
            theme === 'light' ? 'text-gray-500 border-gray-100' : 'text-gray-400 border-[#2d2d2d]'
          }`}>
            <TableIcon className="w-3 h-3 text-blue-500 shrink-0" />
            <span className={`truncate font-semibold ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
              {contextMenu.table.name}
            </span>
          </div>

          <button
            type="button"
            data-testid="ctx-open-table"
            className={`w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors ${
              theme === 'light' ? 'hover:bg-gray-100 text-gray-700' : 'hover:bg-[#2d2d2d] text-gray-200'
            }`}
            onClick={() => {
              handleOpenData(contextMenu.table.name);
              setContextMenu(null);
            }}
          >
            <ExternalLink className="w-3.5 h-3.5 text-blue-500" />
            <span>Open Table Data</span>
          </button>

          <button
            type="button"
            data-testid="ctx-design-table"
            className={`w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors ${
              theme === 'light' ? 'hover:bg-gray-100 text-gray-700' : 'hover:bg-[#2d2d2d] text-gray-200'
            }`}
            onClick={() => {
              handleOpenStructure(contextMenu.table.name);
              setContextMenu(null);
            }}
          >
            <Wrench className="w-3.5 h-3.5 text-amber-500" />
            <span>Design Table Structure</span>
          </button>

          <div className={`border-t my-1 ${theme === 'light' ? 'border-gray-100' : 'border-[#2d2d2d]'}`} />

          <button
            type="button"
            data-testid="ctx-duplicate-table"
            className={`w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors ${
              theme === 'light' ? 'hover:bg-gray-100 text-gray-700' : 'hover:bg-[#2d2d2d] text-gray-200'
            }`}
            onClick={() => handleTriggerDuplicate(contextMenu.table.name)}
          >
            <Copy className="w-3.5 h-3.5 text-purple-500" />
            <span>Duplicate Table...</span>
          </button>

          <button
            type="button"
            data-testid="ctx-copy-to-db"
            className={`w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors ${
              theme === 'light' ? 'hover:bg-gray-100 text-gray-700' : 'hover:bg-[#2d2d2d] text-gray-200'
            }`}
            onClick={() => handleTriggerCopyTableToDb(contextMenu.table.name)}
          >
            <Share2 className="w-3.5 h-3.5 text-indigo-500" />
            <span>Copy Table to Database...</span>
          </button>

          <div className={`border-t my-1 ${theme === 'light' ? 'border-gray-100' : 'border-[#2d2d2d]'}`} />

          <button
            type="button"
            data-testid="ctx-export-sql"
            className={`w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors ${
              theme === 'light' ? 'hover:bg-gray-100 text-gray-700' : 'hover:bg-[#2d2d2d] text-gray-200'
            }`}
            onClick={() => handleTriggerExportSql(contextMenu.table.name)}
          >
            <Download className="w-3.5 h-3.5 text-blue-500" />
            <span>Export as SQL Dump...</span>
          </button>

          <button
            type="button"
            data-testid="ctx-export-data"
            className={`w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors ${
              theme === 'light' ? 'hover:bg-gray-100 text-gray-700' : 'hover:bg-[#2d2d2d] text-gray-200'
            }`}
            onClick={() => handleTriggerExportData(contextMenu.table.name)}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
            <span>Export Table Data...</span>
          </button>

          <button
            type="button"
            data-testid="ctx-import-sql"
            className={`w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors ${
              theme === 'light' ? 'hover:bg-gray-100 text-gray-700' : 'hover:bg-[#2d2d2d] text-gray-200'
            }`}
            onClick={() => handleTriggerImportSql(contextMenu.table.name)}
          >
            <FileCode className="w-3.5 h-3.5 text-blue-500" />
            <span>Import as SQL Dump...</span>
          </button>

          <button
            type="button"
            data-testid="ctx-import-data"
            className={`w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors ${
              theme === 'light' ? 'hover:bg-gray-100 text-gray-700' : 'hover:bg-[#2d2d2d] text-gray-200'
            }`}
            onClick={() => handleTriggerImportData(contextMenu.table.name)}
          >
            <Upload className="w-3.5 h-3.5 text-emerald-500" />
            <span>Import Table Data...</span>
          </button>

          <button
            type="button"
            data-testid="ctx-copy-name"
            className={`w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors ${
              theme === 'light' ? 'hover:bg-gray-100 text-gray-700' : 'hover:bg-[#2d2d2d] text-gray-200'
            }`}
            onClick={() => handleCopyName(contextMenu.table.name)}
          >
            <Copy className="w-3.5 h-3.5 text-gray-400" />
            <span>Copy Table Name</span>
          </button>

          <button
            type="button"
            data-testid="ctx-rename-table"
            className={`w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors ${
              theme === 'light' ? 'hover:bg-gray-100 text-gray-700' : 'hover:bg-[#2d2d2d] text-gray-200'
            }`}
            onClick={() => handleTriggerRenameTable(contextMenu.table.name)}
          >
            <Pencil className="w-3.5 h-3.5 text-blue-500" />
            <span>Rename Table...</span>
          </button>

          <button
            type="button"
            data-testid="ctx-maintenance-table"
            className={`w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors ${
              theme === 'light' ? 'hover:bg-gray-100 text-gray-700' : 'hover:bg-[#2d2d2d] text-gray-200'
            }`}
            onClick={() => handleTriggerMaintenance(contextMenu.table.name)}
          >
            <Wrench className="w-3.5 h-3.5 text-emerald-500" />
            <span>Table Maintenance...</span>
          </button>

          <div className={`border-t my-1 ${theme === 'light' ? 'border-gray-100' : 'border-[#2d2d2d]'}`} />

          <button
            type="button"
            data-testid="ctx-drop-table"
            className={`w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors ${
              theme === 'light' ? 'hover:bg-red-50 text-red-600' : 'hover:bg-red-950/40 text-red-400'
            }`}
            onClick={() => handleTriggerDropTable(contextMenu.table.name)}
          >
            <Trash2 className="w-3.5 h-3.5 text-red-500" />
            <span>Drop Table</span>
          </button>
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

      {activeExportSqlTable && (
        <ExportSqlModal
          isOpen={true}
          connectionId={connectionId}
          tableName={activeExportSqlTable}
          schemaName={schemaName}
          onClose={() => setActiveExportSqlTable(null)}
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
