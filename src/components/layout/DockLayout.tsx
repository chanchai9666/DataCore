import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileCode,
  Table,
  Database,
  Plus,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Layers,
  Wrench,
  Network,
  Wand2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTabStore } from '../../stores/tabStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { usePendingChangesStore } from '../../stores/pendingChangesStore';
import { useStatusStore } from '../../stores/statusStore';
import { ObjectBrowser } from '../sidebar/ObjectBrowser';
import { SqlEditor } from '../editor/SqlEditor';
import { DataGrid } from '../grid/DataGrid';
import { dbApi } from '../../api/db';
import { openQueryTab, openTableTab } from '../sidebar/tabHelpers';
import { buildUpdateSql, buildDeleteSql, buildInsertSql, sanitizeEditedCellValue } from '../grid/tableEditHelpers';
import { extractCellValue } from '../grid/gridUtils';
import { showConfirmDialog } from '../../utils/dialog';
import { buildSqlWhereClause, filterInMemoryRows } from '../grid/filterUtils';
import { sortInMemoryRows } from '../grid/sortUtils';
import { InsertRowModal } from '../grid/InsertRowModal';
import { TableStructureEditor } from '../structure/TableStructureEditor';
import { TableListTab } from '../tablelist/TableListTab';
import { ERDiagramTab } from '../diagram/ERDiagramTab';
import { VisualQueryBuilderTab } from '../querybuilder/VisualQueryBuilderTab';
import { DuplicateTableModal } from '../transfer/DuplicateTableModal';
import { getFetchColumnsSql, parseColumnsFromQueryResult } from '../structure/tableStructureHelpers';
import { GridCellKind, EditableGridCell, Item } from '@glideapps/glide-data-grid';
import type { ConnectionConfig, QueryResult, Tab, TableFilterState, TableSortState } from '../../types/db';

export interface DockLayoutProps {
  theme?: 'dark' | 'light';
  onNewConnection?: () => void;
  onEditConnection?: (connection: ConnectionConfig) => void;
  lastSavedConnectionId?: string | null;
}

interface TableTabState {
  data: QueryResult | null;
  loading: boolean;
  page: number;
  pageSize: number;
  totalRows: number;
  error: string | null;
}

