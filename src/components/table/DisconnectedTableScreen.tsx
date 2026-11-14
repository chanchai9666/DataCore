import React from 'react';
import { Unplug, Database, Server, FileCode, Loader2, X } from 'lucide-react';

export interface DisconnectedTableScreenProps {
  tableName: string;
  connectionId?: string;
  connectionName?: string;
  schemaName?: string;
  driver?: string;
  environment?: string;
  host?: string;
  port?: number;
  filepath?: string;
  database?: string;
  theme?: 'dark' | 'light';
  isConnecting?: boolean;
  isConnectionActive?: boolean;
  onConnect: () => void;
  onClose: () => void;
}

export const DisconnectedTableScreen: React.FC<DisconnectedTableScreenProps> = ({
  tableName,
  connectionId: _connectionId,
  connectionName = 'Database Server',
  schemaName,
  driver = 'postgres',
  environment,
  host,
  port,
  filepath,
  database,
  theme = 'dark',
  isConnecting = false,
  isConnectionActive = false,
  onConnect,
  onClose,
}) => {
  const isLight = theme === 'light';

  // Environment badge colors
  const envKey = (environment || '').toLowerCase();
  const envBadgeStyle =
    envKey === 'production'
      ? 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30'
      : envKey === 'staging'
      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
      : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';

  const targetHostOrPath = filepath || (host ? `${host}${port ? `:${port}` : ''}` : '-');
  const targetDb = database || schemaName || '-';

  return (
    <div
      data-testid="disconnected-table-screen"
      className={`flex-1 flex flex-col items-center justify-center p-6 h-full select-none transition-colors ${
        isLight ? 'bg-slate-50 text-slate-800' : 'bg-[#18181b] text-slate-200'
      }`}
    >
      <div
        className={`max-w-md w-full rounded-2xl border p-6 shadow-xl flex flex-col items-center text-center transition-colors ${
          isLight
            ? 'bg-white border-slate-200 shadow-slate-200/50'
            : 'bg-[#202023] border-[#2e2e32] shadow-black/40'
        }`}
      >
        {/* Visual Icon Badge */}
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-transform hover:scale-105 ${
            isConnectionActive
              ? isLight
                ? 'bg-blue-50 text-blue-600 ring-8 ring-blue-50/50'
                : 'bg-blue-500/10 text-blue-400 ring-8 ring-blue-500/5'
              : isLight
              ? 'bg-amber-50 text-amber-600 ring-8 ring-amber-50/50'
              : 'bg-amber-500/10 text-amber-400 ring-8 ring-amber-500/5'
          }`}
        >
          {isConnectionActive ? <Database className="w-7 h-7" /> : <Unplug className="w-7 h-7" />}
        </div>

        {/* Title & Description */}
        <h2 className={`text-lg font-semibold tracking-tight mb-1.5 ${isLight ? 'text-slate-900' : 'text-white'}`}>
          {isConnectionActive ? 'Table Data Not Loaded' : 'Connection is Disconnected'}
        </h2>
        <p className={`text-xs mb-5 max-w-sm leading-relaxed ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
          {isConnectionActive
            ? 'This table tab was restored from a previous session. To protect database performance and avoid unexpected locks, data is loaded on demand.'
            : 'This table tab was restored from a previous session. To protect system resources and avoid unintended locks, data is not fetched automatically until connected.'}
        </p>

        {/* Target Context Summary Card */}
        <div
          className={`w-full rounded-xl border p-3.5 mb-6 text-left text-xs space-y-2 ${
            isLight ? 'bg-slate-50/80 border-slate-200/80' : 'bg-[#18181a] border-[#2a2a2e]'
          }`}
        >
          {/* Table */}
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Table:</span>
            <span className={`font-mono font-semibold flex items-center gap-1.5 ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              <FileCode className="w-3.5 h-3.5 text-blue-500" />
              {tableName}
            </span>
          </div>

          {/* Server / Connection */}
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Connection:</span>
            <div className="flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-purple-400" />
              <span className={`font-semibold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                {connectionName}
              </span>
              {environment && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold border ${envBadgeStyle}`}
                >
                  {environment}
                </span>
              )}
              <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-mono font-medium ${
                isLight ? 'bg-slate-200 text-slate-700' : 'bg-[#2a2a2e] text-slate-300'
              }`}>
                {driver}
              </span>
            </div>
          </div>

          {/* Database / Schema */}
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Database / Schema:</span>
            <span className={`font-mono text-[11px] ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              {targetDb} {schemaName && schemaName !== targetDb ? `(${schemaName})` : ''}
            </span>
          </div>

          {/* Host / Endpoint */}
          <div className="flex items-center justify-between border-t pt-1.5 mt-1.5 border-dashed border-gray-200 dark:border-gray-800">
            <span className={`text-[11px] font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Target:</span>
            <span className={`font-mono text-[11px] truncate max-w-[200px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`} title={targetHostOrPath}>
              {targetHostOrPath}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="w-full flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isConnecting}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-lg border transition-colors ${
              isLight
                ? 'border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-50'
                : 'border-[#333338] hover:bg-[#2c2c31] text-slate-300 disabled:opacity-50'
            }`}
          >
            <X className="w-3.5 h-3.5" />
            Close Tab
          </button>

          <button
            type="button"
            data-testid="btn-connect-and-load"
            onClick={onConnect}
            disabled={isConnecting}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-md shadow-blue-500/20 disabled:opacity-70 transition-all cursor-pointer"
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Database className="w-3.5 h-3.5" />
                {isConnectionActive ? 'Load Table Data' : 'Connect & Load'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
