import React, { useState, useEffect } from 'react';
import { Layers, X, RefreshCw, Split } from 'lucide-react';
import { dbApi } from '../../api/db';
import {
  buildGetTablePartitionsSql,
  type TablePartitionInfo,
} from '../../api/performanceHelpers';
import { formatCellValue } from '../../types/db';

export interface TablePartitionsModalProps {
  isOpen: boolean;
  tableName: string;
  schemaName?: string;
  connectionId: string;
  driver?: string;
  onClose: () => void;
}

export const TablePartitionsModal: React.FC<TablePartitionsModalProps> = ({
  isOpen,
  tableName,
  schemaName,
  connectionId,
  driver = 'postgres',
  onClose,
}) => {
  const [partitions, setPartitions] = useState<TablePartitionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchPartitions = async () => {
    setIsLoading(true);
    const sql = buildGetTablePartitionsSql(tableName, schemaName || '', driver);
    try {
      const res = await dbApi.executeDirectQuery(connectionId, sql);
      if (!res || !res.rows) {
        setPartitions([]);
        return;
      }

      const parsed: TablePartitionInfo[] = [];
      for (const r of res.rows) {
        const name = String(formatCellValue(r[0]));
        const expr = String(formatCellValue(r[1]) || '');
        const method = String(formatCellValue(r[2]) || '');
        const rowCount = Number(formatCellValue(r[3])) || 0;
        const size = String(formatCellValue(r[4]) || '');

        parsed.push({
          name,
          partitionExpression: expr,
          partitionMethod: method,
          rowCount,
          dataSize: size,
        });
      }

      setPartitions(parsed);
    } catch (err: unknown) {
      console.error('Failed to load table partitions:', err);
      setPartitions([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPartitions();
    }
  }, [isOpen, tableName, schemaName, connectionId, driver]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Table Partitions"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in"
    >
      <div className="relative w-full max-w-2xl rounded-xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400">
              <Split className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Table Partitions
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600 dark:bg-slate-800 dark:text-slate-400 font-mono">
                  {tableName}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inspect partitioned ranges, lists, or hash sub-tables for large datasets
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchPartitions}
              disabled={isLoading}
              aria-label="Refresh Partitions"
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-blue-500' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 max-h-[60vh] overflow-y-auto space-y-3">
          {partitions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-slate-400">
              <Layers className="h-9 w-9 text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Standard Single Relation Table
              </p>
              <p className="text-xs text-slate-500">
                This table is not partitioned into sub-tables.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                  <tr>
                    <th className="px-3.5 py-2.5">Partition Name</th>
                    <th className="px-3.5 py-2.5">Method</th>
                    <th className="px-3.5 py-2.5">Bound / Expression</th>
                    <th className="px-3.5 py-2.5">Estimated Rows</th>
                    <th className="px-3.5 py-2.5">Data Size</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                  {partitions.map((pt, idx) => (
                    <tr key={`${pt.name}-${idx}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="px-3.5 py-2 font-semibold text-slate-800 dark:text-slate-200">{pt.name}</td>
                      <td className="px-3.5 py-2 text-slate-600 dark:text-slate-400">{pt.partitionMethod || 'RANGE'}</td>
                      <td className="px-3.5 py-2 text-blue-600 dark:text-blue-400">{pt.partitionExpression || '-'}</td>
                      <td className="px-3.5 py-2 text-slate-600 dark:text-slate-400">{pt.rowCount?.toLocaleString()}</td>
                      <td className="px-3.5 py-2 text-slate-600 dark:text-slate-400">{pt.dataSize || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-right dark:border-slate-800 dark:bg-slate-900/60">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
