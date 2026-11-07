import React, { useState } from 'react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import type { DatabaseDriver } from '../../types/db';

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

      <div className="border-t border-gray-800 my-2 pt-2">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          {driver === 'sqlite' ? 'SQLite Configuration' : `${driver === 'postgres' ? 'PostgreSQL' : 'MySQL'} Configuration`}
        </h4>

        {/* SQLite Driver Form */}
        {driver === 'sqlite' && (
          <div>
            <label htmlFor="conn-database" className="block text-xs font-medium text-gray-300 mb-1">
              Database Path <span className="text-red-400">*</span>
            </label>
            <input
              id="conn-database"
              type="text"
              value={formData.database}
              onChange={(e) => onChange('database', e.target.value)}
              disabled={disabled}
              placeholder=":memory: or /path/to/database.db"
              className={`w-full px-3 py-1.5 rounded bg-gray-800 border ${
                errors.database ? 'border-red-500' : 'border-gray-700 focus:border-blue-500'
              } text-gray-100 placeholder-gray-500 focus:outline-none transition-colors text-xs font-mono`}
            />
            {errors.database ? (
              <p className="mt-1 text-xs text-red-400">{errors.database}</p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">
                Use <code>:memory:</code> for an in-memory database, or specify an absolute path to a SQLite file.
              </p>
            )}
          </div>
        )}

        {/* Postgres / MySQL Driver Form */}
        {(driver === 'postgres' || driver === 'mysql') && (
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
                  <option value="disable">disable</option>
                  <option value="prefer">prefer</option>
                  <option value="require">require</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
