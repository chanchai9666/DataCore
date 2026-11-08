import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useStatusStore } from '../../stores/statusStore';
import { useConnectionStore } from '../../stores/connectionStore';

export interface StatusBarProps {
  className?: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({ className = '' }) => {
  const { lastQuery, executionTimeMs, rowCount, selectedCellInfo, statusMessage } = useStatusStore();
  const { connections, activeConnectionId } = useConnectionStore();
  const [copied, setCopied] = useState(false);

  const activeConnection = connections.find((c) => c.id === activeConnectionId);

  const handleCopyQuery = () => {
    if (lastQuery) {
      navigator.clipboard.writeText(lastQuery);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <footer
      data-testid="status-bar"
      className={`h-status bg-panel border-t border-line text-[11px] text-muted flex items-center justify-between px-3 select-none flex-shrink-0 transition-colors ${className}`}
    >
      {/* Left: Last executed query or status message */}
      <div className="flex items-center gap-2 max-w-[60%] truncate">
        {statusMessage ? (
          <span className="truncate text-text font-mono">{statusMessage}</span>
        ) : lastQuery ? (
          <div className="flex items-center gap-1.5 truncate">
            <span
              className="font-mono text-text/80 truncate cursor-pointer hover:text-text"
              title={`${lastQuery} (Click to copy)`}
              onClick={handleCopyQuery}
            >
              {lastQuery}
            </span>
            <button
              type="button"
              onClick={handleCopyQuery}
              title="Copy SQL query"
              aria-label="Copy SQL"
              className="p-0.5 hover:text-text rounded transition-colors"
            >
              {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
            </button>
          </div>
        ) : (
          <span className="italic opacity-60">Ready</span>
        )}
      </div>

      {/* Right: Metrics (Rows, Time, Connection status, Cell Selection) */}
      <div className="flex items-center gap-3 font-mono text-[10px] text-muted/90 shrink-0">
        {selectedCellInfo && (
          <span title="Selected cell">{selectedCellInfo}</span>
        )}

        {rowCount !== null && (
          <span title="Row count">
            {rowCount} {rowCount === 1 ? 'row' : 'rows'}
          </span>
        )}

        {executionTimeMs !== null && (
          <span title="Query execution duration">
            {executionTimeMs} ms
          </span>
        )}

        {activeConnection ? (
          <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span>Connected</span>
          </div>
        ) : (
          <span className="text-muted/60">Disconnected</span>
        )}
      </div>
    </footer>
  );
};

export default StatusBar;
