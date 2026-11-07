import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Tree } from 'react-arborist';
import {
  Search,
  RefreshCw,
  Table,
  FileCode,
  Edit,
  Trash2,
  Unplug,
  Copy,
  Plus,
} from 'lucide-react';
import { useConnectionStore } from '../../stores/connectionStore';
import { dbApi } from '../../api/db';
import type { ConnectionConfig, SchemaNode } from '../../types/db';
import { openTableTab, openQueryTab } from './tabHelpers';
import {
  ConnectionTreeNode,
  ObjectBrowserContext,
  type BrowserTreeNode,
} from './ConnectionTreeNode';

const SYSTEM_SCHEMA_NAMES = new Set([
  'auth',
  'extensions',
  'graphql',
  'graphql_public',
  'net',
  'pgbouncer',
  'realtime',
  'storage',
  'vault',
  'supabase_functions',
  'supabase_migrations',
  'tiger',
  'tiger_data',
  'topology',
  'pg_catalog',
  'information_schema',
]);

function isSystemSchema(name: string): boolean {
  const lower = name.toLowerCase();
  return SYSTEM_SCHEMA_NAMES.has(lower) || lower.startsWith('pg_');
}

function groupTablesAndViews(
  rawChildren: SchemaNode[],
  connectionId: string,
  connectionName: string,
  parentPath: string,
  schemaName: string | undefined,
  driver?: string
): BrowserTreeNode[] {
  const tables = rawChildren.filter((c) => c.node_type === 'table');
  const views = rawChildren.filter((c) => c.node_type === 'view');

  if (tables.length === 0 && views.length === 0) {
    return [
      {
        id: `${connectionId}-${parentPath}/empty`,
        name: '(No tables or views)',
        nodeType: 'empty',
        connectionId,
        connectionName,
        schemaName,
        driver,
      },
    ];
  }

  const result: BrowserTreeNode[] = [];

  if (tables.length > 0 || views.length === 0) {
    result.push({
      id: `${connectionId}-${parentPath}/folder-tables`,
      name: `Tables (${tables.length})`,
      nodeType: 'folder',
      connectionId,
      connectionName,
      schemaName,
      driver,
      children: tables.map((t) =>
        mapSchemaNodeToTreeNode(
          t,
          connectionId,
          connectionName,
          `${parentPath}/tables`,
          driver
        )
      ),
    });
  }

  if (views.length > 0) {
    result.push({
      id: `${connectionId}-${parentPath}/folder-views`,
      name: `Views (${views.length})`,
      nodeType: 'folder',
      connectionId,
      connectionName,
      schemaName,
      driver,
      children: views.map((v) =>
        mapSchemaNodeToTreeNode(
          v,
          connectionId,
          connectionName,
          `${parentPath}/views`,
          driver
        )
      ),
    });
  }

  return result;
}

