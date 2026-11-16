import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, RefreshCw, CheckCircle2, Download, AlertCircle, ArrowUpCircle } from 'lucide-react';
import { check } from '@tauri-apps/plugin-updater';
import { toast } from 'sonner';

export interface UpdateCheckerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentVersion?: string;
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'up-to-date' }
  | { state: 'available'; version: string; body?: string; date?: string; updateRef?: any }
  | { state: 'downloading'; progress: number }
  | { state: 'downloaded' }
  | { state: 'error'; message: string };

export const UpdateCheckerModal: React.FC<UpdateCheckerModalProps> = ({
  isOpen,
  onClose,
  currentVersion = '0.1.0',
}) => {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'checking' });

  const checkForUpdates = async () => {
    setStatus({ state: 'checking' });
    try {
      const update = await check();
      if (update?.available) {
        setStatus({
          state: 'available',
          version: update.version,
          body: update.body,
          date: update.date,
          updateRef: update,
        });
      } else {
        setStatus({ state: 'up-to-date' });
      }
    } catch (err: any) {
      setStatus({
        state: 'error',
        message: err?.message || 'Unable to connect to update server.',
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      checkForUpdates();
    }
  }, [isOpen]);

  const handleInstall = async () => {
    if (status.state !== 'available' || !status.updateRef) return;
    try {
      setStatus({ state: 'downloading', progress: 0 });
      let downloaded = 0;
      let contentLength = 0;

      await status.updateRef.downloadAndInstall((event: any) => {
        if (event.event === 'Started') {
          contentLength = event.data.contentLength || 0;
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          if (contentLength > 0) {
            const pct = Math.round((downloaded / contentLength) * 100);
            setStatus({ state: 'downloading', progress: pct });
          }
        } else if (event.event === 'Finished') {
          setStatus({ state: 'downloaded' });
        }
      });

      setStatus({ state: 'downloaded' });
      toast.success('Update installed! Restarting DataCore...');
    } catch (err: any) {
      setStatus({
        state: 'error',
        message: err?.message || 'Failed to download update.',
      });
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          data-testid="update-checker-backdrop"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        />
        <Dialog.Content
          data-testid="update-checker-modal"
          aria-describedby="update-checker-desc"
          className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-panel border border-line rounded-lg shadow-2xl overflow-hidden text-text focus:outline-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-line bg-sidebar">
            <div className="flex items-center space-x-2">
              <ArrowUpCircle className="w-5 h-5 text-blue-400" />
              <Dialog.Title asChild>
                <h2 className="text-base font-semibold text-text">
                  Software Update
                </h2>
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description id="update-checker-desc" className="sr-only">
            Check and install software updates
          </Dialog.Description>

          {/* Body Content */}
          <div className="p-5 space-y-4">
            {status.state === 'checking' && (
              <div className="py-6 flex flex-col items-center justify-center space-y-3 text-center">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-400" />
                <p className="text-sm font-medium text-text">Checking for updates...</p>
                <p className="text-xs text-muted">Current version: v{currentVersion}</p>
              </div>
            )}

            {status.state === 'up-to-date' && (
              <div className="py-6 flex flex-col items-center justify-center space-y-3 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text">You're up to date!</h3>
                  <p className="text-xs text-muted mt-1">
                    DataCore v{currentVersion} is currently the newest version available.
                  </p>
                </div>
              </div>
            )}

            {status.state === 'available' && (
              <div className="space-y-3">
                <div className="p-3.5 rounded-lg bg-blue-500/10 border border-blue-500/20 space-y-1.5">
                  <span className="text-xs font-semibold text-blue-400">New Version Available</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-base font-bold text-text">DataCore v{status.version}</span>
                    <span className="text-xs text-muted">(Current: v{currentVersion})</span>
                  </div>
                </div>

                {status.body && (
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">Release Notes</label>
                    <div className="max-h-36 overflow-y-auto p-2.5 rounded bg-sidebar border border-line text-xs text-muted whitespace-pre-wrap">
                      {status.body}
                    </div>
                  </div>
                )}
              </div>
            )}

            {status.state === 'downloading' && (
              <div className="py-6 space-y-3 text-center">
                <Download className="w-8 h-8 mx-auto animate-bounce text-blue-400" />
                <p className="text-sm font-medium text-text">Downloading Update... {status.progress}%</p>
                <div className="w-full bg-sidebar rounded-full h-2 overflow-hidden border border-line">
                  <div
                    className="bg-blue-600 h-2 transition-all duration-300"
                    style={{ width: `${status.progress}%` }}
                  />
                </div>
              </div>
            )}

            {status.state === 'downloaded' && (
              <div className="py-6 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400" />
                <p className="text-sm font-medium text-text">Update Ready!</p>
                <p className="text-xs text-muted">
                  Please restart DataCore to apply the new version.
                </p>
              </div>
            )}

            {status.state === 'error' && (
              <div className="py-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                  <AlertCircle className="w-4 h-4" />
                  <span>Update Check Notice</span>
                </div>
                <p className="text-xs text-muted leading-relaxed">{status.message}</p>
                <p className="text-[11px] text-muted/70">
                  You can also download the latest release directly from GitHub Releases.
                </p>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="px-5 py-3 border-t border-line bg-sidebar flex items-center justify-end space-x-2">
            {status.state === 'available' ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded text-xs text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  Later
                </button>
                <button
                  type="button"
                  onClick={handleInstall}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download & Install</span>
                </button>
              </>
            ) : status.state === 'error' ? (
              <>
                <button
                  type="button"
                  onClick={checkForUpdates}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-sidebar hover:bg-black/5 dark:hover:bg-white/5 border border-line text-xs text-text transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Retry</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
                >
                  Close
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded bg-sidebar hover:bg-black/5 dark:hover:bg-white/5 border border-line text-xs text-text transition-colors"
              >
                Done
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
