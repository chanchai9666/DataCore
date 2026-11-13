import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { App } from './App';
import { useConnectionStore } from './stores/connectionStore';
import { useTabStore } from './stores/tabStore';

vi.mock('./api/db', () => ({
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
    expect(screen.getByRole('button', { name: /switch to dark mode/i })).toBeInTheDocument();
  });

  it('persists theme toggle to localStorage and updates classes', () => {
    localStorage.setItem('datacore-theme', 'dark');

    render(<App />);

    const themeToggleBtn = screen.getByRole('button', { name: /switch to light mode/i });
    fireEvent.click(themeToggleBtn);

    expect(localStorage.getItem('datacore-theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.body.classList.contains('dark')).toBe(false);

    // Toggle back to dark
    const toDarkBtn = screen.getByRole('button', { name: /switch to dark mode/i });
    fireEvent.click(toDarkBtn);

    expect(localStorage.getItem('datacore-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.body.classList.contains('dark')).toBe(true);
  });
});