export const DockLayout: React.FC<DockLayoutProps> = ({
  theme = 'dark',
  onNewConnection,
  onEditConnection,
  lastSavedConnectionId,
}) => {
  const { t } = useTranslation();
  const { tabs, activeTabId, setActiveTab, closeTab, updateTab } = useTabStore();
  const { connections, activeConnectionId, connectedConnectionIds } = useConnectionStore();
  const hasConnectedDatabase = (connectedConnectionIds?.length ?? 0) > 0;

  // Sidebar collapse & resize state with localStorage persistence
  const [sidebarCollapsed, setSidebarCollapsedState] = useState<boolean>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('datacore-sidebar-collapsed');
      if (saved !== null) return saved === 'true';
    }
    return false;
  });

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsedState(collapsed);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('datacore-sidebar-collapsed', String(collapsed));
    }
  }, []);

  // Listen for global toggle-sidebar keybinding (Cmd+B / Ctrl+B)
  useEffect(() => {
    const handleToggleSidebar = () => {
      setSidebarCollapsedState((prev) => {
        const next = !prev;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('datacore-sidebar-collapsed', String(next));
        }
        return next;
      });
    };
    window.addEventListener('datacore:toggle-sidebar', handleToggleSidebar);
    return () => window.removeEventListener('datacore:toggle-sidebar', handleToggleSidebar);
  }, []);

  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('datacore-sidebar-width');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 180 && parsed <= 500) {
          return parsed;
        }
      }
    }
    return 260;
  });
  const isResizingRef = useRef(false);

  // Split pane height state for Query tab (editor height in pixels) with localStorage persistence
  const [editorHeight, setEditorHeight] = useState<number>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('datacore-editor-height');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 100 && parsed <= 1200) {
          return parsed;
        }
      }
    }
    return 260;
  });

  // Split pane layout direction ('vertical' | 'horizontal') with localStorage persistence
  const [splitDirection, setSplitDirection] = useState<'vertical' | 'horizontal'>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('datacore-split-direction');
      if (saved === 'horizontal' || saved === 'vertical') return saved;
    }
    return 'vertical';
  });

  // Split pane width state for Horizontal Split (editor width in pixels) with localStorage persistence
  const [editorWidth, setEditorWidth] = useState<number>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('datacore-editor-width');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 150 && parsed <= 2500) {
          return parsed;
        }
      }
    }
    return 550;
  });

  const handleToggleSplitDirection = (dir?: 'vertical' | 'horizontal') => {
    const next = dir ?? (splitDirection === 'vertical' ? 'horizontal' : 'vertical');
    setSplitDirection(next);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('datacore-split-direction', next);
    }
  };

  const isResizingSplitRef = useRef(false);
  const querySplitContainerRef = useRef<HTMLDivElement>(null);

  // Per-tab query results for 'query' tabs
  const [queryResults, setQueryResults] = useState<Record<string, QueryResult>>({});
  const [queryMultiResults, setQueryMultiResults] = useState<Record<string, QueryResult[]>>({});
  const [activeResultSubtab, setActiveResultSubtab] = useState<Record<string, number | 'messages'>>({});

  // Per-tab table state for 'table' tabs
  const [tableStates, setTableStates] = useState<Record<string, TableTabState>>({});

  // Status message for table tabs (e.g. "Saved changes", "Row deleted")
  const [tableStatusMessages, setTableStatusMessages] = useState<
    Record<string, { type: 'success' | 'error'; text: string }>
  >({});

  const setTableStatus = useCallback(
    (tabId: string, message: { type: 'success' | 'error'; text: string }) => {
      setTableStatusMessages((prev) => ({
        ...prev,
        [tabId]: message,
      }));
      const duration = message.type === 'success' ? 4000 : 7000;
      setTimeout(() => {
        setTableStatusMessages((prev) => {
          if (prev[tabId]?.text === message.text) {
            const next = { ...prev };
            delete next[tabId];
            return next;
          }
          return prev;
        });
      }, duration);
    },
    []
  );

  // Insert row modal state
  const [insertModalState, setInsertModalState] = useState<{
    tabId: string;
    tableName: string;
    schemaName?: string;
    columns: QueryResult['columns'];
  } | null>(null);

  // Duplicate table modal state
  const [duplicateModalTarget, setDuplicateModalTarget] = useState<{
    connectionId: string;
    sourceTableName: string;
    schemaName?: string;
  } | null>(null);

  // Per-tab table view mode ('data' vs 'structure')
  const [tableTabModes, setTableTabModes] = useState<Record<string, 'data' | 'structure'>>({});

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  // Sync active tab ID with status store for per-tab metrics isolation
  useEffect(() => {
    useStatusStore.getState().setActiveTabId(activeTabId);
  }, [activeTabId]);

  // Ensure active tab session is opened in backend
  useEffect(() => {
    if (activeTab) {
      dbApi.openSession(activeTab.connectionId, activeTab.id).catch((err) => {
        // Ignored or logged; session might already be open
        console.debug('openSession check:', err);
      });
    }
  }, [activeTab]);

  // Function to load table data for a table tab
  const loadTableData = useCallback(
    async (
      tab: Tab,
      page = 1,
      pageSize = 100,
      customFilter?: TableFilterState | null,
      customSort?: TableSortState | null
    ) => {
      const tabId = tab.id;
      const tableName = tab.tableName;
      if (!tableName) return;

      const currentFilter = customFilter !== undefined ? customFilter : tab.filterState;
      const currentSort = customSort !== undefined ? customSort : tab.sortState;
      const currentConnections = useConnectionStore.getState().connections;
      const conn = currentConnections.find((c) => c.id === tab.connectionId);
      const driver = conn?.driver ?? 'postgres';

      let sqlFilter: string | undefined = undefined;
      if (currentFilter && currentFilter.enabled && currentFilter.conditions.length > 0) {
        const clause = buildSqlWhereClause(currentFilter.conditions, currentFilter.conjunction, driver);
        if (clause) {
          sqlFilter = clause;
        }
      }

      const sortCol = currentSort?.column;
      const sortDir = currentSort?.direction;

      setTableStates((prev) => ({
        ...prev,
        [tabId]: {
          data: prev[tabId]?.data ?? null,
          loading: true,
          page,
          pageSize,
          totalRows: prev[tabId]?.totalRows ?? 0,
          error: null,
        },
      }));

      try {
        await dbApi.openSession(tab.connectionId, tabId);
        const offset = (page - 1) * pageSize;
        const result = sortCol
          ? await dbApi.fetchTableData(
              tabId,
              tableName,
              tab.schemaName,
              pageSize,
              offset,
              sqlFilter,
              sortCol,
              sortDir
            )
          : sqlFilter
          ? await dbApi.fetchTableData(
              tabId,
              tableName,
              tab.schemaName,
              pageSize,
              offset,
              sqlFilter
            )
          : await dbApi.fetchTableData(
              tabId,
              tableName,
              tab.schemaName,
              pageSize,
              offset
            );

        const rowCount = result.rows ? result.rows.length : 0;
        const total = result.rows_affected ?? rowCount;

        // If table is empty, columns might be empty from driver query stream.
        // Fallback to fetching column definitions from database schema metadata!
        if (result.columns.length === 0) {
          try {
            const currentConnections = useConnectionStore.getState().connections;
            const conn = currentConnections.find((c) => c.id === tab.connectionId);
            const driver = conn?.driver ?? 'postgres';
            const sql = getFetchColumnsSql(driver, tableName, tab.schemaName);
            const structRes = await dbApi.executeQuery(tabId, sql);
            const parsed = parseColumnsFromQueryResult(structRes, driver);
            if (parsed.length > 0) {
              result.columns = parsed.map((p) => ({
                name: p.name,
                data_type: p.dataType,
                nullable: p.isNullable,
              }));
            }
          } catch (colErr) {
            console.warn('Failed to fallback columns in loadTableData:', colErr);
          }
        }

        const fullTableName = tab.schemaName ? `${tab.schemaName}.${tableName}` : tableName;
        const displaySql = `SELECT * FROM ${fullTableName}${sqlFilter ? ` WHERE ${sqlFilter}` : ''}${sortCol ? ` ORDER BY ${sortCol} ${sortDir || 'ASC'}` : ''} LIMIT ${pageSize} OFFSET ${offset};`;

        useStatusStore.getState().setTabStatus(tabId, {
          lastQuery: displaySql,
          executionTimeMs: result.execution_time_ms,
          rowCount: total,
          statusMessage: null,
        });

        setTableStates((prev) => ({
          ...prev,
          [tabId]: {
            data: result,
            loading: false,
            page,
            pageSize,
            totalRows: total,
            error: null,
          },
        }));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const fullTableName = tab.schemaName ? `${tab.schemaName}.${tableName}` : tableName;
        useStatusStore.getState().setTabStatus(tabId, {
          lastQuery: `SELECT * FROM ${fullTableName};`,
          statusMessage: `Error: ${msg}`,
        });

        setTableStates((prev) => ({
          ...prev,
          [tabId]: {
            data: prev[tabId]?.data ?? null,
            loading: false,
            page,
            pageSize,
            totalRows: prev[tabId]?.totalRows ?? 0,
            error: msg,
          },
        }));
      }
    },
    []
  );

  // Load table data when active tab is a table and has not been loaded yet
  useEffect(() => {
    if (activeTab && activeTab.type === 'table') {
      if (!tableStates[activeTab.id]) {
        loadTableData(activeTab, 1, 100);
      }
    }
  }, [activeTab, tableStates, loadTableData]);

  // Handle cell edit in table tab
  const handleCellEdited = useCallback(
    async (cellCoord: Item, newValueCell: EditableGridCell) => {
      if (!activeTab || activeTab.type !== 'table') return;
      const tabId = activeTab.id;
      const tableState = tableStates[tabId];
      if (!tableState || !tableState.data) return;

      const [colIndex, rowIndex] = cellCoord;
      const column = tableState.data.columns[colIndex];
      const row = tableState.data.rows[rowIndex];
      if (!column || !row) return;

      const oldVal = row[colIndex];

      let rawNewVal: unknown;
      if (newValueCell.kind === GridCellKind.Text) {
        if (
          newValueCell.data === 'NULL' ||
          (newValueCell.data === '' && newValueCell.displayData === 'NULL')
        ) {
          rawNewVal = null;
        } else {
          rawNewVal = newValueCell.data;
        }
      } else if (newValueCell.kind === GridCellKind.Number) {
        rawNewVal = newValueCell.data;
      } else if (newValueCell.kind === GridCellKind.Boolean) {
        rawNewVal = newValueCell.data;
      } else {
        rawNewVal = (newValueCell as any).data ?? null;
      }

      // Sanitize input based on column data type (date/time, numeric, etc.)
      rawNewVal = sanitizeEditedCellValue(rawNewVal, column);

      const oldRawVal = extractCellValue(oldVal).rawValue;
      if (oldRawVal === rawNewVal) return;

      const tableKey = `${activeTab.connectionId}.${activeTab.tableName || activeTab.title}`;
      const isAutoCommit = usePendingChangesStore.getState().isAutoCommitMode(tableKey);
      if (!isAutoCommit) {
        usePendingChangesStore.getState().stageCellEdit(tableKey, {
          rowIndex,
          colIndex,
          colName: column.name,
          oldValue: oldRawVal,
          newValue: rawNewVal,
        });
        return;
      }

      const conn = connections.find((c) => c.id === activeTab.connectionId);
      const driver = conn?.driver ?? 'postgres';

      let updateSql: string;
      try {
        updateSql = buildUpdateSql({
          tableName: activeTab.tableName || activeTab.title,
          schemaName: activeTab.schemaName,
          columns: tableState.data.columns,
          row,
          colIndex,
          newValue: rawNewVal,
          driver,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setTableStatus(tabId, { type: 'error', text: `Cannot update: ${msg}` });
        return;
      }

      // Optimistic update
      const updatedRows = [...tableState.data.rows];
      const updatedRow = [...updatedRows[rowIndex]];
      updatedRow[colIndex] = rawNewVal as any;
      updatedRows[rowIndex] = updatedRow;

      setTableStates((prev) => ({
        ...prev,
        [tabId]: {
          ...prev[tabId],
          data: {
            ...tableState.data!,
            rows: updatedRows,
          },
        },
      }));

      try {
        await dbApi.executeQuery(tabId, updateSql);
        setTableStatus(tabId, { type: 'success', text: `Saved ${column.name} successfully (Auto-Commit)` });
      } catch (err) {
        // Rollback
        const rollbackRows = [...tableState.data.rows];
        rollbackRows[rowIndex] = row;
        setTableStates((prev) => ({
          ...prev,
          [tabId]: {
            ...prev[tabId],
            data: {
              ...tableState.data!,
              rows: rollbackRows,
            },
          },
        }));

        const msg = err instanceof Error ? err.message : String(err);
        setTableStatus(tabId, { type: 'error', text: `Update failed: ${msg}` });
      }
    },
    [activeTab, tableStates, connections]
  );

  // Handle row deletion
  const handleRowDelete = useCallback(
    async (rowIndex: number) => {
      if (!activeTab || activeTab.type !== 'table') return;
      const tabId = activeTab.id;
      const tableState = tableStates[tabId];
      if (!tableState || !tableState.data) return;

      const row = tableState.data.rows[rowIndex];
      if (!row) return;

      const tableKey = `${activeTab.connectionId}.${activeTab.tableName || activeTab.title}`;
      const isAutoCommit = usePendingChangesStore.getState().isAutoCommitMode(tableKey);
      if (!isAutoCommit) {
        usePendingChangesStore.getState().stageDeleteRow(tableKey, rowIndex);
        return;
      }

      const confirmed = await showConfirmDialog(
        `Are you sure you want to delete row #${rowIndex + 1}? This action cannot be undone.`,
        { title: 'Delete Row', kind: 'warning' }
      );
      if (!confirmed) return;

      const conn = connections.find((c) => c.id === activeTab.connectionId);
      const driver = conn?.driver ?? 'postgres';

      let deleteSql: string;
      try {
        deleteSql = buildDeleteSql({
          tableName: activeTab.tableName || activeTab.title,
          schemaName: activeTab.schemaName,
          columns: tableState.data.columns,
          row,
          driver,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setTableStatus(tabId, { type: 'error', text: `Cannot delete: ${msg}` });
        return;
      }

      try {
        await dbApi.executeQuery(tabId, deleteSql);
        setTableStatus(tabId, { type: 'success', text: 'Row deleted successfully' });
        loadTableData(activeTab, tableState.page, tableState.pageSize);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setTableStatus(tabId, { type: 'error', text: `Delete failed: ${msg}` });
      }
    },
    [activeTab, tableStates, connections, loadTableData, setTableStatus]
  );

  // Handle multi-row deletion
  const handleRowsDelete = useCallback(
    async (rowIndices: number[]) => {
      if (!activeTab || activeTab.type !== 'table' || rowIndices.length === 0) return;
      const tabId = activeTab.id;
      const tableState = tableStates[tabId];
      if (!tableState || !tableState.data) return;

      const tableKey = `${activeTab.connectionId}.${activeTab.tableName || activeTab.title}`;
      const isAutoCommit = usePendingChangesStore.getState().isAutoCommitMode(tableKey);
      if (!isAutoCommit) {
        for (const idx of rowIndices) {
          usePendingChangesStore.getState().stageDeleteRow(tableKey, idx);
        }
        return;
      }

      const confirmed = await showConfirmDialog(
        `Are you sure you want to delete ${rowIndices.length} rows? This action cannot be undone.`,
        { title: 'Delete Rows', kind: 'warning' }
      );
      if (!confirmed) return;

      const conn = connections.find((c) => c.id === activeTab.connectionId);
      const driver = conn?.driver ?? 'postgres';

      let successCount = 0;
      for (const idx of rowIndices) {
        const row = tableState.data.rows[idx];
        if (!row) continue;
        try {
          const deleteSql = buildDeleteSql({
            tableName: activeTab.tableName || activeTab.title,
            schemaName: activeTab.schemaName,
            columns: tableState.data.columns,
            row,
            driver,
          });
          await dbApi.executeQuery(tabId, deleteSql);
          successCount++;
        } catch (err) {
          console.error(`Failed to delete row index ${idx}:`, err);
        }
      }

      if (successCount > 0) {
        setTableStatus(tabId, { type: 'success', text: `${successCount} row(s) deleted successfully` });
        loadTableData(activeTab, tableState.page, tableState.pageSize);
      }
    },
    [activeTab, tableStates, connections, loadTableData, setTableStatus]
  );

  // Handle open add row dialog
  const handleAddRow = useCallback(async () => {
    if (!activeTab || activeTab.type !== 'table') return;
    const tabId = activeTab.id;
    const tableState = tableStates[tabId];
    if (!tableState) return;

    let cols = tableState.data?.columns || [];

    // If columns list is empty, fallback to fetching column metadata
    if (cols.length === 0) {
      try {
        const conn = connections.find((c) => c.id === activeTab.connectionId);
        const driver = conn?.driver ?? 'postgres';
        const tableName = activeTab.tableName || activeTab.title;
        const sql = getFetchColumnsSql(driver, tableName, activeTab.schemaName);
        const structRes = await dbApi.executeQuery(tabId, sql);
        const parsed = parseColumnsFromQueryResult(structRes, driver);
        if (parsed.length > 0) {
          cols = parsed.map((p) => ({
            name: p.name,
            data_type: p.dataType,
            nullable: p.isNullable,
          }));

          setTableStates((prev) => ({
            ...prev,
            [tabId]: {
              ...prev[tabId],
              data: {
                columns: cols,
                rows: prev[tabId]?.data?.rows || [],
                execution_time_ms: prev[tabId]?.data?.execution_time_ms || 0,
              },
            },
          }));
        }
      } catch (err) {
        console.warn('Fallback getFetchColumnsSql in handleAddRow failed:', err);
      }
    }

    setInsertModalState({
      tabId,
      tableName: activeTab.tableName || activeTab.title,
      schemaName: activeTab.schemaName,
      columns: cols,
    });
  }, [activeTab, tableStates, connections]);

  // Handle submitting new row
  const handleSubmitInsertRow = useCallback(
    async (values: Record<string, unknown>) => {
      if (!insertModalState || !activeTab) return;
      const tabId = insertModalState.tabId;
      const tableKey = `${activeTab.connectionId}.${insertModalState.tableName}`;
      const isAutoCommit = usePendingChangesStore.getState().isAutoCommitMode(tableKey);

      if (!isAutoCommit) {
        usePendingChangesStore.getState().stageAddRow(tableKey, values);
        setInsertModalState(null);
        return;
      }

      const conn = connections.find((c) => c.id === activeTab.connectionId);
      const driver = conn?.driver ?? 'postgres';

      const insertSql = buildInsertSql({
        tableName: insertModalState.tableName,
        schemaName: insertModalState.schemaName,
        columns: insertModalState.columns,
        values,
        driver,
      });

      await dbApi.executeQuery(tabId, insertSql);
      setTableStatus(tabId, { type: 'success', text: 'Row inserted successfully' });
      setInsertModalState(null);
      const tableState = tableStates[tabId];
      loadTableData(activeTab, tableState?.page ?? 1, tableState?.pageSize ?? 100);
    },
    [insertModalState, activeTab, connections, tableStates, loadTableData, setTableStatus]
  );

  // Handle batch commit of pending changes
  const handleCommitChanges = useCallback(
    async (tableKey: string) => {
      if (!activeTab || activeTab.type !== 'table') return;
      const tabId = activeTab.id;
      const changes = usePendingChangesStore.getState().getTableChanges(tableKey);
      const tableState = tableStates[tabId];
      if (!tableState || !tableState.data) return;

      const conn = connections.find((c) => c.id === activeTab.connectionId);
      const driver = conn?.driver ?? 'postgres';
      const tableName = activeTab.tableName || activeTab.title;
      const schemaName = activeTab.schemaName;
      const columns = tableState.data.columns;

      const statements: string[] = [];

      // 1. Added rows (INSERT)
      for (const rowValues of changes.addedRows) {
        const insertSql = buildInsertSql({
          tableName,
          schemaName,
          columns,
          values: rowValues,
          driver,
        });
        statements.push(insertSql);
      }

      // 2. Cell edits (UPDATE)
      const editsByRow: Record<number, Record<number, unknown>> = {};
      for (const edit of Object.values(changes.cellEdits)) {
        if (!editsByRow[edit.rowIndex]) editsByRow[edit.rowIndex] = {};
        editsByRow[edit.rowIndex][edit.colIndex] = edit.newValue;
      }

      for (const [rowIndexStr, colMap] of Object.entries(editsByRow)) {
        const rowIndex = Number(rowIndexStr);
        const originalRow = tableState.data.rows[rowIndex];
        if (!originalRow) continue;

        for (const [colIndexStr, newVal] of Object.entries(colMap)) {
          const colIndex = Number(colIndexStr);
          const column = columns[colIndex];
          if (!column) continue;
          const updateSql = buildUpdateSql({
            tableName,
            schemaName,
            columns,
            row: originalRow,
            colIndex,
            newValue: newVal,
            driver,
          });
          statements.push(updateSql);
        }
      }

      // 3. Deleted rows (DELETE)
      for (const delIdx of changes.deletedRowIndices) {
        const row = tableState.data.rows[delIdx];
        if (!row) continue;
        const deleteSql = buildDeleteSql({
          tableName,
          schemaName,
          columns,
          row,
          driver,
        });
        statements.push(deleteSql);
      }

      if (statements.length === 0) return;

      try {
        await dbApi.executeQuery(tabId, 'BEGIN');
        try {
          for (const stmt of statements) {
            await dbApi.executeQuery(tabId, stmt);
          }
          await dbApi.executeQuery(tabId, 'COMMIT');
        } catch (execErr) {
          try {
            await dbApi.executeQuery(tabId, 'ROLLBACK');
          } catch (rbErr) {
            console.error('Failed to rollback staged transaction:', rbErr);
          }
          throw execErr;
        }

        usePendingChangesStore.getState().discardChanges(tableKey);
        setTableStatus(tabId, {
          type: 'success',
          text: `Committed ${statements.length} change(s) successfully`,
        });
        loadTableData(activeTab, tableState.page, tableState.pageSize);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setTableStatus(tabId, {
          type: 'error',
          text: `Commit failed: ${msg}`,
        });
      }
    },
    [activeTab, tableStates, connections, loadTableData, setTableStatus]
  );

  // Handler for adding a new query tab
  const handleAddNewQueryTab = useCallback(() => {
    if (!connectedConnectionIds || connectedConnectionIds.length === 0) {
      return;
    }

    const activeTab = tabs.find((t) => t.id === activeTabId);
    let targetConnId: string | undefined;

    if (activeTab?.connectionId && connectedConnectionIds.includes(activeTab.connectionId)) {
      targetConnId = activeTab.connectionId;
    } else if (activeConnectionId && connectedConnectionIds.includes(activeConnectionId)) {
      targetConnId = activeConnectionId;
    } else {
      targetConnId = connectedConnectionIds[0];
    }

    const targetConn = connections.find((c) => c.id === targetConnId);
    if (targetConn) {
      openQueryTab({
        connectionId: targetConn.id,
        connectionName: targetConn.name,
      });
    }
  }, [tabs, activeTabId, connections, activeConnectionId, connectedConnectionIds]);

  // Sidebar resize mouse listeners
  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    let currentWidth = sidebarWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newWidth = Math.max(180, Math.min(500, moveEvent.clientX));
      currentWidth = newWidth;
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('datacore-sidebar-width', String(currentWidth));
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Draggable split resizer between SqlEditor and DataGrid (Vertical or Horizontal)
  const handleSplitResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingSplitRef.current = true;

    if (splitDirection === 'horizontal') {
      const startX = e.clientX;
      const startWidth = editorWidth;
      let currentWidth = editorWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isResizingSplitRef.current) return;
        const deltaX = moveEvent.clientX - startX;
        const containerW = querySplitContainerRef.current?.clientWidth || 1000;
        const newWidth = Math.max(150, Math.min(containerW - 150, startWidth + deltaX));
        currentWidth = newWidth;
        setEditorWidth(newWidth);
      };

      const handleMouseUp = () => {
        isResizingSplitRef.current = false;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('datacore-editor-width', String(currentWidth));
        }
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      const startY = e.clientY;
      const startHeight = editorHeight;
      let currentHeight = editorHeight;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isResizingSplitRef.current) return;
        const deltaY = moveEvent.clientY - startY;
        const containerH = querySplitContainerRef.current?.clientHeight || 600;
        const newHeight = Math.max(100, Math.min(containerH - 100, startHeight + deltaY));
        currentHeight = newHeight;
        setEditorHeight(newHeight);
      };

      const handleMouseUp = () => {
        isResizingSplitRef.current = false;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('datacore-editor-height', String(currentHeight));
        }
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
  };

  // Ensure listeners are cleaned up if component unmounts
  useEffect(() => {
    return () => {
      isResizingRef.current = false;
      isResizingSplitRef.current = false;
    };
  }, []);

  return (
    <div
      className={`flex-1 flex overflow-hidden ${
        theme === 'dark' ? 'bg-gray-950 text-gray-100' : 'bg-gray-100 text-gray-900'
      }`}
    >
      {/* Sidebar: Object Browser */}
      {!sidebarCollapsed && (
        <aside
          style={{ width: `${sidebarWidth}px` }}
          className={`relative flex-shrink-0 flex flex-col h-full border-r ${
            theme === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'
          }`}
        >
          {/* Sidebar Header with collapse button */}
          <div
            className={`flex items-center justify-between px-3 py-1.5 border-b text-xs font-semibold ${
              theme === 'dark'
                ? 'border-gray-800 text-gray-400'
                : 'border-gray-200 text-gray-600'
            }`}
          >
            <span className="font-semibold text-gray-700 dark:text-gray-300">Explorer</span>
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              aria-label="Collapse sidebar"
              className="p-1 rounded text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700/50 transition-colors"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            <ObjectBrowser
              theme={theme}
              onEditConnection={onEditConnection}
              onNewConnection={onNewConnection}
              lastSavedConnectionId={lastSavedConnectionId}
            />
          </div>

          {/* Resizer Handle */}
          <div
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label="Resize Sidebar"
            aria-valuenow={sidebarWidth}
            aria-valuemin={180}
            aria-valuemax={500}
            data-testid="sidebar-splitter"
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setSidebarWidth((prev) => {
                  const next = Math.max(180, prev - 10);
                  if (typeof localStorage !== 'undefined') {
                    localStorage.setItem('datacore-sidebar-width', String(next));
                  }
                  return next;
                });
              } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                setSidebarWidth((prev) => {
                  const next = Math.min(500, prev + 10);
                  if (typeof localStorage !== 'undefined') {
                    localStorage.setItem('datacore-sidebar-width', String(next));
                  }
                  return next;
                });
              }
            }}
            onMouseDown={handleMouseDownResize}
            className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors z-20"
          />
        </aside>
      )}

      {/* Main Docking Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Tab Bar Header */}
        <div
          role="tablist"
          className={`flex items-center border-b overflow-x-auto select-none ${
            theme === 'dark'
              ? 'bg-gray-900 border-gray-800'
              : 'bg-gray-100 border-gray-200'
          }`}
        >
          {sidebarCollapsed && (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              aria-label={t('layout.expandSidebar', 'Expand sidebar')}
              title={t('layout.expandSidebar', 'Expand sidebar')}
              className={`p-2 border-r transition-colors ${
                theme === 'dark'
                  ? 'border-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                  : 'border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-200'
              }`}
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}

          {/* Tabs */}
          <div className="flex items-center flex-1 overflow-x-auto min-w-0">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <div
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`group flex items-center space-x-2 px-3 py-2 border-r text-xs cursor-pointer max-w-[200px] min-w-[120px] transition-colors ${
                    isActive
                      ? theme === 'dark'
                        ? 'bg-gray-950 text-blue-400 border-r-gray-800 font-medium border-t-2 border-t-blue-500'
                        : 'bg-white text-blue-600 border-r-gray-200 font-medium border-t-2 border-t-blue-600 shadow-sm'
                      : theme === 'dark'
                      ? 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200 border-r-gray-800'
                      : 'text-gray-600 hover:bg-gray-200/60 hover:text-gray-900 border-r-gray-200'
                  }`}
                >
                  {tab.type === 'table-list' ? (
                    <Database className="w-3.5 h-3.5 flex-shrink-0 text-purple-400" />
                  ) : tab.type === 'er-diagram' ? (
                    <Network className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" />
                  ) : tab.type === 'query-builder' ? (
                    <Wand2 className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
                  ) : tab.type === 'table' ? (
                    <Table className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" />
                  ) : (
                    <FileCode className="w-3.5 h-3.5 flex-shrink-0 text-blue-400" />
                  )}
                  <span className="truncate flex-1">{tab.title}</span>
                  <button
                    type="button"
                    aria-label="Close tab"
                    data-testid={`close-tab-${tab.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700/60 transition-colors transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Add Query Tab Button */}
          {hasConnectedDatabase && (
            <button
              type="button"
              data-testid="add-query-tab-btn"
              onClick={handleAddNewQueryTab}
              aria-label="New Query Tab"
              title="New Query Tab"
              className={`p-2 transition-colors flex-shrink-0 ${
                theme === 'dark'
                  ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
              }`}
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Tab Body */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          {!activeTab ? (
            /* Empty State */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-500">
              <Layers className="w-16 h-16 mb-4 opacity-25" />
              <h3 className="text-base font-semibold mb-1">
                {hasConnectedDatabase ? t('layout.noOpenTabs', 'No open tabs') : t('layout.noDatabaseConnected', 'No database connected')}
              </h3>
              <p className="text-xs max-w-sm mb-4">
                {hasConnectedDatabase
                  ? t('layout.emptyTabsConnectedHelp', 'Select a table from the Object Browser or click the + button to open a new query tab.')
                  : t('layout.emptyTabsDisconnectedHelp', 'Connect to a database in the Object Browser to start querying or viewing tables.')}
              </p>
              {hasConnectedDatabase ? (
                <button
                  type="button"
                  data-testid="empty-new-query-tab-btn"
                  onClick={handleAddNewQueryTab}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('layout.newQueryTab', 'New Query Tab')}</span>
                </button>
              ) : connections.length === 0 && onNewConnection ? (
                <button
                  type="button"
                  data-testid="empty-add-connection-btn"
                  onClick={onNewConnection}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('layout.addConnection', 'Add Connection')}</span>
                </button>
              ) : null}
            </div>
          ) : activeTab.type === 'er-diagram' ? (
            /* ER Diagram Tab */
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <ERDiagramTab
                connectionId={activeTab.connectionId}
                driver={connections.find((c) => c.id === activeTab.connectionId)?.driver}
                schemaName={activeTab.schemaName}
                theme={theme}
              />
            </div>
          ) : activeTab.type === 'query-builder' ? (
            /* Visual Query Builder Tab */
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <VisualQueryBuilderTab
                tab={activeTab}
                connectionId={activeTab.connectionId}
                driver={connections.find((c) => c.id === activeTab.connectionId)?.driver}
                schemaName={activeTab.schemaName}
                tableName={activeTab.tableName}
                theme={theme}
              />
            </div>
          ) : activeTab.type === 'table-list' ? (
            /* Table List View Tab */
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <TableListTab
                connectionId={activeTab.connectionId}
                schemaName={activeTab.schemaName}
                theme={theme}
                onOpenTable={(tableName: string) => {
                  openTableTab({
                    connectionId: activeTab.connectionId,
                    tableName,
                    schemaName: activeTab.schemaName,
                  });
                }}
                onOpenStructure={(tableName: string) => {
                  openTableTab({
                    connectionId: activeTab.connectionId,
                    tableName,
                    schemaName: activeTab.schemaName,
                    viewMode: 'structure',
                  });
                }}
                onDuplicateTable={(tableName: string) => {
                  setDuplicateModalTarget({
                    connectionId: activeTab.connectionId,
                    sourceTableName: tableName,
                    schemaName: activeTab.schemaName,
                  });
                }}
              />
            </div>
          ) : activeTab.type === 'query' ? (
            /* Query Tab: Split view (Editor and DataGrid with vertical or horizontal resizer) */
            <div
              ref={querySplitContainerRef}
              className={`flex-1 flex ${splitDirection === 'horizontal' ? 'flex-row' : 'flex-col'} min-h-0 overflow-hidden relative`}
            >
              {/* SQL Editor */}
              <div
                style={
                  splitDirection === 'horizontal'
                    ? { width: `${editorWidth}px` }
                    : { height: `${editorHeight}px` }
                }
                className="flex flex-col overflow-hidden flex-shrink-0"
              >
                <SqlEditor
                  tabId={activeTab.id}
                  theme={theme}
                  splitDirection={splitDirection}
                  onToggleSplit={handleToggleSplitDirection}
                  isReadOnly={Boolean(
                    connections.find((c) => c.id === activeTab.connectionId)?.readOnly ||
                    connections.find((c) => c.id === activeTab.connectionId)?.read_only
                  )}
                  onQueryResult={(result, multiResults) => {
                    setQueryResults((prev) => ({
                      ...prev,
                      [activeTab.id]: result,
                    }));
                    if (multiResults && multiResults.length > 1) {
                      setQueryMultiResults((prev) => ({
                        ...prev,
                        [activeTab.id]: multiResults,
                      }));
                      setActiveResultSubtab((prev) => ({
                        ...prev,
                        [activeTab.id]: 0,
                      }));
                    } else {
                      setQueryMultiResults((prev) => {
                        const next = { ...prev };
                        delete next[activeTab.id];
                        return next;
                      });
                    }
                  }}
                />
              </div>

              {/* Draggable Split Resizer between Editor and Grid */}
              <div
                data-testid="split-resizer"
                role="separator"
                tabIndex={0}
                aria-orientation={splitDirection === 'horizontal' ? 'vertical' : 'horizontal'}
                aria-label="Resize editor and results"
                aria-valuenow={splitDirection === 'horizontal' ? editorWidth : editorHeight}
                onKeyDown={(e) => {
                  if (splitDirection === 'horizontal') {
                    if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      setEditorWidth((prev) => {
                        const next = Math.max(150, prev - 10);
                        if (typeof localStorage !== 'undefined') {
                          localStorage.setItem('datacore-editor-width', String(next));
                        }
                        return next;
                      });
                    } else if (e.key === 'ArrowRight') {
                      e.preventDefault();
                      const containerW = querySplitContainerRef.current?.clientWidth || 1000;
                      setEditorWidth((prev) => {
                        const next = Math.min(containerW - 150, prev + 10);
                        if (typeof localStorage !== 'undefined') {
                          localStorage.setItem('datacore-editor-width', String(next));
                        }
                        return next;
                      });
                    }
                  } else {
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setEditorHeight((prev) => {
                        const next = Math.max(100, prev - 10);
                        if (typeof localStorage !== 'undefined') {
                          localStorage.setItem('datacore-editor-height', String(next));
                        }
                        return next;
                      });
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      const containerH = querySplitContainerRef.current?.clientHeight || 600;
                      setEditorHeight((prev) => {
                        const next = Math.min(containerH - 100, prev + 10);
                        if (typeof localStorage !== 'undefined') {
                          localStorage.setItem('datacore-editor-height', String(next));
                        }
                        return next;
                      });
                    }
                  }
                }}
                onMouseDown={handleSplitResizeMouseDown}
                className={`${
                  splitDirection === 'horizontal'
                    ? 'w-1.5 h-full cursor-col-resize border-x'
                    : 'h-1.5 w-full cursor-row-resize border-y'
                } flex-shrink-0 transition-colors z-10 flex items-center justify-center focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                  theme === 'dark'
                    ? 'bg-gray-900 border-gray-800 hover:bg-blue-600/60 active:bg-blue-600'
                    : 'bg-gray-200 border-gray-300 hover:bg-blue-500/60 active:bg-blue-500'
                }`}
              >
                <div
                  className={`${
                    splitDirection === 'horizontal' ? 'w-0.5 h-8' : 'w-8 h-0.5'
                  } rounded-full ${
                    theme === 'dark' ? 'bg-gray-600' : 'bg-gray-400'
                  }`}
                />
              </div>

              {/* Bottom / Right: Multi-Result Tabs & DataGrid */}
              <div className="flex-1 min-h-[100px] min-w-[200px] flex flex-col overflow-hidden">
                {(() => {
                  const multi = queryMultiResults[activeTab.id];
                  const hasMulti = multi && multi.length > 1;
                  const currentSubtab = activeResultSubtab[activeTab.id] ?? 0;
                  const activeResult = hasMulti
                    ? (typeof currentSubtab === 'number' ? multi[currentSubtab] : null)
                    : (queryResults[activeTab.id] || null);

                  return (
                    <>
                      {/* Multi-Result Sub-tabs Bar */}
                      {hasMulti && (
                        <div
                          data-testid="multi-result-tabs-bar"
                          className={`flex items-center gap-1 px-2 border-b flex-shrink-0 overflow-x-auto text-xs ${
                            theme === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-gray-100 border-gray-200'
                          }`}
                        >
                          {multi.map((res, idx) => {
                            const stmt = (res as any).statement || '';
                            const tblMatch = stmt.match(/\b(?:FROM|INTO|UPDATE|JOIN|TABLE)\s+[`"']?([a-zA-Z0-9_]+)[`"']?/i);
                            const tblName = tblMatch ? tblMatch[1] : null;
                            const label = tblName ? `Result ${idx + 1} (${tblName})` : `Result ${idx + 1}`;
                            const isSelected = currentSubtab === idx;

                            return (
                              <button
                                key={idx}
                                data-testid={`result-subtab-${idx}`}
                                type="button"
                                onClick={() => setActiveResultSubtab((prev) => ({ ...prev, [activeTab.id]: idx }))}
                                className={`px-3 py-1.5 font-medium border-b-2 transition-colors ${
                                  isSelected
                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-500/10'
                                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                }`}
                              >
                                {label}
                                {res.rows ? (
                                  <span className="ml-1.5 text-[10px] opacity-75">({res.rows.length})</span>
                                ) : null}
                              </button>
                            );
                          })}

                          <button
                            data-testid="result-subtab-messages"
                            type="button"
                            onClick={() => setActiveResultSubtab((prev) => ({ ...prev, [activeTab.id]: 'messages' }))}
                            className={`px-3 py-1.5 font-medium border-b-2 transition-colors ${
                              currentSubtab === 'messages'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-500/10'
                                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                            }`}
                          >
                            Messages
                          </button>
                        </div>
                      )}

                      {/* Content: Messages view or DataGrid */}
                      {hasMulti && currentSubtab === 'messages' ? (
                        <div
                          data-testid="query-messages-view"
                          className={`flex-1 p-4 font-mono text-xs overflow-auto select-text whitespace-pre-wrap ${
                            theme === 'dark' ? 'bg-gray-950 text-gray-300' : 'bg-white text-gray-800'
                          }`}
                        >
                          {multi.map((r, i) => (
                            <div key={i} className="mb-3">
                              <div className="font-semibold text-blue-500 dark:text-blue-400">
                                [Query {i + 1}] {(r as any).statement || 'Statement'}
                              </div>
                              <div className="text-gray-500 dark:text-gray-400 mt-0.5">
                                {r.rows
                                  ? `${r.rows.length} rows retrieved in ${r.execution_time_ms} ms.`
                                  : `${r.rows_affected ?? 0} rows affected in ${r.execution_time_ms} ms.`}
                              </div>
                            </div>
                          ))}
                          <div className="mt-4 pt-2 border-t border-gray-700/50 text-emerald-500 font-semibold">
                            Total execution time: {multi.reduce((acc, curr) => acc + curr.execution_time_ms, 0)} ms. All statements finished.
                          </div>
                        </div>
                      ) : (
                        <DataGrid
                          data={(() => {
                            const raw = activeResult;
                            if (!raw) return null;
                            let rows = raw.rows;
                            if (activeTab.filterState && activeTab.filterState.enabled) {
                              rows = filterInMemoryRows(
                                raw.columns,
                                rows,
                                activeTab.filterState.conditions,
                                activeTab.filterState.conjunction
                              );
                            }
                            if (activeTab.sortState) {
                              rows = sortInMemoryRows(
                                raw.columns,
                                rows,
                                activeTab.sortState.column,
                                activeTab.sortState.direction
                              );
                            }
                            return {
                              ...raw,
                              rows,
                            };
                          })()}
                          theme={theme}
                          filterState={activeTab.filterState}
                          onFilterChange={(newFilter) => updateTab(activeTab.id, { filterState: newFilter })}
                          onApplyFilter={() => {}}
                          onClearFilter={() => {
                            const cleared: TableFilterState = {
                              enabled: false,
                              conjunction: 'AND',
                              conditions: [
                                {
                                  id: 'c1',
                                  column: activeResult?.columns?.[0]?.name || '',
                                  operator: '=',
                                  value: '',
                                },
                              ],
                            };
                            updateTab(activeTab.id, { filterState: cleared });
                          }}
                          sortState={activeTab.sortState}
                          onSortChange={(newSort) => updateTab(activeTab.id, { sortState: newSort })}
                          columnWidths={activeTab.columnWidths}
                          onColumnResize={(colId, newWidth) => {
                            updateTab(activeTab.id, {
                              columnWidths: {
                                ...(activeTab.columnWidths || {}),
                                [colId]: newWidth,
                              },
                            });
                          }}
                          driver={connections.find((c) => c.id === activeTab.connectionId)?.driver}
                        />
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          ) : (
            /* Table Tab: Data vs Structure view */
            (() => {
              const currentMode =
                tableTabModes[activeTab.id] ?? activeTab.viewMode ?? 'data';

              return (
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                  {/* Table Sub-header: Rendered in Data view; in Structure view, TableStructureEditor renders its unified Tier 1 bar */}
                  {currentMode === 'data' && (
                    <div
                      className={`flex items-center justify-between px-3 py-1.5 border-b text-xs flex-shrink-0 select-none ${
                        theme === 'dark'
                          ? 'bg-gray-900 border-gray-800'
                          : 'bg-gray-100 border-gray-200'
                      }`}
                    >
                      <div className={`flex items-center space-x-1 p-0.5 rounded border ${
                        theme === 'dark'
                          ? 'bg-black/20 border-gray-700/40'
                          : 'bg-gray-200/60 border-gray-300'
                      }`}>
                        <button
                          type="button"
                          data-testid="table-mode-data-btn"
                          onClick={() =>
                            setTableTabModes((prev) => ({
                              ...prev,
                              [activeTab.id]: 'data',
                            }))
                          }
                          className="inline-flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-medium transition-colors bg-blue-600 text-white shadow-sm"
                        >
                          <Table className="w-3.5 h-3.5" />
                          <span>Data</span>
                        </button>

                        <button
                          type="button"
                          data-testid="table-mode-structure-btn"
                          onClick={() =>
                            setTableTabModes((prev) => ({
                              ...prev,
                              [activeTab.id]: 'structure',
                            }))
                          }
                          className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
                            theme === 'dark'
                              ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
                          }`}
                        >
                          <Wrench className="w-3.5 h-3.5 text-amber-400" />
                          <span>Structure</span>
                        </button>
                      </div>

                      <div className="text-gray-500 text-[11px] font-mono">
                        {activeTab.schemaName ? `${activeTab.schemaName}.` : ''}
                        <span className="font-semibold text-gray-700 dark:text-gray-300">
                          {activeTab.tableName}
                        </span>
                      </div>
                    </div>
                  )}

                  {currentMode === 'data' ? (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                      <DataGrid
                        data={tableStates[activeTab.id]?.data ?? null}
                        isLoading={tableStates[activeTab.id]?.loading}
                        page={tableStates[activeTab.id]?.page ?? 1}
                        pageSize={tableStates[activeTab.id]?.pageSize ?? 100}
                        totalRows={tableStates[activeTab.id]?.totalRows ?? 0}
                        onPageChange={(newPage) => {
                          loadTableData(
                            activeTab,
                            newPage,
                            tableStates[activeTab.id]?.pageSize ?? 100
                          );
                        }}
                        onPageSizeChange={(newSize) => {
                          loadTableData(activeTab, 1, newSize);
                        }}
                        onRefresh={() => {
                          loadTableData(
                            activeTab,
                            tableStates[activeTab.id]?.page ?? 1,
                            tableStates[activeTab.id]?.pageSize ?? 100
                          );
                        }}
                        theme={theme}
                        isReadOnly={Boolean(
                          connections.find((c) => c.id === activeTab.connectionId)?.readOnly ||
                          connections.find((c) => c.id === activeTab.connectionId)?.read_only
                        )}
                        isEditable={true}
                        onCellEdited={handleCellEdited}
                        onRowDelete={handleRowDelete}
                        onRowsDelete={handleRowsDelete}
                        onAddRow={handleAddRow}
                        statusMessage={tableStatusMessages[activeTab.id]}
                        filterState={activeTab.filterState}
                        onFilterChange={(newFilter) =>
                          updateTab(activeTab.id, { filterState: newFilter })
                        }
                        onApplyFilter={() =>
                          loadTableData(
                            activeTab,
                            1,
                            tableStates[activeTab.id]?.pageSize ?? 100
                          )
                        }
                        onClearFilter={() => {
                          const cleared: TableFilterState = {
                            enabled: false,
                            conjunction: 'AND',
                            conditions: [
                              {
                                id: 'c1',
                                column:
                                  tableStates[activeTab.id]?.data?.columns?.[0]?.name || '',
                                operator: '=',
                                value: '',
                              },
                            ],
                          };
                          updateTab(activeTab.id, { filterState: cleared });
                          loadTableData(
                            activeTab,
                            1,
                            tableStates[activeTab.id]?.pageSize ?? 100,
                            cleared
                          );
                        }}
                        sortState={activeTab.sortState}
                        onSortChange={(newSort) => {
                          updateTab(activeTab.id, { sortState: newSort });
                          loadTableData(
                            activeTab,
                            1,
                            tableStates[activeTab.id]?.pageSize ?? 100,
                            undefined,
                            newSort
                          );
                        }}
                        columnWidths={activeTab.columnWidths}
                        onColumnResize={(colId, newWidth) => {
                          updateTab(activeTab.id, {
                            columnWidths: {
                              ...(activeTab.columnWidths || {}),
                              [colId]: newWidth,
                            },
                          });
                        }}
                        driver={connections.find((c) => c.id === activeTab.connectionId)?.driver}
                        connectionId={activeTab.connectionId}
                        tableName={activeTab.tableName}
                        onCommitChanges={handleCommitChanges}
                      />
                    </div>
                  ) : (
                    <TableStructureEditor
                      tabId={activeTab.id}
                      connectionId={activeTab.connectionId}
                      tableName={activeTab.tableName || activeTab.title}
                      schemaName={activeTab.schemaName}
                      driver={
                        connections.find((c) => c.id === activeTab.connectionId)
                          ?.driver
                      }
                      theme={theme}
                      currentMode={currentMode}
                      onModeChange={(newMode) => {
                        setTableTabModes((prev) => ({
                          ...prev,
                          [activeTab.id]: newMode,
                        }));
                      }}
                      onStructureChanged={() => {
                        loadTableData(
                          activeTab,
                          tableStates[activeTab.id]?.page ?? 1,
                          tableStates[activeTab.id]?.pageSize ?? 100
                        );
                      }}
                    />
                  )}
                </div>
              );
            })()
          )}
        </div>
      </main>

      {/* Insert Row Modal */}
      {insertModalState && (
        <InsertRowModal
          isOpen={true}
          onClose={() => setInsertModalState(null)}
          tableName={insertModalState.tableName}
          schemaName={insertModalState.schemaName}
          columns={insertModalState.columns}
          onSubmit={handleSubmitInsertRow}
          theme={theme}
        />
      )}

      {/* Duplicate Table Modal */}
      {duplicateModalTarget && (
        <DuplicateTableModal
          isOpen={true}
          connectionId={duplicateModalTarget.connectionId}
          sourceTableName={duplicateModalTarget.sourceTableName}
          schemaName={duplicateModalTarget.schemaName}
          onClose={() => setDuplicateModalTarget(null)}
          onSuccess={(newTableName) => {
            // Automatically open the newly duplicated table data
            openTableTab({
              connectionId: duplicateModalTarget.connectionId,
              tableName: newTableName,
              schemaName: duplicateModalTarget.schemaName,
            });
          }}
        />
      )}
    </div>
  );
};

export default DockLayout;
