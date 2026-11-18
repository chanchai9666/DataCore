import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Database, ShieldCheck, Zap, ExternalLink, Copy, RefreshCw, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

export const APP_REPOSITORY_URL = 'https://github.com/chanchai9666/DataCore';
export const APP_AUTHOR = 'chanchai';
export const SUPPORTED_ENGINES = ['PostgreSQL', 'MySQL', 'SQLite', 'DuckDB', 'SQL Server'] as const;
const FALLBACK_VERSION = '0.1.0';

export interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCheckUpdates?: () => void;
  version?: string;
}

export const AboutModal: React.FC<AboutModalProps> = ({
  isOpen,
  onClose,
  onCheckUpdates,
  version: versionProp,
}) => {
  const { t } = useTranslation();
  const [version, setVersion] = useState<string>(versionProp ?? FALLBACK_VERSION);

  useEffect(() => {
    if (!isOpen || versionProp) return;
    let mounted = true;
    import('@tauri-apps/api/app')
      .then((mod) => mod.getVersion())
      .then((v) => {
        if (mounted && v) setVersion(v);
      })
      .catch(() => {
        // Non-Tauri environment (browser / tests): keep fallback version
      });
    return () => {
      mounted = false;
    };
  }, [isOpen, versionProp]);

  const handleCopyInfo = async () => {
    const platform = typeof navigator !== 'undefined' ? navigator.platform || 'unknown' : 'unknown';
    const info = `DataCore v${version}\nPlatform: ${platform}\nRepository: ${APP_REPOSITORY_URL}`;
    try {
      await navigator.clipboard.writeText(info);
      toast.success(t('about.copied', 'Copied app info to clipboard'));
    } catch {
      toast.error(t('about.copyFailed', 'Failed to copy app info'));
    }
  };

  if (!isOpen) return null;

  const highlights = [
    {
      icon: ShieldCheck,
      color: 'text-emerald-500',
      title: t('about.securityTitle', 'Secure Local Vault'),
      desc: t(
        'about.securityDesc',
        'Passwords sealed with AES-256-GCM and Argon2id in a local encrypted vault (0600).'
      ),
    },
    {
      icon: Zap,
      color: 'text-amber-500',
      title: t('about.performanceTitle', 'Fast & Lightweight'),
      desc: t(
        'about.performanceDesc',
        'Native Tauri + Rust backend with streaming queries and keyset pagination.'
      ),
    },
  ];

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          data-testid="about-modal"
          aria-describedby="about-modal-desc"
          className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-panel border border-line rounded-xl shadow-2xl overflow-hidden text-text focus:outline-none"
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-line bg-sidebar">
            <Dialog.Title className="text-sm font-semibold">
              {t('about.title', 'About DataCore')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="p-1 rounded text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="p-6 space-y-5">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="w-16 h-16 rounded-2xl bg-accent/15 text-accent flex items-center justify-center ring-8 ring-accent/5">
                <Database className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold tracking-tight">DataCore</h2>
              <span
                data-testid="about-version"
                className="px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-sidebar border border-line text-muted"
              >
                v{version}
              </span>
              <p id="about-modal-desc" className="text-xs text-muted leading-relaxed max-w-xs">
                {t(
                  'about.tagline',
                  'A lightweight native macOS database manager for modern developers.'
                )}
              </p>
            </div>

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">
                {t('about.supportedEngines', 'Supported Databases')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SUPPORTED_ENGINES.map((engine) => (
                  <span
                    key={engine}
                    className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-grid border border-line"
                  >
                    {engine}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {highlights.map(({ icon: Icon, color, title, desc }) => (
                <div key={title} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-sidebar border border-line">
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
                  <div>
                    <div className="text-xs font-semibold">{title}</div>
                    <div className="text-[11px] text-muted leading-relaxed">{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                {t('about.developedBy', 'Developed by')} <strong className="text-text">{APP_AUTHOR}</strong>
              </span>
              <a
                href={APP_REPOSITORY_URL}
                target="_blank"
                rel="noreferrer"
                data-testid="about-github-link"
                className="inline-flex items-center gap-1.5 text-accent hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                GitHub
              </a>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-line bg-sidebar">
            <button
              type="button"
              data-testid="about-copy-btn"
              onClick={handleCopyInfo}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border border-line hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              {t('about.copyInfo', 'Copy Info')}
            </button>
            {onCheckUpdates && (
              <button
                type="button"
                data-testid="about-check-updates-btn"
                onClick={onCheckUpdates}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border border-line hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t('toolbar.checkUpdates', 'Check for Updates...')}
              </button>
            )}
            <button
              type="button"
              data-testid="about-close-btn"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
            >
              {t('common.close', 'Close')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default AboutModal;
