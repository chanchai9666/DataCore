import { useState, useEffect } from 'react';
import { Toaster } from 'sonner';
import { MainToolbar } from './components/chrome/MainToolbar';
import { StatusBar } from './components/chrome/StatusBar';
import { DockLayout } from './components/layout/DockLayout';
import { ConnectionDialog } from './components/dialogs/ConnectionDialog';
import { useConnectionStore } from './stores/connectionStore';
import { openQueryTab } from './components/sidebar/tabHelpers';
import type { ConnectionConfig } from './types/db';

export function App() {
  const { loadConnections, setActiveConnection, activeConnectionId } = useConnectionStore();
  const [isConnectionDialogOpen, setIsConnectionDialogOpen] = useState(false);
  const [connectionToEdit, setConnectionToEdit] = useState<ConnectionConfig | null>(null);
  const [lastSavedConnectionId, setLastSavedConnectionId] = useState<string | null>(null);

  // Theme management: default to dark mode (charcoal)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

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

      {/* Global Toast Notifications */}
      <Toaster richColors theme={theme} position="bottom-right" />
    </div>
  );
}

export default App;
