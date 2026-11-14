import { useEffect } from 'react';
import { useTabStore } from '../stores/tabStore';
import { useConnectionStore } from '../stores/connectionStore';
import { openQueryTab } from '../components/sidebar/tabHelpers';
import type { Tab } from '../types/db';

export interface ShortcutHandlers {
  onNewConnection?: () => void;
  onToggleTheme?: () => void;
  onOpenShortcuts?: () => void;
  onToggleSidebar?: () => void;
  onPreviousTab?: () => void;
  onNextTab?: () => void;
  onDuplicateTab?: () => void;
  onEscape?: () => void;
}

export function useShortcuts({
  onNewConnection,
  onToggleTheme,
  onOpenShortcuts,
  onToggleSidebar,
  onPreviousTab,
  onNextTab,
  onDuplicateTab,
  onEscape,
}: ShortcutHandlers = {}) {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent F5 reload
      if (e.key === 'F5') {
        e.preventDefault();
        return;
      }

      // Escape: Close modals, drawers, or dismiss overlays
      if (e.key === 'Escape') {
        onEscape?.();
        return;
      }

      // '?' without modifiers (when not inside an input/textarea): Open shortcuts cheat sheet
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        const isInput =
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable);
        if (!isInput && onOpenShortcuts) {
          e.preventDefault();
          onOpenShortcuts();
          return;
        }
      }

      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (!isCmdOrCtrl) return;

      // Prevent native browser reload (Cmd+R, Cmd+Shift+R)
      if (e.key.toLowerCase() === 'r' && !e.altKey) {
        e.preventDefault();
        return;
      }

      // Prevent native browser zooming (Cmd+=, Cmd+-, Cmd+0)
      if (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '0') {
        e.preventDefault();
        return;
      }

      // Cmd+/ or Ctrl+/: Open Keyboard Shortcuts Cheat Sheet Modal
      if (e.key === '/' || e.key === '?') {
        e.preventDefault();
        onOpenShortcuts?.();
        return;
      }

      // Cmd+B or Ctrl+B: Toggle Sidebar Visibility
      if (e.key.toLowerCase() === 'b' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (onToggleSidebar) {
          onToggleSidebar();
        } else if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('datacore:toggle-sidebar'));
        }
        return;
      }

      // Cmd+[ or Ctrl+[ or Cmd+Alt+Left: Previous Tab
      if (
        (e.key === '[' && !e.shiftKey && !e.altKey) ||
        (e.altKey && e.key === 'ArrowLeft')
      ) {
        e.preventDefault();
        if (onPreviousTab) {
          onPreviousTab();
        } else {
          const { tabs, activeTabId: currentActiveId, setActiveTab } = useTabStore.getState();
          if (tabs.length > 1 && currentActiveId) {
            const currentIndex = tabs.findIndex((t) => t.id === currentActiveId);
            if (currentIndex > 0) {
              setActiveTab(tabs[currentIndex - 1].id);
            } else if (currentIndex === 0) {
              setActiveTab(tabs[tabs.length - 1].id);
            }
          }
        }
        return;
      }

      // Cmd+] or Ctrl+] or Cmd+Alt+Right: Next Tab
      if (
        (e.key === ']' && !e.shiftKey && !e.altKey) ||
        (e.altKey && e.key === 'ArrowRight')
      ) {
        e.preventDefault();
        if (onNextTab) {
          onNextTab();
        } else {
          const { tabs, activeTabId: currentActiveId, setActiveTab } = useTabStore.getState();
          if (tabs.length > 1 && currentActiveId) {
            const currentIndex = tabs.findIndex((t) => t.id === currentActiveId);
            if (currentIndex >= 0 && currentIndex < tabs.length - 1) {
              setActiveTab(tabs[currentIndex + 1].id);
            } else if (currentIndex === tabs.length - 1) {
              setActiveTab(tabs[0].id);
            }
          }
        }
        return;
      }

      // Cmd+D or Ctrl+D: Duplicate Active Tab
      if (e.key.toLowerCase() === 'd' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (onDuplicateTab) {
          onDuplicateTab();
        } else {
          const { tabs, activeTabId: currentActiveId, openTab } = useTabStore.getState();
          if (currentActiveId) {
            const tabToCopy = tabs.find((t) => t.id === currentActiveId);
            if (tabToCopy) {
              const duplicatedTab: Tab = {
                ...tabToCopy,
                id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                title: `${tabToCopy.title} (Copy)`,
              };
              openTab(duplicatedTab);
            }
          }
        }
        return;
      }

      // Cmd+Shift+T or Ctrl+Shift+T: Toggle Dark/Light Theme
      if (e.shiftKey && e.key.toLowerCase() === 't' && !e.altKey) {
        e.preventDefault();
        onToggleTheme?.();
        return;
      }

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
  }, [
    activeTabId,
    closeTab,
    activeConnectionId,
    onNewConnection,
    onToggleTheme,
    onOpenShortcuts,
    onToggleSidebar,
    onPreviousTab,
    onNextTab,
    onDuplicateTab,
    onEscape,
  ]);
}

export default useShortcuts;
