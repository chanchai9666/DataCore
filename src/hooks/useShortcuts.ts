import { useEffect } from 'react';
import { useTabStore } from '../stores/tabStore';
import { useConnectionStore } from '../stores/connectionStore';
import { openQueryTab } from '../components/sidebar/tabHelpers';

export interface ShortcutHandlers {
  onNewConnection?: () => void;
  onToggleTheme?: () => void;
}

export function useShortcuts({ onNewConnection, onToggleTheme }: ShortcutHandlers = {}) {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (!isCmdOrCtrl) return;

      // Cmd+N: New Connection
      if (e.key.toLowerCase() === 'n' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        onNewConnection?.();
        return;
      }

      // Cmd+T: New Query Tab
      if (e.key.toLowerCase() === 't' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (activeConnectionId) {
          openQueryTab({ connectionId: activeConnectionId });
        }
        return;
      }

      // Cmd+W: Close Active Tab
      if (e.key.toLowerCase() === 'w' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (activeTabId) {
          closeTab(activeTabId);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabId, closeTab, activeConnectionId, onNewConnection, onToggleTheme]);
}

export default useShortcuts;
