import React, { useState, useEffect, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, CheckCircle2, AlertCircle, Loader2, Database, PlugZap } from 'lucide-react';
import { toast } from 'sonner';
import { DriverForm, type ConnectionFormData } from './DriverForm';
import { validateConnectionForm } from '../../schemas/connectionSchema';
import { useConnectionStore } from '../../stores/connectionStore';
import { dbApi } from '../../api/db';
import type { ConnectionConfig, DatabaseDriver } from '../../types/db';

export interface ConnectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialConnection?: ConnectionConfig | null;
  onSaved?: (connection: ConnectionConfig) => void;
}

type TestStatus =
  | { type: 'idle' }
  | { type: 'testing' }
  | { type: 'success'; latency: number }
  | { type: 'error'; message: string };

function getDefaultFormData(driver: DatabaseDriver): ConnectionFormData {
  const base = {
    caCertPath: '',
    clientCertPath: '',
    clientKeyPath: '',
    sshEnabled: false,
    sshHost: '',
    sshPort: 22,
    sshUser: '',
    sshAuthType: 'key' as const,
    sshPrivateKeyPath: '',
    sshPassphrase: '',
    timeoutSeconds: '',
    autoReconnect: true,
  };

  switch (driver) {
    case 'postgres':
      return {
        ...base,
        name: '',
        driver: 'postgres',
        host: '127.0.0.1',
        port: 5432,
        database: '',
        user: 'postgres',
        password: '',
        folder: '',
        sslMode: 'prefer',
      };
    case 'mysql':
      return {
        ...base,
        name: '',
        driver: 'mysql',
        host: '127.0.0.1',
        port: 3306,
        database: '',
        user: 'root',
        password: '',
        folder: '',
        sslMode: 'prefer',
      };
    case 'sqlite':
    default:
      return {
        ...base,
        name: '',
        driver: 'sqlite',
        host: '',
        port: '',
        database: '',
        user: '',
        password: '',
        folder: '',
        sslMode: 'prefer',
      };
  }
}

function initializeFormData(initial?: ConnectionConfig | null): ConnectionFormData {
  if (!initial) {
    return getDefaultFormData('sqlite');
  }

  const sslCerts = initial.ssl_certs || initial.sslCerts;
  const ssh = initial.ssh_tunnel || initial.sshTunnel;

  return {
    name: initial.name || '',
    driver: initial.driver,
    host: initial.host ?? (initial.driver === 'postgres' ? '127.0.0.1' : initial.driver === 'mysql' ? '127.0.0.1' : ''),
    port: initial.port ?? (initial.driver === 'postgres' ? 5432 : initial.driver === 'mysql' ? 3306 : ''),
    database: initial.database || '',
    user: initial.user ?? (initial.driver === 'postgres' ? 'postgres' : initial.driver === 'mysql' ? 'root' : ''),
    password: '',
    folder: initial.folder || '',
    sslMode: initial.ssl_mode || initial.sslMode || 'prefer',
    caCertPath: sslCerts?.ca_cert_path || sslCerts?.caCertPath || '',
    clientCertPath: sslCerts?.client_cert_path || sslCerts?.clientCertPath || '',
    clientKeyPath: sslCerts?.client_key_path || sslCerts?.clientKeyPath || '',
    sshEnabled: ssh?.enabled ?? false,
    sshHost: ssh?.host || '',
    sshPort: ssh?.port || 22,
    sshUser: ssh?.user || '',
    sshAuthType: (ssh?.auth_type || ssh?.authType || 'key') as 'password' | 'key',
    sshPrivateKeyPath: ssh?.private_key_path || ssh?.privateKeyPath || '',
    sshPassphrase: ssh?.passphrase || '',
    timeoutSeconds: initial.timeout_seconds ?? initial.timeoutSeconds ?? '',
    autoReconnect: initial.auto_reconnect ?? initial.autoReconnect ?? true,
  };
}

