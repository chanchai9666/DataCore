import { create } from 'zustand';
import type { ConnectionConfig } from '../types/db';
import { dbApi } from '../api/db';

export interface ConnectionStoreState {
  connections: ConnectionConfig[];
  activeConnectionId: string | null;
  loading: boolean;
  error: string | null;
  loadConnections: () => Promise<void>;
  setActiveConnection: (id: string | null) => void;
  addConnection: (connection: ConnectionConfig, password?: string) => Promise<void>;
  removeConnection: (id: string) => Promise<void>;
  setConnections: (connections: ConnectionConfig[]) => void;
}

export const useConnectionStore = create<ConnectionStoreState>((set, get) => ({
  connections: [],
  activeConnectionId: null,
  loading: false,
  error: null,

  loadConnections: async () => {
    set({ loading: true, error: null });
    try {
      const connections = await dbApi.getConnections();
      set({ connections, loading: false });
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : String(err),
        loading: false,
      });
    }
  },

  setActiveConnection: (id: string | null) => {
    set({ activeConnectionId: id });
  },

  addConnection: async (connection: ConnectionConfig, password?: string) => {
    await dbApi.saveConnection(connection, password);
    const existing = get().connections;
    const index = existing.findIndex((c) => c.id === connection.id);
    if (index >= 0) {
      const updated = [...existing];
      updated[index] = connection;
      set({ connections: updated });
    } else {
      set({ connections: [...existing, connection] });
    }
  },

  removeConnection: async (id: string) => {
    await dbApi.deleteConnection(id);
    set((state) => ({
      connections: state.connections.filter((c) => c.id !== id),
      activeConnectionId: state.activeConnectionId === id ? null : state.activeConnectionId,
    }));
  },

  setConnections: (connections: ConnectionConfig[]) => {
    set({ connections });
  },
}));
