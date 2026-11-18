import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, ShieldAlert, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DangerousQueryAnalysis } from '../../utils/dangerousQueryDetector';

export interface DangerousQueryConfirmModalProps {
  isOpen: boolean;
  sql: string;
  analysis: DangerousQueryAnalysis | null;
  environment?: string;
  connectionName?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DangerousQueryConfirmModal: React.FC<DangerousQueryConfirmModalProps> = ({
  isOpen,
  sql,
  analysis,
  environment,
  connectionName,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [confirmInput, setConfirmInput] = useState('');

  useEffect(() => {
    if (isOpen) {
      setConfirmInput('');
    }
  }, [isOpen]);

  if (!isOpen || !analysis) return null;

  const isProduction = environment?.toLowerCase() === 'production';
  const isCritical = analysis.riskLevel === 'CRITICAL' || isProduction;
  const isExecuteDisabled = isProduction && confirmInput.trim() !== 'CONFIRM';

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay
          data-testid="dangerous-query-overlay"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm transition-opacity"
          onClick={onCancel}
        />
        <Dialog.Content
          role="alertdialog"
          aria-label="Confirm Dangerous Query"
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg rounded-xl border border-red-500/30 bg-white dark:bg-zinc-900 p-6 text-zinc-900 dark:text-zinc-100 shadow-2xl focus:outline-none"
        >
          {/* Production Safe Mode Warning Banner */}
          {isProduction && (
            <div
              data-testid="production-safe-mode-banner"
              className="mb-4 p-3 rounded-lg bg-red-500/15 border border-red-500/40 text-red-600 dark:text-red-400 flex items-center gap-2.5 text-xs font-semibold"
            >
              <ShieldAlert className="w-5 h-5 shrink-0 text-red-500" />
              <div>
                <div className="uppercase tracking-wider font-bold text-[11px]">{t('dialogs.prodSafeModeTitle', 'Production Safe Mode Guardrail')}</div>
                <div className="text-[11px] font-normal opacity-90">
                  {t('dialogs.prodSafeModeDesc', { name: connectionName ? `"${connectionName}"` : '', defaultValue: `Target connection ${connectionName ? `"${connectionName}"` : ''} is in PRODUCTION. Destructive operations require explicit confirmation.` })}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-full shrink-0 ${isCritical ? 'bg-red-500/20 text-red-500 dark:text-red-400' : 'bg-amber-500/20 text-amber-500 dark:text-amber-400'}`}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <Dialog.Title className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <span>{t('dialogs.dangerousQueryTitle', 'Dangerous Query Warning')}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${isCritical ? 'bg-red-500/20 text-red-500 dark:text-red-400 border border-red-500/30' : 'bg-amber-500/20 text-amber-500 dark:text-amber-400 border border-amber-500/30'}`}>
                    {isProduction ? 'PRODUCTION' : (analysis.riskLevel ?? 'HIGH RISK')}
                  </span>
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button
                    onClick={onCancel}
                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </Dialog.Close>
              </div>

              <Dialog.Description className="mt-2 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                {analysis.reason}
              </Dialog.Description>

              <div className="mt-4">
                <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">{t('dialogs.queryToExecute', 'Query to be executed:')}</div>
                <pre className="p-3 rounded-lg bg-zinc-50 dark:bg-black/60 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-red-700 dark:text-red-200 overflow-x-auto max-h-32 select-text">
                  {sql}
                </pre>
              </div>

              {/* Explicit Confirmation Input in Production */}
              {isProduction && (
                <div className="mt-4 p-3 rounded-lg bg-zinc-100 dark:bg-black/40 border border-red-500/30">
                  <label htmlFor="prod-confirm-input" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Type <span className="font-mono font-bold text-red-600 dark:text-red-400 select-all">CONFIRM</span> to authorize execution:
                  </label>
                  <input
                    id="prod-confirm-input"
                    data-testid="safe-mode-confirm-input"
                    type="text"
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    placeholder="CONFIRM"
                    className="w-full px-3 py-1.5 text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-red-500"
                    autoFocus
                  />
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs font-medium rounded-lg text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isExecuteDisabled}
              data-testid="dangerous-query-confirm-btn"
              className={`px-4 py-2 text-xs font-semibold rounded-lg text-white transition-all shadow-lg ${
                isExecuteDisabled
                  ? 'bg-zinc-400 dark:bg-zinc-700 cursor-not-allowed opacity-50 shadow-none'
                  : 'bg-red-600 hover:bg-red-500 shadow-red-900/30 cursor-pointer'
              }`}
            >
              {t('dialogs.executeAnyway', 'Execute Anyway')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
