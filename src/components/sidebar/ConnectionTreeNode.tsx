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
} from 'lucide-react';
import { useConnectionStore } from '../../stores/connectionStore';
import { openTableTab, openQueryTab, openTableListTab } from './tabHelpers';
import { DbBadge } from './DbBadge';

export type BrowserNodeType =
  | 'connection'
  | 'database'
  | 'schema'
  | 'folder'
  | 'table'
  | 'view'
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
  driver?: string;
  children?: BrowserTreeNode[];
  errorMessage?: string;
  isLoading?: boolean;
  isConnected?: boolean;
  isDisconnected?: boolean;
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
        className="flex items-center space-x-1.5 px-2 py-0.5 text-xs text-red-400 bg-red-950/30 border-l-2 border-red-500 rounded my-0.5 select-none"
        title={data.errorMessage || data.name}
      >
        <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-400" />
        <span className="truncate flex-1 text-[11px] text-red-300 font-mono">
          {data.name}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            context.onEditConnection?.(data.connectionId);
          }}
          className="px-1.5 py-0.5 text-[10px] bg-red-900/60 hover:bg-red-800 text-red-200 rounded font-medium flex items-center space-x-1 shrink-0"
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
          className="p-1 hover:bg-red-800/50 text-red-300 rounded shrink-0"
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
  const connectionStatus = isConnection ? getConnectionStatus(data) : null;
  const showArrow = isConnection ? connectionStatus === 'connected' : !isLeaf;

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
      case 'folder': {
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
    } else if (!isLeaf) {
      node.toggle();
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTableOrView) {
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

  return (
    <div
      ref={dragHandle}
      style={style}
      className={`group flex items-center h-6 px-1.5 rounded cursor-pointer select-none text-xs text-gray-200 hover:bg-gray-800 transition-colors ${
        node.isSelected ? 'bg-blue-600/30 text-white font-medium' : ''
      }`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      data-testid={`tree-node-${data.name}`}
    >
      {/* Expander Arrow */}
      <span
        className="w-4 h-4 flex items-center justify-center shrink-0 mr-0.5 text-gray-400 hover:text-gray-200"
        onClick={(e) => {
          e.stopPropagation();
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
      <span className="truncate flex-1" title={data.name}>
        {data.name}
      </span>

      {/* Status Badges & DB Type for Connection Nodes */}
      {data.nodeType === 'connection' && (
        <div className="flex items-center space-x-1 mr-1 shrink-0">
          <DbBadge driver={data.driver} />
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
              className="p-0.5 text-gray-400 hover:text-white rounded hover:bg-gray-700"
              onClick={handleNewQueryTab}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Refresh Schema"
              className="p-0.5 text-gray-400 hover:text-white rounded hover:bg-gray-700"
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
          <button
            type="button"
            title="Query Table"
            className="p-0.5 text-gray-400 hover:text-white rounded hover:bg-gray-700"
            onClick={handleNewQueryTab}
          >
            <Play className="w-3 h-3 text-emerald-400" />
          </button>
        )}
      </div>
    </div>
  );
};
