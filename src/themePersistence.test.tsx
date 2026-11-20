import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { App } from './App';
import { useConnectionStore } from './stores/connectionStore';
import { useTabStore } from './stores/tabStore';

vi.mock('./api/db', () => ({
  getVaultStatus: vi.fn().mockResolvedValue({
    hasMasterPassword: false,
    isUnlocked: true,
    keychainOptIn: false,
  }),
  lockVault: vi.fn().mockResolvedValue(undefined),
  dbApi: {
    getConnections: vi.fn().mockResolvedValue([]),
    getSchemaTree: vi.fn().mockResolvedValue([]),
    openSession: vi.fn().mockResolvedValue(undefined),
    closeSession: vi.fn().mockResolvedValue(undefined),
    executeQuery: vi.fn().mockResolvedValue({ columns: [], rows: [], execution_time_ms: 1 }),
  },
}));

describe('Theme Persistence in App', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.className = '';
    document.body.className = '';
    document.documentElement.removeAttribute('data-theme');
    document.body.removeAttribute('data-theme');
    useConnectionStore.setState({
      connections: [],
      activeConnectionId: null,
      connectedConnectionIds: [],
      loading: false,
      error: null,
    });
    useTabStore.setState({
      tabs: [],
      activeTabId: null,
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('initializes theme from localStorage if set', () => {
    localStorage.setItem('datacore-theme', 'light');

    render(<App />);

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.body.classList.contains('dark')).toBe(false);
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    expect(screen.getByTestId('toolbar-theme-btn')).toBeInTheDocument();
  });

  it('persists theme selection to localStorage and updates classes', () => {
    localStorage.setItem('datacore-theme', 'dark');

    render(<App />);

    fireEvent.click(screen.getByTestId('toolbar-theme-btn'));
    fireEvent.click(screen.getByTestId('theme-option-light'));

    expect(localStorage.getItem('datacore-theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.body.classList.contains('dark')).toBe(false);

    // Switch back to dark
    fireEvent.click(screen.getByTestId('toolbar-theme-btn'));
    fireEvent.click(screen.getByTestId('theme-option-dark'));

    expect(localStorage.getItem('datacore-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.body.classList.contains('dark')).toBe(true);
  });

  it('initializes warm-paper theme from localStorage and sets data-theme attribute', () => {
    localStorage.setItem('datacore-theme', 'warm-paper');

    render(<App />);

    expect(document.documentElement.getAttribute('data-theme')).toBe('warm-paper');
    expect(document.body.getAttribute('data-theme')).toBe('warm-paper');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('selects warm-paper theme from toolbar theme picker and persists to localStorage', () => {
    localStorage.setItem('datacore-theme', 'dark');

    render(<App />);

    const themePickerBtn = screen.getByTestId('toolbar-theme-btn');
    fireEvent.click(themePickerBtn);

    const warmPaperOption = screen.getByTestId('theme-option-warm-paper');
    fireEvent.click(warmPaperOption);

    expect(localStorage.getItem('datacore-theme')).toBe('warm-paper');
    expect(document.documentElement.getAttribute('data-theme')).toBe('warm-paper');
    expect(document.body.getAttribute('data-theme')).toBe('warm-paper');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
