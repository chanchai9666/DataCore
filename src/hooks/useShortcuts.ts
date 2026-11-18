import { useEffect, useRef } from 'react';
import { useTabStore } from '../stores/tabStore';
import { useConnectionStore } from '../stores/connectionStore';
import { useShortcutStore } from '../stores/shortcutStore';
import { openQueryTab } from '../components/sidebar/tabHelpers';
import type { Tab } from '../types/db';

export interface ShortcutHandlers {
  onNewConnection?: () => void;
  onToggleTheme?: () => void;
  onOpenShortcuts?: () => void;
  onOpenCommandPalette?: () => void;
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
  onOpenCommandPalette,
  onToggleSidebar,
  onPreviousTab,
  onNextTab,
  onDuplicateTab,
  onEscape,
}: ShortcutHandlers = {}) {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const connectedConnectionIds = useConnectionStore((s) => s.connectedConnectionIds);
  const preset = useShortcutStore((s) => s.preset);
  const lastShiftTimeRef = useRef<number>(0);

  useEffect(() => {
    const triggerSidebarToggle = () => {
      if (onToggleSidebar) {
        onToggleSidebar();
      } else if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('datacore:toggle-sidebar'));
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // DataGrip: Double-Shift opens Command Palette
      if (preset === 'datagrip' && e.key === 'Shift' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const now = Date.now();
        if (now - lastShiftTimeRef.current < 350) {
          lastShiftTimeRef.current = 0;
          e.preventDefault();
          onOpenCommandPalette?.();
          return;
        }
        lastShiftTimeRef.current = now;
        return;
      }

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

      // DataGrip Win/Linux: Alt+1 toggles sidebar
      if (preset === 'datagrip' && e.altKey && e.key === '1' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        triggerSidebarToggle();
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

      // Prevent native browser reload (Cmd+R, Cmd+Shift+R); in TablePlus preset Cmd+R runs query
      if (e.key.toLowerCase() === 'r' && !e.altKey) {
        e.preventDefault();
        if (preset === 'tableplus' && !e.shiftKey && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('datacore:run-query'));
        }
        return;
      }

      // Prevent native browser zooming (Cmd+=, Cmd+-, Cmd+0)
      if (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '0') {
        e.preventDefault();
        return;
      }

      // Cmd+Shift+/ or Cmd+? or Ctrl+Shift+? : Open Keyboard Shortcuts Cheat Sheet Modal
      // Notice: Cmd+/ without shift is intentionally NOT intercepted here so that code editors (CodeMirror) can use it for Toggle Line Comment.
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        onOpenShortcuts?.();
        return;
      }

      // VS Code: Cmd+Shift+P opens Command Palette
      if (preset === 'vscode' && e.shiftKey && e.key.toLowerCase() === 'p' && !e.altKey) {
        e.preventDefault();
        onOpenCommandPalette?.();
        return;
      }

      // DataGrip: Cmd+O opens Search / Quick Open
      if (preset === 'datagrip' && e.key.toLowerCase() === 'o' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        onOpenCommandPalette?.();
        return;
      }

      // Cmd+K / Ctrl+K or Cmd+P / Ctrl+P: Command Palette / Quick Open
      if (
        (e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'p') &&
        !e.shiftKey &&
        !e.altKey
      ) {
        e.preventDefault();
        onOpenCommandPalette?.();
        return;
      }

      // Toggle Sidebar Visibility (DataGrip: Cmd+1; others: Cmd+B)
      if (
        (preset === 'datagrip' && e.key === '1' && !e.shiftKey && !e.altKey) ||
        (preset !== 'datagrip' && e.key.toLowerCase() === 'b' && !e.shiftKey && !e.altKey)
      ) {
        e.preventDefault();
        triggerSidebarToggle();
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

      // Cmd+N: New Query Tab in DataGrip/VSCode presets; New Connection otherwise
      if (e.key.toLowerCase() === 'n' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (preset === 'datagrip' || preset === 'vscode') {
          if (activeConnectionId && connectedConnectionIds.includes(activeConnectionId)) {
            openQueryTab({ connectionId: activeConnectionId });
          }
        } else {
          onNewConnection?.();
        }
        return;
      }

      // Cmd+T: New Query Tab
      if (e.key.toLowerCase() === 't' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (activeConnectionId && connectedConnectionIds.includes(activeConnectionId)) {
          openQueryTab({ connectionId: activeConnectionId });
        }
        return;
      }

      // Cmd+W (or Ctrl+F4 in DataGrip): Close Active Tab
      if (
        (e.key.toLowerCase() === 'w' && !e.shiftKey && !e.altKey) ||
        (preset === 'datagrip' && e.ctrlKey && e.key === 'F4' && !e.shiftKey && !e.altKey)
      ) {
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
    connectedConnectionIds,
    preset,
    onNewConnection,
    onToggleTheme,
    onOpenShortcuts,
    onOpenCommandPalette,
    onToggleSidebar,
    onPreviousTab,
    onNextTab,
    onDuplicateTab,
    onEscape,
  ]);
}

export default useShortcuts;
