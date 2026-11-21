import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, ShieldCheck, FolderOpen, Terminal, Sliders, Shield } from 'lucide-react';
import type { DatabaseDriver } from '../../types/db';
import { pickSqliteDatabaseFile } from '../../utils/dialog';

export interface ConnectionFormData {
  name: string;
  driver: DatabaseDriver;
  host: string;
  port: number | string;
  database: string;
  user: string;
  password?: string;
  rememberPassword?: boolean;
  folder?: string;
  environment?: 'development' | 'staging' | 'production' | string;
  readOnly?: boolean;
  sslMode?: string;
  // SSL Certs
  caCertPath?: string;
  clientCertPath?: string;
  clientKeyPath?: string;
  // SSH Tunnel
  sshEnabled?: boolean;
  sshHost?: string;
  sshPort?: number | string;
  sshUser?: string;
  sshAuthType?: 'password' | 'key';
  sshPrivateKeyPath?: string;
  sshPassphrase?: string;
  // Advanced
  timeoutSeconds?: number | string;
  autoReconnect?: boolean;
}

export interface DriverFormProps {
  driver: DatabaseDriver;
  formData: ConnectionFormData;
  onChange: <K extends keyof ConnectionFormData>(field: K, value: ConnectionFormData[K]) => void;
  errors?: Partial<Record<keyof ConnectionFormData, string>>;
  disabled?: boolean;
  isEditing?: boolean;
}

