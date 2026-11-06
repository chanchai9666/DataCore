import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useConnectionStore } from './connectionStore';
import { dbApi } from '../api/db';
import type { ConnectionConfig } from '../types/db';

vi.mock('../api/db', () => ({
  dbApi: {
    getConnections: vi.fn(),
    saveConnection: vi.fn(),
    deleteConnection: vi.fn(),
  },
}));

describe('connectionStore', () => {
  const mockConfig: ConnectionConfig = {
    id: 'conn-1',
    name: 'Local SQLite',
    driver: 'sqlite',
    database: '/path/to/test.db',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useConnectionStore.setState({
      connections: [],
      activeConnectionId: null,
      loading: false,
      error: null,
    });
  });

  it('should load connections from dbApi', async () => {
    vi.mocked(dbApi.getConnections).mockResolvedValueOnce([mockConfig]);

    await useConnectionStore.getState().loadConnections();

    const state = useConnectionStore.getState();
    expect(state.connections).toEqual([mockConfig]);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('should handle errors when loading connections', async () => {
    vi.mocked(dbApi.getConnections).mockRejectedValueOnce(new Error('Failed to load'));

    await useConnectionStore.getState().loadConnections();

    const state = useConnectionStore.getState();
    expect(state.connections).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.error).toBe('Failed to load');
  });

  it('should set active connection', () => {
    useConnectionStore.getState().setActiveConnection('conn-1');
    expect(useConnectionStore.getState().activeConnectionId).toBe('conn-1');

    useConnectionStore.getState().setActiveConnection(null);
    expect(useConnectionStore.getState().activeConnectionId).toBeNull();
  });

  it('should add connection and update state', async () => {
    vi.mocked(dbApi.saveConnection).mockResolvedValueOnce(undefined);

    await useConnectionStore.getState().addConnection(mockConfig, 'secret');

    expect(dbApi.saveConnection).toHaveBeenCalledWith(mockConfig, 'secret');
    expect(useConnectionStore.getState().connections).toEqual([mockConfig]);
  });

  it('should update existing connection in state when added with same id', async () => {
    useConnectionStore.setState({ connections: [mockConfig] });
    vi.mocked(dbApi.saveConnection).mockResolvedValueOnce(undefined);

    const updatedConfig: ConnectionConfig = {
      ...mockConfig,
      name: 'Updated SQLite',
    };

    await useConnectionStore.getState().addConnection(updatedConfig);

    const state = useConnectionStore.getState();
    expect(state.connections).toHaveLength(1);
    expect(state.connections[0].name).toBe('Updated SQLite');
  });

  it('should remove connection and reset activeConnectionId if active', async () => {
    useConnectionStore.setState({
      connections: [mockConfig],
      activeConnectionId: 'conn-1',
    });
    vi.mocked(dbApi.deleteConnection).mockResolvedValueOnce(undefined);

    await useConnectionStore.getState().removeConnection('conn-1');

    expect(dbApi.deleteConnection).toHaveBeenCalledWith('conn-1');
    const state = useConnectionStore.getState();
    expect(state.connections).toHaveLength(0);
    expect(state.activeConnectionId).toBeNull();
  });
});
