import React, { createContext, useContext } from 'react';
import type { NodeRendererProps } from 'react-arborist';
import {
  Database,
  Folder,
  Table as TableIcon,
  Eye,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Plus,
  Play,
  AlertCircle,
  Loader2,
  Wrench,
  Key,
  Link2,
  Columns3,
} from 'lucide-react';
import { useConnectionStore } from '../../stores/connectionStore';
import { openTableTab, openQueryTab, openTableListTab } from './tabHelpers';
import { DbBadge } from './DbBadge';

export type BrowserNodeType =
  | 'connection'
  | 'connection-folder'
  | 'database'
  | 'schema'
  | 'folder'
  | 'table'
  | 'view'
  | 'column'
  | 'index'
  | 'foreign_key'
  | 'foreignkey'
  | 'trigger'
  | 'function'
  | 'procedure'
  | 'error'
  | 'loading'
  | 'empty';

export interface BrowserTreeNode {
  id: string;
  name: string;
  nodeType: BrowserNodeType;
  connectionId: string;
  connectionName?: string;
  databaseName?: string;
  schemaName?: string;
  tableName?: string;
  dataType?: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  isNullable?: boolean;
  driver?: string;
  children?: BrowserTreeNode[];
  errorMessage?: string;
  isLoading?: boolean;
  isConnected?: boolean;
  isDisconnected?: boolean;
  folderColor?: string;
  isConnectionFolder?: boolean;
  environment?: string;
  readOnly?: boolean;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export function getConnectionStatus(data: BrowserTreeNode): ConnectionStatus {
  if (data.isLoading) {
    return 'connecting';
  }
  if (data.errorMessage) {
    return 'error';
  }
  if (data.isConnected) {
    return 'connected';
  }
  return 'disconnected';
}

export interface ObjectBrowserContextType {
  onContextMenuNode?: (e: React.MouseEvent, node: BrowserTreeNode) => void;
  onRefreshConnection?: (connectionId: string) => void;
  onConnectConnection?: (connectionId: string) => void;
  onOpenTable?: (node: BrowserTreeNode) => void;
  onOpenTableList?: (node: BrowserTreeNode) => void;
  onNewQuery?: (node: BrowserTreeNode) => void;
  onEditConnection?: (connectionId: string) => void;
  onDeleteConnection?: (connectionId: string) => void;
  onDisconnectConnection?: (connectionId: string) => void;
  onLoadTableColumns?: (node: BrowserTreeNode) => void;
  onInsertColumnToEditor?: (colName: string) => void;
  activeConnectionId?: string | null;
  activeTableName?: string | null;
  activeSchemaName?: string | null;
}

export const ObjectBrowserContext = createContext<ObjectBrowserContextType>({});

export const ConnectionTreeNode: React.FC<NodeRendererProps<BrowserTreeNode>> = ({
  node,
  style,
  dragHandle,
}) => {
  const context = useContext(ObjectBrowserContext);
  const data = node.data;
  const isLeaf = node.isLeaf;
  const isTableOrView = data.nodeType === 'table' || data.nodeType === 'view';
  const isTablesFolder =
    data.nodeType === 'folder' &&
    (data.name.startsWith('Tables') || data.id.includes('folder-tables'));

  // Special node rendering: error state under a connection
  if (data.nodeType === 'error') {
    return (
      <div
        style={style}
        className="flex items-center space-x-1.5 px-2 py-0.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-l-2 border-red-500 rounded my-0.5 select-none"
        title={data.errorMessage || data.name}
      >
        <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
        <span className="truncate flex-1 text-[11px] text-red-700 dark:text-red-300 font-mono">
          {data.name}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            context.onEditConnection?.(data.connectionId);
          }}
          className="px-1.5 py-0.5 text-[10px] bg-red-100 dark:bg-red-900/60 hover:bg-red-200 dark:hover:bg-red-800 text-red-800 dark:text-red-200 rounded font-medium flex items-center space-x-1 shrink-0"
          title="Edit Connection Settings"
        >
          <Wrench className="w-2.5 h-2.5" />
          <span>Edit</span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            context.onRefreshConnection?.(data.connectionId);
          }}
          className="p-1 hover:bg-red-100 dark:hover:bg-red-800/50 text-red-700 dark:text-red-300 rounded shrink-0"
          title="Retry Loading Schema"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // Special node rendering: loading state
  if (data.nodeType === 'loading') {
    return (
      <div
        style={style}
        className="flex items-center space-x-1.5 px-4 py-0.5 text-xs text-blue-400 select-none animate-pulse"
      >
        <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
        <span className="text-[11px] italic">Loading schema...</span>
      </div>
    );
  }

  // Special node rendering: empty schema/database
  if (data.nodeType === 'empty') {
    return (
      <div
        style={style}
        className="flex items-center px-4 py-0.5 text-[11px] text-gray-500 italic select-none"
      >
        <span>(No tables or views found)</span>
      </div>
    );
  }

  const isConnection = data.nodeType === 'connection';
  const isTable = data.nodeType === 'table';
  const connectionStatus = isConnection ? getConnectionStatus(data) : null;
  const showArrow = isConnection ? connectionStatus === 'connected' : (isTable ? true : !isLeaf);

  const getNodeIcon = () => {
    switch (data.nodeType) {
      case 'connection': {
        const status = getConnectionStatus(data);
        const iconColor =
          status === 'connected'
            ? 'text-emerald-500'
            : status === 'connecting'
            ? 'text-amber-500 animate-pulse'
            : status === 'error'
            ? 'text-red-500'
            : 'text-gray-400';

        return (
          <Database
            className={`w-4 h-4 shrink-0 ${iconColor}`}
            data-testid="icon-connection"
            data-status={status}
          />
        );
      }
      case 'database':
        return <Database className="w-4 h-4 text-amber-400 shrink-0" data-testid="icon-database" />;
      case 'schema':
        return <Folder className="w-4 h-4 text-yellow-500 shrink-0" data-testid="icon-folder" />;
      case 'connection-folder':
      case 'folder': {
        if (data.folderColor) {
          return (
            <Folder
              className="w-4 h-4 shrink-0"
              style={{ color: data.folderColor }}
              data-testid="icon-folder"
            />
          );
        }
        if (data.name.startsWith('Tables')) {
          return <TableIcon className="w-4 h-4 text-emerald-400 shrink-0" data-testid="icon-folder" />;
        }
        if (data.name.startsWith('Views')) {
          return <Eye className="w-4 h-4 text-purple-400 shrink-0" data-testid="icon-folder" />;
        }
        if (data.name.startsWith('System')) {
          return <Folder className="w-4 h-4 text-gray-400 shrink-0" data-testid="icon-folder" />;
        }
        return <Folder className="w-4 h-4 text-yellow-500 shrink-0" data-testid="icon-folder" />;
      }
      case 'table':
        return <TableIcon className="w-4 h-4 text-emerald-400 shrink-0" data-testid="icon-table" />;
      case 'view':
        return <Eye className="w-4 h-4 text-purple-400 shrink-0" data-testid="icon-view" />;
      case 'column': {
        if (data.isPrimaryKey) {
          return (
            <span title="Primary Key" className="inline-flex">
              <Key className="w-3.5 h-3.5 text-amber-400 shrink-0" data-testid="icon-pk" />
            </span>
          );
        }
        if (data.isForeignKey) {
          return (
            <span title="Foreign Key" className="inline-flex">
              <Link2 className="w-3.5 h-3.5 text-blue-400 shrink-0" data-testid="icon-fk" />
            </span>
          );
        }
        return <Columns3 className="w-3.5 h-3.5 text-slate-400 shrink-0" data-testid="icon-column" />;
      }
      case 'index':
        return <Key className="w-3.5 h-3.5 text-cyan-400 shrink-0" data-testid="icon-index" />;
      case 'foreign_key':
        return <Link2 className="w-3.5 h-3.5 text-blue-400 shrink-0" data-testid="icon-fk" />;
      case 'trigger':
        return <Play className="w-3.5 h-3.5 text-orange-400 shrink-0" data-testid="icon-trigger" />;
      case 'function':
      case 'procedure':
        return <Wrench className="w-3.5 h-3.5 text-indigo-400 shrink-0" data-testid="icon-function" />;
      default:
        return <Folder className="w-4 h-4 text-gray-400 shrink-0" />;
    }
  };

  const handleOpenTableTab = () => {
    if (context.onOpenTable) {
      context.onOpenTable(data);
    } else {
      openTableTab({
        connectionId: data.connectionId,
        tableName: data.tableName || data.name,
        schemaName: data.schemaName,
      });
    }
  };

  const handleOpenTableListTab = () => {
    if (context.onOpenTableList) {
      context.onOpenTableList(data);
    } else {
      openTableListTab({
        connectionId: data.connectionId,
        schemaName: data.schemaName,
      });
    }
  };

  const handleNewQueryTab = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (context.onNewQuery) {
      context.onNewQuery(data);
    } else {
      openQueryTab({
        connectionId: data.connectionId,
        connectionName: data.connectionName || data.name,
        schemaName: data.schemaName,
        tableName: isTableOrView ? data.tableName || data.name : undefined,
        driver: data.driver,
      });
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    node.select();

    if (data.nodeType === 'connection') {
      useConnectionStore.getState().setActiveConnection(data.connectionId);
      const status = getConnectionStatus(data);
      if (status === 'connected') {
        node.toggle();
      }
    } else if (isTableOrView) {
      // Do nothing to toggle: clicking table or view row only selects it.
      // Columns are expanded via the dedicated Show Columns button or chevron arrow.
    } else if (!isLeaf) {
      node.toggle();
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (data.nodeType === 'column') {
      context.onInsertColumnToEditor?.(data.name);
    } else if (isTableOrView) {
      handleOpenTableTab();
    } else if (isTablesFolder) {
      handleOpenTableListTab();
    } else if (data.nodeType === 'connection') {
      useConnectionStore.getState().setActiveConnection(data.connectionId);
      const status = getConnectionStatus(data);
      if (status !== 'connected' && context.onConnectConnection) {
        context.onConnectConnection(data.connectionId);
      } else if (status === 'connected') {
        node.toggle();
      }
    } else if (!isLeaf) {
      node.toggle();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    node.select();
    if (context.onContextMenuNode) {
      context.onContextMenuNode(e, data);
    }
  };

  const isTargetActiveTable =
    (data.nodeType === 'table' || data.nodeType === 'view') &&
    context.activeConnectionId === data.connectionId &&
    Boolean(context.activeTableName) &&
    (data.tableName === context.activeTableName || data.name === context.activeTableName) &&
    (!context.activeSchemaName || !data.schemaName || data.schemaName === context.activeSchemaName);

  const isTargetActiveConnection =
    data.nodeType === 'connection' &&
    Boolean(context.activeConnectionId) &&
    context.activeConnectionId === data.connectionId;

  return (
    <div style={style} className="w-full flex items-center pr-1 overflow-visible">
      <div
        ref={dragHandle}
        draggable={data.nodeType === 'column'}
        onDragStart={(e) => {
          if (data.nodeType === 'column') {
            e.dataTransfer.setData('text/plain', data.name);
            e.dataTransfer.setData('application/datacore-column', data.name);
          }
        }}
        className={`group flex items-center h-6 mx-1 px-1.5 w-full rounded-md cursor-pointer select-none text-xs transition-colors ${
          isTargetActiveTable
            ? 'bg-blue-600/20 text-blue-900 dark:text-blue-100 border border-blue-500 ring-1 ring-blue-500/30 font-semibold shadow-xs'
            : node.isSelected
            ? 'bg-blue-600/20 text-blue-800 dark:bg-blue-600/30 dark:text-white font-medium'
            : 'text-gray-700 dark:text-gray-200 hover:bg-gray-200/70 dark:hover:bg-gray-800'
        } ${
          isTargetActiveConnection
            ? 'bg-blue-500/15 dark:bg-blue-600/25 text-blue-900 dark:text-blue-100 font-bold border border-blue-500/50 dark:border-blue-400/50 shadow-xs'
            : ''
        }`}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        data-testid={`tree-node-${data.name}`}
        data-active-table={isTargetActiveTable ? 'true' : undefined}
      >
        {/* Expander Arrow */}
        <span
          className="w-4 h-4 flex items-center justify-center shrink-0 mr-0.5 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          onClick={(e) => {
            e.stopPropagation();
            if (data.nodeType === 'connection') {
              const status = getConnectionStatus(data);
              if (status !== 'connected' && context.onConnectConnection) {
                context.onConnectConnection(data.connectionId);
                return;
              }
            }
            if (isTable && !node.isOpen && context.onLoadTableColumns) {
              context.onLoadTableColumns(data);
            }
            if (showArrow) node.toggle();
          }}
        >
          {showArrow ? (
            node.isOpen ? (
              <ChevronDown className="w-3.5 h-3.5" data-testid="chevron-down" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" data-testid="chevron-right" />
            )
          ) : (
            <span className="w-3.5" data-testid="arrow-spacer" />
          )}
        </span>

        {/* Node Icon */}
        <span className="mr-1.5 flex items-center">{getNodeIcon()}</span>

        {/* Node Name */}
        <span className={`truncate flex-1 ${data.nodeType === 'column' ? 'font-mono text-[11px]' : ''}`} title={data.name}>
          {data.name}
        </span>

        {/* Active Indicator Symbol for Table/View or Connection */}
        {isTargetActiveTable && (
          <span
            className="ml-auto mr-1.5 flex h-2 w-2 shrink-0 rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.85)] ring-2 ring-blue-500/20"
            title="Active tab"
            data-testid="indicator-active-table"
          />
        )}

        {isTargetActiveConnection && (
          <span
            className="ml-auto mr-2.5 flex h-2 w-2 shrink-0 rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.85)] ring-2 ring-blue-500/20"
            title="Active connection"
            data-testid="indicator-active-connection"
          />
        )}

      {/* Column Data Type & PK/FK Badges */}
      {data.nodeType === 'column' && (
        <div className="flex items-center space-x-1 ml-1.5 shrink-0 select-none">
          {data.isPrimaryKey && (
            <span
              className="text-[9px] px-1 py-0.2 bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 rounded font-semibold border border-amber-300 dark:border-amber-500/30"
              title="Primary Key"
              data-testid="badge-pk"
            >
              PK
            </span>
          )}
          {data.isForeignKey && (
            <span
              className="text-[9px] px-1 py-0.2 bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-300 rounded font-semibold border border-blue-300 dark:border-blue-500/30"
              title="Foreign Key"
              data-testid="badge-fk"
            >
              FK
            </span>
          )}
          {data.dataType && (
            <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono" data-testid="column-datatype">
              {data.dataType}
            </span>
          )}
        </div>
      )}

      {/* Status Badges & DB Type for Connection Nodes */}
      {data.nodeType === 'connection' && (
        <div className="flex items-center space-x-1 mr-1 shrink-0">
          <DbBadge driver={data.driver} />
          {(() => {
            const env =
              data.environment ||
              useConnectionStore
                .getState()
                .connections.find((c) => c.id === data.connectionId)?.environment;
            if (!env) return null;

            const normalizedEnv = env.toLowerCase();
            let badgeClass = '';
            let label = '';

            if (normalizedEnv === 'production') {
              badgeClass = 'bg-red-500/20 text-red-400 border border-red-500/40';
              label = 'PROD';
            } else if (normalizedEnv === 'staging') {
              badgeClass = 'bg-amber-500/20 text-amber-400 border border-amber-500/40';
              label = 'STAGING';
            } else if (normalizedEnv === 'development') {
              badgeClass = 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40';
              label = 'DEV';
            } else {
              badgeClass = 'bg-gray-500/20 text-gray-400 border border-gray-500/40';
              label = env.toUpperCase();
            }

            return (
              <span
                data-testid="badge-environment"
                data-environment={normalizedEnv}
                title={`Environment: ${env}`}
                className={`text-[9px] font-bold px-1 py-0.5 rounded leading-none ${badgeClass}`}
              >
                {label}
              </span>
            );
          })()}
          {(() => {
            const isRo =
              data.readOnly ??
              Boolean(
                useConnectionStore
                  .getState()
                  .connections.find((c) => c.id === data.connectionId)?.readOnly ||
                useConnectionStore
                  .getState()
                  .connections.find((c) => c.id === data.connectionId)?.read_only
              );
            if (!isRo) return null;

            return (
              <span
                data-testid="badge-readonly"
                title="Read-Only Mode"
                className="text-[9px] font-bold px-1 py-0.5 rounded leading-none bg-amber-500/20 text-amber-400 border border-amber-500/40"
              >
                RO
              </span>
            );
          })()}
          {data.isLoading && (
            <span title="Connecting...">
              <Loader2 className="w-3 h-3 text-amber-500 animate-spin" data-testid="spinner-connecting" />
            </span>
          )}
          {data.errorMessage && !data.isLoading && (
            <span title={`Connection error: ${data.errorMessage}`}>
              <AlertCircle className="w-3.5 h-3.5 text-red-500" data-testid="icon-connection-error" />
            </span>
          )}
        </div>
      )}

      {/* Hover Action Buttons */}
      <div className="hidden group-hover:flex items-center space-x-1 shrink-0 ml-1">
        {data.nodeType === 'connection' && (
          <>
            <button
              type="button"
              title="New Query"
              className="p-0.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              onClick={handleNewQueryTab}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Refresh Schema"
              className="p-0.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                context.onRefreshConnection?.(data.connectionId);
              }}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        {isTableOrView && (
          <>
            <button
              type="button"
              title="Show Columns"
              data-testid="btn-toggle-columns"
              className="p-0.5 text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                if (!node.isOpen && context.onLoadTableColumns) {
                  context.onLoadTableColumns(data);
                }
                node.toggle();
              }}
            >
              <Columns3 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Query Table"
              className="p-0.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              onClick={handleNewQueryTab}
            >
              <Play className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
            </button>
          </>
        )}
      </div>
    </div>
  </div>
);
};
