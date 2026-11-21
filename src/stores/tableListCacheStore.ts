import { create } from 'zustand';
import type { TableMetadata } from '../types/dataTransfer';

export interface TableListCacheEntry {
  tables: TableMetadata[];
  loadedAt: number;
}

export function getTableListCacheKey(connectionId: string, schemaName?: string): string {
  return `${connectionId}:${schemaName || '__default__'}`;
}

interface TableListCacheState {
  entries: Record<string, TableListCacheEntry>;
  setCachedTables: (connectionId: string, schemaName: string | undefined, tables: TableMetadata[]) => void;
  clearCache: (connectionId?: string, schemaName?: string) => void;
}

export const useTableListCacheStore = create<TableListCacheState>((set) => ({
  entries: {},

  setCachedTables: (connectionId, schemaName, tables) => {
    const key = getTableListCacheKey(connectionId, schemaName);
    set((state) => ({
      entries: {
        ...state.entries,
        [key]: {
          tables,
          loadedAt: Date.now(),
        },
      },
    }));
  },

  clearCache: (connectionId, schemaName) => {
    if (!connectionId) {
      set({ entries: {} });
      return;
    }
    if (schemaName !== undefined) {
      const key = getTableListCacheKey(connectionId, schemaName);
      set((state) => {
        const next = { ...state.entries };
        delete next[key];
        return { entries: next };
      });
      return;
    }
    const prefix = `${connectionId}:`;
    set((state) => {
      const next: Record<string, TableListCacheEntry> = {};
      for (const [k, v] of Object.entries(state.entries)) {
        if (!k.startsWith(prefix)) {
          next[k] = v;
        }
      }
      return { entries: next };
    });
  },
}));
