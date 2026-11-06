import React from 'react';
import type { DatabaseDriver } from '../../types/db';

export interface ConnectionFormData {
  name: string;
  driver: DatabaseDriver;
  host: string;
  port: number | string;
  database: string;
  user: string;
  password?: string;
  folder?: string;
  sslMode?: string;
}

export interface DriverFormProps {
  driver: DatabaseDriver;
  formData: ConnectionFormData;
  onChange: <K extends keyof ConnectionFormData>(field: K, value: ConnectionFormData[K]) => void;
  errors?: Partial<Record<keyof ConnectionFormData, string>>;
  disabled?: boolean;
}

export const DriverForm: React.FC<DriverFormProps> = ({
  driver,
  formData,
  onChange,
  errors = {},
  disabled = false,
}) => {
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
                <input
                  id="conn-password"
                  type="password"
                  value={formData.password || ''}
                  onChange={(e) => onChange('password', e.target.value)}
                  disabled={disabled}
                  placeholder="••••••••"
                  className="w-full px-3 py-1.5 rounded bg-gray-800 border border-gray-700 focus:border-blue-500 text-gray-100 placeholder-gray-500 focus:outline-none transition-colors text-xs"
                />
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