export const ConnectionDialog: React.FC<ConnectionDialogProps> = ({
  isOpen,
  onClose,
  initialConnection,
  onSaved,
}) => {
  const addConnection = useConnectionStore((s) => s.addConnection);

  const [formData, setFormData] = useState<ConnectionFormData>(() =>
    initializeFormData(initialConnection)
  );
  const [errors, setErrors] = useState<Partial<Record<keyof ConnectionFormData, string>>>({});
  const [testStatus, setTestStatus] = useState<TestStatus>({ type: 'idle' });
  const [isSaving, setIsSaving] = useState(false);

  // Reset form when dialog opens or initialConnection changes
  useEffect(() => {
    if (isOpen) {
      setFormData(initializeFormData(initialConnection));
      setErrors({});
      setTestStatus({ type: 'idle' });
      setIsSaving(false);

      if (initialConnection?.id) {
        dbApi.getStoredPassword(initialConnection.id).then((storedPwd) => {
          if (storedPwd !== null && storedPwd !== undefined) {
            setFormData((prev) => ({
              ...prev,
              password: storedPwd,
              rememberPassword: true,
            }));
          } else {
            setFormData((prev) => ({
              ...prev,
              rememberPassword: false,
            }));
          }
        }).catch((e) => {
          console.debug('Failed to check stored password:', e);
        });
      }
    }
  }, [isOpen, initialConnection]);

  // Handle Escape key to close dialog
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleFieldChange = useCallback(
    <K extends keyof ConnectionFormData>(field: K, value: ConnectionFormData[K]) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => {
        if (prev[field]) {
          const next = { ...prev };
          delete next[field];
          return next;
        }
        return prev;
      });
    },
    []
  );

  const handleDriverSwitch = useCallback((driver: DatabaseDriver) => {
    setFormData((prev) => {
      if (prev.driver === driver) return prev;
      const defaults = getDefaultFormData(driver);
      return {
        ...prev,
        driver,
        host: prev.host && prev.driver !== 'sqlite' ? prev.host : defaults.host,
        port: defaults.port,
        user: defaults.user,
        database: prev.driver === 'sqlite' || driver === 'sqlite' ? '' : prev.database,
      };
    });
    setTestStatus({ type: 'idle' });
    setErrors({});
  }, []);

  const validateForm = (isTesting: boolean = false): boolean => {
    const { success, errors: validationErrors } = validateConnectionForm(formData, isTesting);
    setErrors(validationErrors as Partial<Record<keyof ConnectionFormData, string>>);
    return success;
  };

  const buildConnectionConfig = (): ConnectionConfig => {
    const id =
      initialConnection?.id ||
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `conn-${Date.now()}`);

    const hasSslCerts = Boolean(
      formData.caCertPath?.trim() ||
      formData.clientCertPath?.trim() ||
      formData.clientKeyPath?.trim()
    );

    const sslCerts = hasSslCerts
      ? {
          ca_cert_path: formData.caCertPath?.trim() || undefined,
          caCertPath: formData.caCertPath?.trim() || undefined,
          client_cert_path: formData.clientCertPath?.trim() || undefined,
          clientCertPath: formData.clientCertPath?.trim() || undefined,
          client_key_path: formData.clientKeyPath?.trim() || undefined,
          clientKeyPath: formData.clientKeyPath?.trim() || undefined,
        }
      : undefined;

    const sshTunnel = formData.sshEnabled
      ? {
          enabled: true,
          host: formData.sshHost?.trim() || undefined,
          port: formData.sshPort ? Number(formData.sshPort) : undefined,
          user: formData.sshUser?.trim() || undefined,
          auth_type: formData.sshAuthType || 'key',
          authType: formData.sshAuthType || 'key',
          private_key_path: formData.sshPrivateKeyPath?.trim() || undefined,
          privateKeyPath: formData.sshPrivateKeyPath?.trim() || undefined,
          passphrase: formData.sshPassphrase || undefined,
        }
      : undefined;

    const timeoutSeconds =
      formData.timeoutSeconds !== undefined && formData.timeoutSeconds !== ''
        ? Number(formData.timeoutSeconds)
        : undefined;

    return {
      id,
      name: formData.name.trim() || 'Test Connection',
      driver: formData.driver,
      host: formData.driver !== 'sqlite' ? formData.host.trim() : undefined,
      port: formData.driver !== 'sqlite' ? Number(formData.port) : undefined,
      database: formData.database.trim(),
      user: formData.driver !== 'sqlite' ? formData.user.trim() : undefined,
      folder: formData.folder?.trim() || undefined,
      ssl_mode: formData.driver !== 'sqlite' ? (formData.sslMode || 'prefer') : undefined,
      sslMode: formData.driver !== 'sqlite' ? (formData.sslMode || 'prefer') : undefined,
      ssl_certs: sslCerts,
      sslCerts,
      ssh_tunnel: sshTunnel,
      sshTunnel,
      timeout_seconds: timeoutSeconds,
      timeoutSeconds,
      auto_reconnect: formData.autoReconnect,
      autoReconnect: formData.autoReconnect,
    };
  };

  const resolvePassword = (): string | undefined => {
    if (formData.password && formData.password.length > 0) {
      return formData.password;
    }
    return initialConnection ? undefined : '';
  };

  const handleTestConnection = async () => {
    if (!validateForm(true)) return;

    setTestStatus({ type: 'testing' });
    const config = buildConnectionConfig();

    try {
      const password = resolvePassword();
      const latency = await dbApi.testConnection(config, password);
      if (password) {
        await dbApi.setSessionPassword(config.id, password).catch(() => {});
      }
      setTestStatus({ type: 'success', latency });
      toast.success(`Connection successful (${latency} ms)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestStatus({
        type: 'error',
        message: msg,
      });
      toast.error(`Connection failed: ${msg}`);
    }
  };

  const handleSave = async () => {
    if (!validateForm(false)) return;

    setIsSaving(true);
    const config = buildConnectionConfig();

    try {
      const password = resolvePassword();
      if (formData.rememberPassword === false) {
        // User chose not to remember password on disk (Local Encrypted Vault).
        // Remove from persistent vault storage, but keep in RAM session memory.
        await dbApi.deleteStoredPassword(config.id).catch(() => {});
        await addConnection(config, undefined);
        if (password) {
          await dbApi.setSessionPassword(config.id, password).catch(() => {});
        }
      } else {
        await addConnection(config, password);
        if (password) {
          await dbApi.setSessionPassword(config.id, password).catch(() => {});
        }
      }
      toast.success(`Connection "${config.name}" saved successfully`);
      if (onSaved) {
        onSaved(config);
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestStatus({
        type: 'error',
        message: msg,
      });
      toast.error(`Failed to save connection: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        {/* Backdrop */}
        <Dialog.Overlay
          data-testid="connection-dialog-backdrop"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />

        {/* Modal Container */}
        <Dialog.Content
          aria-describedby="connection-dialog-desc"
          className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl bg-gray-900 border border-gray-700 rounded-lg shadow-2xl flex flex-col overflow-hidden max-h-[90vh] focus:outline-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 bg-gray-900/60">
            <div className="flex items-center space-x-2">
              <Database className="w-5 h-5 text-blue-400" />
              <Dialog.Title asChild>
                <h2 id="connection-dialog-title" className="text-base font-semibold text-gray-100">
                  {initialConnection ? 'Edit Connection' : 'New Connection'}
                </h2>
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description id="connection-dialog-desc" className="sr-only">
            Database connection settings form
          </Dialog.Description>

        {/* Driver Tabs Selector */}
        <div className="px-5 pt-4 bg-gray-900">
          <div
            role="tablist"
            aria-label="Driver tabs"
            className="flex space-x-1 p-1 bg-gray-950 rounded-lg border border-gray-800"
          >
            <button
              type="button"
              role="tab"
              aria-selected={formData.driver === 'sqlite'}
              onClick={() => handleDriverSwitch('sqlite')}
              className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-all ${
                formData.driver === 'sqlite'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
              }`}
            >
              SQLite
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={formData.driver === 'postgres'}
              onClick={() => handleDriverSwitch('postgres')}
              className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-all ${
                formData.driver === 'postgres'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
              }`}
            >
              PostgreSQL
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={formData.driver === 'mysql'}
              onClick={() => handleDriverSwitch('mysql')}
              className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-all ${
                formData.driver === 'mysql'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
              }`}
            >
              MySQL
            </button>
          </div>
        </div>

        {/* Body / Driver Form */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <DriverForm
            driver={formData.driver}
            formData={formData}
            onChange={handleFieldChange}
            errors={errors}
            disabled={isSaving}
            isEditing={Boolean(initialConnection)}
          />

          {/* Test Status Feedback Banner */}
          {testStatus.type === 'success' && (
            <div
              data-testid="connection-test-badge"
              className="mt-4 flex items-center space-x-2 px-3 py-2 rounded-md bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 text-xs"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span className="font-medium text-emerald-300">Success ({testStatus.latency}ms)</span>
            </div>
          )}

          {testStatus.type === 'error' && (
            <div
              data-testid="connection-test-error"
              className="mt-4 flex items-start space-x-2 px-3 py-2 rounded-md bg-rose-950/80 border border-rose-500/30 text-rose-300 text-xs"
            >
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <span className="break-all text-rose-300">{testStatus.message}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-800 bg-gray-950/50">
          <div>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testStatus.type === 'testing' || isSaving}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-medium bg-gray-800 text-gray-200 border border-gray-700 hover:bg-gray-750 hover:text-white transition-colors disabled:opacity-50"
            >
              {testStatus.type === 'testing' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Testing...</span>
                </>
              ) : (
                <>
                  <PlugZap className="w-3.5 h-3.5 text-blue-400" />
                  <span>Test Connection</span>
                </>
              )}
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <Dialog.Close asChild>
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-3.5 py-1.5 rounded text-xs font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center space-x-1.5 px-4 py-1.5 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-sm disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save</span>
              )}
            </button>
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);
};
