import { useState, useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import { MainToolbar } from './components/chrome/MainToolbar';
import { StatusBar } from './components/chrome/StatusBar';
import { DockLayout } from './components/layout/DockLayout';
import { ConnectionDialog } from './components/dialogs/ConnectionDialog';
import { ExportSqlModal } from './components/transfer/ExportSqlModal';
import { ImportSqlModal } from './components/transfer/ImportSqlModal';
import { ExportModal } from './components/transfer/ExportModal';
import { ImportModal } from './components/transfer/ImportModal';
import { DatabaseMetricsModal } from './components/performance/DatabaseMetricsModal';
import { LockInspectorModal } from './components/transactions/LockInspectorModal';
import { AuditLogDrawer } from './components/security/AuditLogDrawer';
import { ConnectionSecurityModal } from './components/security/ConnectionSecurityModal';
import { HistorySnippetsDrawer } from './components/editor/HistorySnippetsDrawer';
import { useConnectionStore } from './stores/connectionStore';
import { useTabStore } from './stores/tabStore';
import { openQueryTab, openTableListTab, openERDiagramTab } from './components/sidebar/tabHelpers';
import { useShortcuts } from './hooks/useShortcuts';
import { dbApi } from './api/db';
import type { ConnectionConfig } from './types/db';

export function App() {
  const { loadConnections, setActiveConnection, activeConnectionId, connections } = useConnectionStore();
  const { tabs, activeTabId } = useTabStore();
  const [isConnectionDialogOpen, setIsConnectionDialogOpen] = useState(false);
  const [connectionToEdit, setConnectionToEdit] = useState<ConnectionConfig | null>(null);
  const [lastSavedConnectionId, setLastSavedConnectionId] = useState<string | null>(null);

  // Global Transfer Modals
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isImportSqlModalOpen, setIsImportSqlModalOpen] = useState(false);
  const [isExportSqlModalOpen, setIsExportSqlModalOpen] = useState(false);
  const [isExportDataModalOpen, setIsExportDataModalOpen] = useState(false);
  const [globalImportDataTarget, setGlobalImportDataTarget] = useState<{
    tableName: string;
    columns: { name: string; dataType: string }[];
  } | null>(null);

  // Global Tools & Diagnostics Modals / Drawers
  const [isMetricsModalOpen, setIsMetricsModalOpen] = useState(false);
  const [isLocksModalOpen, setIsLocksModalOpen] = useState(false);
  const [isAuditLogDrawerOpen, setIsAuditLogDrawerOpen] = useState(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const resolvedConnectionId = activeTab?.connectionId ?? activeConnectionId;
  const activeConnection = connections.find((c) => c.id === resolvedConnectionId);

  // System theme detection: defaults to system preference
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark';
    }
    return 'dark';
  });

  // Listen for system appearance changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setTheme(e.matches ? 'dark' : 'light');
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Load saved connections on application mount
  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  // Sync dark class on document root / body
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        document.body.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
        document.body.classList.remove('dark');
      }
    }
  }, [theme]);

  // Native desktop app polish: prevent default browser context menu and file drop navigation
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      // Allow standard context menu only inside actual input or textarea for copy/paste
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      e.preventDefault();
    };

    const handleDragOver = (e: DragEvent) => e.preventDefault();
    const handleDrop = (e: DragEvent) => e.preventDefault();

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleOpenNewConnection = () => {
    setConnectionToEdit(null);
    setIsConnectionDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsConnectionDialogOpen(false);
    setConnectionToEdit(null);
  };

  const handleSavedConnection = (saved: ConnectionConfig) => {
    setActiveConnection(saved.id);
    setLastSavedConnectionId(`${saved.id}-${Date.now()}`);
  };

  const handleNewQuery = () => {
    if (activeConnectionId) {
      openQueryTab({ connectionId: activeConnectionId });
    }
  };

  const handleOpenTable = () => {
    if (activeConnectionId) {
      openTableListTab({ connectionId: activeConnectionId });
    }
  };

  const handleBackup = () => {
    if (activeConnectionId) {
      setIsBackupModalOpen(true);
    }
  };

  const handleImportSql = () => {
    if (activeConnectionId) {
      setIsImportSqlModalOpen(true);
    }
  };

  const handleImportData = async () => {
    if (!activeConnectionId) return;
    if (activeTab?.type === 'table' && activeTab.tableName) {
      try {
        const res = await dbApi.executeDirectQuery(
          activeConnectionId,
          `SELECT * FROM ${activeTab.tableName} LIMIT 0`
        );
        const cols = (res.columns || []).map((c) => ({
          name: c.name,
          dataType: c.data_type,
        }));
        setGlobalImportDataTarget({
          tableName: activeTab.tableName,
          columns: cols,
        });
      } catch {
        setGlobalImportDataTarget({
          tableName: activeTab.tableName,
          columns: [],
        });
      }
    } else {
      openTableListTab({ connectionId: activeConnectionId });
      toast.info('Please open or right-click a table to import data into it.');
    }
  };

  const handleExportSql = () => {
    if (activeConnectionId) {
      setIsExportSqlModalOpen(true);
    }
  };

  const handleExportData = () => {
    if (!activeConnectionId) return;
    if (activeTab?.type === 'table' && activeTab.tableName) {
      setIsExportDataModalOpen(true);
    } else {
      toast.info('Please open a table tab to export its data, or export as SQL dump.');
      setIsExportSqlModalOpen(true);
    }
  };

  // Keyboard shortcuts integration: ⌘N (New Connection), ⌘T (New Query), ⌘W (Close Tab)
  useShortcuts({
    onNewConnection: handleOpenNewConnection,
    onToggleTheme: handleToggleTheme,
  });

  return (
    <div
      className={`flex flex-col h-screen w-screen overflow-hidden select-none ${
        theme === 'dark' ? 'dark bg-panel text-text' : 'bg-panel text-text'
      }`}
    >
      {/* Top Main Desktop Toolbar (56px) with traffic light clearance */}
      <MainToolbar
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onNewConnection={handleOpenNewConnection}
        onConnect={handleOpenNewConnection}
        onNewQuery={handleNewQuery}
        onOpenTable={handleOpenTable}
        onBackup={handleBackup}
        onImportSql={handleImportSql}
        onImportData={handleImportData}
        onExportSql={handleExportSql}
        onExportData={handleExportData}
        onOpenMetrics={() => {
          if (resolvedConnectionId) setIsMetricsModalOpen(true);
        }}
        onOpenLocks={() => {
          if (resolvedConnectionId) setIsLocksModalOpen(true);
        }}
        onOpenAuditLog={() => setIsAuditLogDrawerOpen(true)}
        onOpenSecurity={() => {
          if (resolvedConnectionId) setIsSecurityModalOpen(true);
        }}
        onOpenHistory={() => setIsHistoryDrawerOpen(true)}
        onOpenERDiagram={() => {
          if (resolvedConnectionId) {
            openERDiagramTab({
              connectionId: resolvedConnectionId,
              schemaName: activeTab?.schemaName,
            });
          }
        }}
        onEditConnection={(conn) => {
          setConnectionToEdit(conn);
          setIsConnectionDialogOpen(true);
        }}
      />

      {/* Main Workspace (Sidebar + Docking Tabs) */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <DockLayout
          theme={theme}
          onNewConnection={handleOpenNewConnection}
          onEditConnection={(conn) => {
            setConnectionToEdit(conn);
            setIsConnectionDialogOpen(true);
          }}
          lastSavedConnectionId={lastSavedConnectionId}
        />
      </div>

      {/* Bottom Global Status Bar (22px) */}
      <StatusBar />

      {/* Connection Modal Dialog */}
      <ConnectionDialog
        isOpen={isConnectionDialogOpen}
        initialConnection={connectionToEdit}
        onClose={handleCloseDialog}
        onSaved={handleSavedConnection}
      />

      {/* Global Backup Modal (SQL Dump) */}
      {isBackupModalOpen && activeConnectionId && (
        <ExportSqlModal
          isOpen={true}
          connectionId={activeConnectionId}
          schemaName={activeTab?.schemaName}
          tableName={activeTab?.type === 'table' ? activeTab.tableName : undefined}
          onClose={() => setIsBackupModalOpen(false)}
        />
      )}

      {/* Global Import SQL Modal */}
      {isImportSqlModalOpen && activeConnectionId && (
        <ImportSqlModal
          isOpen={true}
          connectionId={activeConnectionId}
          schemaName={activeTab?.schemaName}
          onClose={() => setIsImportSqlModalOpen(false)}
        />
      )}

      {/* Global Export SQL Modal */}
      {isExportSqlModalOpen && activeConnectionId && (
        <ExportSqlModal
          isOpen={true}
          connectionId={activeConnectionId}
          schemaName={activeTab?.schemaName}
          tableName={activeTab?.type === 'table' ? activeTab.tableName : undefined}
          onClose={() => setIsExportSqlModalOpen(false)}
        />
      )}

      {/* Global Export Table Data Modal */}
      {isExportDataModalOpen && activeConnectionId && activeTab?.tableName && (
        <ExportModal
          isOpen={true}
          connectionId={activeConnectionId}
          tableName={activeTab.tableName}
          onClose={() => setIsExportDataModalOpen(false)}
        />
      )}

      {/* Global Import Table Data Modal */}
      {globalImportDataTarget && activeConnectionId && (
        <ImportModal
          isOpen={true}
          connectionId={activeConnectionId}
          tableName={globalImportDataTarget.tableName}
          tableColumns={globalImportDataTarget.columns}
          onClose={() => setGlobalImportDataTarget(null)}
        />
      )}

      {/* Global Database Metrics Modal */}
      {isMetricsModalOpen && resolvedConnectionId && (
        <DatabaseMetricsModal
          isOpen={true}
          connectionId={resolvedConnectionId}
          driver={activeConnection?.driver}
          databaseName={activeConnection?.database}
          onClose={() => setIsMetricsModalOpen(false)}
        />
      )}

      {/* Global Lock Inspector Modal */}
      {isLocksModalOpen && resolvedConnectionId && (
        <LockInspectorModal
          isOpen={true}
          connectionId={resolvedConnectionId}
          driver={activeConnection?.driver}
          connectionName={activeConnection?.name}
          onClose={() => setIsLocksModalOpen(false)}
        />
      )}

      {/* Global Audit Log Drawer */}
      <AuditLogDrawer
        isOpen={isAuditLogDrawerOpen}
        onClose={() => setIsAuditLogDrawerOpen(false)}
      />

      {/* Global Connection Security (TLS / At-Rest) Modal */}
      {isSecurityModalOpen && resolvedConnectionId && (
        <ConnectionSecurityModal
          isOpen={true}
          connectionId={resolvedConnectionId}
          driver={activeConnection?.driver}
          connectionName={activeConnection?.name}
          sslMode={activeConnection?.ssl_mode}
          onClose={() => setIsSecurityModalOpen(false)}
        />
      )}

      {/* Global History & Snippets Drawer */}
      <HistorySnippetsDrawer
        isOpen={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
        currentConnectionId={resolvedConnectionId || undefined}
        currentConnectionName={activeConnection?.name}
        currentDatabase={activeConnection?.database}
        onSelectSql={(sql) => {
          setIsHistoryDrawerOpen(false);
          if (resolvedConnectionId) {
            openQueryTab({
              connectionId: resolvedConnectionId,
              connectionName: activeConnection?.name,
              initialQuery: sql,
            });
          }
        }}
      />

      {/* Global Toast Notifications */}
      <Toaster richColors theme={theme} position="bottom-right" />
    </div>
  );
}

export default App;
