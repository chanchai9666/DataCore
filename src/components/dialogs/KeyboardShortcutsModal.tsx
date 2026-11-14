import React, { useState, useMemo, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Keyboard,
  X,
  Search,
  Command,
  Compass,
  Code2,
  Table2,
  Sparkles,
} from 'lucide-react';

export type ShortcutCategory = 'General' | 'Navigation' | 'Query Editor' | 'Data Grid';

export interface ShortcutItem {
  id: string;
  title: string;
  category: ShortcutCategory;
  macKeys: string[];
  winKeys: string[];
  description?: string;
}

export const SHORTCUTS_LIST: ShortcutItem[] = [
  // General
  {
    id: 'general-command-palette',
    title: 'Open Command Palette / Quick Open',
    category: 'General',
    macKeys: ['⌘', 'K'],
    winKeys: ['Ctrl', 'K'],
    description: 'Search commands, tables, and switch databases (or ⌘P)',
  },
  {
    id: 'general-shortcuts',
    title: 'Show Keyboard Shortcuts Cheat Sheet',
    category: 'General',
    macKeys: ['⌘', '/'],
    winKeys: ['Ctrl', '/'],
    description: 'Open this cheat sheet modal (or press ?)',
  },
  {
    id: 'general-new-conn',
    title: 'New Database Connection',
    category: 'General',
    macKeys: ['⌘', 'N'],
    winKeys: ['Ctrl', 'N'],
    description: 'Open connection manager dialog',
  },
  {
    id: 'general-toggle-sidebar',
    title: 'Toggle Sidebar Visibility',
    category: 'General',
    macKeys: ['⌘', 'B'],
    winKeys: ['Ctrl', 'B'],
    description: 'Show or hide the database tree sidebar',
  },
  {
    id: 'general-toggle-theme',
    title: 'Toggle Color Theme',
    category: 'General',
    macKeys: ['⌘', '⇧', 'T'],
    winKeys: ['Ctrl', 'Shift', 'T'],
    description: 'Switch between Dark and Light mode',
  },
  {
    id: 'general-escape',
    title: 'Close Dialog / Cancel Selection',
    category: 'General',
    macKeys: ['Esc'],
    winKeys: ['Esc'],
    description: 'Dismiss open dialogs or clear selection',
  },

  // Navigation
  {
    id: 'nav-prev-tab',
    title: 'Previous Tab',
    category: 'Navigation',
    macKeys: ['⌘', '['],
    winKeys: ['Ctrl', '['],
    description: 'Switch to the previous open tab (or ⌘⌥←)',
  },
  {
    id: 'nav-next-tab',
    title: 'Next Tab',
    category: 'Navigation',
    macKeys: ['⌘', ']'],
    winKeys: ['Ctrl', ']'],
    description: 'Switch to the next open tab (or ⌘⌥→)',
  },
  {
    id: 'nav-new-query-tab',
    title: 'New SQL Query Tab',
    category: 'Navigation',
    macKeys: ['⌘', 'T'],
    winKeys: ['Ctrl', 'T'],
    description: 'Open a new SQL editor tab for active database',
  },
  {
    id: 'nav-close-tab',
    title: 'Close Active Tab',
    category: 'Navigation',
    macKeys: ['⌘', 'W'],
    winKeys: ['Ctrl', 'W'],
    description: 'Close currently selected query or table tab',
  },
  {
    id: 'nav-duplicate-tab',
    title: 'Duplicate Current Tab',
    category: 'Navigation',
    macKeys: ['⌘', 'D'],
    winKeys: ['Ctrl', 'D'],
    description: 'Clone the active tab and its query contents',
  },

  // Query Editor
  {
    id: 'editor-run-query',
    title: 'Execute Query / Run Selection',
    category: 'Query Editor',
    macKeys: ['⌘', 'Enter'],
    winKeys: ['Ctrl', 'Enter'],
    description: 'Execute entire SQL script or highlighted query',
  },
  {
    id: 'editor-explain-query',
    title: 'Explain Query (Execution Plan)',
    category: 'Query Editor',
    macKeys: ['⌘', '⇧', 'E'],
    winKeys: ['Ctrl', 'Shift', 'E'],
    description: 'Inspect execution plan and estimated query cost',
  },
  {
    id: 'editor-find',
    title: 'Find & Replace in Editor',
    category: 'Query Editor',
    macKeys: ['⌘', 'F'],
    winKeys: ['Ctrl', 'F'],
    description: 'Open CodeMirror search and replace panel',
  },
  {
    id: 'editor-comment',
    title: 'Toggle Line Comment',
    category: 'Query Editor',
    macKeys: ['⌘', '/'],
    winKeys: ['Ctrl', '/'],
    description: 'Add or remove SQL -- comment on selected lines',
  },

  // Data Grid
  {
    id: 'grid-filter',
    title: 'Quick Filter / Search Rows',
    category: 'Data Grid',
    macKeys: ['⌘', 'F'],
    winKeys: ['Ctrl', 'F'],
    description: 'Filter grid rows by column values',
  },
  {
    id: 'grid-insert-row',
    title: 'Insert New Row',
    category: 'Data Grid',
    macKeys: ['⌘', '⇧', 'N'],
    winKeys: ['Ctrl', 'Shift', 'N'],
    description: 'Open table row insertion dialog',
  },
  {
    id: 'grid-commit',
    title: 'Commit Staged Changes',
    category: 'Data Grid',
    macKeys: ['⌘', 'S'],
    winKeys: ['Ctrl', 'S'],
    description: 'Commit staged table cell edits and new rows',
  },
  {
    id: 'grid-copy',
    title: 'Copy Selected Cells',
    category: 'Data Grid',
    macKeys: ['⌘', 'C'],
    winKeys: ['Ctrl', 'C'],
    description: 'Copy selected cell values to clipboard',
  },
];

