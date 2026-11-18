import React, { useState, useMemo } from 'react';
import { Copy, Check, AlertTriangle, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { openQueryTab } from '../../sidebar/tabHelpers';

export interface SqlPreviewTabProps {
  sql: string;
  connectionId: string;
  tableName: string;
  onOpenInEditor?: (sql: string) => void;
}

export function hasDestructiveDdl(sql: string): boolean {
  return /\bDROP\s+COLUMN\b/i.test(sql) || /\bALTER\s+COLUMN\b[\s\S]*?\bTYPE\b/i.test(sql);
}

export const SqlPreviewTab: React.FC<SqlPreviewTabProps> = ({
  sql,
  connectionId,
  tableName,
  onOpenInEditor,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const isDestructive = useMemo(() => hasDestructiveDdl(sql), [sql]);

  const handleCopy = () => {
    navigator.clipboard?.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenInQueryEditor = () => {
    if (onOpenInEditor) {
      onOpenInEditor(sql);
      return;
    }
    openQueryTab({
      connectionId,
      tableName,
      initialQuery: sql,
    });
  };

  return (
    <div
      data-testid="sql-preview-tab"
      className="border border-line bg-panel rounded-lg overflow-hidden flex flex-col h-full shadow-sm"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-line bg-sidebar text-text text-xs font-semibold">
        <span>{t('structure.sqlSchemaDef', 'SQL Schema Definition (DDL)')}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="sql-preview-open-editor-btn"
            onClick={handleOpenInQueryEditor}
            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] transition-colors border border-line bg-panel hover:bg-black/5 dark:hover:bg-white/10 text-text"
          >
            <ExternalLink className="w-3.5 h-3.5 text-blue-500" />
            <span>{t('structure.openInQueryEditor', 'Open in Query Editor')}</span>
          </button>
          <button
            type="button"
            data-testid="sql-preview-copy-btn"
            onClick={handleCopy}
            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] transition-colors border border-line bg-panel hover:bg-black/5 dark:hover:bg-white/10 text-text"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span>{t('structure.copied', 'Copied!')}</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-muted" />
                <span>{t('structure.copySql', 'Copy SQL')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {isDestructive && (
        <div
          data-testid="sql-preview-destructive-warning"
          className="px-3 py-2 bg-amber-500/10 border-b border-amber-500/30 text-amber-600 dark:text-amber-300 text-xs flex items-center gap-2 font-medium"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
          <span>
            {t(
              'structure.destructiveDdlWarning',
              'Destructive DDL Detected: This script contains DROP COLUMN or ALTER COLUMN TYPE statements that may cause data loss.'
            )}
          </span>
        </div>
      )}

      <pre className="p-4 font-mono text-xs overflow-auto flex-1 select-text bg-grid text-blue-600 dark:text-blue-300">
        {sql}
      </pre>
    </div>
  );
};
