import React, { useState } from 'react';
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
    <div className="space-y-4 text-sm text-gray-200">
      {/* General Settings: Connection Name & Folder */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="conn-name" className="block text-xs font-medium text-gray-300 mb-1">
            Connection Name <span className="text-red-400">*</span>
          </label>
          <input
            id="conn-name"
            type="text"
            value={formData.name}
            onChange={(e) => onChange('name', e.target.value)}
            disabled={disabled}
            placeholder="e.g. Production Database"
            className={`w-full px-3 py-1.5 rounded bg-gray-800 border ${
              errors.name ? 'border-red-500' : 'border-gray-700 focus:border-blue-500'
            } text-gray-100 placeholder-gray-500 focus:outline-none transition-colors text-xs`}
          />
          {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name}</p>}
        </div>

        <div>
          <label htmlFor="conn-folder" className="block text-xs font-medium text-gray-300 mb-1">
            Folder (Optional)
          </label>
          <input
            id="conn-folder"
            type="text"
            value={formData.folder || ''}
            onChange={(e) => onChange('folder', e.target.value)}
            disabled={disabled}
            placeholder="e.g. Production, Analytics"
            className="w-full px-3 py-1.5 rounded bg-gray-800 border border-gray-700 focus:border-blue-500 text-gray-100 placeholder-gray-500 focus:outline-none transition-colors text-xs"
          />
        </div>
      </div>

      {driver !== 'sqlite' && (
        <div className="flex border-b border-gray-800 text-xs gap-4 pt-1">
          <button
            type="button"
            onClick={() => setSubTab('general')}
            className={`pb-2 font-medium flex items-center gap-1.5 transition-colors border-b-2 ${
              subTab === 'general'
                ? 'text-blue-400 border-blue-500'
                : 'text-gray-400 border-transparent hover:text-gray-200'
            }`}
          >
            <span>General</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('ssl')}
            className={`pb-2 font-medium flex items-center gap-1.5 transition-colors border-b-2 ${
              subTab === 'ssl'
                ? 'text-blue-400 border-blue-500'
                : 'text-gray-400 border-transparent hover:text-gray-200'
            }`}
          >
            <Shield size={13} />
            <span>SSL / TLS Certificates</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('ssh')}
            className={`pb-2 font-medium flex items-center gap-1.5 transition-colors border-b-2 ${
              subTab === 'ssh'
                ? 'text-blue-400 border-blue-500'
                : 'text-gray-400 border-transparent hover:text-gray-200'
            }`}
          >
            <Terminal size={13} />
            <span>SSH Tunnel</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('advanced')}
            className={`pb-2 font-medium flex items-center gap-1.5 transition-colors border-b-2 ${
              subTab === 'advanced'
                ? 'text-blue-400 border-blue-500'
                : 'text-gray-400 border-transparent hover:text-gray-200'
            }`}
          >
            <Sliders size={13} />
            <span>Advanced</span>
          </button>
        </div>
      )}

      <div className="pt-1">
        {/* SQLite Driver Form */}
        {driver === 'sqlite' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="conn-database" className="block text-xs font-medium text-gray-300">
                Database Path <span className="text-red-400">*</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="conn-database"
                  type="text"
                  value={formData.database}
                  onChange={(e) => onChange('database', e.target.value)}
                  disabled={disabled}
                  placeholder=":memory: or select a .db/.sqlite file"
                  className={`flex-1 px-3 py-1.5 rounded bg-gray-800 border ${
                    errors.database ? 'border-red-500' : 'border-gray-700 focus:border-blue-500'
                  } text-gray-100 placeholder-gray-500 focus:outline-none transition-colors text-xs font-mono`}
                />
                <button
                  type="button"
                  onClick={handleBrowseFile}
                  disabled={disabled}
                  title="Browse SQLite file from disk"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  <FolderOpen size={14} />
                  <span>Browse...</span>
                </button>
              </div>
              {errors.database ? (
                <p className="mt-1 text-xs text-red-400">{errors.database}</p>
              ) : (
                <p className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                  <span>Click <strong>Browse</strong> to select a <code>.db</code> file, or use</span>
                  <button
                    type="button"
                    onClick={() => onChange('database', ':memory:')}
                    className="text-blue-400 hover:underline font-mono inline"
                  >
                    :memory:
                  </button>
                </p>
              )}
            </div>

            <div className="border-t border-gray-800 pt-3">
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formData.autoReconnect ?? true}
                  onChange={(e) => onChange('autoReconnect', e.target.checked)}
                  disabled={disabled}
                  className="rounded bg-gray-800 border-gray-700 text-blue-600 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5"
                />
                <span className="text-xs text-gray-300">Auto-reconnect on connection loss</span>
              </label>
            </div>
          </div>
        )}

        {/* Postgres / MySQL Driver Form */}
        {(driver === 'postgres' || driver === 'mysql') && (
          <div>
            {/* SubTab: General */}
            {subTab === 'general' && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label htmlFor="conn-host" className="block text-xs font-medium text-gray-300 mb-1">
                      Host <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="conn-host"
                      type="text"
                      value={formData.host}
                      onChange={(e) => onChange('host', e.target.value)}
                      disabled={disabled}
                      placeholder="127.0.0.1"
                      className={`w-full px-3 py-1.5 rounded bg-gray-800 border ${
                        errors.host ? 'border-red-500' : 'border-gray-700 focus:border-blue-500'
                      } text-gray-100 placeholder-gray-500 focus:outline-none transition-colors text-xs`}
                    />
                    {errors.host && <p className="mt-1 text-xs text-red-400">{errors.host}</p>}
                  </div>

                  <div>
                    <label htmlFor="conn-port" className="block text-xs font-medium text-gray-300 mb-1">
                      Port <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="conn-port"
                      type="number"
                      value={formData.port}
                      onChange={(e) => onChange('port', e.target.value)}
                      disabled={disabled}
                      placeholder={driver === 'postgres' ? '5432' : '3306'}
                      className={`w-full px-3 py-1.5 rounded bg-gray-800 border ${
                        errors.port ? 'border-red-500' : 'border-gray-700 focus:border-blue-500'
                      } text-gray-100 placeholder-gray-500 focus:outline-none transition-colors text-xs`}
                    />
                    {errors.port && <p className="mt-1 text-xs text-red-400">{errors.port}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="conn-database" className="block text-xs font-medium text-gray-300 mb-1">
                      Database <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="conn-database"
                      type="text"
                      value={formData.database}
                      onChange={(e) => onChange('database', e.target.value)}
                      disabled={disabled}
                      placeholder={driver === 'postgres' ? 'postgres' : 'database_name'}
                      className={`w-full px-3 py-1.5 rounded bg-gray-800 border ${
                        errors.database ? 'border-red-500' : 'border-gray-700 focus:border-blue-500'
                      } text-gray-100 placeholder-gray-500 focus:outline-none transition-colors text-xs`}
                    />
                    {errors.database && <p className="mt-1 text-xs text-red-400">{errors.database}</p>}
                  </div>

                  <div>
                    <label htmlFor="conn-user" className="block text-xs font-medium text-gray-300 mb-1">
                      User <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="conn-user"
                      type="text"
                      value={formData.user}
                      onChange={(e) => onChange('user', e.target.value)}
                      disabled={disabled}
                      placeholder={driver === 'postgres' ? 'postgres' : 'root'}
                      className={`w-full px-3 py-1.5 rounded bg-gray-800 border ${
                        errors.user ? 'border-red-500' : 'border-gray-700 focus:border-blue-500'
                      } text-gray-100 placeholder-gray-500 focus:outline-none transition-colors text-xs`}
                    />
                    {errors.user && <p className="mt-1 text-xs text-red-400">{errors.user}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="conn-password" className="block text-xs font-medium text-gray-300 mb-1">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="conn-password"
                        type={showPassword ? 'text' : 'password'}
                        value={formData.password || ''}
                        onChange={(e) => onChange('password', e.target.value)}
                        disabled={disabled}
                        placeholder={isEditing ? 'Leave blank to keep existing password' : '••••••••'}
                        className="w-full pl-3 pr-8 py-1.5 rounded bg-gray-800 border border-gray-700 focus:border-blue-500 text-gray-100 placeholder-gray-500 focus:outline-none transition-colors text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        tabIndex={-1}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 p-0.5 transition-colors"
                        title={showPassword ? 'Hide password' : 'Show password'}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {/* Remember Password Checkbox & Security Indicator */}
                    <div className="mt-2 space-y-1">
                      <label className="flex items-center space-x-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          id="conn-remember-password"
                          checked={formData.rememberPassword ?? true}
                          onChange={(e) => onChange('rememberPassword', e.target.checked)}
                          disabled={disabled}
                          className="rounded bg-gray-800 border-gray-700 text-blue-600 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer"
                        />
                        <span className="text-[11px] text-gray-300 font-medium">
                          Remember password
                        </span>
                      </label>
                      <div className="flex items-center space-x-1 text-[10px] text-emerald-400/90 pl-5">
                        <ShieldCheck className="w-3 h-3 shrink-0" />
                        <span>Saved in local encrypted vault (No OS Keychain access)</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="conn-ssl" className="block text-xs font-medium text-gray-300 mb-1">
                      SSL Mode
                    </label>
                    <select
                      id="conn-ssl"
                      value={formData.sslMode || 'prefer'}
                      onChange={(e) => onChange('sslMode', e.target.value)}
                      disabled={disabled}
                      className="w-full px-3 py-1.5 rounded bg-gray-800 border border-gray-700 focus:border-blue-500 text-gray-100 focus:outline-none transition-colors text-xs"
                    >
                      <option value="disable">disable (Plaintext - No encryption)</option>
                      <option value="prefer">prefer (Attempt TLS, fallback to unencrypted)</option>
                      <option value="require">require (Enforce TLS encryption)</option>
                      <option value="verify-ca">verify-ca (Verify Certificate Authority)</option>
                      <option value="verify-full">verify-full (Verify CA & Server Hostname)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* SubTab: SSL / TLS Certificates */}
            {subTab === 'ssl' && (
              <div className="space-y-3 py-1">
                <p className="text-xs text-gray-400">
                  Configure CA certificate and mutual TLS (mTLS) client certificate files.
                </p>
                <div>
                  <label htmlFor="conn-ca-cert" className="block text-xs font-medium text-gray-300 mb-1">
                    CA Certificate Path (root.crt / ca.pem)
                  </label>
                  <input
                    id="conn-ca-cert"
                    type="text"
                    value={formData.caCertPath || ''}
                    onChange={(e) => onChange('caCertPath', e.target.value)}
                    disabled={disabled}
                    placeholder="/path/to/server-ca.pem"
                    className="w-full px-3 py-1.5 rounded bg-gray-800 border border-gray-700 focus:border-blue-500 text-gray-100 placeholder-gray-500 focus:outline-none transition-colors text-xs font-mono"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="conn-client-cert" className="block text-xs font-medium text-gray-300 mb-1">
                      Client Certificate Path (client.crt)
                    </label>
                    <input
                      id="conn-client-cert"
                      type="text"
                      value={formData.clientCertPath || ''}
                      onChange={(e) => onChange('clientCertPath', e.target.value)}
                      disabled={disabled}
                      placeholder="/path/to/client-cert.pem"
                      className="w-full px-3 py-1.5 rounded bg-gray-800 border border-gray-700 focus:border-blue-500 text-gray-100 placeholder-gray-500 focus:outline-none transition-colors text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="conn-client-key" className="block text-xs font-medium text-gray-300 mb-1">
                      Client Key Path (client.key)
                    </label>
                    <input
                      id="conn-client-key"
                      type="text"
                      value={formData.clientKeyPath || ''}
                      onChange={(e) => onChange('clientKeyPath', e.target.value)}
                      disabled={disabled}
                      placeholder="/path/to/client-key.pem"
                      className="w-full px-3 py-1.5 rounded bg-gray-800 border border-gray-700 focus:border-blue-500 text-gray-100 placeholder-gray-500 focus:outline-none transition-colors text-xs font-mono"
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
                    className="rounded bg-gray-800 border-gray-700 text-blue-600 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5"
                  />
                  <span className="text-xs text-gray-200 font-medium">Use SSH Tunnel (Bastion / Jump Host)</span>
                </label>

                {formData.sshEnabled && (
                  <div className="space-y-3 pl-2 border-l-2 border-blue-500/30">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-2">
                        <label htmlFor="conn-ssh-host" className="block text-xs font-medium text-gray-300 mb-1">
                          SSH Host
                        </label>
                        <input
                          id="conn-ssh-host"
                          type="text"
                          value={formData.sshHost || ''}
                          onChange={(e) => onChange('sshHost', e.target.value)}
                          disabled={disabled}
                          placeholder="bastion.example.com"
                          className="w-full px-3 py-1.5 rounded bg-gray-800 border border-gray-700 focus:border-blue-500 text-gray-100 placeholder-gray-500 focus:outline-none transition-colors text-xs"
                        />
                      </div>
                      <div>
                        <label htmlFor="conn-ssh-port" className="block text-xs font-medium text-gray-300 mb-1">
                          SSH Port
                        </label>
                        <input
                          id="conn-ssh-port"
                          type="number"
                          value={formData.sshPort || 22}
                          onChange={(e) => onChange('sshPort', e.target.value)}
                          disabled={disabled}
                          placeholder="22"
                          className="w-full px-3 py-1.5 rounded bg-gray-800 border border-gray-700 focus:border-blue-500 text-gray-100 placeholder-gray-500 focus:outline-none transition-colors text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="conn-ssh-user" className="block text-xs font-medium text-gray-300 mb-1">
                          SSH User
                        </label>
                        <input
                          id="conn-ssh-user"
                          type="text"
                          value={formData.sshUser || ''}
                          onChange={(e) => onChange('sshUser', e.target.value)}
                          disabled={disabled}
                          placeholder="ec2-user / ubuntu"
                          className="w-full px-3 py-1.5 rounded bg-gray-800 border border-gray-700 focus:border-blue-500 text-gray-100 placeholder-gray-500 focus:outline-none transition-colors text-xs"
                        />
                      </div>
                      <div>
                        <label htmlFor="conn-ssh-auth" className="block text-xs font-medium text-gray-300 mb-1">
                          Authentication Method
                        </label>
                        <select
                          id="conn-ssh-auth"
                          value={formData.sshAuthType || 'key'}
                          onChange={(e) => onChange('sshAuthType', e.target.value as 'password' | 'key')}
                          disabled={disabled}
                          className="w-full px-3 py-1.5 rounded bg-gray-800 border border-gray-700 focus:border-blue-500 text-gray-100 focus:outline-none transition-colors text-xs"
                        >
                          <option value="key">Private Key</option>
                          <option value="password">Password</option>
                        </select>
                      </div>
                    </div>

                    {formData.sshAuthType === 'key' ? (
                      <div className="space-y-3">
                        <div>
                          <label htmlFor="conn-ssh-key" className="block text-xs font-medium text-gray-300 mb-1">
                            Private Key Path
                          </label>
                          <input
                            id="conn-ssh-key"
                            type="text"
                            value={formData.sshPrivateKeyPath || ''}
                            onChange={(e) => onChange('sshPrivateKeyPath', e.target.value)}
                            disabled={disabled}
                            placeholder="~/.ssh/id_rsa or /path/to/key.pem"
                            className="w-full px-3 py-1.5 rounded bg-gray-800 border border-gray-700 focus:border-blue-500 text-gray-100 placeholder-gray-500 focus:outline-none transition-colors text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label htmlFor="conn-ssh-passphrase" className="block text-xs font-medium text-gray-300 mb-1">
                            Key Passphrase (Optional)
                          </label>
                          <input
                            id="conn-ssh-passphrase"
                            type="password"
                            value={formData.sshPassphrase || ''}
                            onChange={(e) => onChange('sshPassphrase', e.target.value)}
                            disabled={disabled}
                            placeholder="Passphrase if encrypted"
                            className="w-full px-3 py-1.5 rounded bg-gray-800 border border-gray-700 focus:border-blue-500 text-gray-100 placeholder-gray-500 focus:outline-none transition-colors text-xs"
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label htmlFor="conn-ssh-password" className="block text-xs font-medium text-gray-300 mb-1">
                          SSH Password
                        </label>
                        <input
                          id="conn-ssh-password"
                          type="password"
                          value={formData.sshPassphrase || ''}
                          onChange={(e) => onChange('sshPassphrase', e.target.value)}
                          disabled={disabled}
                          placeholder="SSH Password"
                          className="w-full px-3 py-1.5 rounded bg-gray-800 border border-gray-700 focus:border-blue-500 text-gray-100 placeholder-gray-500 focus:outline-none transition-colors text-xs"
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
                  <label htmlFor="conn-timeout" className="block text-xs font-medium text-gray-300 mb-1">
                    Connection Timeout (seconds)
                  </label>
                  <input
                    id="conn-timeout"
                    type="number"
                    value={formData.timeoutSeconds ?? ''}
                    onChange={(e) => onChange('timeoutSeconds', e.target.value)}
                    disabled={disabled}
                    placeholder="15 (Default)"
                    className="w-full px-3 py-1.5 rounded bg-gray-800 border border-gray-700 focus:border-blue-500 text-gray-100 placeholder-gray-500 focus:outline-none transition-colors text-xs"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Maximum time to establish connection before aborting.
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
                      className="rounded bg-gray-800 border-gray-700 text-blue-600 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5"
                    />
                    <span className="text-xs text-gray-200 font-medium">Auto-reconnect on connection loss</span>
                  </label>
                  <p className="mt-1 text-xs text-gray-500 pl-5">
                    Automatically re-establishes session connection if disconnected unexpectedly.
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
