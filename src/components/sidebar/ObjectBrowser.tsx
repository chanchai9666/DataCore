import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Tree, TreeApi } from 'react-arborist';
import { toast } from 'sonner';
import {
  Search,
  RefreshCw,
  Table,
  FileCode,
  Edit,
  Trash2,
  Unplug,
  Plug,
  Copy,
  Plus,
  Wrench,
  Upload,
  Download,
  ArrowRightLeft,
  Pencil,
  Folder,
  FolderPlus,
  Palette,
  ChevronRight,
  Network,
  Wand2,
} from 'lucide-react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useFolderStore } from '../../stores/folderStore';
import { useTabStore } from '../../stores/tabStore';
import { dbApi } from '../../api/db';
import type { ConnectionConfig, SchemaNode } from '../../types/db';
import {
  openTableTab,
  openQueryTab,
  openTableListTab,
  openERDiagramTab,
  openQueryBuilderTab,
} from './tabHelpers';
import {
  getFetchColumnsSql,
  parseColumnsFromQueryResult,
  type TableColumnStructure,
} from '../structure/tableStructureHelpers';
import { FolderModal } from './FolderModal';
import { CreateTableModal } from '../structure/CreateTableModal';
import { DropTableModal } from '../structure/DropTableModal';
import { RenameTableModal } from '../structure/RenameTableModal';
import { TableMaintenanceModal } from '../structure/TableMaintenanceModal';
import { ImportModal } from '../transfer/ImportModal';
import { ExportModal } from '../transfer/ExportModal';
import { DuplicateTableModal } from '../transfer/DuplicateTableModal';
import { CrossDbCopyModal } from '../transfer/CrossDbCopyModal';
import { ExportSqlModal } from '../transfer/ExportSqlModal';
import { ImportSqlModal } from '../transfer/ImportSqlModal';
import {
  buildRefreshMaterializedViewSql,
  buildGetViewDdlSql,
} from '../../api/performanceHelpers';
import { useAuditLogStore } from '../../stores/auditLogStore';
import {
  ConnectionTreeNode,
  ObjectBrowserContext,
  type BrowserTreeNode,
} from './ConnectionTreeNode';
import { ExplorerBreadcrumb } from './ExplorerBreadcrumb';
import { showConfirmDialog } from '../../utils/dialog';

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
  driver?: string,
  tableColumnsMap?: Record<string, { loading: boolean; columns?: TableColumnStructure[]; error?: string }>
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
          driver,
          tableColumnsMap
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
          driver,
          tableColumnsMap
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
  driver?: string,
  tableColumnsMap?: Record<string, { loading: boolean; columns?: TableColumnStructure[]; error?: string }>
): BrowserTreeNode {
  const currentPath = `${parentPath}/${node.node_type}-${node.name}`;
  const schemaName = node.schema || (node as any).schema_name;

  if (node.node_type === 'table') {
    const tableKey = `${connectionId}:${schemaName || ''}:${node.name}`;
    const colState = tableColumnsMap?.[tableKey];
    let children: BrowserTreeNode[] = [];

    if (colState?.loading) {
      children = [
        {
          id: `${connectionId}-${currentPath}/loading`,
          name: 'Loading columns...',
          nodeType: 'loading',
          connectionId,
          connectionName,
          schemaName,
          tableName: node.name,
          driver,
        },
      ];
    } else if (colState?.columns) {
      if (colState.columns.length === 0) {
        children = [
          {
            id: `${connectionId}-${currentPath}/empty`,
            name: '(No columns)',
            nodeType: 'empty',
            connectionId,
            connectionName,
            schemaName,
            tableName: node.name,
            driver,
          },
        ];
      } else {
        children = colState.columns.map((c) => ({
          id: `${connectionId}-${currentPath}/col-${c.name}`,
          name: c.name,
          nodeType: 'column',
          connectionId,
          connectionName,
          schemaName,
          tableName: node.name,
          driver,
          dataType: c.dataType,
          isPrimaryKey: c.isPrimaryKey,
          isNullable: c.isNullable,
        }));
      }
    } else if (node.children && node.children.length > 0) {
      children = node.children.map((child) =>
        mapSchemaNodeToTreeNode(child, connectionId, connectionName, currentPath, driver, tableColumnsMap)
      );
    }

    return {
      id: `${connectionId}-${currentPath}`,
      name: node.name,
      nodeType: 'table',
      connectionId,
      connectionName,
      schemaName,
      tableName: node.name,
      driver,
      children,
    };
  }

  if (node.node_type === 'column') {
    return {
      id: `${connectionId}-${currentPath}`,
      name: node.name,
      nodeType: 'column',
      connectionId,
      connectionName,
      schemaName,
      tableName: (node as any).tableName,
      driver,
      dataType: node.metadata?.data_type || node.metadata?.dataType,
      isPrimaryKey: node.metadata?.is_primary_key === 'true' || node.metadata?.isPrimaryKey === 'true',
      isForeignKey: node.metadata?.is_foreign_key === 'true' || node.metadata?.isForeignKey === 'true',
    };
  }

  if (node.node_type === 'view') {
    return {
      id: `${connectionId}-${currentPath}`,
      name: node.name,
      nodeType: 'view',
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
        driver,
        tableColumnsMap
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
        mapSchemaNodeToTreeNode(child, connectionId, connectionName, currentPath, driver, tableColumnsMap)
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
            driver,
            tableColumnsMap
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
          driver,
          tableColumnsMap
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
    tableName: undefined,
    driver,
    children: (node.children || []).map((child) =>
      mapSchemaNodeToTreeNode(child, connectionId, connectionName, currentPath, driver, tableColumnsMap)
    ),
  };
}

interface ContextMenuState {
  mouseX: number;
  mouseY: number;
  node: BrowserTreeNode;
}

export function findNodeInTree(
  nodes: BrowserTreeNode[],
  predicate: (node: BrowserTreeNode) => boolean
): BrowserTreeNode | null {
  for (const node of nodes) {
    if (predicate(node)) return node;
    if (node.children && node.children.length > 0) {
      const found = findNodeInTree(node.children, predicate);
      if (found) return found;
    }
  }
  return null;
}

export function getAncestorNodeIds(
  nodes: BrowserTreeNode[],
  targetId: string,
  ancestors: string[] = []
): string[] | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return ancestors;
    }
    if (node.children && node.children.length > 0) {
      const res = getAncestorNodeIds(node.children, targetId, [...ancestors, node.id]);
      if (res) return res;
    }
  }
  return null;
}

