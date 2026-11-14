import React, { useState } from 'react';
import { Copy, Check, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStatusStore } from '../../stores/statusStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { changeLanguage } from '../../i18n';

export interface StatusBarProps {
  className?: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({ className = '' }) => {
  const { t, i18n } = useTranslation();
  const { lastQuery, executionTimeMs, rowCount, selectedCellInfo, statusMessage } = useStatusStore();
  const { connections, activeConnectionId } = useConnectionStore();
  const [copied, setCopied] = useState(false);

  const activeConnection = connections.find((c) => c.id === activeConnectionId);
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
              title={`${lastQuery} (Click to copy)`}
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
          <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span>{t('status.connected', 'Connected')}</span>
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
    </footer>
  );
};

export default StatusBar;
