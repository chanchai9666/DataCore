import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Wrench,
  X,
  Loader2,
  Code2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Play,
  Activity,
  ShieldCheck,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { dbApi } from '../../api/db';
import { formatCellValue } from '../../utils/cellFormatter';
import {
  buildTableMaintenanceSql,
  type TableMaintenanceOp,
} from './tableManagementHelpers';

export interface TableMaintenanceModalProps {
  isOpen: boolean;
  tableName: string;
  schemaName?: string;
  connectionId: string;
  driver?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

interface OperationMeta {
  op: TableMaintenanceOp;
  name: string;
  nameTh: string;
  icon: React.ElementType;
  description: string;
}

const OPERATIONS: OperationMeta[] = [
  {
    op: 'analyze',
    name: 'Analyze',
    nameTh: 'วิเคราะห์สถิติคีย์',
    icon: Activity,
    description: 'อัปเดตสถิติการกระจายตัวของข้อมูล ช่วยให้ Query Planner เลือก Index ทำงานได้รวดเร็วที่สุด',
  },
  {
    op: 'check',
    name: 'Check Integrity',
    nameTh: 'ตรวจสอบความสมบูรณ์',
    icon: ShieldCheck,
    description: 'สแกนความถูกต้องของโครงสร้างตารางและไฟล์ข้อมูลว่าไม่มีจุดเสียหาย (Data Corruption)',
  },
  {
    op: 'optimize',
    name: 'Optimize / Vacuum',
    nameTh: 'จัดระเบียบและคืนพื้นที่',
    icon: Sparkles,
    description: 'จัดเรียงข้อมูลบนดิสก์ใหม่ (Defragmentation) และคืนพื้นที่ว่างที่ถูกลบออกให้ OS',
  },
  {
    op: 'reindex',
    name: 'Reindex / Repair',
    nameTh: 'ซ่อมแซมและสร้างดัชนีใหม่',
    icon: RefreshCw,
    description: 'สร้าง Index ใหม่ทั้งหมดเพื่อแก้ปัญหา Index บวม หรือซ่อมแซมโครงสร้างตารางที่ผิดปกติ',
  },
];

export const TableMaintenanceModal: React.FC<TableMaintenanceModalProps> = ({
  isOpen,
  tableName,
  schemaName,
  connectionId,
  driver = 'postgres',
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const [selectedOp, setSelectedOp] = useState<TableMaintenanceOp>('analyze');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastExecutedOp, setLastExecutedOp] = useState<TableMaintenanceOp | null>(null);
  const [executionResult, setExecutionResult] = useState<{
    executionTimeMs: number;
    columns: string[];
    rows: string[][];
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedOp('analyze');
      setError(null);
      setLoading(false);
      setLastExecutedOp(null);
      setExecutionResult(null);
    }
  }, [isOpen, tableName]);

  if (!isOpen) return null;

  const fullDisplay = schemaName ? `${schemaName}.${tableName}` : tableName;
  const currentSql = buildTableMaintenanceSql(selectedOp, tableName, schemaName, driver);

  const handleExecute = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await dbApi.executeDirectQuery(connectionId, currentSql);
      const colNames = (res.columns || []).map((c) => c.name);
      const strRows = (res.rows || []).map((row) =>
        row.map((cell) => formatCellValue(cell))
      );

      setLastExecutedOp(selectedOp);
      setExecutionResult({
        executionTimeMs: res.execution_time_ms ?? 0,
        columns: colNames,
        rows: strRows,
      });

      toast.success(
        `Executed ${selectedOp.toUpperCase()} on "${fullDisplay}" (${res.execution_time_ms ?? 0} ms)`
      );
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(`Maintenance operation failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const getOpName = (op: TableMaintenanceOp) => {
    switch (op) {
      case 'analyze': return t('structure.opAnalyze', 'Analyze');
      case 'check': return t('structure.opCheck', 'Check Integrity');
      case 'optimize': return t('structure.opOptimize', 'Optimize / Vacuum');
      case 'reindex': return t('structure.opReindex', 'Reindex / Repair');
    }
  };

  const getOpDesc = (op: TableMaintenanceOp) => {
    switch (op) {
      case 'analyze': return t('structure.opAnalyzeDesc', 'Update key distribution statistics to help the Query Planner choose the fastest Index.');
      case 'check': return t('structure.opCheckDesc', 'Scan table and data file structure integrity for data corruption.');
      case 'optimize': return t('structure.opOptimizeDesc', 'Reorganize data on disk (Defragmentation) and reclaim unused space for the OS.');
      case 'reindex': return t('structure.opReindexDesc', 'Rebuild all indexes to resolve index bloat or repair corrupted table structures.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="maintenance-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div className="bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#333333] rounded-lg shadow-2xl w-full max-w-xl overflow-hidden text-gray-800 dark:text-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 dark:border-[#2d2d2d] bg-gray-50 dark:bg-[#252526]">
          <div className="flex items-center space-x-2.5">
            <Wrench className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h2 id="maintenance-modal-title" className="text-sm font-semibold text-gray-900 dark:text-white">
                {t('structure.maintenanceTitle', 'Table Maintenance & Diagnostics')}
              </h2>
              <div className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                {fullDisplay} <span className="text-gray-400 dark:text-gray-500">({driver.toUpperCase()})</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label={t('common.close', 'Close dialog')}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-white p-1 rounded hover:bg-gray-200 dark:hover:bg-[#333333] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3 text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500 dark:text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Operation Selector Tabs */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              {t('structure.selectOperation', 'Select Operation')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {OPERATIONS.map((item) => {
                const Icon = item.icon;
                const isSelected = selectedOp === item.op;
                return (
                  <button
                    key={item.op}
                    type="button"
                    data-testid={`maintenance-op-${item.op}`}
                    onClick={() => setSelectedOp(item.op)}
                    disabled={loading}
                    className={`flex items-start text-left p-2.5 rounded-lg border transition-all ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-white'
                        : 'border-gray-200 dark:border-[#333333] bg-gray-50 dark:bg-[#141414] hover:bg-gray-100 dark:hover:bg-[#252526] text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 mt-0.5 mr-2 flex-shrink-0 ${
                        isSelected ? 'text-emerald-500 dark:text-emerald-400' : 'text-gray-400'
                      }`}
                    />
                    <div>
                      <div className="text-xs font-semibold">{getOpName(item.op)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 px-1">
              {getOpDesc(selectedOp)}
            </p>
          </div>

          {/* SQL Preview */}
          <div>
            <div className="flex items-center space-x-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1">
              <Code2 className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
              <span>{t('structure.sqlCommand', 'SQL Command')}</span>
            </div>
            <pre className="p-2.5 text-xs font-mono bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#2d2d2d] rounded text-emerald-700 dark:text-emerald-300 overflow-x-auto whitespace-pre-wrap break-all select-all">
              {currentSql}
            </pre>
          </div>

          {/* Diagnostic Result Section */}
          {executionResult && (
            <div className="p-3 bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#2d2d2d] rounded-lg space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{t('structure.executionComplete', 'Execution Complete ({{op}})', { op: lastExecutedOp?.toUpperCase() })}</span>
                </div>
                <div className="flex items-center space-x-1 text-gray-500 dark:text-gray-400 font-mono text-[11px]">
                  <Clock className="w-3 h-3 text-blue-500 dark:text-blue-400" />
                  <span data-testid="maintenance-exec-time">
                    {executionResult.executionTimeMs} ms
                  </span>
                </div>
              </div>

              {executionResult.rows.length > 0 ? (
                <div className="overflow-x-auto max-h-36 border border-gray-200 dark:border-[#2d2d2d] rounded">
                  <table className="w-full text-[11px] text-left text-gray-700 dark:text-gray-300">
                    <thead className="bg-gray-100 dark:bg-[#252526] text-gray-600 dark:text-gray-400 font-mono border-b border-gray-200 dark:border-[#2d2d2d]">
                      <tr>
                        {executionResult.columns.map((c, i) => (
                          <th key={i} className="px-2 py-1 font-medium">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-[#2d2d2d]">
                      {executionResult.rows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-gray-100 dark:hover:bg-[#1a1a1a]">
                          {row.map((val, cIdx) => (
                            <td key={cIdx} className="px-2 py-1 font-mono">
                              {val}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[11px] text-gray-500 dark:text-gray-400 italic">
                  {t('structure.maintenanceSuccess0Rows', 'Command completed successfully with 0 diagnostic warning rows returned.')}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 dark:border-[#2d2d2d] bg-gray-50 dark:bg-[#252526]">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">
            {t('tableList.engine', 'Engine')}: <span className="font-mono text-gray-700 dark:text-gray-300">{driver}</span>
          </span>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3.5 py-1.5 text-xs font-medium rounded text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white bg-gray-200 dark:bg-[#2d2d2d] hover:bg-gray-300 dark:hover:bg-[#383838] transition-colors"
            >
              {t('common.close', 'Close')}
            </button>
            <button
              type="button"
              data-testid="execute-maintenance-btn"
              onClick={handleExecute}
              disabled={loading}
              className="inline-flex items-center space-x-1.5 px-4 py-1.5 text-xs font-medium rounded text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors shadow-sm"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              <span>{loading ? t('structure.running', 'Running...') : t('structure.execute', 'Execute')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