export interface ObjectBrowserProps {
  theme?: 'dark' | 'light';
  onEditConnection?: (connection: ConnectionConfig) => void;
  onNewConnection?: () => void;
  lastSavedConnectionId?: string | null;
}

export const ObjectBrowser: React.FC<ObjectBrowserProps> = ({
  theme: _theme,
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
    connectedConnectionIds,
    markConnected,
    markDisconnected,
    moveConnectionToFolder,
    renameFolderInConnections,
    removeFolderFromConnections,
  } = useConnectionStore();

  const {
    folderMetadata,
    customFolders,
    addFolder,
    renameFolder,
    setFolderColor,
    removeFolder,
  } = useFolderStore();

  const [folderModal, setFolderModal] = useState<{
    isOpen: boolean;
    mode: 'create' | 'rename' | 'color';
    folderName?: string;
  }>({
    isOpen: false,
    mode: 'create',
  });
  const [pendingMoveConnId, setPendingMoveConnId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [schemas, setSchemas] = useState<Record<string, SchemaNode[]>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const [createTableTarget, setCreateTableTarget] = useState<{
    connectionId: string;
    schemaName?: string;
    driver?: string;
  } | null>(null);

  const [dropTableTarget, setDropTableTarget] = useState<{
    connectionId: string;
    tableName: string;
    schemaName?: string;
    driver?: string;
  } | null>(null);

  const [renameTableTarget, setRenameTableTarget] = useState<{
    connectionId: string;
    tableName: string;
    schemaName?: string;
    driver?: string;
  } | null>(null);

  const [maintenanceTableTarget, setMaintenanceTableTarget] = useState<{
    connectionId: string;
    tableName: string;
    schemaName?: string;
    driver?: string;
  } | null>(null);

  const [importModalTarget, setImportModalTarget] = useState<{
    connectionId: string;
    tableName: string;
    schemaName?: string;
    columns: { name: string; dataType: string }[];
  } | null>(null);

  const [exportModalTarget, setExportModalTarget] = useState<{
    connectionId: string;
    tableName: string;
    schemaName?: string;
  } | null>(null);

  const [duplicateModalTarget, setDuplicateModalTarget] = useState<{
    connectionId: string;
    sourceTableName: string;
    schemaName?: string;
  } | null>(null);

  const [crossDbCopyModalTarget, setCrossDbCopyModalTarget] = useState<{
    connectionId: string;
    sourceTableName: string;
    schemaName?: string;
  } | null>(null);

  const [exportSqlModalTarget, setExportSqlModalTarget] = useState<{
    connectionId: string;
    tableName?: string;
    schemaName?: string;
  } | null>(null);

  const [importSqlModalTarget, setImportSqlModalTarget] = useState<{
    connectionId: string;
    schemaName?: string;
  } | null>(null);

  const [tableColumnsMap, setTableColumnsMap] = useState<
    Record<string, { loading: boolean; columns?: TableColumnStructure[]; error?: string }>
  >({});

  const handleLoadTableColumns = useCallback(
    async (node: BrowserTreeNode) => {
      const tableKey = `${node.connectionId}:${node.schemaName || ''}:${node.tableName || node.name}`;
      if (tableColumnsMap[tableKey]?.columns || tableColumnsMap[tableKey]?.loading) {
        return;
      }
      setTableColumnsMap((prev) => ({ ...prev, [tableKey]: { loading: true } }));
      try {
        const sql = getFetchColumnsSql(
          node.driver || 'postgres',
          node.tableName || node.name,
          node.schemaName
        );
        const res = await dbApi.executeDirectQuery(node.connectionId, sql);
        const cols = parseColumnsFromQueryResult(res, node.driver || 'postgres');
        setTableColumnsMap((prev) => ({
          ...prev,
          [tableKey]: { loading: false, columns: cols },
        }));
      } catch (err: unknown) {
        console.error(`Failed to load columns for ${tableKey}:`, err);
        setTableColumnsMap((prev) => ({
          ...prev,
          [tableKey]: { loading: false, error: String(err) },
        }));
      }
    },
    [tableColumnsMap]
  );

  const handleInsertColumnToEditor = useCallback((colName: string) => {
    const tabStore = useTabStore.getState();
    const activeTabId = tabStore.activeTabId;
    const activeTab = tabStore.tabs.find((t) => t.id === activeTabId);
    if (activeTab && activeTab.type === 'query' && activeTabId) {
      const current = activeTab.queryContent || '';
      const newContent = current ? `${current} ${colName}` : colName;
      tabStore.setQueryContent(activeTabId, newContent);
      toast.success(`Inserted column "${colName}" into SQL editor`);
    } else {
      navigator.clipboard?.writeText(colName);
      toast.success(`Copied column "${colName}" to clipboard`);
    }
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<TreeApi<BrowserTreeNode>>(null);
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
      markConnected(connectionId);
      treeRef.current?.open(`conn-${connectionId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to load schema for connection ${connectionId}:`, err);
      setErrorMap((prev) => ({ ...prev, [connectionId]: msg }));
      markDisconnected(connectionId);
      setSchemas((prev) => {
        const next = { ...prev };
        delete next[connectionId];
        return next;
      });
      treeRef.current?.open(`conn-${connectionId}`);
    } finally {
      setLoadingMap((prev) => ({ ...prev, [connectionId]: false }));
    }
  }, [markConnected, markDisconnected]);

  const lastProcessedSavedConnRef = useRef<string | null>(null);
  // Auto-connect and load schema when a connection is saved
  useEffect(() => {
    if (lastSavedConnectionId && lastSavedConnectionId !== lastProcessedSavedConnRef.current) {
      lastProcessedSavedConnRef.current = lastSavedConnectionId;
      const targetConn = (connections || []).find((c) => lastSavedConnectionId.startsWith(c.id));
      const shouldAutoConnect = lastSavedConnectionId.includes('-connect-');
      if (targetConn && (shouldAutoConnect || connectedConnectionIds.includes(targetConn.id))) {
        fetchSchema(targetConn.id);
      }
    }
  }, [lastSavedConnectionId, connections, fetchSchema, connectedConnectionIds]);

  // Automatically fetch schema for any connection that is marked connected but lacks schema tree in state
  useEffect(() => {
    connectedConnectionIds.forEach((connId) => {
      if (!schemas[connId] && !loadingMap[connId] && !errorMap[connId]) {
        fetchSchema(connId);
      }
    });
  }, [connectedConnectionIds, schemas, loadingMap, errorMap, fetchSchema]);

  const allFolderNames = useMemo(() => {
    const set = new Set<string>();
    customFolders.forEach((f) => set.add(f));
    (connections || []).forEach((c) => {
      if (c.folder && c.folder.trim()) {
        set.add(c.folder.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [customFolders, connections]);

  const treeData = useMemo<BrowserTreeNode[]>(() => {
    const connMap = new Map<string, BrowserTreeNode>();

    (connections || []).forEach((conn) => {
      const isConnected = connectedConnectionIds.includes(conn.id);
      const connSchema = schemas[conn.id] || [];
      const isLoading = Boolean(loadingMap[conn.id]);
      const errorMsg = errorMap[conn.id];
      const isDisconnected = !isConnected && !isLoading && !errorMsg;

      let children: BrowserTreeNode[];

      if (isDisconnected) {
        children = [];
      } else if (errorMsg) {
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
      } else if (isLoading || (isConnected && schemas[conn.id] === undefined)) {
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
          mapSchemaNodeToTreeNode(schemaNode, conn.id, conn.name, '', conn.driver, tableColumnsMap)
        );
      }

      connMap.set(conn.id, {
        id: `conn-${conn.id}`,
        name: conn.name,
        nodeType: 'connection',
        connectionId: conn.id,
        connectionName: conn.name,
        driver: conn.driver,
        errorMessage: errorMsg,
        isLoading,
        isConnected,
        isDisconnected,
        environment: conn.environment,
        readOnly: conn.readOnly ?? conn.read_only,
        children,
      });
    });

    if (allFolderNames.length === 0) {
      return Array.from(connMap.values());
    }

    const folderNodes: BrowserTreeNode[] = allFolderNames.map((folderName) => {
      const connsInFolder = (connections || [])
        .filter((c) => c.folder === folderName)
        .map((c) => connMap.get(c.id)!)
        .filter(Boolean);

      const color = folderMetadata[folderName]?.color || '#eab308';

      return {
        id: `conn-folder-${folderName}`,
        name: folderName,
        nodeType: 'connection-folder',
        connectionId: '',
        folderColor: color,
        isConnectionFolder: true,
        children:
          connsInFolder.length > 0
            ? connsInFolder
            : [
                {
                  id: `empty-folder-${folderName}`,
                  name: '(Empty folder)',
                  nodeType: 'empty',
                  connectionId: '',
                },
              ],
      };
    });

    const rootConns = (connections || [])
      .filter((c) => !c.folder || !c.folder.trim())
      .map((c) => connMap.get(c.id)!)
      .filter(Boolean);

    return [...folderNodes, ...rootConns];
  }, [connections, schemas, loadingMap, errorMap, connectedConnectionIds, allFolderNames, folderMetadata, tableColumnsMap]);

  const activeTabId = useTabStore((s) => s.activeTabId);
  const activeTab = useTabStore((s) => s.tabs.find((t) => t.id === activeTabId));

  // Active Connection & Context for Sticky Breadcrumb
  const currentActiveConnId = activeTab?.connectionId || activeConnectionId;
  const currentActiveConn = (connections || []).find((c) => c.id === currentActiveConnId);
  const shouldShowBreadcrumb =
    Boolean(currentActiveConn) &&
    Boolean(currentActiveConnId) &&
    (Boolean(activeTab) || (currentActiveConnId ? connectedConnectionIds.includes(currentActiveConnId) : false));

  // Locate active node callback
  const handleLocateActive = useCallback(() => {
    if (!currentActiveConnId || !treeRef.current) return;

    const targetTableName = activeTab?.tableName;
    const targetSchemaName = activeTab?.schemaName;

    const targetNode = findNodeInTree(treeData, (node) => {
      if (node.connectionId !== currentActiveConnId) return false;
      if (targetTableName) {
        const matchesTable =
          (node.nodeType === 'table' || node.nodeType === 'view') &&
          (node.tableName === targetTableName || node.name === targetTableName);
        if (matchesTable) {
          if (!targetSchemaName || !node.schemaName || node.schemaName === targetSchemaName) {
            return true;
          }
        }
        return false;
      }
      if (activeTab?.type === 'table-list') {
        const isTableFolder =
          node.nodeType === 'folder' &&
          (node.name.startsWith('Tables') || node.id.includes('tables')) &&
          (!targetSchemaName || !node.schemaName || node.schemaName === targetSchemaName);
        if (isTableFolder) return true;
      }
      return node.nodeType === 'connection' && node.connectionId === currentActiveConnId;
    });

    if (targetNode) {
      const ancestors = getAncestorNodeIds(treeData, targetNode.id);
      if (ancestors) {
        for (const ancestorId of ancestors) {
          treeRef.current.open(ancestorId);
        }
      }
      treeRef.current.scrollTo(targetNode.id);
      treeRef.current.select(targetNode.id);
    } else {
      treeRef.current.scrollTo(`conn-${currentActiveConnId}`);
      treeRef.current.select(`conn-${currentActiveConnId}`);
    }
  }, [currentActiveConnId, activeTab?.tableName, activeTab?.schemaName, activeTab?.type, treeData]);

  // Click on breadcrumb segment to navigate
  const handleSelectBreadcrumbSegment = useCallback(
    (target: 'connection' | 'database' | 'schema' | 'table') => {
      if (!currentActiveConnId || !treeRef.current) return;

      if (target === 'connection') {
        treeRef.current.open(`conn-${currentActiveConnId}`);
        treeRef.current.scrollTo(`conn-${currentActiveConnId}`);
        treeRef.current.select(`conn-${currentActiveConnId}`);
        return;
      }

      if (target === 'table') {
        handleLocateActive();
        return;
      }

      // For database or schema, find matching node in tree
      const targetNode = findNodeInTree(treeData, (node) => {
        if (node.connectionId !== currentActiveConnId) return false;
        if (target === 'database') {
          return node.nodeType === 'database' || node.name === currentActiveConn?.database;
        }
        if (target === 'schema') {
          return (
            node.nodeType === 'schema' &&
            (!activeTab?.schemaName || node.name === activeTab.schemaName || node.schemaName === activeTab.schemaName)
          );
        }
        return false;
      });

      if (targetNode) {
        const ancestors = getAncestorNodeIds(treeData, targetNode.id);
        if (ancestors) {
          for (const ancestorId of ancestors) {
            treeRef.current.open(ancestorId);
          }
        }
        treeRef.current.scrollTo(targetNode.id);
        treeRef.current.select(targetNode.id);
      }
    },
    [currentActiveConnId, currentActiveConn?.database, activeTab?.schemaName, treeData, handleLocateActive]
  );

  // Auto-reveal and scroll into view when active tab changes
  useEffect(() => {
    if (!activeTab || !activeTab.connectionId || !treeRef.current) return;

    const connId = activeTab.connectionId;
    const targetTableName = activeTab.tableName;
    const targetSchemaName = activeTab.schemaName;

    const targetNode = findNodeInTree(treeData, (node) => {
      if (node.connectionId !== connId) return false;
      if (targetTableName) {
        const matchesTable =
          (node.nodeType === 'table' || node.nodeType === 'view') &&
          (node.tableName === targetTableName || node.name === targetTableName);
        if (matchesTable) {
          if (!targetSchemaName || !node.schemaName || node.schemaName === targetSchemaName) {
            return true;
          }
        }
        return false;
      }
      if (activeTab.type === 'table-list') {
        const isTableFolder =
          node.nodeType === 'folder' &&
          (node.name.startsWith('Tables') || node.id.includes('tables')) &&
          (!targetSchemaName || !node.schemaName || node.schemaName === targetSchemaName);
        if (isTableFolder) return true;
      }
      return node.nodeType === 'connection' && node.connectionId === connId;
    });

    if (targetNode) {
      const ancestors = getAncestorNodeIds(treeData, targetNode.id);
      if (ancestors) {
        for (const ancestorId of ancestors) {
          treeRef.current.open(ancestorId);
        }
      }
      treeRef.current.scrollTo(targetNode.id);
    }
  }, [activeTabId, activeTab?.tableName, activeTab?.connectionId, activeTab?.schemaName, treeData]);

  const handleOpenTable = useCallback((node: BrowserTreeNode) => {
    openTableTab({
      connectionId: node.connectionId,
      tableName: node.tableName || node.name,
      schemaName: node.schemaName,
    });
    setContextMenu(null);
  }, []);

  const handleOpenTableList = useCallback((node: BrowserTreeNode) => {
    openTableListTab({
      connectionId: node.connectionId,
      schemaName: node.schemaName,
    });
    setContextMenu(null);
  }, []);

  const handleOpenERDiagram = useCallback((node: BrowserTreeNode) => {
    openERDiagramTab({
      connectionId: node.connectionId,
      schemaName: node.schemaName,
    });
    setContextMenu(null);
  }, []);

  const handleOpenQueryBuilder = useCallback((node: BrowserTreeNode) => {
    openQueryBuilderTab({
      connectionId: node.connectionId,
      tableName: node.tableName || (node.nodeType === 'table' || node.nodeType === 'view' ? node.name : undefined),
      schemaName: node.schemaName,
    });
    setContextMenu(null);
  }, []);

  const handleEditStructure = useCallback((node: BrowserTreeNode) => {
    openTableTab({
      connectionId: node.connectionId,
      tableName: node.tableName || node.name,
      schemaName: node.schemaName,
      viewMode: 'structure',
    });
    setContextMenu(null);
  }, []);

  const handleNewTable = useCallback((node: BrowserTreeNode) => {
    setCreateTableTarget({
      connectionId: node.connectionId,
      schemaName: node.schemaName,
      driver: node.driver,
    });
    setContextMenu(null);
  }, []);

  const handleRenameTable = useCallback((node: BrowserTreeNode) => {
    setRenameTableTarget({
      connectionId: node.connectionId,
      tableName: node.tableName || node.name,
      schemaName: node.schemaName,
      driver: node.driver,
    });
    setContextMenu(null);
  }, []);

  const handleMaintenanceTable = useCallback((node: BrowserTreeNode) => {
    setMaintenanceTableTarget({
      connectionId: node.connectionId,
      tableName: node.tableName || node.name,
      schemaName: node.schemaName,
      driver: node.driver,
    });
    setContextMenu(null);
  }, []);

  const handleDropTable = useCallback((node: BrowserTreeNode) => {
    setDropTableTarget({
      connectionId: node.connectionId,
      tableName: node.tableName || node.name,
      schemaName: node.schemaName,
      driver: node.driver,
    });
    setContextMenu(null);
  }, []);

  const handleImportTable = useCallback(async (node: BrowserTreeNode) => {
    const tableName = node.tableName || node.name;
    try {
      const res = await dbApi.executeDirectQuery(
        node.connectionId,
        `SELECT * FROM ${tableName} LIMIT 0`
      );
      const cols = (res.columns || []).map((c) => ({
        name: c.name,
        dataType: c.data_type,
      }));
      setImportModalTarget({
        connectionId: node.connectionId,
        tableName,
        schemaName: node.schemaName,
        columns: cols,
      });
    } catch {
      setImportModalTarget({
        connectionId: node.connectionId,
        tableName,
        schemaName: node.schemaName,
        columns: [],
      });
    }
    setContextMenu(null);
  }, []);

  const handleExportTable = useCallback((node: BrowserTreeNode) => {
    setExportModalTarget({
      connectionId: node.connectionId,
      tableName: node.tableName || node.name,
      schemaName: node.schemaName,
    });
    setContextMenu(null);
  }, []);

  const handleDuplicateTable = useCallback((node: BrowserTreeNode) => {
    setDuplicateModalTarget({
      connectionId: node.connectionId,
      sourceTableName: node.tableName || node.name,
      schemaName: node.schemaName,
    });
    setContextMenu(null);
  }, []);

  const handleCopyTableCrossDb = useCallback((node: BrowserTreeNode) => {
    setCrossDbCopyModalTarget({
      connectionId: node.connectionId,
      sourceTableName: node.tableName || node.name,
      schemaName: node.schemaName,
    });
    setContextMenu(null);
  }, []);

  const handleExportSql = useCallback((node: BrowserTreeNode) => {
    const isTable = node.nodeType === 'table' || node.nodeType === 'view';
    setExportSqlModalTarget({
      connectionId: node.connectionId,
      tableName: isTable ? node.tableName || node.name : undefined,
      schemaName: node.schemaName,
    });
    setContextMenu(null);
  }, []);

  const handleImportSql = useCallback((node: BrowserTreeNode) => {
    setImportSqlModalTarget({
      connectionId: node.connectionId,
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

  const handleRefreshMaterializedView = useCallback(async (node: BrowserTreeNode) => {
    const viewName = node.tableName || node.name;
    const sql = buildRefreshMaterializedViewSql(viewName, node.schemaName);
    try {
      await dbApi.executeDirectQuery(node.connectionId, sql);
      toast.success(`Refreshed Materialized View "${viewName}"`);
      useAuditLogStore.getState().addLog({
        action: 'MAINTENANCE',
        connectionName: node.connectionName,
        query: sql,
        status: 'SUCCESS',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Refresh failed: ${msg}`);
    }
    setContextMenu(null);
  }, []);

  const handleShowViewDdl = useCallback((node: BrowserTreeNode) => {
    const viewName = node.tableName || node.name;
    const sql = buildGetViewDdlSql(viewName, node.schemaName || '', node.driver || 'postgres');
    openQueryTab({
      connectionId: node.connectionId,
      connectionName: node.connectionName || node.name,
      schemaName: node.schemaName,
      tableName: viewName,
      driver: node.driver,
      initialQuery: sql,
    });
    setContextMenu(null);
  }, []);

  const handleRefresh = useCallback(
    (connectionId: string) => {
      fetchSchema(connectionId);
      setContextMenu(null);
      toast.success('Schema refreshed');
    },
    [fetchSchema]
  );

  const handleConnect = useCallback(
    async (connectionId: string) => {
      setContextMenu(null);
      await fetchSchema(connectionId);
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
      const confirmed = await showConfirmDialog(
        `Are you sure you want to delete connection "${connName}"?`,
        { title: 'Delete Connection', kind: 'warning' }
      );
      if (confirmed) {
        await removeConnection(connectionId);
        toast.success(`Deleted connection "${connName}"`);
      }
      setContextMenu(null);
    },
    [connections, removeConnection]
  );

  const handleOpenFolderModal = useCallback(
    (mode: 'create' | 'rename' | 'color', folderName?: string) => {
      setFolderModal({
        isOpen: true,
        mode,
        folderName,
      });
      setContextMenu(null);
    },
    []
  );

  const handleFolderModalSubmit = useCallback(
    async ({ name, color }: { name: string; color: string }) => {
      if (folderModal.mode === 'create') {
        addFolder(name, color);
        if (pendingMoveConnId) {
          await moveConnectionToFolder(pendingMoveConnId, name);
          setPendingMoveConnId(null);
        }
        toast.success(`Created folder "${name}"`);
      } else if (folderModal.mode === 'rename') {
        if (folderModal.folderName) {
          renameFolder(folderModal.folderName, name);
          await renameFolderInConnections(folderModal.folderName, name);
          toast.success(`Renamed folder to "${name}"`);
        }
      } else if (folderModal.mode === 'color') {
        if (folderModal.folderName) {
          setFolderColor(folderModal.folderName, color);
          toast.success(`Updated color for "${folderModal.folderName}"`);
        }
      }
    },
    [folderModal, addFolder, renameFolder, setFolderColor, pendingMoveConnId, moveConnectionToFolder, renameFolderInConnections]
  );

  const handleDeleteFolder = useCallback(
    async (folderName: string) => {
      const confirmed = await showConfirmDialog(
        `Are you sure you want to delete folder "${folderName}"? All connections inside will be moved to the root level.`,
        { title: 'Delete Folder', kind: 'warning' }
      );
      if (confirmed) {
        removeFolder(folderName);
        await removeFolderFromConnections(folderName);
        toast.success(`Deleted folder "${folderName}"`);
      }
      setContextMenu(null);
    },
    [removeFolder, removeFolderFromConnections]
  );

  const handleMoveConnection = useCallback(
    async (connectionId: string, folderName?: string) => {
      await moveConnectionToFolder(connectionId, folderName);
      toast.success(
        folderName
          ? `Moved connection to "${folderName}"`
          : 'Moved connection to root'
      );
      setContextMenu(null);
    },
    [moveConnectionToFolder]
  );

  const handleDisconnect = useCallback(
    (connectionId: string) => {
      const conn = (connections || []).find((c) => c.id === connectionId);
      if (activeConnectionId === connectionId) {
        setActiveConnection(null);
      }
      markDisconnected(connectionId);
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
      treeRef.current?.close(`conn-${connectionId}`);
      setContextMenu(null);
      toast.info(`Disconnected from "${conn?.name || 'connection'}"`);

      useTabStore
        .getState()
        .closeTabsForConnection(connectionId)
        .catch((err) => {
          console.error('Failed to teardown connection backend sessions:', err);
        });
    },
    [activeConnectionId, setActiveConnection, connections, markDisconnected]
  );

  const handleCopyName = useCallback((textToCopy: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(textToCopy);
    }
    toast.success(`Copied "${textToCopy}" to clipboard`);
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
    <div className="flex flex-col h-full w-full bg-sidebar border-r border-line text-text select-none transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-line">
        <span className="text-xs font-semibold text-text">
          Connections
        </span>
        <div className="flex items-center space-x-1">
          {onNewConnection && (
            <button
              type="button"
              title="Add New Connection"
              aria-label="Add Connection"
              className="p-1 rounded text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              onClick={onNewConnection}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            title="New Folder"
            aria-label="New Folder"
            data-testid="sidebar-new-folder-btn"
            className="p-1 rounded text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            onClick={() => handleOpenFolderModal('create')}
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Refresh All"
            aria-label="Refresh All"
            className="p-1 rounded text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            onClick={() => (connections || []).forEach((c) => fetchSchema(c.id))}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="p-2 border-b border-line">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-2 text-muted pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search tables/views..."
            className="w-full pl-7 pr-2 py-1 text-xs bg-white dark:bg-gray-800/80 text-text placeholder-muted rounded border border-line focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Sticky Context Breadcrumb Bar */}
      {shouldShowBreadcrumb && currentActiveConn && (
        <ExplorerBreadcrumb
          connectionName={currentActiveConn.name}
          driver={currentActiveConn.driver}
          databaseName={activeTab?.schemaName || currentActiveConn.database}
          schemaName={activeTab?.schemaName}
          tableName={activeTab?.tableName}
          onSelectNode={handleSelectBreadcrumbSegment}
          onLocateActive={handleLocateActive}
          theme={_theme}
        />
      )}

      {/* Tree View Container */}
      <div ref={containerRef} className="flex-1 overflow-hidden p-1">
        {(!connections || connections.length === 0) && customFolders.length === 0 ? (
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
              onConnectConnection: handleConnect,
              onOpenTable: handleOpenTable,
              onOpenTableList: handleOpenTableList,
              onNewQuery: handleNewQuery,
              onEditConnection: handleEditConnection,
              onDeleteConnection: handleDeleteConnection,
              onDisconnectConnection: handleDisconnect,
              onLoadTableColumns: handleLoadTableColumns,
              onInsertColumnToEditor: handleInsertColumnToEditor,
              activeConnectionId: activeTab?.connectionId,
              activeTableName: activeTab?.tableName,
              activeSchemaName: activeTab?.schemaName,
            }}
          >
            <Tree
              ref={treeRef}
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
              openByDefault={false}
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
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-xl py-1 text-xs text-gray-800 dark:text-gray-200 min-w-[160px]"
          style={{ top: contextMenu.mouseY, left: contextMenu.mouseX }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Connection Context Menu */}
          {contextMenu.node.nodeType === 'connection' && (
            <>
              {!connectedConnectionIds.includes(contextMenu.node.connectionId) ? (
                <button
                  type="button"
                  data-testid="connect-connection-btn"
                  className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-emerald-600 dark:text-emerald-400 font-medium"
                  onClick={() => handleConnect(contextMenu.node.connectionId)}
                >
                  <Plug className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Connect</span>
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="disconnect-connection-btn"
                  className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-orange-600 dark:text-orange-400"
                  onClick={() => handleDisconnect(contextMenu.node.connectionId)}
                >
                  <Unplug className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                  <span>Disconnect</span>
                </button>
              )}

              <button
                type="button"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                onClick={() => handleEditConnection(contextMenu.node.connectionId)}
              >
                <Edit className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                <span>Edit Connection</span>
              </button>

              <button
                type="button"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                onClick={() => handleNewQuery(contextMenu.node)}
              >
                <FileCode className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                <span>New Query</span>
              </button>

              <button
                type="button"
                data-testid="schema-run-sql-btn"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                onClick={() => handleImportSql(contextMenu.node)}
              >
                <Upload className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                <span>Run SQL Script...</span>
              </button>

              <button
                type="button"
                data-testid="schema-export-sql-btn"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                onClick={() => handleExportSql(contextMenu.node)}
              >
                <Download className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                <span>Export as SQL Dump...</span>
              </button>

              <button
                type="button"
                data-testid="connection-run-sql-btn"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                onClick={() => handleImportSql(contextMenu.node)}
              >
                <Upload className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                <span>Run SQL Script...</span>
              </button>

              <button
                type="button"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                onClick={() => handleRefresh(contextMenu.node.connectionId)}
              >
                <RefreshCw className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                <span>Refresh Schema</span>
              </button>

              <div className="relative group/folder">
                <button
                  type="button"
                  data-testid="connection-move-folder-btn"
                  className="w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                >
                  <div className="flex items-center space-x-2">
                    <Folder className="w-3.5 h-3.5 text-yellow-500" />
                    <span>Move to Folder</span>
                  </div>
                  <ChevronRight className="w-3 h-3 text-gray-400" />
                </button>
                <div className="hidden group-hover/folder:block absolute left-full top-0 ml-0.5 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-xl py-1 z-50">
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center gap-1.5"
                    onClick={() => handleMoveConnection(contextMenu.node.connectionId, undefined)}
                  >
                    <span>None (Root)</span>
                  </button>
                  {allFolderNames.map((folder) => (
                    <button
                      key={folder}
                      type="button"
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center gap-1.5 truncate"
                      onClick={() => handleMoveConnection(contextMenu.node.connectionId, folder)}
                    >
                      <Folder style={{ color: folderMetadata[folder]?.color || '#eab308' }} className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{folder}</span>
                    </button>
                  ))}
                  <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-600 text-blue-600 dark:text-blue-300 hover:text-white flex items-center gap-1.5"
                    onClick={() => {
                      setPendingMoveConnId(contextMenu.node.connectionId);
                      handleOpenFolderModal('create');
                    }}
                  >
                    <Plus className="w-3 h-3" />
                    <span>New Folder...</span>
                  </button>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 my-1" />

              <button
                type="button"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-red-50 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400"
                onClick={() => handleDeleteConnection(contextMenu.node.connectionId)}
              >
                <Trash2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                <span>Delete Connection</span>
              </button>
            </>
          )}

          {/* Connection Folder Context Menu */}
          {contextMenu.node.nodeType === 'connection-folder' && (
            <>
              <button
                type="button"
                data-testid="folder-new-conn-btn"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                onClick={() => {
                  if (onNewConnection) onNewConnection();
                  setContextMenu(null);
                }}
              >
                <Plus className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                <span>New Connection</span>
              </button>

              <button
                type="button"
                data-testid="folder-rename-btn"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                onClick={() => {
                  handleOpenFolderModal('rename', contextMenu.node.name);
                }}
              >
                <Edit className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                <span>Rename Folder...</span>
              </button>

              <button
                type="button"
                data-testid="folder-change-color-btn"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                onClick={() => {
                  handleOpenFolderModal('color', contextMenu.node.name);
                }}
              >
                <Palette className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
                <span>Change Color...</span>
              </button>

              <div className="border-t border-gray-200 dark:border-gray-700 my-1" />

              <button
                type="button"
                data-testid="folder-delete-btn"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-red-50 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400"
                onClick={() => handleDeleteFolder(contextMenu.node.name)}
              >
                <Trash2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                <span>Delete Folder</span>
              </button>
            </>
          )}

          {/* Table / View Context Menu */}
          {(contextMenu.node.nodeType === 'table' ||
            contextMenu.node.nodeType === 'view') && (
            <>
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                onClick={() => handleOpenTable(contextMenu.node)}
              >
                <Table className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                <span>Open Table</span>
              </button>

              {contextMenu.node.nodeType === 'table' && (
                <>
                  <button
                    type="button"
                    data-testid="edit-structure-btn"
                    className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                    onClick={() => handleEditStructure(contextMenu.node)}
                  >
                    <Wrench className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                    <span>Edit Structure</span>
                  </button>

                  <button
                    type="button"
                    data-testid="import-data-table-btn"
                    className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                    onClick={() => handleImportTable(contextMenu.node)}
                  >
                    <Upload className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                    <span>Import Data...</span>
                  </button>

                  <button
                    type="button"
                    data-testid="export-data-table-btn"
                    className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                    onClick={() => handleExportTable(contextMenu.node)}
                  >
                    <Download className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                    <span>Export Table Data...</span>
                  </button>

                  <button
                    type="button"
                    data-testid="duplicate-table-btn"
                    className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                    onClick={() => handleDuplicateTable(contextMenu.node)}
                  >
                    <Copy className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
                    <span>Duplicate Table...</span>
                  </button>

                  <button
                    type="button"
                    data-testid="copy-table-cross-db-btn"
                    className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                    onClick={() => handleCopyTableCrossDb(contextMenu.node)}
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                    <span>Copy Table to Database...</span>
                  </button>

                  <button
                    type="button"
                    data-testid="export-sql-table-btn"
                    className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                    onClick={() => handleExportSql(contextMenu.node)}
                  >
                    <Download className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                    <span>Export as SQL Dump...</span>
                  </button>
                </>
              )}

              <button
                type="button"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                onClick={() => handleNewQuery(contextMenu.node)}
              >
                <FileCode className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                <span>Query Table</span>
              </button>

              <button
                type="button"
                data-testid="open-query-builder-btn"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-amber-600 dark:text-amber-400 font-medium"
                onClick={() => handleOpenQueryBuilder(contextMenu.node)}
              >
                <Wand2 className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                <span>Visual Query Builder</span>
              </button>

              <button
                type="button"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                onClick={() => handleCopyName(contextMenu.node.tableName || contextMenu.node.name)}
              >
                <Copy className="w-3.5 h-3.5 text-gray-400" />
                <span>Copy Name</span>
              </button>

              {contextMenu.node.nodeType === 'view' && (
                <>
                  <button
                    type="button"
                    data-testid="show-view-ddl-btn"
                    className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                    onClick={() => handleShowViewDdl(contextMenu.node)}
                  >
                    <FileCode className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                    <span>View Definition SQL</span>
                  </button>

                  {(!contextMenu.node.driver || contextMenu.node.driver.toLowerCase() === 'postgres') && (
                    <button
                      type="button"
                      data-testid="refresh-matview-btn"
                      className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                      onClick={() => handleRefreshMaterializedView(contextMenu.node)}
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                      <span>Refresh Materialized View</span>
                    </button>
                  )}
                </>
              )}

              {contextMenu.node.nodeType === 'table' && (
                <>
                  <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                  <button
                    type="button"
                    data-testid="rename-table-btn"
                    className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                    onClick={() => handleRenameTable(contextMenu.node)}
                  >
                    <Pencil className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                    <span>Rename Table...</span>
                  </button>
                  <button
                    type="button"
                    data-testid="maintenance-table-btn"
                    className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                    onClick={() => handleMaintenanceTable(contextMenu.node)}
                  >
                    <Wrench className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                    <span>Maintenance & Diagnostics...</span>
                  </button>
                  <button
                    type="button"
                    data-testid="drop-table-btn"
                    className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-red-50 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400"
                    onClick={() => handleDropTable(contextMenu.node)}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                    <span>Drop Table</span>
                  </button>
                </>
              )}
            </>
          )}

          {/* Database / Schema / Folder Context Menu */}
          {(contextMenu.node.nodeType === 'database' ||
            contextMenu.node.nodeType === 'schema' ||
            contextMenu.node.nodeType === 'folder') && (
            <>
              {(contextMenu.node.id.includes('folder-tables') ||
                contextMenu.node.name.startsWith('Tables') ||
                contextMenu.node.nodeType === 'database' ||
                contextMenu.node.nodeType === 'schema') && (
                <>
                  <button
                    type="button"
                    data-testid="view-table-list-btn"
                    className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-purple-600 dark:text-purple-400 font-medium"
                    onClick={() => handleOpenTableList(contextMenu.node)}
                  >
                    <Table className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
                    <span>View Tables (Details)</span>
                  </button>

                  <button
                    type="button"
                    data-testid="view-er-diagram-btn"
                    className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-emerald-600 dark:text-emerald-400 font-medium"
                    onClick={() => handleOpenERDiagram(contextMenu.node)}
                  >
                    <Network className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                    <span>View ER Diagram</span>
                  </button>

                  <button
                    type="button"
                    data-testid="schema-query-builder-btn"
                    className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-amber-600 dark:text-amber-400 font-medium"
                    onClick={() => handleOpenQueryBuilder(contextMenu.node)}
                  >
                    <Wand2 className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                    <span>Visual Query Builder</span>
                  </button>
                </>
              )}

              <button
                type="button"
                data-testid="new-table-btn"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-emerald-600 dark:text-emerald-400"
                onClick={() => handleNewTable(contextMenu.node)}
              >
                <Plus className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                <span>New Table...</span>
              </button>

              <button
                type="button"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                onClick={() => handleNewQuery(contextMenu.node)}
              >
                <FileCode className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                <span>New Query</span>
              </button>

              <button
                type="button"
                data-testid="schema-run-sql-btn"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                onClick={() => handleImportSql(contextMenu.node)}
              >
                <Upload className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                <span>Run SQL Script...</span>
              </button>

              <button
                type="button"
                data-testid="schema-export-sql-btn"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                onClick={() => handleExportSql(contextMenu.node)}
              >
                <Download className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                <span>Export as SQL Dump...</span>
              </button>

              <button
                type="button"
                data-testid="connection-run-sql-btn"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                onClick={() => handleImportSql(contextMenu.node)}
              >
                <Upload className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                <span>Run SQL Script...</span>
              </button>

              <button
                type="button"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                onClick={() => handleRefresh(contextMenu.node.connectionId)}
              >
                <RefreshCw className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                <span>Refresh</span>
              </button>

              <button
                type="button"
                className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                onClick={() => handleCopyName(contextMenu.node.name)}
              >
                <Copy className="w-3.5 h-3.5 text-gray-400" />
                <span>Copy Name</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Modals */}
      {createTableTarget && (
        <CreateTableModal
          isOpen={true}
          connectionId={createTableTarget.connectionId}
          schemaName={createTableTarget.schemaName}
          driver={createTableTarget.driver}
          onClose={() => setCreateTableTarget(null)}
          onSuccess={(newTableName, newSchema) => {
            fetchSchema(createTableTarget.connectionId);
            openTableTab({
              connectionId: createTableTarget.connectionId,
              tableName: newTableName,
              schemaName: newSchema || createTableTarget.schemaName,
              viewMode: 'structure',
            });
          }}
        />
      )}

      {dropTableTarget && (
        <DropTableModal
          isOpen={true}
          tableName={dropTableTarget.tableName}
          schemaName={dropTableTarget.schemaName}
          connectionId={dropTableTarget.connectionId}
          driver={dropTableTarget.driver}
          onClose={() => setDropTableTarget(null)}
          onSuccess={() => {
            fetchSchema(dropTableTarget.connectionId);
          }}
        />
      )}

      {renameTableTarget && (
        <RenameTableModal
          isOpen={true}
          tableName={renameTableTarget.tableName}
          schemaName={renameTableTarget.schemaName}
          connectionId={renameTableTarget.connectionId}
          driver={renameTableTarget.driver}
          onClose={() => setRenameTableTarget(null)}
          onSuccess={() => {
            fetchSchema(renameTableTarget.connectionId);
          }}
        />
      )}

      {maintenanceTableTarget && (
        <TableMaintenanceModal
          isOpen={true}
          tableName={maintenanceTableTarget.tableName}
          schemaName={maintenanceTableTarget.schemaName}
          connectionId={maintenanceTableTarget.connectionId}
          driver={maintenanceTableTarget.driver}
          onClose={() => setMaintenanceTableTarget(null)}
          onSuccess={() => {
            fetchSchema(maintenanceTableTarget.connectionId);
          }}
        />
      )}

      {importModalTarget && (
        <ImportModal
          isOpen={true}
          tableName={importModalTarget.tableName}
          connectionId={importModalTarget.connectionId}
          tableColumns={importModalTarget.columns}
          onClose={() => setImportModalTarget(null)}
          onImportSuccess={() => {
            fetchSchema(importModalTarget.connectionId);
          }}
        />
      )}

      {exportModalTarget && (
        <ExportModal
          isOpen={true}
          tableName={exportModalTarget.tableName}
          connectionId={exportModalTarget.connectionId}
          onClose={() => setExportModalTarget(null)}
        />
      )}

      {duplicateModalTarget && (
        <DuplicateTableModal
          isOpen={true}
          connectionId={duplicateModalTarget.connectionId}
          sourceTableName={duplicateModalTarget.sourceTableName}
          schemaName={duplicateModalTarget.schemaName}
          onClose={() => setDuplicateModalTarget(null)}
          onSuccess={() => {
            fetchSchema(duplicateModalTarget.connectionId);
          }}
        />
      )}

      {crossDbCopyModalTarget && (
        <CrossDbCopyModal
          isOpen={true}
          sourceConnectionId={crossDbCopyModalTarget.connectionId}
          sourceTableName={crossDbCopyModalTarget.sourceTableName}
          sourceSchemaName={crossDbCopyModalTarget.schemaName}
          onClose={() => setCrossDbCopyModalTarget(null)}
          onSuccess={() => {
            fetchSchema(crossDbCopyModalTarget.connectionId);
          }}
        />
      )}

      {exportSqlModalTarget && (
        <ExportSqlModal
          isOpen={true}
          connectionId={exportSqlModalTarget.connectionId}
          tableName={exportSqlModalTarget.tableName}
          schemaName={exportSqlModalTarget.schemaName}
          onClose={() => setExportSqlModalTarget(null)}
        />
      )}

      {importSqlModalTarget && (
        <ImportSqlModal
          isOpen={true}
          connectionId={importSqlModalTarget.connectionId}
          schemaName={importSqlModalTarget.schemaName}
          onClose={() => setImportSqlModalTarget(null)}
          onSuccess={() => {
            fetchSchema(importSqlModalTarget.connectionId);
          }}
        />
      )}

      <FolderModal
        isOpen={folderModal.isOpen}
        onClose={() => {
          setFolderModal((prev) => ({ ...prev, isOpen: false }));
          setPendingMoveConnId(null);
        }}
        mode={folderModal.mode}
        initialFolderName={folderModal.folderName}
        initialColor={folderModal.folderName ? folderMetadata[folderModal.folderName]?.color : '#3b82f6'}
        existingFolders={allFolderNames}
        onSubmit={handleFolderModalSubmit}
      />
    </div>
  );
};
