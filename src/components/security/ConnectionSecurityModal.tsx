import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  X,
  Lock,
  HardDrive,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  EyeOff,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { dbApi } from '../../api/db';
import { usePrivacyStore } from '../../stores/privacyStore';
import {
  buildGetTlsStatusSql,
  buildGetAtRestEncryptionSql,
  parseAtRestEncryptionResult,
  type TlsStatusInfo,
  type AtRestEncryptionInfo,
} from '../../api/securityHelpers';
import { formatCellValue } from '../../utils/cellFormatter';

export interface ConnectionSecurityModalProps {
  isOpen: boolean;
  connectionId: string;
  driver?: string;
  connectionName?: string;
  sslMode?: string;
  onClose: () => void;
}

export const ConnectionSecurityModal: React.FC<ConnectionSecurityModalProps> = ({
  isOpen,
  connectionId,
  driver = 'postgres',
  connectionName,
  sslMode,
  onClose,
}) => {
  const { t } = useTranslation();
  const [tlsInfo, setTlsInfo] = useState<TlsStatusInfo | null>(null);
  const [atRestInfo, setAtRestInfo] = useState<AtRestEncryptionInfo | null>(null);
  const [isKeychainOptIn, setIsKeychainOptIn] = useState(false);
  const [hasMasterPassword, setHasMasterPassword] = useState(false);
  const [masterPwdMode, setMasterPwdMode] = useState<'none' | 'set' | 'change' | 'remove'>('none');
  const [pwdInput1, setPwdInput1] = useState('');
  const [pwdInput2, setPwdInput2] = useState('');
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [isSavingPwd, setIsSavingPwd] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isTogglingKeychain, setIsTogglingKeychain] = useState(false);
  const {
    screenProtectionEnabled,
    isUpdating: isUpdatingScreenProtection,
    error: screenProtectionError,
    toggleScreenProtection,
  } = usePrivacyStore();

  const fetchSecurityStatus = async () => {
    setIsLoading(true);
    const d = driver?.toLowerCase() || 'postgres';

    // 0. Vault Keychain & Master Password status
    try {
      const [enabled, hasMaster] = await Promise.all([
        dbApi.isVaultKeychainEnabled?.() ?? Promise.resolve(false),
        dbApi.hasVaultMasterPassword?.() ?? Promise.resolve(false),
      ]);
      setIsKeychainOptIn(Boolean(enabled));
      setHasMasterPassword(Boolean(hasMaster));
    } catch {
      // Keep defaults
    }

    // 1. In-transit TLS
    const tlsSql = buildGetTlsStatusSql(d);
    try {
      if (d === 'sqlite' || d === 'duckdb') {
        setTlsInfo({
          isEncrypted: true,
          protocol: 'In-Process (Local IPC)',
          cipherSuite: 'Direct Memory Bus (No Network Exposure)',
        });
      } else {
        const res = await dbApi.executeDirectQuery(connectionId, tlsSql);
        if (res && res.rows && res.rows.length > 0) {
          if (d === 'mysql') {
            const map: Record<string, string> = {};
            for (const r of res.rows) {
              map[String(formatCellValue(r[0]))] = String(formatCellValue(r[1]));
            }
            const cipher = map['Ssl_cipher'];
            const version = map['Ssl_version'];
            const isEncrypted = Boolean(cipher && cipher !== 'NULL' && cipher !== '');
            setTlsInfo({
              isEncrypted,
              protocol: isEncrypted ? version || 'TLS (Version Unreported)' : 'Plaintext',
              cipherSuite: isEncrypted ? cipher : 'None',
              keyBits: undefined,
            });
          } else {
            // Postgres: [ssl, version, cipher, bits]
            const r = res.rows[0];
            const sslVal = formatCellValue(r[0]);
            const isEncrypted = sslVal.toLowerCase() === 'true' || sslVal.toLowerCase() === 't';
            const version = String(formatCellValue(r[1]) || '');
            const cipher = String(formatCellValue(r[2]) || '');
            const bits = Number(formatCellValue(r[3])) || undefined;

            setTlsInfo({
              isEncrypted,
              protocol: isEncrypted ? (version || 'TLS (Version Unreported)') : 'Plaintext',
              cipherSuite: isEncrypted ? (cipher || 'Unreported') : 'None',
              keyBits: isEncrypted ? bits : 0,
            });
          }
        } else {
          setTlsInfo({
            isEncrypted: false,
            unverified: true,
            protocol: 'Unknown (Unable to Verify)',
            cipherSuite: 'Unverified — server did not report TLS status',
          });
        }
      }
    } catch {
      setTlsInfo({
        isEncrypted: false,
        unverified: true,
        protocol: 'Unknown (Unable to Verify)',
        cipherSuite: 'Unverified — TLS inspection query failed',
      });
    }

    // 2. At-Rest
    try {
      const atRestSql = buildGetAtRestEncryptionSql(d);
      const restRes = await dbApi.executeDirectQuery(connectionId, atRestSql);
      const atRestData = parseAtRestEncryptionResult(d, restRes);
      setAtRestInfo(atRestData);
    } catch {
      setAtRestInfo({
        isEncrypted: false,
        status: 'unknown',
        technology: 'Inspection Unsupported / Restricted',
        details: 'Server does not expose at-rest encryption configuration or query permissions are restricted.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleKeychain = async () => {
    try {
      setIsTogglingKeychain(true);
      const nextState = !isKeychainOptIn;
      await dbApi.setVaultKeychainEnabled?.(nextState);
      setIsKeychainOptIn(nextState);
    } catch (err) {
      console.error('Failed to toggle macOS Keychain opt-in:', err);
    } finally {
      setIsTogglingKeychain(false);
    }
  };

  const handleMasterPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError(null);
    if (!pwdInput1) {
      setPwdError('Password cannot be empty.');
      return;
    }
    try {
      setIsSavingPwd(true);
      if (masterPwdMode === 'set') {
        await dbApi.setVaultMasterPassword?.(pwdInput1);
        setHasMasterPassword(true);
      } else if (masterPwdMode === 'change') {
        if (!pwdInput2) {
          setPwdError('New password cannot be empty.');
          return;
        }
        await dbApi.changeVaultMasterPassword?.(pwdInput1, pwdInput2);
      } else if (masterPwdMode === 'remove') {
        await dbApi.removeVaultMasterPassword?.(pwdInput1);
        setHasMasterPassword(false);
        setIsKeychainOptIn(false);
      }
      setMasterPwdMode('none');
      setPwdInput1('');
      setPwdInput2('');
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSavingPwd(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSecurityStatus();
    }
  }, [isOpen, connectionId, driver, sslMode]);

  if (!isOpen) return null;

  const isTlsActive = tlsInfo?.isEncrypted ?? false;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Connection Encryption and Security Status"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in"
    >
      <div className="relative w-full max-w-xl rounded-xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              isTlsActive
                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                : 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'
            }`}>
              {isTlsActive ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                {t('security.title', 'Connection Encryption & Security')}
                {connectionName && (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600 dark:bg-slate-800 dark:text-slate-400 font-mono">
                    {connectionName}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('security.subtitle', 'In-transit (TLS/SSL) and at-rest cryptographic status')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchSecurityStatus}
              disabled={isLoading}
              aria-label="Refresh Security"
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-blue-500' : ''}`} />
              {t('tools.refresh', 'Refresh')}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          {/* In-Transit TLS Section */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200">
                <Lock className="h-4 w-4 text-emerald-500" />
                <span>{t('security.inTransitTitle', 'In-Transit Encryption (TLS / SSL)')}</span>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  isTlsActive
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : tlsInfo?.unverified
                    ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                }`}
              >
                {isTlsActive
                  ? t('security.tlsEncrypted', 'TLS Encrypted')
                  : tlsInfo?.unverified
                  ? t('security.tlsUnverified', 'Unknown / Unverified')
                  : t('security.unencryptedPlaintext', 'Unencrypted / Plaintext')}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="rounded-lg bg-white p-2.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-900/60">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">{t('security.protocolVersion', 'Protocol Version')}</div>
                <div className="font-mono font-bold text-slate-800 dark:text-slate-100 text-xs mt-0.5">
                  {tlsInfo?.protocol || 'Unknown'}
                </div>
              </div>

              <div className="rounded-lg bg-white p-2.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-900/60">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">{t('security.keyStrength', 'Key Strength')}</div>
                <div className="font-mono font-bold text-slate-800 dark:text-slate-100 text-xs mt-0.5">
                  {tlsInfo?.keyBits ? `${tlsInfo.keyBits}-bit Encryption` : 'Unknown'}
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-white p-2.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-900/60">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">{t('security.cipherSuite', 'Cipher Suite')}</div>
              <div className="font-mono text-slate-700 dark:text-slate-300 text-[11px] mt-0.5 break-all">
                {tlsInfo?.cipherSuite || 'Unknown'}
              </div>
            </div>
          </div>

          {/* At-Rest Encryption Section */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200">
                <HardDrive className="h-4 w-4 text-indigo-500" />
                <span>{t('security.atRestTitle', 'At-Rest Encryption (Data Storage)')}</span>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  atRestInfo?.isEncrypted
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : atRestInfo?.status === 'unknown'
                    ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                }`}
              >
                {atRestInfo?.isEncrypted
                  ? t('security.encryptedTde', 'Encrypted (TDE Active)')
                  : atRestInfo?.status === 'unknown'
                  ? t('security.unknownUnsupported', 'Unknown / Unsupported')
                  : t('security.unencryptedAtRest', 'Unencrypted at Rest')}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2.5 rounded-lg bg-white p-3 border border-slate-200 dark:border-slate-700 dark:bg-slate-900/60">
                <div className="flex items-start gap-2.5">
                  <KeyRound className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-1 flex-1">
                    <div className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2 flex-wrap">
                      {t('security.localVaultTitle', 'Local Credential Vault (AES-256-GCM)')}
                      <span className="rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-400 px-1.5 py-0.2">
                        {hasMasterPassword ? 'Master Password (DCV2 Argon2id)' : 'Machine-Bound (DCV1)'}
                      </span>
                      <span className="rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-400 px-1.5 py-0.2">
                        POSIX 0600
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {hasMasterPassword
                        ? 'Credentials in ~/.datacore/vault.enc are protected with your Master Password (Argon2id + AES-256-GCM).'
                        : 'Credentials in ~/.datacore/vault.enc use machine-bound obfuscation (DCV1). Set a Master Password for full Argon2id encryption.'}
                    </p>
                    <div className="pt-1 flex items-center gap-2 flex-wrap">
                      {!hasMasterPassword ? (
                        <button
                          type="button"
                          onClick={() => {
                            setMasterPwdMode(masterPwdMode === 'set' ? 'none' : 'set');
                            setPwdError(null);
                          }}
                          className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                        >
                          Set Master Password
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setMasterPwdMode(masterPwdMode === 'change' ? 'none' : 'change');
                              setPwdError(null);
                            }}
                            className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          >
                            Change Master Password
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMasterPwdMode(masterPwdMode === 'remove' ? 'none' : 'remove');
                              setPwdError(null);
                            }}
                            className="rounded border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                          >
                            Remove Master Password
                          </button>
                        </>
                      )}
                    </div>
                    {masterPwdMode !== 'none' && (
                      <form onSubmit={handleMasterPasswordSubmit} className="pt-2 space-y-2 border-t border-slate-100 dark:border-slate-800 mt-1">
                        <input
                          type="password"
                          value={pwdInput1}
                          onChange={(e) => setPwdInput1(e.target.value)}
                          placeholder={
                            masterPwdMode === 'set'
                              ? 'Enter new Master Password'
                              : masterPwdMode === 'change'
                              ? 'Current Master Password'
                              : 'Confirm current Master Password'
                          }
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                        />
                        {masterPwdMode === 'change' && (
                          <input
                            type="password"
                            value={pwdInput2}
                            onChange={(e) => setPwdInput2(e.target.value)}
                            placeholder="New Master Password"
                            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                          />
                        )}
                        {pwdError && <p className="text-[10px] text-rose-500">{pwdError}</p>}
                        <div className="flex items-center gap-2">
                          <button
                            type="submit"
                            disabled={isSavingPwd}
                            className="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {isSavingPwd ? 'Saving...' : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMasterPwdMode('none');
                              setPwdInput1('');
                              setPwdInput2('');
                              setPwdError(null);
                            }}
                            className="rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-600 dark:border-slate-700 dark:text-slate-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                    <div className="pt-1.5 flex items-center gap-2 text-[11px]">
                      <span className="text-slate-600 dark:text-slate-300 font-medium">
                        {t('security.keychainSyncLabel', 'macOS Keychain Sync (Opt-In):')}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isKeychainOptIn}
                        aria-label="Toggle macOS Keychain Sync"
                        onClick={handleToggleKeychain}
                        disabled={isTogglingKeychain || !hasMasterPassword}
                        className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                          isKeychainOptIn ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            isKeychainOptIn ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                      <span className="text-[10px] text-slate-400">
                        {!hasMasterPassword
                          ? 'Requires Master Password'
                          : isKeychainOptIn
                          ? t('security.enabledKeychain', 'Enabled (Keychain Synced)')
                          : t('security.disabledIsolated', 'Disabled (Isolated Vault)')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-lg bg-white p-3 border border-slate-200 dark:border-slate-700 dark:bg-slate-900/60">
                <EyeOff className={`h-4 w-4 shrink-0 mt-0.5 ${screenProtectionEnabled ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-400'}`} />
                <div className="space-y-0.5 flex-1">
                  <div className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    {t('security.screenProtectionTitle', 'Screen Sharing Protection (Privacy Mode)')}
                    <span className="rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-400 px-1.5 py-0.2">
                      macOS
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t('security.screenProtectionDesc', 'Hides the DataCore window from screen-sharing and recording apps (such as Zoom, Teams, OBS, or QuickTime).')}
                  </p>
                  <div className="pt-1.5 flex items-center gap-2 text-[11px]">
                    <span className="text-slate-600 dark:text-slate-300 font-medium">
                      {t('security.screenProtectionLabel', 'Prevent Screen Capture:')}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={screenProtectionEnabled}
                      aria-label="Toggle Screen Sharing Protection"
                      onClick={() => void toggleScreenProtection()}
                      disabled={isUpdatingScreenProtection}
                      className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                        screenProtectionEnabled ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          screenProtectionEnabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <span className="text-[10px] text-slate-400">
                      {screenProtectionEnabled
                        ? t('security.screenProtectionEnabled', 'Protected (Hidden from Screen Share)')
                        : t('security.screenProtectionDisabled', 'Disabled (Visible to Screen Share)')}
                    </span>
                  </div>
                  {screenProtectionError && (
                    <p className="text-[10px] text-rose-500 pt-1">{screenProtectionError}</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-lg bg-white p-3 border border-slate-200 dark:border-slate-700 dark:bg-slate-900/60">
                {atRestInfo?.isEncrypted ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                ) : atRestInfo?.status === 'unknown' ? (
                  <AlertCircle className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5">
                  <div className="font-medium text-slate-800 dark:text-slate-200">
                    {atRestInfo?.technology || 'Database Storage Security'}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {atRestInfo?.details || 'Database files and tablespaces are unencrypted.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-right dark:border-slate-800 dark:bg-slate-900/60">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {t('common.close', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
};
