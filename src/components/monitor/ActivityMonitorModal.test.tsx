import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActivityMonitorModal } from './ActivityMonitorModal';
import * as activityMonitorApi from '../../api/activityMonitorApi';
import { useConnectionStore } from '../../stores/connectionStore';
import type { ConnectionConfig } from '../../types/db';

vi.mock('../../api/activityMonitorApi', async () => {
  const actual = await vi.importActual<typeof activityMonitorApi>('../../api/activityMonitorApi');
  return {
    ...actual,
    fetchServerProcesses: vi.fn(),
  };
});

describe('ActivityMonitorModal', () => {
  const mockConnections: ConnectionConfig[] = [
    {
      id: 'conn_1',
      name: 'Production PG',
      driver: 'postgres',
      database: 'prod_db',
    } as ConnectionConfig,
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    useConnectionStore.setState({
      connections: mockConnections,
      activeConnectionId: 'conn_1',
    });

    vi.mocked(activityMonitorApi.fetchServerProcesses).mockResolvedValue([
      {
        id: '9901',
        user: 'admin',
        database: 'prod_db',
        host: '10.0.0.1',
        state: 'active',
        durationSeconds: 15.2,
        query: 'SELECT * FROM big_orders WHERE status = 1',
        isBlocked: false,
      },
      {
        id: '9902',
        user: 'worker',
        database: 'prod_db',
        host: '10.0.0.2',
        state: 'idle',
        durationSeconds: 0,
        isBlocked: false,
      },
    ]);
  });

  it('renders process list and summary cards', async () => {
    render(
      <ActivityMonitorModal
        isOpen={true}
        onClose={vi.fn()}
        connectionId="conn_1"
      />
    );

    expect(screen.getByText(/server activity monitor/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('9901')).toBeInTheDocument();
      expect(screen.getByText('9902')).toBeInTheDocument();
      expect(screen.getByText(/big_orders/i)).toBeInTheDocument();
    });

    // Check summary metrics
    expect(screen.getByText('2')).toBeInTheDocument(); // total
  });

  it('filters processes by search query', async () => {
    render(
      <ActivityMonitorModal
        isOpen={true}
        onClose={vi.fn()}
        connectionId="conn_1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('9901')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search query, user/i);
    fireEvent.change(searchInput, { target: { value: 'worker' } });

    expect(screen.queryByText('big_orders')).not.toBeInTheDocument();
    expect(screen.getByText('worker')).toBeInTheDocument();
  });

  it('hides terminate session button when driver is sqlite (Issue #120)', async () => {
    useConnectionStore.setState({
      connections: [
        {
          id: 'conn_sqlite',
          name: 'Local SQLite',
          driver: 'sqlite',
          database: 'local.db',
        } as ConnectionConfig,
      ],
      activeConnectionId: 'conn_sqlite',
    });

    render(
      <ActivityMonitorModal
        isOpen={true}
        onClose={vi.fn()}
        connectionId="conn_sqlite"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('9901')).toBeInTheDocument();
    });

    // Should not render terminate button for sqlite
    expect(screen.queryByTitle(/terminate session/i)).not.toBeInTheDocument();
  });
});
