import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  KeyboardShortcutsModal,
  detectIsMac,
  SHORTCUTS_LIST,
} from './KeyboardShortcutsModal';

describe('KeyboardShortcutsModal Component', () => {
  it('does not render content when isOpen is false', () => {
    render(<KeyboardShortcutsModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('shortcuts-modal-content')).not.toBeInTheDocument();
  });

  it('renders title, categories, and shortcuts when isOpen is true', () => {
    render(<KeyboardShortcutsModal isOpen={true} onClose={vi.fn()} platform="mac" />);

    expect(screen.getByTestId('shortcuts-modal-content')).toBeInTheDocument();
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();

    // Check categories
    expect(screen.getByTestId('shortcuts-section-general')).toBeInTheDocument();
    expect(screen.getByTestId('shortcuts-section-navigation')).toBeInTheDocument();
    expect(screen.getByTestId('shortcuts-section-query-editor')).toBeInTheDocument();
    expect(screen.getByTestId('shortcuts-section-data-grid')).toBeInTheDocument();
  });

  it('renders Mac keybindings (⌘) by default or when platform is mac', () => {
    render(<KeyboardShortcutsModal isOpen={true} onClose={vi.fn()} platform="mac" />);

    // Platform switcher should show macOS active
    const macBtn = screen.getByTestId('platform-btn-mac');
    expect(macBtn).toHaveClass('font-semibold');

    // Should display ⌘ keys
    const cmdKeyBadges = screen.getAllByText('⌘');
    expect(cmdKeyBadges.length).toBeGreaterThan(0);
  });

  it('renders Windows keybindings (Ctrl) when platform is windows', () => {
    render(<KeyboardShortcutsModal isOpen={true} onClose={vi.fn()} platform="windows" />);

    const winBtn = screen.getByTestId('platform-btn-windows');
    expect(winBtn).toHaveClass('font-semibold');

    // Should display Ctrl keys
    const ctrlKeyBadges = screen.getAllByText('Ctrl');
    expect(ctrlKeyBadges.length).toBeGreaterThan(0);
  });

  it('switches keybindings dynamically when clicking platform buttons', () => {
    render(<KeyboardShortcutsModal isOpen={true} onClose={vi.fn()} platform="mac" />);

    expect(screen.getAllByText('⌘').length).toBeGreaterThan(0);

    // Switch to Windows
    const winBtn = screen.getByTestId('platform-btn-windows');
    fireEvent.click(winBtn);

    expect(screen.getAllByText('Ctrl').length).toBeGreaterThan(0);
  });

  it('filters shortcuts matching search query in title or description', () => {
    render(<KeyboardShortcutsModal isOpen={true} onClose={vi.fn()} platform="mac" />);

    const searchInput = screen.getByTestId('shortcuts-search-input');
    fireEvent.change(searchInput, { target: { value: 'Sidebar' } });

    // Should find Toggle Sidebar
    expect(screen.getByText('Toggle Sidebar Visibility')).toBeInTheDocument();
    // Non-matching shortcuts should be excluded
    expect(screen.queryByText('New Database Connection')).not.toBeInTheDocument();
  });

  it('filters shortcuts when selecting a specific category filter pill', () => {
    render(<KeyboardShortcutsModal isOpen={true} onClose={vi.fn()} platform="mac" />);

    const navFilterBtn = screen.getByTestId('category-filter-navigation');
    fireEvent.click(navFilterBtn);

    // Navigation items should exist
    expect(screen.getByText('Previous Tab')).toBeInTheDocument();
    expect(screen.getByText('Next Tab')).toBeInTheDocument();

    // Query editor or data grid should not exist in this view
    expect(screen.queryByTestId('shortcuts-section-query-editor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('shortcuts-section-data-grid')).not.toBeInTheDocument();
  });

  it('displays empty state when search finds no match, and clears search when button clicked', () => {
    render(<KeyboardShortcutsModal isOpen={true} onClose={vi.fn()} platform="mac" />);

    const searchInput = screen.getByTestId('shortcuts-search-input');
    fireEvent.change(searchInput, { target: { value: 'nonexistent-query-keyword-xyz' } });

    expect(screen.getByTestId('shortcuts-empty-state')).toBeInTheDocument();
    expect(screen.getByText(/no shortcuts match your search/i)).toBeInTheDocument();

    // Clear search using clear button in input or empty state button
    const clearBtn = screen.getByTestId('shortcuts-clear-search-btn');
    fireEvent.click(clearBtn);

    expect(screen.queryByTestId('shortcuts-empty-state')).not.toBeInTheDocument();
    expect(screen.getByText('Toggle Sidebar Visibility')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} platform="mac" />);

    const closeBtn = screen.getByTestId('shortcuts-modal-close-btn');
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('detectIsMac returns true for Mac platform strings and false for others', () => {
    expect(detectIsMac('mac')).toBe(true);
    expect(detectIsMac('windows')).toBe(false);
  });

  it('ensures all shortcuts have both macKeys and winKeys defined', () => {
    expect(SHORTCUTS_LIST.length).toBeGreaterThan(10);
    for (const item of SHORTCUTS_LIST) {
      expect(item.macKeys.length).toBeGreaterThan(0);
      expect(item.winKeys.length).toBeGreaterThan(0);
      expect(item.title).toBeTruthy();
      expect(item.category).toBeTruthy();
    }
  });
});
