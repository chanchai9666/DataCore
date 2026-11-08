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
} from 'lucide-react';
import { dbApi } from '../../api/db';
import type { TableMetadata } from '../../types/dataTransfer';
import { openTableTab } from '../sidebar/tabHelpers';

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
  theme?: 'dark' | 'light';
  onOpenTable?: (tableName: string) => void;
  onOpenStructure?: (tableName: string) => void;
  onDuplicateTable?: (tableName: string) => void;
}

type SortField = 'name' | 'approxRowCount' | 'totalSizeBytes' | 'engine';
type SortOrder = 'asc' | 'desc';

export const TableListTab: React.FC<TableListTabProps> = ({
  connectionId,
  schemaName,
  theme = 'dark',
  onOpenTable,
  onOpenStructure,
  onDuplicateTable,
}) => {
  const [tables, setTables] = useState<TableMetadata[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

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
      <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-[#333333] gap-4">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-blue-400" />
          <span className="font-semibold text-xs text-white">
            {schemaName ? `${schemaName} Tables` : 'Tables'}
          </span>
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#333333] text-gray-300">
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
              className="bg-[#1e1e1e] text-xs text-white pl-8 pr-3 py-1 rounded border border-[#3c3c3c] focus:outline-none focus:border-blue-500 w-52 placeholder-gray-500"
            />
          </div>

          <button
            onClick={fetchTables}
            disabled={loading}
            title="Refresh tables metadata"
            className="p-1 rounded hover:bg-[#333333] text-gray-300 hover:text-white transition-colors disabled:opacity-50"
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
            <thead className="bg-[#252526] sticky top-0 z-10 text-gray-400 border-b border-[#333333]">
              <tr>
                <th
                  onClick={() => handleSort('name')}
                  className="py-2 px-3 font-medium cursor-pointer hover:text-white select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>Name</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-500" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('approxRowCount')}
                  className="py-2 px-3 font-medium cursor-pointer hover:text-white select-none text-right"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Approx Rows</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-500" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('totalSizeBytes')}
                  className="py-2 px-3 font-medium cursor-pointer hover:text-white select-none text-right"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Total Size</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-500" />
                  </div>
                </th>
                <th className="py-2 px-3 font-medium text-right">Data Size</th>
                <th className="py-2 px-3 font-medium text-right">Index Size</th>
                <th
                  onClick={() => handleSort('engine')}
                  className="py-2 px-3 font-medium cursor-pointer hover:text-white select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>Engine</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-500" />
                  </div>
                </th>
                <th className="py-2 px-3 font-medium">Collation</th>
                <th className="py-2 px-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a2a2a]">
              {filteredAndSortedTables.map((table) => (
                <tr
                  key={table.name}
                  onDoubleClick={() => handleOpenData(table.name)}
                  className="hover:bg-[#2a2d2e] transition-colors group cursor-pointer"
                >
                  <td className="py-2 px-3 flex items-center gap-2 font-mono text-white">
                    <TableIcon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="truncate max-w-[200px]" title={table.name}>
                      {table.name}
                    </span>
                  </td>
                  <td
                    className="py-2 px-3 text-right font-mono text-gray-300"
                    title="Approximate row count from database catalog"
                  >
                    {formatApproxRows(table.approxRowCount)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-gray-300">
                    {formatBytes(table.totalSizeBytes)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-gray-400">
                    {formatBytes(table.dataSizeBytes)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-gray-400">
                    {formatBytes(table.indexSizeBytes)}
                  </td>
                  <td className="py-2 px-3 text-gray-400">
                    {table.engine || '-'}
                  </td>
                  <td className="py-2 px-3 text-gray-400 truncate max-w-[120px]" title={table.collation}>
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
                        className="p-1 rounded hover:bg-[#383838] text-gray-400 hover:text-white"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenStructure(table.name);
                        }}
                        title="Design Table Structure"
                        className="p-1 rounded hover:bg-[#383838] text-gray-400 hover:text-white"
                      >
                        <Wrench className="w-3 h-3" />
                      </button>
                      {onDuplicateTable && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDuplicateTable(table.name);
                          }}
                          title="Duplicate Table"
                          className="p-1 rounded hover:bg-[#383838] text-gray-400 hover:text-white"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