export function detectIsMac(platformOverride?: 'mac' | 'windows'): boolean {
  if (platformOverride) return platformOverride === 'mac';
  if (typeof navigator === 'undefined') return true;
  const platform =
    navigator.platform ||
    (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    navigator.userAgent ||
    '';
  return /Mac|iPhone|iPod|iPad/i.test(platform);
}

export interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  platform?: 'mac' | 'windows';
}

const CATEGORY_ICONS: Record<ShortcutCategory, React.ElementType> = {
  General: Sparkles,
  Navigation: Compass,
  'Query Editor': Code2,
  'Data Grid': Table2,
};

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
  platform: initialPlatform,
}) => {
  const [platform, setPlatform] = useState<'mac' | 'windows'>(() =>
    initialPlatform ?? (detectIsMac() ? 'mac' : 'windows')
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ShortcutCategory | 'All'>('All');

  // Sync if prop changes
  useEffect(() => {
    if (initialPlatform) {
      setPlatform(initialPlatform);
    }
  }, [initialPlatform]);

  // Reset filter when modal reopens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSelectedCategory('All');
    }
  }, [isOpen]);

  const categories: ShortcutCategory[] = ['General', 'Navigation', 'Query Editor', 'Data Grid'];

  // Filter shortcuts
  const filteredShortcuts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return SHORTCUTS_LIST.filter((item) => {
      // Category filter
      if (selectedCategory !== 'All' && item.category !== selectedCategory) {
        return false;
      }
      if (!query) return true;

      // Text search in title, description, category, and keys
      const inTitle = item.title.toLowerCase().includes(query);
      const inDesc = item.description?.toLowerCase().includes(query) ?? false;
      const inCategory = item.category.toLowerCase().includes(query);
      const activeKeys = platform === 'mac' ? item.macKeys : item.winKeys;
      const inKeys = activeKeys.some((k) => k.toLowerCase().includes(query));

      return inTitle || inDesc || inCategory || inKeys;
    });
  }, [searchQuery, selectedCategory, platform]);

  // Group filtered shortcuts by category
  const groupedShortcuts = useMemo(() => {
    const groups: Partial<Record<ShortcutCategory, ShortcutItem[]>> = {};
    for (const cat of categories) {
      const items = filteredShortcuts.filter((s) => s.category === cat);
      if (items.length > 0) {
        groups[cat] = items;
      }
    }
    return groups;
  }, [filteredShortcuts, categories]);

  if (!isOpen) return null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          data-testid="shortcuts-modal-overlay"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity"
        />
        <Dialog.Content
          data-testid="shortcuts-modal-content"
          role="dialog"
          aria-label="Keyboard Shortcuts"
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border border-line bg-panel text-text shadow-2xl focus:outline-none overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-panel shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/10 text-accent">
                <Keyboard className="w-5 h-5" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-text flex items-center gap-2">
                  <span>Keyboard Shortcuts</span>
                  <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/20">
                    {platform === 'mac' ? '⌘ /' : 'Ctrl + /'}
                  </span>
                </Dialog.Title>
                <Dialog.Description className="text-xs text-muted">
                  Quick keybindings for navigation, query editing, and grid management
                </Dialog.Description>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Platform Switcher */}
              <div
                data-testid="platform-switcher"
                className="flex items-center rounded-lg border border-line bg-bg p-0.5 text-xs font-medium"
              >
                <button
                  type="button"
                  data-testid="platform-btn-mac"
                  onClick={() => setPlatform('mac')}
                  className={`px-2.5 py-1 rounded flex items-center gap-1 transition-colors ${
                    platform === 'mac'
                      ? 'bg-panel text-text shadow-xs font-semibold'
                      : 'text-muted hover:text-text'
                  }`}
                  title="Switch to macOS keybindings"
                >
                  <Command className="w-3 h-3" />
                  <span>macOS</span>
                </button>
                <button
                  type="button"
                  data-testid="platform-btn-windows"
                  onClick={() => setPlatform('windows')}
                  className={`px-2.5 py-1 rounded flex items-center gap-1 transition-colors ${
                    platform === 'windows'
                      ? 'bg-panel text-text shadow-xs font-semibold'
                      : 'text-muted hover:text-text'
                  }`}
                  title="Switch to Windows/Linux keybindings"
                >
                  <span>Win / Linux</span>
                </button>
              </div>

              <Dialog.Close asChild>
                <button
                  type="button"
                  data-testid="shortcuts-modal-close-btn"
                  className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  aria-label="Close dialog"
                >
                  <X className="w-4 h-4" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Search Bar & Category Filter */}
          <div className="p-4 border-b border-line bg-bg/50 shrink-0 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                data-testid="shortcuts-search-input"
                placeholder="Search shortcuts by action, key, or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-line bg-panel text-text placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-all"
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  data-testid="shortcuts-clear-search-btn"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text p-0.5 rounded"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <button
                type="button"
                data-testid="category-filter-all"
                onClick={() => setSelectedCategory('All')}
                className={`px-2.5 py-1 text-xs rounded-full border transition-all ${
                  selectedCategory === 'All'
                    ? 'border-accent bg-accent text-white font-medium shadow-xs'
                    : 'border-line bg-panel text-muted hover:text-text hover:border-line-hover'
                }`}
              >
                All
              </button>
              {categories.map((cat) => {
                const Icon = CATEGORY_ICONS[cat];
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    data-testid={`category-filter-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                    onClick={() => setSelectedCategory(cat)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition-all ${
                      isSelected
                        ? 'border-accent bg-accent text-white font-medium shadow-xs'
                        : 'border-line bg-panel text-muted hover:text-text hover:border-line-hover'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{cat}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Shortcuts Body List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 max-h-[50vh]">
            {Object.keys(groupedShortcuts).length === 0 ? (
              <div
                data-testid="shortcuts-empty-state"
                className="text-center py-12 space-y-2 text-muted"
              >
                <Keyboard className="w-8 h-8 mx-auto text-muted/50" />
                <p className="text-sm font-medium text-text">No shortcuts match your search</p>
                <p className="text-xs">
                  Try searching for another keyword or clear the search filter.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('All');
                  }}
                  className="mt-3 px-3 py-1.5 text-xs rounded-lg border border-line bg-panel text-accent hover:bg-accent/10 transition-colors"
                >
                  Clear filter
                </button>
              </div>
            ) : (
              categories.map((cat) => {
                const items = groupedShortcuts[cat];
                if (!items || items.length === 0) return null;
                const Icon = CATEGORY_ICONS[cat];

                return (
                  <section
                    key={cat}
                    data-testid={`shortcuts-section-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                    className="space-y-2"
                  >
                    <div className="flex items-center gap-2 pb-1 border-b border-line/60">
                      <Icon className="w-3.5 h-3.5 text-accent" />
                      <h3 className="text-xs font-semibold text-text uppercase tracking-wider">
                        {cat}
                      </h3>
                      <span className="text-[10px] font-mono text-muted">({items.length})</span>
                    </div>

                    <div className="grid grid-cols-1 gap-1.5">
                      {items.map((item) => {
                        const keys = platform === 'mac' ? item.macKeys : item.winKeys;
                        return (
                          <div
                            key={item.id}
                            data-testid={`shortcut-row-${item.id}`}
                            className="flex items-center justify-between p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors group"
                          >
                            <div className="min-w-0 pr-4">
                              <p className="text-xs font-medium text-text">{item.title}</p>
                              {item.description && (
                                <p className="text-[11px] text-muted truncate">
                                  {item.description}
                                </p>
                              )}
                            </div>

                            {/* Key badges */}
                            <div className="flex items-center gap-1 shrink-0">
                              {keys.map((k, idx) => (
                                <React.Fragment key={`${item.id}-${idx}`}>
                                  <kbd
                                    data-testid="shortcut-kbd"
                                    className="inline-flex items-center justify-center min-w-[22px] h-6 px-1.5 text-[11px] font-mono font-semibold rounded bg-black/10 dark:bg-white/10 border border-black/20 dark:border-white/20 text-text shadow-2xs group-hover:border-accent/40 transition-colors"
                                  >
                                    {k}
                                  </kbd>
                                  {idx < keys.length - 1 && (
                                    <span className="text-muted/60 text-[10px] select-none">+</span>
                                  )}
                                </React.Fragment>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-line bg-bg/50 shrink-0 flex items-center justify-between text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span>Press</span>
              <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/10 dark:bg-white/10 border border-line">
                Esc
              </kbd>
              <span>or</span>
              <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/10 dark:bg-white/10 border border-line">
                {platform === 'mac' ? '⌘/' : 'Ctrl+/'}
              </kbd>
              <span>to dismiss</span>
            </span>

            <span className="text-[11px] text-muted/80">DataCore Desktop Shortcuts</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default KeyboardShortcutsModal;
