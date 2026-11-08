import { create } from 'zustand';
import type { ConnectionConfig } from '../types/db';
import { dbApi } from '../api/db';

export interface ConnectionStoreState {
  connections: ConnectionConfig[];
  activeConnectionId: string | null;
  connectedConnectionIds: string[];
  loading: boolean;
  error: string | null;
  loadConnections: () => Promise<void>;
  setActiveConnection: (id: string | null) => void;
  addConnection: (connection: ConnectionConfig, password?: string) => Promise<void>;
  removeConnection: (id: string) => Promise<void>;
  setConnections: (connections: ConnectionConfig[]) => void;
  markConnected: (connectionId: string) => void;
  markDisconnected: (connectionId: string) => void;
}

export const useConnectionStore = create<ConnectionStoreState>((set, get) => ({
  connections: [],
  activeConnectionId: null,
  connectedConnectionIds: [],
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
      connectedConnectionIds: state.connectedConnectionIds.filter((connId) => connId !== id),
    }));
  },

  setConnections: (connections: ConnectionConfig[]) => {
    set({ connections });
  },

  markConnected: (connectionId: string) => {
    set((state) => {
      if (state.connectedConnectionIds.includes(connectionId)) {
        return state;
      }
      return {
        connectedConnectionIds: [...state.connectedConnectionIds, connectionId],
      };
    });
  },

  markDisconnected: (connectionId: string) => {
    set((state) => ({
      connectedConnectionIds: state.connectedConnectionIds.filter((id) => id !== connectionId),
    }));
  },
}));
