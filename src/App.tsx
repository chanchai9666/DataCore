import { useState, useEffect } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { DockLayout } from './components/layout/DockLayout';
import { ConnectionDialog } from './components/dialogs/ConnectionDialog';
import { useConnectionStore } from './stores/connectionStore';
import type { ConnectionConfig } from './types/db';

export function App() {
  const { loadConnections, setActiveConnection } = useConnectionStore();
  const [isConnectionDialogOpen, setIsConnectionDialogOpen] = useState(false);
  const [connectionToEdit, setConnectionToEdit] = useState<ConnectionConfig | null>(null);

  // Theme management: default to dark mode
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
  };

  return (
    <div
      className={`flex flex-col h-screen w-screen overflow-hidden select-none ${
        theme === 'dark' ? 'dark bg-gray-950 text-gray-100' : 'bg-gray-100 text-gray-900'
      }`}
    >
      {/* Top Title Bar with macOS window controls spacing */}
      <TitleBar
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onNewConnection={handleOpenNewConnection}
      />

      {/* Main Workspace (Sidebar + Docking Tabs) */}
      <DockLayout
        theme={theme}
        onNewConnection={handleOpenNewConnection}
      />

      {/* Connection Modal Dialog */}
      <ConnectionDialog
        isOpen={isConnectionDialogOpen}
        initialConnection={connectionToEdit}
        onClose={handleCloseDialog}
        onSaved={handleSavedConnection}
      />
    </div>
  );
}

export default App;
