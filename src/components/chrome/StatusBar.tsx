import React, { useState } from 'react';
import { Copy, Check, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStatusStore } from '../../stores/statusStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useTabStore } from '../../stores/tabStore';
import { useTransferMonitorStore, formatEta } from '../../stores/transferMonitorStore';
import { changeLanguage } from '../../i18n';

export interface StatusBarProps {
  className?: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({ className = '' }) => {
  const { t, i18n } = useTranslation();
  const { lastQuery, executionTimeMs, rowCount, selectedCellInfo, statusMessage } = useStatusStore();
  const { connections, activeConnectionId, connectedConnectionIds } = useConnectionStore();
  const { tabs, activeTabId } = useTabStore();
  const { jobs, jobOrder, openDashboard } = useTransferMonitorStore();
  const [copied, setCopied] = useState(false);

  const runningTransfer = jobOrder
    .map((id) => jobs[id])
    .find((j) => j && j.status === 'running');

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const resolvedConnectionId = activeTab?.connectionId ?? activeConnectionId;
  const activeConnection = connections.find((c) => c.id === resolvedConnectionId);
  const isConnected = Boolean(
    resolvedConnectionId && connectedConnectionIds.includes(resolvedConnectionId)
  );
  const currentLang = i18n.language?.startsWith('th') ? 'th' : 'en';

  const handleCopyQuery = () => {
    if (lastQuery) {
      navigator.clipboard.writeText(lastQuery);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleToggleLanguage = () => {
    const nextLang = currentLang === 'th' ? 'en' : 'th';
    changeLanguage(nextLang);
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
              title={t('status.clickToCopySql', '{{query}} (Click to copy)', { query: lastQuery })}
              onClick={handleCopyQuery}
            >
              {lastQuery}
            </span>
            <button
              type="button"
              onClick={handleCopyQuery}
              title={t('status.copySql', 'Copy SQL')}
              aria-label={t('status.copySql', 'Copy SQL')}
              className="p-0.5 hover:text-text rounded transition-colors"
            >
              {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
            </button>
          </div>
        ) : (
          <span className="italic opacity-60">{t('status.ready', 'Ready')}</span>
        )}
      </div>

      {/* Right: Metrics (Rows, Time, Connection status, Cell Selection) & Language Switcher */}
      <div className="flex items-center gap-3 font-mono text-[10px] text-muted/90 shrink-0">
        {runningTransfer && (
          <button
            type="button"
            data-testid="status-transfer-indicator"
            onClick={openDashboard}
            title={t('monitor.openTransferDashboard', 'Open Transfer Monitor Dashboard')}
            className="inline-flex items-center gap-1.5 rounded bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-500/25 transition-colors"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span>
              {runningTransfer.percent !== null ? `${runningTransfer.percent}% · ` : ''}
              {runningTransfer.rowsProcessed.toLocaleString()} rows ·{' '}
              {runningTransfer.mbPerSec.toFixed(1)} MB/s · ETA{' '}
              {formatEta(runningTransfer.etaSeconds)}
            </span>
          </button>
        )}

        {selectedCellInfo && (
          <span title={t('status.selectedCell', 'Selected cell')}>{selectedCellInfo}</span>
        )}

        {rowCount !== null && (
          <span title={t('status.rowCount', 'Row count')}>
            {rowCount} {rowCount === 1 ? t('status.row', 'row') : t('status.rows', 'rows')}
          </span>
        )}

        {executionTimeMs !== null && (
          <span title={t('status.executionTime', 'Query execution duration')}>
            {executionTimeMs} ms
          </span>
        )}

        {activeConnection ? (
          <div className="flex items-center gap-1.5">
            {activeConnection.environment && (
              <span
                data-testid="status-env-badge"
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded leading-none ${
                  activeConnection.environment.toLowerCase() === 'production'
                    ? 'bg-red-500/20 text-red-500 dark:text-red-400 border border-red-500/30'
                    : activeConnection.environment.toLowerCase() === 'staging'
                    ? 'bg-amber-500/20 text-amber-500 dark:text-amber-400 border border-amber-500/30'
                    : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                }`}
              >
                {activeConnection.environment.toUpperCase()}
              </span>
            )}
            {isConnected ? (
              <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span>{t('status.connected', 'Connected')}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-muted/60">
                <span className="text-text/70">{activeConnection.name}</span>
                <span>({t('status.disconnected', 'Disconnected')})</span>
              </div>
            )}
          </div>
        ) : (
          <span className="text-muted/60">{t('status.disconnected', 'Disconnected')}</span>
        )}

        {/* Language switch button */}
        <button
          type="button"
          onClick={handleToggleLanguage}
          aria-label={t('status.toggleLanguage', 'Toggle language')}
          data-testid="status-language-btn"
          title={currentLang === 'th' ? t('toolbar.switchToEnglish', 'Switch to English') : t('toolbar.switchToThai', 'Switch to Thai')}
          className="px-1.5 py-0.5 rounded border border-line hover:bg-black/5 dark:hover:bg-white/10 hover:text-text text-[10px] font-sans font-medium transition-colors flex items-center gap-1"
        >
          <Globe size={11} className="opacity-70" />
          <span>{currentLang === 'th' ? 'TH' : 'EN'}</span>
        </button>
      </div>

      {/* WCAG 2.1 AA Screen Reader Announcements (ARIA Live Region) */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="status-bar-sr-announcement"
      >
        {statusMessage ||
          (executionTimeMs !== null && rowCount !== null
            ? `Query executed in ${executionTimeMs} milliseconds. ${rowCount} rows returned.`
            : '')}
      </div>
    </footer>
  );
};

export default StatusBar;
