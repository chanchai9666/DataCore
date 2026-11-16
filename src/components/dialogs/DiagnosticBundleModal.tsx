import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Copy, Download, Check, ShieldCheck, FileJson, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useConnectionStore } from '../../stores/connectionStore';
import { useTabStore } from '../../stores/tabStore';
import { generateDiagnosticBundle, type DiagnosticBundle } from '../../utils/diagnosticBundle';
import { toast } from 'sonner';

export interface DiagnosticBundleModalProps {
  isOpen: boolean;
  onClose: () => void;
  appVersion?: string;
}

export const DiagnosticBundleModal: React.FC<DiagnosticBundleModalProps> = ({
  isOpen,
  onClose,
  appVersion = '0.1.0',
}) => {
  const { t } = useTranslation();
  const { connections, activeConnectionId } = useConnectionStore();
  const { tabs } = useTabStore();
  const [bundle, setBundle] = useState<DiagnosticBundle | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const generated = generateDiagnosticBundle({
        connections,
        activeConnectionId,
        activeTabsCount: tabs?.length ?? 0,
        appVersion,
      });
      setBundle(generated);
      setCopied(false);
    }
  }, [isOpen, connections, activeConnectionId, tabs, appVersion]);

  if (!isOpen || !bundle) return null;

  const jsonString = JSON.stringify(bundle, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      toast.success(t('diagnostic.copiedSuccess', 'Diagnostic bundle copied to clipboard'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('diagnostic.copyFailed', 'Failed to copy to clipboard'));
    }
  };

  const handleDownload = () => {
    try {
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `datacore-diagnostic-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t('diagnostic.downloadSuccess', 'Diagnostic bundle downloaded'));
    } catch {
      toast.error(t('diagnostic.downloadFailed', 'Failed to download diagnostic bundle'));
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-150" />
        <Dialog.Content
          aria-describedby="diagnostic-bundle-description"
          className="fixed left-[50%] top-[50%] max-h-[90vh] w-[90vw] max-w-2xl translate-x-[-50%] translate-y-[-50%] rounded-xl bg-panel border border-line shadow-2xl p-6 z-50 flex flex-col focus:outline-none animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line pb-4 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                <FileJson className="w-5 h-5" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-text">
                  {t('diagnostic.title', 'Export Diagnostic Bundle')}
                </Dialog.Title>
                <Dialog.Description
                  id="diagnostic-bundle-description"
                  className="text-xs text-muted"
                >
                  {t(
                    'diagnostic.subtitle',
                    'Sanitized system information and configuration for troubleshooting.'
                  )}
                </Dialog.Description>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-muted hover:text-text rounded-md p-1 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Privacy Notice Banner */}
          <div className="flex items-start gap-3 p-3 mb-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
            <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <p className="font-medium text-emerald-300">
                {t('diagnostic.privacyGuaranteed', '100% Privacy Protected')}
              </p>
              <p className="text-emerald-400/80 text-[11px] leading-relaxed">
                {t(
                  'diagnostic.privacyDesc',
                  'All database passwords, SSH keys, SSL certificates, tokens, and query data have been completely scrubbed and redacted.'
                )}
              </p>
            </div>
          </div>

          {/* Metadata Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 text-xs">
            <div className="p-2.5 rounded-lg bg-black/5 dark:bg-white/5 border border-line">
              <span className="text-[10px] text-muted block uppercase font-medium">OS Platform</span>
              <span className="font-semibold text-text truncate block">{bundle.system.platform}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-black/5 dark:bg-white/5 border border-line">
              <span className="text-[10px] text-muted block uppercase font-medium">DataCore Version</span>
              <span data-testid="diagnostic-app-version" className="font-semibold text-text block">{`v${bundle.app.version}`}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-black/5 dark:bg-white/5 border border-line">
              <span className="text-[10px] text-muted block uppercase font-medium">Connections</span>
              <span className="font-semibold text-text block">{bundle.connections.length} profiles</span>
            </div>
            <div className="p-2.5 rounded-lg bg-black/5 dark:bg-white/5 border border-line">
              <span className="text-[10px] text-muted block uppercase font-medium">Timezone</span>
              <span className="font-semibold text-text truncate block">{bundle.system.timezone}</span>
            </div>
          </div>

          {/* JSON Preview Content */}
          <div className="flex-1 min-h-[220px] max-h-[340px] flex flex-col mb-5">
            <div className="flex items-center justify-between text-xs text-muted mb-1.5 px-0.5">
              <span>{t('diagnostic.previewLabel', 'Bundle Payload Preview')}</span>
              <span>{(jsonString.length / 1024).toFixed(1)} KB</span>
            </div>
            <textarea
              readOnly
              data-testid="diagnostic-json-preview"
              value={jsonString}
              aria-label="Diagnostic JSON Payload"
              className="flex-1 w-full font-mono text-[11px] p-3 rounded-lg bg-black/40 border border-line text-text/90 resize-none focus:outline-none focus:border-accent selection:bg-accent/30"
            />
          </div>

          {/* Footer Controls */}
          <div className="flex items-center justify-between pt-3 border-t border-line">
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('diagnostic.attachHint', 'Share this bundle when filing GitHub issues.')}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                data-testid="diagnostic-copy-btn"
                className="px-3 py-1.5 rounded-lg border border-line text-xs font-medium text-text hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center gap-1.5"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? t('common.copied', 'Copied!') : t('common.copyJson', 'Copy JSON')}</span>
              </button>
              <button
                type="button"
                onClick={handleDownload}
                data-testid="diagnostic-download-btn"
                className="px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/90 transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{t('diagnostic.downloadFile', 'Download File')}</span>
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
