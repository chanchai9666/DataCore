import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Tree } from 'react-arborist';
import { Search, RefreshCw, Table, FileCode } from 'lucide-react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useTabStore } from '../../stores/tabStore';
import { dbApi } from '../../api/db';
import type { SchemaNode } from '../../types/db';
import {
  ConnectionTreeNode,
  ObjectBrowserContext,
  type BrowserTreeNode,
} from './ConnectionTreeNode';

function mapSchemaNodeToTreeNode(
  node: SchemaNode,
  connectionId: string,
  connectionName: string,
  parentPath = ''
): BrowserTreeNode {
  const currentPath = `${parentPath}/${node.node_type}-${node.name}`;
  const schemaName = node.schema || node.schema_name;
  const isLeaf = node.node_type === 'table' || node.node_type === 'view';

  return {
    id: `${connectionId}-${currentPath}`,
    name: node.name,
    nodeType: node.node_type,
    connectionId,
    connectionName,
    schemaName,
    tableName: isLeaf ? node.name : undefined,
    children: isLeaf
      ? undefined
      : (node.children || []).map((child) =>
          mapSchemaNodeToTreeNode(child, connectionId, connectionName, currentPath)
        ),
  };
}

interface ContextMenuState {
  mouseX: number;
  mouseY: number;
  node: BrowserTreeNode;
}

export const ObjectBrowser: React.FC = () => {
  const { connections, loadConnections } = useConnectionStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [schemas, setSchemas] = useState<Record<string, SchemaNode[]>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 280, height: 600 });

  // Update container dimensions for react-arborist
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setDimensions({
          width: clientWidth || 280,
          height: clientHeight || 600,
        });
      }
    };
    updateSize();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateSize);
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }
  }, []);

  // Close context menu on outside click or Escape
  useEffect(() => {
    const handleOutsideClick = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };

    window.addEventListener('click', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Initial connection loading
  useEffect(() => {
    if (connections.length === 0) {
      loadConnections();
    }
  }, [connections.length, loadConnections]);

  const fetchSchema = useCallback(async (connectionId: string) => {
    setLoadingMap((prev) => ({ ...prev, [connectionId]: true }));
    try {
      const tree = await dbApi.getSchemaTree(connectionId);
      setSchemas((prev) => ({ ...prev, [connectionId]: tree }));
    } catch (err) {
      console.error(`Failed to load schema for connection ${connectionId}:`, err);
    } finally {
      setLoadingMap((prev) => ({ ...prev, [connectionId]: false }));
    }
  }, []);

  // Fetch schema for all connections if not yet loaded
  useEffect(() => {
    connections.forEach((conn) => {
      if (!schemas[conn.id] && !loadingMap[conn.id]) {
        fetchSchema(conn.id);
      }
    });
  }, [connections, fetchSchema, schemas, loadingMap]);

  const treeData = useMemo<BrowserTreeNode[]>(() => {
    return connections.map((conn) => {
      const connSchema = schemas[conn.id] || [];
      const children: BrowserTreeNode[] = connSchema.map((schemaNode) =>
        mapSchemaNodeToTreeNode(schemaNode, conn.id, conn.name)
      );

      return {
        id: `conn-${conn.id}`,
        name: conn.name,
        nodeType: 'connection',
        connectionId: conn.id,
        connectionName: conn.name,
        children,
      };
    });
  }, [connections, schemas]);

  const handleOpenTable = useCallback((node: BrowserTreeNode) => {
    const tableId = `${node.connectionId}-${node.tableName || node.name}`;
    useTabStore.getState().openTab({
      id: 'table-' + tableId,
      connectionId: node.connectionId,
      type: 'table',
      title: node.name,
      schemaName: node.schemaName,
      tableName: node.tableName || node.name,
      autoCommit: true,
      queryContent: '',
    });
    setContextMenu(null);
  }, []);

  const handleNewQuery = useCallback((node: BrowserTreeNode) => {
    const isTableOrView = node.nodeType === 'table' || node.nodeType === 'view';
    const queryTabId = `query-${Date.now()}`;
    const initialQuery = isTableOrView
      ? `SELECT * FROM ${node.schemaName ? `"${node.schemaName}".` : ''}"${node.tableName || node.name}" LIMIT 100;\n`
      : '';

    useTabStore.getState().openTab({
      id: queryTabId,
      connectionId: node.connectionId,
      type: 'query',
      title: `Query (${node.connectionName || node.name})`,
      autoCommit: true,
      queryContent: initialQuery,
    });
    setContextMenu(null);
  }, []);

  const handleRefresh = useCallback(
    (connectionId: string) => {
      fetchSchema(connectionId);
      setContextMenu(null);
    },
    [fetchSchema]
  );

  const handleContextMenuNode = useCallback(
    (e: React.MouseEvent, node: BrowserTreeNode) => {
      setContextMenu({
        mouseX: e.clientX,
        mouseY: e.clientY,
        node,
      });
    },
    []
  );

  return (
    <div className="flex flex-col h-full w-full bg-gray-900 border-r border-gray-800 text-gray-200 select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <span className="text-xs font-semibold tracking-wider uppercase text-gray-400">
          Object Browser
        </span>
        <div className="flex items-center space-x-1">
          <button
            type="button"
            title="Refresh All"
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800"
            onClick={() => connections.forEach((c) => fetchSchema(c.id))}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="p-2 border-b border-gray-800">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-2 text-gray-500 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search tables/views..."
            className="w-full pl-7 pr-2 py-1 text-xs bg-gray-800 text-gray-200 placeholder-gray-500 rounded border border-gray-700 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Tree View Container */}
      <div ref={containerRef} className="flex-1 overflow-hidden p-1">
        {connections.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-500">
            No connections found.
          </div>
        ) : (
          <ObjectBrowserContext.Provider
            value={{
              onContextMenuNode: handleContextMenuNode,
              onRefreshConnection: handleRefresh,
            }}
          >
            <Tree
              data={treeData}
              width={dimensions.width}
              height={dimensions.height}
              indent={16}
              rowHeight={26}
              searchTerm={searchTerm}
              searchMatch={(node, term) =>
                node.data.name.toLowerCase().includes(term.toLowerCase())
              }
              openByDefault={true}
            >
              {ConnectionTreeNode}
            </Tree>
          </ObjectBrowserContext.Provider>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          role="menu"
          className="fixed z-50 bg-gray-800 border border-gray-700 rounded shadow-lg py-1 text-xs text-gray-200 min-w-[140px]"
          style={{ top: contextMenu.mouseY, left: contextMenu.mouseX }}
          onClick={(e) => e.stopPropagation()}
        >
          {(contextMenu.node.nodeType === 'table' ||
            contextMenu.node.nodeType === 'view') && (
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-700 text-gray-200"
              onClick={() => handleOpenTable(contextMenu.node)}
            >
              <Table className="w-3.5 h-3.5 text-emerald-400" />
              <span>Open Table</span>
            </button>
          )}

          <button
            type="button"
            className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-700 text-gray-200"
            onClick={() => handleNewQuery(contextMenu.node)}
          >
            <FileCode className="w-3.5 h-3.5 text-blue-400" />
            <span>New Query</span>
          </button>

          {(contextMenu.node.nodeType === 'connection' ||
            contextMenu.node.nodeType === 'database' ||
            contextMenu.node.nodeType === 'schema') && (
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-700 text-gray-200"
              onClick={() => handleRefresh(contextMenu.node.connectionId)}
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
              <span>Refresh</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
