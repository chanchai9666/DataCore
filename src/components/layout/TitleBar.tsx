import React from 'react';
import { Database, Plus, Sun, Moon } from 'lucide-react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useTabStore } from '../../stores/tabStore';

export interface TitleBarProps {
  onNewConnection?: () => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  onNewConnection,
  theme = 'dark',
  onToggleTheme,
}) => {
  const { connections, activeConnectionId } = useConnectionStore();
  const { tabs, activeTabId } = useTabStore();

  // Determine active connection from active tab, or fall back to store activeConnectionId
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const resolvedConnectionId = activeTab?.connectionId ?? activeConnectionId;
  const activeConnection = connections.find((c) => c.id === resolvedConnectionId);

  return (
    <header
      data-tauri-drag-region
      className={`h-11 flex-shrink-0 flex items-center justify-between border-b select-none transition-colors duration-150 ${
        theme === 'dark'
          ? 'bg-gray-900 border-gray-800 text-gray-200'
          : 'bg-gray-50 border-gray-200 text-gray-800'
      }`}
    >
      {/* Left side: Space for macOS traffic lights (pl-20) */}
      <div className="pl-20 flex items-center space-x-2" data-tauri-drag-region>
        <span className="flex items-center text-blue-500 font-bold tracking-wide">
          <Database className="w-4 h-4 mr-1.5" />
          <span className="text-sm font-semibold">DataCore</span>
        </span>
      </div>

      {/* Middle: Active connection / Database Badge */}
      <div
        className="flex items-center space-x-2 px-3 py-1 rounded-md text-xs"
        data-tauri-drag-region
      >
        {activeConnection ? (
          <div
            className={`flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full border ${
              theme === 'dark'
                ? 'bg-gray-800/80 border-gray-700 text-gray-300'
                : 'bg-white border-gray-300 text-gray-700 shadow-sm'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                activeConnection.driver === 'postgres'
                  ? 'bg-indigo-400'
                  : activeConnection.driver === 'mysql'
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'
              }`}
            />
            <span className="font-medium">{activeConnection.name}</span>
            <span className="opacity-40">|</span>
            <span className="opacity-75 uppercase text-[10px] tracking-wider font-semibold">
              {activeConnection.driver}
            </span>
          </div>
        ) : (
          <span className="text-xs opacity-50">No connection selected</span>
        )}
      </div>

      {/* Right: Actions */}
      <div className="pr-4 flex items-center space-x-2">
        <button
          type="button"
          onClick={onNewConnection}
          data-testid="new-connection-btn"
          aria-label="New Connection"
          className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            theme === 'dark'
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm'
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>+ New Connection</span>
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className={`p-1.5 rounded-md transition-colors ${
            theme === 'dark'
              ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
          }`}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};

export default TitleBar;
