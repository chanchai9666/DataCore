import { create } from 'zustand';
import type { QueryHistoryItem } from '../types/queryHistory';

export const MAX_QUERY_HISTORY_ITEMS = 200;
const STORAGE_KEY = 'datacore_query_history_v1';

function loadStoredHistory(): QueryHistoryItem[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    }
  } catch {
    // Ignore storage parse errors
  }
  return [];
}

function persistStoredHistory(items: QueryHistoryItem[]) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }
  } catch {
    // Ignore storage write errors
  }
}

export interface QueryHistoryStoreState {
  history: QueryHistoryItem[];
  addHistoryItem: (
    item: Omit<QueryHistoryItem, 'id' | 'executedAt'> & { id?: string; executedAt?: number }
  ) => void;
  removeHistoryItem: (id: string) => void;
  clearAll: () => void;
}

export const useQueryHistoryStore = create<QueryHistoryStoreState>((set, get) => ({
  history: loadStoredHistory(),

  addHistoryItem: (item) => {
    const newItem: QueryHistoryItem = {
      id: item.id || `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      executedAt: item.executedAt || Date.now(),
      ...item,
    };

    const nextHistory = [newItem, ...get().history.filter((h) => h.id !== newItem.id)].slice(
      0,
      MAX_QUERY_HISTORY_ITEMS
    );

    set({ history: nextHistory });
    persistStoredHistory(nextHistory);
  },

  removeHistoryItem: (id) => {
    const nextHistory = get().history.filter((h) => h.id !== id);
    set({ history: nextHistory });
    persistStoredHistory(nextHistory);
  },

  clearAll: () => {
    set({ history: [] });
    persistStoredHistory([]);
  },
}));