export const DriverForm: React.FC<DriverFormProps> = ({
  driver,
  formData,
  onChange,
  errors = {},
  disabled = false,
  isEditing = false,
}) => {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [subTab, setSubTab] = useState<'general' | 'ssl' | 'ssh' | 'advanced'>('general');

  const handleBrowseFile = async () => {
    const selected = await pickSqliteDatabaseFile();
    if (selected) {
      onChange('database', selected);
      // Auto-suggest connection name if currently empty
      if (!formData.name.trim()) {
        const fileName = selected.split(/[/\\]/).pop() || '';
        if (fileName) {
          onChange('name', fileName);
        }
      }
    }
  };

  return (
    <div className="space-y-4 text-sm text-text">
      {/* General Settings: Connection Name & Folder */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="conn-name" className="block text-xs font-medium text-text mb-1">
            {t('connection.connectionName', 'Connection Name')} <span className="text-danger">*</span>
          </label>
          <input
            id="conn-name"
            type="text"
            value={formData.name}
            onChange={(e) => onChange('name', e.target.value)}
            disabled={disabled}
            placeholder={t('connection.connectionNamePlaceholder', 'e.g. Production Database')}
            className={`w-full px-3 py-1.5 rounded bg-[var(--bg-input)] border ${
              errors.name ? 'border-danger' : 'border-border focus:border-accent'
            } text-text placeholder:text-muted focus:outline-none transition-colors text-xs`}
          />
          {errors.name && <p className="mt-1 text-xs text-danger">{errors.name}</p>}
        </div>

        <div>
          <label htmlFor="conn-folder" className="block text-xs font-medium text-text mb-1">
            {t('connection.folder', 'Folder (Optional)')}
          </label>
          <input
            id="conn-folder"
            type="text"
            value={formData.folder || ''}
            onChange={(e) => onChange('folder', e.target.value)}
            disabled={disabled}
            placeholder={t('connection.folderPlaceholder', 'e.g. Production, Analytics')}
            className="w-full px-3 py-1.5 rounded bg-[var(--bg-input)] border border-border focus:border-accent text-text placeholder:text-muted focus:outline-none transition-colors text-xs"
          />
        </div>
      </div>

      {/* Environment & Read-Only Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <div>
          <label htmlFor="conn-environment" className="block text-xs font-medium text-text mb-1">
            {t('connection.environment', 'Environment')}
          </label>
          <select
            id="conn-environment"
            aria-label="Environment"
            value={formData.environment || ''}
            onChange={(e) =>
              onChange('environment', (e.target.value as 'development' | 'staging' | 'production' | '') || undefined)
            }
            disabled={disabled}
            className="w-full px-3 py-1.5 rounded bg-[var(--bg-input)] border border-border focus:border-accent text-text focus:outline-none transition-colors text-xs"
          >
            <option value="">{t('connection.envNone', 'None (Default)')}</option>
            <option value="development">{t('connection.envDevelopment', 'Development')}</option>
            <option value="staging">{t('connection.envStaging', 'Staging')}</option>
            <option value="production">{t('connection.envProduction', 'Production')}</option>
          </select>
        </div>

        <div className="pt-1 md:pt-5">
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              id="conn-readonly"
              type="checkbox"
              aria-label="Read-Only Mode"
              checked={formData.readOnly ?? false}
              onChange={(e) => onChange('readOnly', e.target.checked)}
              disabled={disabled}
              className="mt-0.5 rounded bg-[var(--bg-input)] border-border text-blue-600 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 shrink-0"
            />
            <div className="leading-tight">
              <div className="text-xs text-text font-medium">{t('connection.readOnlyMode', 'Read-Only Mode')}</div>
              <div className="text-[11px] text-muted mt-0.5">{t('connection.readOnlyDesc', 'Enforce read-only queries')}</div>
            </div>
          </label>
        </div>
      </div>

      {driver !== 'sqlite' && driver !== 'duckdb' && (
        <div className="flex border-b border-line text-xs gap-4 pt-1">
          <button
            type="button"
            onClick={() => setSubTab('general')}
            className={`pb-2 font-medium flex items-center gap-1.5 transition-colors border-b-2 ${
              subTab === 'general'
                ? 'text-accent border-accent'
                : 'text-muted border-transparent hover:text-text'
            }`}
          >
            <span>{t('connection.generalTab', 'General')}</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('ssl')}
            className={`pb-2 font-medium flex items-center gap-1.5 transition-colors border-b-2 ${
              subTab === 'ssl'
                ? 'text-accent border-accent'
                : 'text-muted border-transparent hover:text-text'
            }`}
          >
            <Shield size={13} />
            <span>{t('connection.sslCertsTab', 'SSL / TLS Certificates')}</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('ssh')}
            className={`pb-2 font-medium flex items-center gap-1.5 transition-colors border-b-2 ${
              subTab === 'ssh'
                ? 'text-accent border-accent'
                : 'text-muted border-transparent hover:text-text'
            }`}
          >
            <Terminal size={13} />
            <span>{t('connection.sshTunnel', 'SSH Tunnel')}</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('advanced')}
            className={`pb-2 font-medium flex items-center gap-1.5 transition-colors border-b-2 ${
              subTab === 'advanced'
                ? 'text-accent border-accent'
                : 'text-muted border-transparent hover:text-text'
            }`}
          >
            <Sliders size={13} />
            <span>{t('connection.advancedTab', 'Advanced')}</span>
          </button>
        </div>
      )}

      <div className="pt-1">
        {/* SQLite / DuckDB Driver Form */}
        {(driver === 'sqlite' || driver === 'duckdb') && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="conn-database" className="block text-xs font-medium text-text">
                {driver === 'duckdb' ? t('connection.duckdbPathLabel', 'DuckDB File / Memory / Parquet') : t('connection.databasePathLabel', 'Database Path')} <span className="text-danger">*</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="conn-database"
                  type="text"
                  value={formData.database}
                  onChange={(e) => onChange('database', e.target.value)}
                  disabled={disabled}
                  placeholder={driver === 'duckdb' ? ':memory: or path to .duckdb / .parquet / .csv file' : ':memory: or select a .db/.sqlite file'}
                  className={`flex-1 px-3 py-1.5 rounded bg-[var(--bg-input)] border ${
                    errors.database ? 'border-danger' : 'border-border focus:border-accent'
                  } text-text placeholder:text-muted focus:outline-none transition-colors text-xs font-mono`}
                />
                <button
                  type="button"
                  onClick={handleBrowseFile}
                  disabled={disabled}
                  title={driver === 'duckdb' ? 'Browse database file or dataset from disk' : 'Browse SQLite file from disk'}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  <FolderOpen size={14} />
                  <span>{t('connection.browse', 'Browse...')}</span>
                </button>
              </div>
              {errors.database ? (
                <p className="mt-1 text-xs text-danger">{errors.database}</p>
              ) : (
                <p className="mt-1 text-xs text-muted flex items-center gap-1">
                  <span>{t('connection.clickBrowseOrMemory', 'Click Browse or use in-memory mode')}</span>
                  <button
                    type="button"
                    onClick={() => onChange('database', ':memory:')}
                    className="text-accent hover:underline font-mono inline"
                  >
                    :memory:
                  </button>
                </p>
              )}
            </div>

            <div className="border-t border-line pt-3">
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formData.autoReconnect ?? true}
                  onChange={(e) => onChange('autoReconnect', e.target.checked)}
                  disabled={disabled}
                  className="rounded bg-[var(--bg-input)] border-border text-blue-600 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5"
                />
                <span className="text-xs text-text">{t('connection.autoReconnectLabel', 'Auto-reconnect on connection loss')}</span>
              </label>
            </div>
          </div>
        )}

        {/* Postgres / MySQL / MSSQL Driver Form */}
        {(driver === 'postgres' || driver === 'mysql' || driver === 'mssql') && (
          <div>
            {/* SubTab: General */}
            {subTab === 'general' && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-9">
                    <label htmlFor="conn-host" className="block text-xs font-medium text-text mb-1">
                      {t('connection.host', 'Host')} <span className="text-danger">*</span>
                    </label>
                    <input
                      id="conn-host"
                      type="text"
                      value={formData.host}
                      onChange={(e) => onChange('host', e.target.value)}
                      disabled={disabled}
                      placeholder="127.0.0.1"
                      className={`w-full px-3 py-1.5 rounded bg-[var(--bg-input)] border ${
                        errors.host ? 'border-danger' : 'border-border focus:border-accent'
                      } text-text placeholder:text-muted focus:outline-none transition-colors text-xs`}
                    />
                    {errors.host && <p className="mt-1 text-xs text-danger">{errors.host}</p>}
                  </div>

                  <div className="md:col-span-3">
                    <label htmlFor="conn-port" className="block text-xs font-medium text-text mb-1">
                      {t('connection.port', 'Port')} <span className="text-danger">*</span>
                    </label>
                    <input
                      id="conn-port"
                      type="number"
                      value={formData.port}
                      onChange={(e) => onChange('port', e.target.value)}
                      disabled={disabled}
                      placeholder={driver === 'postgres' ? '5432' : driver === 'mysql' ? '3306' : '1433'}
                      className={`w-full px-3 py-1.5 rounded bg-[var(--bg-input)] border [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                        errors.port ? 'border-danger' : 'border-border focus:border-accent'
                      } text-text placeholder:text-muted focus:outline-none transition-colors text-xs font-mono`}
                    />
                    {errors.port && <p className="mt-1 text-xs text-danger">{errors.port}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="conn-database" className="block text-xs font-medium text-text mb-1">
                      {t('connection.database', 'Database')} <span className="text-danger">*</span>
                    </label>
                    <input
                      id="conn-database"
                      type="text"
                      value={formData.database}
                      onChange={(e) => onChange('database', e.target.value)}
                      disabled={disabled}
                      placeholder={driver === 'postgres' ? 'postgres' : driver === 'mysql' ? 'database_name' : 'master'}
                      className={`w-full px-3 py-1.5 rounded bg-[var(--bg-input)] border ${
                        errors.database ? 'border-danger' : 'border-border focus:border-accent'
                      } text-text placeholder:text-muted focus:outline-none transition-colors text-xs`}
                    />
                    {errors.database && <p className="mt-1 text-xs text-danger">{errors.database}</p>}
                  </div>

                  <div>
                    <label htmlFor="conn-user" className="block text-xs font-medium text-text mb-1">
                      {t('connection.username', 'Username')} <span className="text-danger">*</span>
                    </label>
                    <input
                      id="conn-user"
                      type="text"
                      value={formData.user}
                      onChange={(e) => onChange('user', e.target.value)}
                      disabled={disabled}
                      placeholder={driver === 'postgres' ? 'postgres' : driver === 'mysql' ? 'root' : 'sa'}
                      className={`w-full px-3 py-1.5 rounded bg-[var(--bg-input)] border ${
                        errors.user ? 'border-danger' : 'border-border focus:border-accent'
                      } text-text placeholder:text-muted focus:outline-none transition-colors text-xs`}
                    />
                    {errors.user && <p className="mt-1 text-xs text-danger">{errors.user}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="conn-password" className="block text-xs font-medium text-text mb-1">
                      {t('connection.password', 'Password')}
                    </label>
                    <div className="relative">
                      <input
                        id="conn-password"
                        type={showPassword ? 'text' : 'password'}
                        value={formData.password || ''}
                        onChange={(e) => onChange('password', e.target.value)}
                        disabled={disabled}
                        placeholder={isEditing ? t('connection.leaveBlankKeepPassword', 'Leave blank to keep existing password') : '••••••••'}
                        className="w-full pl-3 pr-8 py-1.5 rounded bg-[var(--bg-input)] border border-border focus:border-accent text-text placeholder:text-muted focus:outline-none transition-colors text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        tabIndex={-1}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-text p-0.5 transition-colors"
                        title={showPassword ? 'Hide password' : 'Show password'}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="conn-ssl" className="block text-xs font-medium text-text mb-1">
                      {t('connection.sslMode', 'SSL Mode')}
                    </label>
                    <select
                      id="conn-ssl"
                      value={formData.sslMode || 'prefer'}
                      onChange={(e) => onChange('sslMode', e.target.value)}
                      disabled={disabled}
                      className="w-full px-3 py-1.5 rounded bg-[var(--bg-input)] border border-border focus:border-accent text-text focus:outline-none transition-colors text-xs"
                    >
                      <option value="disable">{t('connection.sslDisableDesc', 'disable (Plaintext - No encryption)')}</option>
                      <option value="prefer">{t('connection.sslPreferDesc', 'prefer (Attempt TLS, fallback to unencrypted)')}</option>
                      <option value="require">{t('connection.sslRequireDesc', 'require (Enforce TLS encryption)')}</option>
                      <option value="verify-ca">{t('connection.sslVerifyCaDesc', 'verify-ca (Verify Certificate Authority)')}</option>
                      <option value="verify-full">{t('connection.sslVerifyFullDesc', 'verify-full (Verify CA & Server Hostname)')}</option>
                    </select>
                  </div>
                </div>

                {/* Remember Password & Local Vault Status (Full-Width Row) */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                  <label className="flex items-center space-x-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      id="conn-remember-password"
                      checked={formData.rememberPassword ?? true}
                      onChange={(e) => onChange('rememberPassword', e.target.checked)}
                      disabled={disabled}
                      className="rounded bg-[var(--bg-input)] border-border text-blue-600 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer"
                    />
                    <span className="text-xs text-text font-medium">
                      {t('connection.rememberPassword', 'Remember password')}
                    </span>
                  </label>
                  <div className="flex items-center space-x-1 text-[11px] text-success">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>{t('connection.savedInLocalVault', 'Saved in local encrypted vault (No OS Keychain access)')}</span>
                  </div>
                </div>
              </div>
            )}

            {/* SubTab: SSL / TLS Certificates */}
            {subTab === 'ssl' && (
              <div className="space-y-3 py-1">
                <p className="text-xs text-muted">
                  {t('connection.sslCertsDesc', 'Configure CA certificate and mutual TLS (mTLS) client certificate files.')}
                </p>
                <div>
                  <label htmlFor="conn-ca-cert" className="block text-xs font-medium text-text mb-1">
                    {t('connection.caCertPath', 'CA Certificate Path (root.crt / ca.pem)')}
                  </label>
                  <input
                    id="conn-ca-cert"
                    type="text"
                    value={formData.caCertPath || ''}
                    onChange={(e) => onChange('caCertPath', e.target.value)}
                    disabled={disabled}
                    placeholder="/path/to/server-ca.pem"
                    className="w-full px-3 py-1.5 rounded bg-[var(--bg-input)] border border-border focus:border-accent text-text placeholder:text-muted focus:outline-none transition-colors text-xs font-mono"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="conn-client-cert" className="block text-xs font-medium text-text mb-1">
                      {t('connection.clientCertPath', 'Client Certificate Path (client.crt)')}
                    </label>
                    <input
                      id="conn-client-cert"
                      type="text"
                      value={formData.clientCertPath || ''}
                      onChange={(e) => onChange('clientCertPath', e.target.value)}
                      disabled={disabled}
                      placeholder="/path/to/client-cert.pem"
                      className="w-full px-3 py-1.5 rounded bg-[var(--bg-input)] border border-border focus:border-accent text-text placeholder:text-muted focus:outline-none transition-colors text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="conn-client-key" className="block text-xs font-medium text-text mb-1">
                      {t('connection.clientKeyPath', 'Client Key Path (client.key)')}
                    </label>
                    <input
                      id="conn-client-key"
                      type="text"
                      value={formData.clientKeyPath || ''}
                      onChange={(e) => onChange('clientKeyPath', e.target.value)}
                      disabled={disabled}
                      placeholder="/path/to/client-key.pem"
                      className="w-full px-3 py-1.5 rounded bg-[var(--bg-input)] border border-border focus:border-accent text-text placeholder:text-muted focus:outline-none transition-colors text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* SubTab: SSH Tunnel */}
            {subTab === 'ssh' && (
              <div className="space-y-3 py-1">
                <label className="flex items-center space-x-2 cursor-pointer select-none mb-2">
                  <input
                    type="checkbox"
                    id="conn-ssh-enabled"
                    checked={formData.sshEnabled || false}
                    onChange={(e) => onChange('sshEnabled', e.target.checked)}
                    disabled={disabled}
                    className="rounded bg-[var(--bg-input)] border-border text-blue-600 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5"
                  />
                  <span className="text-xs text-text font-medium">{t('connection.sshEnable', 'Use SSH Tunnel (Bastion / Jump Host)')}</span>
                </label>

                {formData.sshEnabled && (
                  <div className="space-y-3 pl-2 border-l-2 border-blue-500/30">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-2">
                        <label htmlFor="conn-ssh-host" className="block text-xs font-medium text-text mb-1">
                          {t('connection.sshHost', 'SSH Host')}
                        </label>
                        <input
                          id="conn-ssh-host"
                          type="text"
                          value={formData.sshHost || ''}
                          onChange={(e) => onChange('sshHost', e.target.value)}
                          disabled={disabled}
                          placeholder="bastion.example.com"
                          className="w-full px-3 py-1.5 rounded bg-[var(--bg-input)] border border-border focus:border-accent text-text placeholder:text-muted focus:outline-none transition-colors text-xs"
                        />
                      </div>
                      <div>
                        <label htmlFor="conn-ssh-port" className="block text-xs font-medium text-text mb-1">
                          {t('connection.sshPort', 'SSH Port')}
                        </label>
                        <input
                          id="conn-ssh-port"
                          type="number"
                          value={formData.sshPort || 22}
                          onChange={(e) => onChange('sshPort', e.target.value)}
                          disabled={disabled}
                          placeholder="22"
                          className="w-full px-3 py-1.5 rounded bg-[var(--bg-input)] border border-border focus:border-accent text-text placeholder:text-muted focus:outline-none transition-colors text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="conn-ssh-user" className="block text-xs font-medium text-text mb-1">
                          {t('connection.sshUser', 'SSH User')}
                        </label>
                        <input
                          id="conn-ssh-user"
                          type="text"
                          value={formData.sshUser || ''}
                          onChange={(e) => onChange('sshUser', e.target.value)}
                          disabled={disabled}
                          placeholder="ec2-user / ubuntu"
                          className="w-full px-3 py-1.5 rounded bg-[var(--bg-input)] border border-border focus:border-accent text-text placeholder:text-muted focus:outline-none transition-colors text-xs"
                        />
                      </div>
                      <div>
                        <label htmlFor="conn-ssh-auth" className="block text-xs font-medium text-text mb-1">
                          {t('connection.sshAuthMethod', 'Authentication Method')}
                        </label>
                        <select
                          id="conn-ssh-auth"
                          value={formData.sshAuthType || 'key'}
                          onChange={(e) => onChange('sshAuthType', e.target.value as 'password' | 'key')}
                          disabled={disabled}
                          className="w-full px-3 py-1.5 rounded bg-[var(--bg-input)] border border-border focus:border-accent text-text focus:outline-none transition-colors text-xs"
                        >
                          <option value="key">{t('connection.sshAuthKey', 'Private Key')}</option>
                          <option value="password">{t('connection.sshAuthPassword', 'Password')}</option>
                        </select>
                      </div>
                    </div>

                    {formData.sshAuthType === 'key' ? (
                      <div className="space-y-3">
                        <div>
                          <label htmlFor="conn-ssh-key" className="block text-xs font-medium text-text mb-1">
                            {t('connection.sshPrivateKeyPath', 'Private Key Path')}
                          </label>
                          <input
                            id="conn-ssh-key"
                            type="text"
                            value={formData.sshPrivateKeyPath || ''}
                            onChange={(e) => onChange('sshPrivateKeyPath', e.target.value)}
                            disabled={disabled}
                            placeholder="~/.ssh/id_rsa or /path/to/key.pem"
                            className="w-full px-3 py-1.5 rounded bg-[var(--bg-input)] border border-border focus:border-accent text-text placeholder:text-muted focus:outline-none transition-colors text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label htmlFor="conn-ssh-passphrase" className="block text-xs font-medium text-text mb-1">
                            {t('connection.sshKeyPassphrase', 'Key Passphrase (Optional)')}
                          </label>
                          <input
                            id="conn-ssh-passphrase"
                            type="password"
                            value={formData.sshPassphrase || ''}
                            onChange={(e) => onChange('sshPassphrase', e.target.value)}
                            disabled={disabled}
                            placeholder={t('connection.sshPassphrasePlaceholder', 'Passphrase if encrypted')}
                            className="w-full px-3 py-1.5 rounded bg-[var(--bg-input)] border border-border focus:border-accent text-text placeholder:text-muted focus:outline-none transition-colors text-xs"
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label htmlFor="conn-ssh-password" className="block text-xs font-medium text-text mb-1">
                          {t('connection.sshPassword', 'SSH Password')}
                        </label>
                        <input
                          id="conn-ssh-password"
                          type="password"
                          value={formData.sshPassphrase || ''}
                          onChange={(e) => onChange('sshPassphrase', e.target.value)}
                          disabled={disabled}
                          placeholder="SSH Password"
                          className="w-full px-3 py-1.5 rounded bg-[var(--bg-input)] border border-border focus:border-accent text-text placeholder:text-muted focus:outline-none transition-colors text-xs"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SubTab: Advanced */}
            {subTab === 'advanced' && (
              <div className="space-y-3 py-1">
                <div>
                  <label htmlFor="conn-timeout" className="block text-xs font-medium text-text mb-1">
                    {t('connection.connectionTimeoutLabel', 'Connection Timeout (seconds)')}
                  </label>
                  <input
                    id="conn-timeout"
                    type="number"
                    value={formData.timeoutSeconds ?? ''}
                    onChange={(e) => onChange('timeoutSeconds', e.target.value)}
                    disabled={disabled}
                    placeholder="15 (Default)"
                    className="w-full px-3 py-1.5 rounded bg-[var(--bg-input)] border border-border focus:border-accent text-text placeholder:text-muted focus:outline-none transition-colors text-xs"
                  />
                  <p className="mt-1 text-xs text-muted">
                    {t('connection.connectionTimeoutDesc', 'Maximum time to establish connection before aborting.')}
                  </p>
                </div>

                <div className="pt-2">
                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      id="conn-auto-reconnect"
                      checked={formData.autoReconnect ?? true}
                      onChange={(e) => onChange('autoReconnect', e.target.checked)}
                      disabled={disabled}
                      className="rounded bg-[var(--bg-input)] border-border text-blue-600 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5"
                    />
                    <span className="text-xs text-text font-medium">{t('connection.autoReconnectLabel', 'Auto-reconnect on connection loss')}</span>
                  </label>
                  <p className="mt-1 text-xs text-muted pl-5">
                    {t('connection.autoReconnectDesc', 'Automatically re-establishes session connection if disconnected unexpectedly.')}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
