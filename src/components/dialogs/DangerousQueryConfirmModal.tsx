import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, X } from 'lucide-react';
import type { DangerousQueryAnalysis } from '../../utils/dangerousQueryDetector';

export interface DangerousQueryConfirmModalProps {
  isOpen: boolean;
  sql: string;
  analysis: DangerousQueryAnalysis | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DangerousQueryConfirmModal: React.FC<DangerousQueryConfirmModalProps> = ({
  isOpen,
  sql,
  analysis,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen || !analysis) return null;

  const isCritical = analysis.riskLevel === 'CRITICAL';

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
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg rounded-xl border border-red-500/30 bg-gray-900 p-6 text-gray-100 shadow-2xl focus:outline-none"
        >
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-full shrink-0 ${isCritical ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <Dialog.Title className="text-base font-semibold text-white flex items-center gap-2">
                  <span>Dangerous Query Warning</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${isCritical ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                    {analysis.riskLevel ?? 'HIGH RISK'}
                  </span>
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button
                    onClick={onCancel}
                    className="text-gray-400 hover:text-white transition-colors"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </Dialog.Close>
              </div>

              <Dialog.Description className="mt-2 text-xs text-gray-300 leading-relaxed">
                {analysis.reason}
              </Dialog.Description>

              <div className="mt-4">
                <div className="text-[11px] font-medium text-gray-400 mb-1">Query to be executed:</div>
                <pre className="p-3 rounded-lg bg-black/60 border border-gray-800 text-xs font-mono text-red-200 overflow-x-auto max-h-32 select-text">
                  {sql}
                </pre>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-gray-800">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs font-medium rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold transition-colors shadow-lg shadow-red-900/30"
            >
              Execute Anyway
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
