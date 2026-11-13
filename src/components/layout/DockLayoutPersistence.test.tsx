import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DockLayout } from './DockLayout';
import { useTabStore } from '../../stores/tabStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { usePendingChangesStore } from '../../stores/pendingChangesStore';
import type { ConnectionConfig } from '../../types/db';

vi.mock('../../api/db', () => ({
  dbApi: {
    getConnections: vi.fn().mockResolvedValue([]),
    getSchemaTree: vi.fn().mockResolvedValue([]),
    openSession: vi.fn().mockResolvedValue(undefined),
    closeSession: vi.fn().mockResolvedValue(undefined),
    executeQuery: vi.fn().mockResolvedValue({ columns: [], rows: [], execution_time_ms: 1 }),
  },
}));

describe('DockLayout Persistence', () => {
  const mockConn: ConnectionConfig = {
    id: 'conn-1',
    name: 'Test DB',
    driver: 'sqlite',
    database: '/test.db',
  };

  beforeEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
    usePendingChangesStore.getState().clearAll();
    useConnectionStore.setState({
      connections: [mockConn],
      activeConnectionId: 'conn-1',
      connectedConnectionIds: ['conn-1'],
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

  it('restores sidebarCollapsed from localStorage when set to true', () => {
    localStorage.setItem('datacore-sidebar-collapsed', 'true');

    render(<DockLayout theme="dark" onNewConnection={vi.fn()} onEditConnection={vi.fn()} />);

    // When collapsed, the expand sidebar button is displayed and Explorer header is not present
    expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument();
    expect(screen.queryByText('Explorer')).not.toBeInTheDocument();
  });

  it('restores sidebarWidth from localStorage when valid', () => {
    localStorage.setItem('datacore-sidebar-width', '350');

    render(<DockLayout theme="dark" onNewConnection={vi.fn()} onEditConnection={vi.fn()} />);

    const aside = screen.getByRole('complementary');
    expect(aside).toHaveStyle({ width: '350px' });
  });

  it('saves sidebarCollapsed to localStorage on collapse and expand', () => {
    render(<DockLayout theme="dark" onNewConnection={vi.fn()} onEditConnection={vi.fn()} />);

    // Collapse sidebar
    const collapseBtn = screen.getByRole('button', { name: /collapse sidebar/i });
    fireEvent.click(collapseBtn);
    expect(localStorage.getItem('datacore-sidebar-collapsed')).toBe('true');

    // Expand sidebar
    const expandBtn = screen.getByRole('button', { name: /expand sidebar/i });
    fireEvent.click(expandBtn);
    expect(localStorage.getItem('datacore-sidebar-collapsed')).toBe('false');
  });
});
