import React from 'react';
import { ChevronRight, LocateFixed, Database } from 'lucide-react';
import { DbBadge } from './DbBadge';

export interface ExplorerBreadcrumbProps {
  connectionName?: string;
  driver?: string;
  databaseName?: string;
  schemaName?: string;
  tableName?: string;
  onSelectNode?: (target: 'connection' | 'database' | 'schema' | 'table') => void;
  onLocateActive?: () => void;
  theme?: 'dark' | 'light';
}

export const ExplorerBreadcrumb: React.FC<ExplorerBreadcrumbProps> = ({
  connectionName,
  driver,
  databaseName,
  schemaName,
  tableName,
  onSelectNode,
  onLocateActive,
}) => {
  if (!connectionName) {
    return null;
  }

  // Display database segment if defined and different from connectionName
  const showDb = Boolean(databaseName && databaseName !== connectionName);
  // Display schema segment if defined and not default/empty
  const showSchema = Boolean(schemaName && schemaName !== databaseName);

  return (
    <div
      data-testid="explorer-breadcrumb"
      className="flex items-center justify-between px-2 py-1 text-[11px] bg-slate-50/95 dark:bg-gray-900/90 backdrop-blur-xs border-b border-line text-muted select-none min-h-[26px] z-10 transition-colors"
    >
      {/* Scrollable Breadcrumbs Path */}
      <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar min-w-0 pr-1">
        {driver && (
          <span className="shrink-0 mr-0.5 scale-90 origin-left">
            <DbBadge driver={driver} />
          </span>
        )}

        {/* Connection Segment */}
        <button
          type="button"
          data-testid="breadcrumb-connection"
          title={`Connection: ${connectionName}`}
          onClick={() => onSelectNode?.('connection')}
          className="font-medium text-text hover:text-blue-600 dark:hover:text-blue-400 hover:underline truncate max-w-[90px] shrink-0 transition-colors"
        >
          {connectionName}
        </button>

        {/* Database Segment */}
        {showDb && (
          <>
            <ChevronRight className="w-3 h-3 text-muted shrink-0 opacity-60" />
            <button
              type="button"
              data-testid="breadcrumb-database"
              title={`Database: ${databaseName}`}
              onClick={() => onSelectNode?.('database')}
              className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline truncate max-w-[80px] shrink-0 transition-colors inline-flex items-center space-x-0.5"
            >
              <Database className="w-2.5 h-2.5 mr-0.5 opacity-70" />
              <span>{databaseName}</span>
            </button>
          </>
        )}

        {/* Schema Segment */}
        {showSchema && (
          <>
            <ChevronRight className="w-3 h-3 text-muted shrink-0 opacity-60" />
            <button
              type="button"
              data-testid="breadcrumb-schema"
              title={`Schema: ${schemaName}`}
              onClick={() => onSelectNode?.('schema')}
              className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline truncate max-w-[70px] shrink-0 transition-colors"
            >
              {schemaName}
            </button>
          </>
        )}

        {/* Table Segment */}
        {tableName && (
          <>
            <ChevronRight className="w-3 h-3 text-muted shrink-0 opacity-60" />
            <button
              type="button"
              data-testid="breadcrumb-table"
              title={`Active Table: ${tableName}`}
              onClick={() => onSelectNode?.('table')}
              className="font-semibold text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[100px] shrink-0 transition-colors"
            >
              {tableName}
            </button>
          </>
        )}
      </div>

      {/* Locate/Focus Action Button */}
      {onLocateActive && (
        <button
          type="button"
          data-testid="breadcrumb-locate-btn"
          title="Scroll to active node in tree"
          onClick={onLocateActive}
          className="p-1 -mr-1 text-muted hover:text-blue-600 dark:hover:text-blue-400 hover:bg-black/5 dark:hover:bg-white/10 rounded shrink-0 transition-colors cursor-pointer"
        >
          <LocateFixed className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
