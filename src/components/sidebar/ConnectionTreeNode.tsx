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
} from 'lucide-react';
import { useConnectionStore } from '../../stores/connectionStore';
import { openTableTab, openQueryTab } from './tabHelpers';

export type BrowserNodeType =
  | 'connection'
  | 'database'
  | 'schema'
  | 'folder'
  | 'table'
  | 'view';

export interface BrowserTreeNode {
  id: string;
  name: string;
  nodeType: BrowserNodeType;
  connectionId: string;
  connectionName?: string;
  databaseName?: string;
  schemaName?: string;
  tableName?: string;
  children?: BrowserTreeNode[];
}

export interface ObjectBrowserContextType {
  onContextMenuNode?: (e: React.MouseEvent, node: BrowserTreeNode) => void;
  onRefreshConnection?: (connectionId: string) => void;
  onOpenTable?: (node: BrowserTreeNode) => void;
  onNewQuery?: (node: BrowserTreeNode) => void;
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

  const getNodeIcon = () => {
    switch (data.nodeType) {
      case 'connection':
        return <Database className="w-4 h-4 text-sky-400 shrink-0" data-testid="icon-connection" />;
      case 'database':
        return <Database className="w-4 h-4 text-amber-400 shrink-0" data-testid="icon-database" />;
      case 'schema':
      case 'folder':
        return <Folder className="w-4 h-4 text-yellow-500 shrink-0" data-testid="icon-folder" />;
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
      });
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    node.select();

    if (data.nodeType === 'connection') {
      useConnectionStore.getState().setActiveConnection(data.connectionId);
    }

    if (!isLeaf) {
      node.toggle();
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTableOrView) {
      handleOpenTableTab();
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
          if (!isLeaf) node.toggle();
        }}
      >
        {!isLeaf ? (
          node.isOpen ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )
        ) : (
          <span className="w-3.5" />
        )}
      </span>

      {/* Node Icon */}
      <span className="mr-1.5 flex items-center">{getNodeIcon()}</span>

      {/* Node Name */}
      <span className="truncate flex-1" title={data.name}>
        {data.name}
      </span>

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
