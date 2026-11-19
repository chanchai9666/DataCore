import React, { useState } from 'react';
import { Lock, KeyRound, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { dbApi } from '../../api/db';

export interface VaultUnlockModalProps {
  isOpen: boolean;
  onUnlocked: () => void;
  onClose: () => void;
}

export const VaultUnlockModal: React.FC<VaultUnlockModalProps> = ({
  isOpen,
  onUnlocked,
  onClose,
}) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!password) {
      setError(t('security.masterPasswordRequired', 'Please enter your Master Password.'));
      return;
    }

    try {
      setIsUnlocking(true);
      await dbApi.unlockVault?.(password);
      setPassword('');
      onUnlocked();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('security.unlockVaultAriaLabel', 'Unlock Credential Vault')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('security.unlockVaultTitle', 'Unlock Credential Vault')}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('security.unlockVaultSubtitle', 'Enter your Master Password to access saved connection credentials.')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('security.closeAriaLabel', 'Close')}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="vault-unlock-password"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              {t('security.masterPasswordLabel', 'Master Password')}
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="vault-unlock-password"
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('security.masterPasswordPlaceholder', 'Enter Master Password')}
                className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-rose-500 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={isUnlocking}
              className="rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isUnlocking ? t('security.unlocking', 'Unlocking...') : t('security.unlockButton', 'Unlock Vault')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
