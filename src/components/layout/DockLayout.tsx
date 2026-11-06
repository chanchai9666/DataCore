import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileCode,
  Table,
  Plus,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Layers,
} from 'lucide-react';
import { useTabStore } from '../../stores/tabStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { ObjectBrowser } from '../sidebar/ObjectBrowser';
import { SqlEditor } from '../editor/SqlEditor';
import { DataGrid } from '../grid/DataGrid';
import { dbApi } from '../../api/db';
import { openQueryTab } from '../sidebar/tabHelpers';
import type { QueryResult, Tab } from '../../types/db';

export interface DockLayoutProps {
  theme?: 'dark' | 'light';
  onNewConnection?: () => void;
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
}) => {
  const { tabs, activeTabId, setActiveTab, closeTab } = useTabStore();
  const { connections, activeConnectionId } = useConnectionStore();

  // Sidebar collapse & resize state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const isResizingRef = useRef(false);

  // Per-tab query results for 'query' tabs
  const [queryResults, setQueryResults] = useState<Record<string, QueryResult>>({});

  // Per-tab table state for 'table' tabs
  const [tableStates, setTableStates] = useState<Record<string, TableTabState>>({});

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

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
    async (tab: Tab, page = 1, pageSize = 100) => {
      const tabId = tab.id;
      const tableName = tab.tableName;
      if (!tableName) return;

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
        const result = await dbApi.fetchTableData(
          tabId,
          tableName,
          tab.schemaName,
          pageSize,
          offset
        );

        const rowCount = result.rows ? result.rows.length : 0;
        const total = result.rows_affected ?? rowCount;

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

  // Handler for adding a new query tab
  const handleAddNewQueryTab = useCallback(() => {
    const activeTab = tabs.find((t) => t.id === activeTabId);
    let targetConn = connections.find((c) => c.id === activeTab?.connectionId);

    if (!targetConn && activeConnectionId) {
      targetConn = connections.find((c) => c.id === activeConnectionId);
    }
    if (!targetConn && connections.length > 0) {
      targetConn = connections[0];
    }

    if (targetConn) {
      openQueryTab({
        connectionId: targetConn.id,
        connectionName: targetConn.name,
      });
    } else {
      if (onNewConnection) {
        onNewConnection();
      }
    }
  }, [tabs, activeTabId, connections, activeConnectionId, onNewConnection]);

  // Sidebar resize mouse listeners
  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newWidth = Math.max(180, Math.min(500, moveEvent.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

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
            className={`flex items-center justify-between px-3 py-2 border-b text-xs font-semibold ${
              theme === 'dark'
                ? 'border-gray-800 text-gray-400'
                : 'border-gray-200 text-gray-600'
            }`}
          >
            <span className="uppercase tracking-wider">Explorer</span>
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              aria-label="Collapse sidebar"
              className="p-1 rounded hover:bg-gray-700/50 transition-colors"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            <ObjectBrowser />
          </div>

          {/* Resizer Handle */}
          <div
            onMouseDown={handleMouseDownResize}
            className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500 transition-colors z-20"
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
              aria-label="Expand sidebar"
              title="Expand sidebar"
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
                  {tab.type === 'table' ? (
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
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-700/60 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Add Query Tab Button */}
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
        </div>

        {/* Tab Body */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          {!activeTab ? (
            /* Empty State */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-500">
              <Layers className="w-16 h-16 mb-4 opacity-25" />
              <h3 className="text-base font-semibold mb-1">No open tabs</h3>
              <p className="text-xs max-w-sm mb-4">
                Select a table from the Object Browser or click the + button to open a new query tab.
              </p>
              <button
                type="button"
                onClick={handleAddNewQueryTab}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Query Tab</span>
              </button>
            </div>
          ) : activeTab.type === 'query' ? (
            /* Query Tab: Split view (Editor on top, DataGrid on bottom) */
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Top: SQL Editor */}
              <div className="h-1/2 min-h-[140px] flex flex-col overflow-hidden border-b border-gray-800">
                <SqlEditor
                  tabId={activeTab.id}
                  theme={theme}
                  onQueryResult={(result) => {
                    setQueryResults((prev) => ({
                      ...prev,
                      [activeTab.id]: result,
                    }));
                  }}
                />
              </div>

              {/* Bottom: DataGrid displaying QueryResult */}
              <div className="flex-1 min-h-[140px] flex flex-col overflow-hidden">
                <DataGrid
                  data={queryResults[activeTab.id] ?? null}
                  theme={theme}
                />
              </div>
            </div>
          ) : (
            /* Table Tab: Full DataGrid displaying table rows with pagination */
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
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default DockLayout;