function mapSchemaNodeToTreeNode(
  node: SchemaNode,
  connectionId: string,
  connectionName: string,
  parentPath = '',
  driver?: string
): BrowserTreeNode {
  const currentPath = `${parentPath}/${node.node_type}-${node.name}`;
  const schemaName = node.schema || (node as any).schema_name;
  const isLeaf = node.node_type === 'table' || node.node_type === 'view';

  if (isLeaf) {
    return {
      id: `${connectionId}-${currentPath}`,
      name: node.name,
      nodeType: node.node_type,
      connectionId,
      connectionName,
      schemaName,
      tableName: node.name,
      driver,
    };
  }

  // Schema node: group tables & views
  if (node.node_type === 'schema') {
    return {
      id: `${connectionId}-${currentPath}`,
      name: node.name,
      nodeType: 'schema',
      connectionId,
      connectionName,
      schemaName: node.name,
      driver,
      children: groupTablesAndViews(
        node.children || [],
        connectionId,
        connectionName,
        currentPath,
        node.name,
        driver
      ),
    };
  }

  // Database node
  if (node.node_type === 'database') {
    const rawChildren = node.children || [];
    const hasSchemaChildren = rawChildren.some((c) => c.node_type === 'schema');

    if (hasSchemaChildren) {
      // Split into user schemas and system schemas
      const userSchemas: SchemaNode[] = [];
      const systemSchemas: SchemaNode[] = [];

      for (const child of rawChildren) {
        if (child.node_type === 'schema') {
          if (isSystemSchema(child.name) && child.name.toLowerCase() !== 'public') {
            systemSchemas.push(child);
          } else {
            userSchemas.push(child);
          }
        }
      }

      // Sort user schemas: 'public' always first
      userSchemas.sort((a, b) => {
        if (a.name.toLowerCase() === 'public') return -1;
        if (b.name.toLowerCase() === 'public') return 1;
        return a.name.localeCompare(b.name);
      });

      const mappedUserSchemas = userSchemas.map((child) =>
        mapSchemaNodeToTreeNode(child, connectionId, connectionName, currentPath, driver)
      );

      const dbChildren: BrowserTreeNode[] = [...mappedUserSchemas];

      if (systemSchemas.length > 0) {
        systemSchemas.sort((a, b) => a.name.localeCompare(b.name));
        const mappedSystemSchemas = systemSchemas.map((child) =>
          mapSchemaNodeToTreeNode(
            child,
            connectionId,
            connectionName,
            `${currentPath}/system-schemas`,
            driver
          )
        );

        dbChildren.push({
          id: `${connectionId}-${currentPath}/folder-system-schemas`,
          name: `System Schemas (${systemSchemas.length})`,
          nodeType: 'folder',
          connectionId,
          connectionName,
          driver,
          children: mappedSystemSchemas,
        });
      }

      return {
        id: `${connectionId}-${currentPath}`,
        name: node.name,
        nodeType: 'database',
        connectionId,
        connectionName,
        databaseName: node.name,
        driver,
        children: dbChildren,
      };
    } else {
      // Direct tables/views (SQLite / MySQL)
      return {
        id: `${connectionId}-${currentPath}`,
        name: node.name,
        nodeType: 'database',
        connectionId,
        connectionName,
        databaseName: node.name,
        driver,
        children: groupTablesAndViews(
          rawChildren,
          connectionId,
          connectionName,
          currentPath,
          undefined,
          driver
        ),
      };
    }
  }

  return {
    id: `${connectionId}-${currentPath}`,
    name: node.name,
    nodeType: node.node_type,
    connectionId,
    connectionName,
    schemaName,
    tableName: isLeaf ? node.name : undefined,
    driver,
    children: (node.children || []).map((child) =>
      mapSchemaNodeToTreeNode(child, connectionId, connectionName, currentPath, driver)
    ),
  };
}

interface ContextMenuState {
  mouseX: number;
  mouseY: number;
  node: BrowserTreeNode;
}

export interface ObjectBrowserProps {
  onEditConnection?: (connection: ConnectionConfig) => void;
  onNewConnection?: () => void;
  lastSavedConnectionId?: string | null;
}

export const ObjectBrowser: React.FC<ObjectBrowserProps> = ({
  onEditConnection,
  onNewConnection,
  lastSavedConnectionId,
}) => {
  const {
    connections,
    loadConnections,
    activeConnectionId,
    setActiveConnection,
    removeConnection,
  } = useConnectionStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [schemas, setSchemas] = useState<Record<string, SchemaNode[]>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});
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

  // Initial connection loading on mount
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (!hasLoadedRef.current && (!connections || connections.length === 0)) {
      hasLoadedRef.current = true;
      loadConnections();
    }
  }, [connections, loadConnections]);

  const fetchSchema = useCallback(async (connectionId: string) => {
    setLoadingMap((prev) => ({ ...prev, [connectionId]: true }));
    setErrorMap((prev) => {
      const next = { ...prev };
      delete next[connectionId];
      return next;
    });

    try {
      const tree = await dbApi.getSchemaTree(connectionId);
      setSchemas((prev) => ({ ...prev, [connectionId]: tree }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to load schema for connection ${connectionId}:`, err);
      setErrorMap((prev) => ({ ...prev, [connectionId]: msg }));
      setSchemas((prev) => {
        const next = { ...prev };
        delete next[connectionId];
        return next;
      });
    } finally {
      setLoadingMap((prev) => ({ ...prev, [connectionId]: false }));
    }
  }, []);

  // Auto-refresh schema when a connection is added or edited
  useEffect(() => {
    if (lastSavedConnectionId) {
      const targetConn = (connections || []).find((c) => lastSavedConnectionId.startsWith(c.id));
      if (targetConn) {
        fetchSchema(targetConn.id);
      }
    }
  }, [lastSavedConnectionId, connections, fetchSchema]);

  // Fetch schema for all connections if not yet loaded and not errored
  useEffect(() => {
    (connections || []).forEach((conn) => {
      if (!schemas[conn.id] && !loadingMap[conn.id] && !errorMap[conn.id]) {
        fetchSchema(conn.id);
      }
    });
  }, [connections, fetchSchema, schemas, loadingMap, errorMap]);

  const treeData = useMemo<BrowserTreeNode[]>(() => {
    return (connections || []).map((conn) => {
      const connSchema = schemas[conn.id] || [];
      const isLoading = Boolean(loadingMap[conn.id]);
      const errorMsg = errorMap[conn.id];

      let children: BrowserTreeNode[];

      if (errorMsg) {
        children = [
          {
            id: `${conn.id}-error`,
            name: errorMsg,
            nodeType: 'error',
            connectionId: conn.id,
            connectionName: conn.name,
            errorMessage: errorMsg,
          },
        ];
      } else if (isLoading && connSchema.length === 0) {
        children = [
          {
            id: `${conn.id}-loading`,
            name: 'Loading schema...',
            nodeType: 'loading',
            connectionId: conn.id,
            connectionName: conn.name,
          },
        ];
      } else if (connSchema.length === 0) {
        children = [
          {
            id: `${conn.id}-empty`,
            name: '(No tables or views found)',
            nodeType: 'empty',
            connectionId: conn.id,
            connectionName: conn.name,
          },
        ];
      } else {
        children = connSchema.map((schemaNode) =>
          mapSchemaNodeToTreeNode(schemaNode, conn.id, conn.name, '', conn.driver)
        );
      }

      return {
        id: `conn-${conn.id}`,
        name: conn.name,
        nodeType: 'connection',
        connectionId: conn.id,
        connectionName: conn.name,
        driver: conn.driver,
        errorMessage: errorMsg,
        isLoading,
        children,
      };
    });
  }, [connections, schemas, loadingMap, errorMap]);

  const initialOpenState = useMemo<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    const traverse = (nodes: BrowserTreeNode[]) => {
      for (const node of nodes) {
        if (node.id.includes('folder-system-schemas')) {
          map[node.id] = false;
        } else {
          map[node.id] = true;
        }
        if (node.children) {
          traverse(node.children);
        }
      }
    };
    traverse(treeData);
    return map;
  }, [treeData]);

  const handleOpenTable = useCallback((node: BrowserTreeNode) => {
    openTableTab({
      connectionId: node.connectionId,
      tableName: node.tableName || node.name,
      schemaName: node.schemaName,
    });
    setContextMenu(null);
  }, []);

  const handleNewQuery = useCallback((node: BrowserTreeNode) => {
    const isTableOrView = node.nodeType === 'table' || node.nodeType === 'view';
    const tableName = isTableOrView ? node.tableName || node.name : undefined;
    openQueryTab({
      connectionId: node.connectionId,
      connectionName: node.connectionName || node.name,
      schemaName: node.schemaName,
      tableName,
      driver: node.driver,
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

  const handleEditConnection = useCallback(
    (connectionId: string) => {
      const conn = (connections || []).find((c) => c.id === connectionId);
      if (conn && onEditConnection) {
        onEditConnection(conn);
      }
      setContextMenu(null);
    },
    [connections, onEditConnection]
  );

  const handleDeleteConnection = useCallback(
    async (connectionId: string) => {
      const conn = (connections || []).find((c) => c.id === connectionId);
      const connName = conn?.name || 'this connection';
      if (window.confirm(`Are you sure you want to delete connection "${connName}"?`)) {
        await removeConnection(connectionId);
      }
      setContextMenu(null);
    },
    [connections, removeConnection]
  );

  const handleDisconnect = useCallback(
    (connectionId: string) => {
      if (activeConnectionId === connectionId) {
        setActiveConnection(null);
      }
      setSchemas((prev) => {
        const next = { ...prev };
        delete next[connectionId];
        return next;
      });
      setErrorMap((prev) => {
        const next = { ...prev };
        delete next[connectionId];
        return next;
      });
      setContextMenu(null);
    },
    [activeConnectionId, setActiveConnection]
  );

  const handleCopyName = useCallback((textToCopy: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(textToCopy);
    }
    setContextMenu(null);
  }, []);

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
          {onNewConnection && (
            <button
              type="button"
              title="Add New Connection"
              aria-label="Add Connection"
              className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              onClick={onNewConnection}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            title="Refresh All"
            aria-label="Refresh All"
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            onClick={() => (connections || []).forEach((c) => fetchSchema(c.id))}
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
        {!connections || connections.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-500 flex flex-col items-center space-y-2">
            <span>No connections found.</span>
            {onNewConnection && (
              <button
                type="button"
                onClick={onNewConnection}
                className="px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
              >
                Add Connection
              </button>
            )}
          </div>
        ) : (
          <ObjectBrowserContext.Provider
            value={{
              onContextMenuNode: handleContextMenuNode,
              onRefreshConnection: handleRefresh,
              onOpenTable: handleOpenTable,
              onNewQuery: handleNewQuery,
              onEditConnection: handleEditConnection,
              onDeleteConnection: handleDeleteConnection,
              onDisconnectConnection: handleDisconnect,
            }}
          >
            <Tree
              data={treeData}
              width={dimensions.width}
              height={dimensions.height}
              indent={16}
              rowHeight={26}
              searchTerm={searchTerm}
              searchMatch={(node, term) => {
                const lower = term.toLowerCase();
                if (node.data.name.toLowerCase().includes(lower)) return true;
                if (node.data.tableName && node.data.tableName.toLowerCase().includes(lower)) return true;
                return false;
              }}
              initialOpenState={initialOpenState}
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
          className="fixed z-50 bg-gray-800 border border-gray-700 rounded-md shadow-xl py-1 text-xs text-gray-200 min-w-[160px]"
          style={{ top: contextMenu.mouseY, left: contextMenu.mouseX }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Connection Context Menu */}
          {contextMenu.node.nodeType === 'connection' && (
            <>
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-700 text-gray-200"
                onClick={() => handleEditConnection(contextMenu.node.connectionId)}
              >
                <Edit className="w-3.5 h-3.5 text-amber-400" />
                <span>Edit Connection</span>
              </button>

              <button
                type="button"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-700 text-gray-200"
                onClick={() => handleNewQuery(contextMenu.node)}
              >
                <FileCode className="w-3.5 h-3.5 text-blue-400" />
                <span>New Query</span>
              </button>

              <button
                type="button"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-700 text-gray-200"
                onClick={() => handleRefresh(contextMenu.node.connectionId)}
              >
                <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                <span>Refresh Schema</span>
              </button>

              <button
                type="button"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-700 text-gray-200"
                onClick={() => handleDisconnect(contextMenu.node.connectionId)}
              >
                <Unplug className="w-3.5 h-3.5 text-orange-400" />
                <span>Disconnect</span>
              </button>

              <div className="border-t border-gray-700 my-1" />

              <button
                type="button"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-red-900/40 text-red-400"
                onClick={() => handleDeleteConnection(contextMenu.node.connectionId)}
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                <span>Delete Connection</span>
              </button>
            </>
          )}

          {/* Table / View Context Menu */}
          {(contextMenu.node.nodeType === 'table' ||
            contextMenu.node.nodeType === 'view') && (
            <>
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-700 text-gray-200"
                onClick={() => handleOpenTable(contextMenu.node)}
              >
                <Table className="w-3.5 h-3.5 text-emerald-400" />
                <span>Open Table</span>
              </button>

              <button
                type="button"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-700 text-gray-200"
                onClick={() => handleNewQuery(contextMenu.node)}
              >
                <FileCode className="w-3.5 h-3.5 text-blue-400" />
                <span>Query Table</span>
              </button>

              <button
                type="button"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-700 text-gray-200"
                onClick={() => handleCopyName(contextMenu.node.tableName || contextMenu.node.name)}
              >
                <Copy className="w-3.5 h-3.5 text-gray-400" />
                <span>Copy Name</span>
              </button>
            </>
          )}

          {/* Database / Schema Context Menu */}
          {(contextMenu.node.nodeType === 'database' ||
            contextMenu.node.nodeType === 'schema') && (
            <>
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-700 text-gray-200"
                onClick={() => handleNewQuery(contextMenu.node)}
              >
                <FileCode className="w-3.5 h-3.5 text-blue-400" />
                <span>New Query</span>
              </button>

              <button
                type="button"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-700 text-gray-200"
                onClick={() => handleRefresh(contextMenu.node.connectionId)}
              >
                <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                <span>Refresh</span>
              </button>

              <button
                type="button"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-700 text-gray-200"
                onClick={() => handleCopyName(contextMenu.node.name)}
              >
                <Copy className="w-3.5 h-3.5 text-gray-400" />
                <span>Copy Name</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
