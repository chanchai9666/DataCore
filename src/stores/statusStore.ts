import { create } from 'zustand';

export interface StatusState {
  lastQuery: string | null;
  executionTimeMs: number | null;
  rowCount: number | null;
  selectedCellInfo: string | null;
  statusMessage: string | null;
  setStatus: (updates: Partial<Omit<StatusState, 'setStatus' | 'reset'>>) => void;
  reset: () => void;
}

export const useStatusStore = create<StatusState>((set) => ({
  lastQuery: null,
  executionTimeMs: null,
  rowCount: null,
  selectedCellInfo: null,
  statusMessage: null,
  setStatus: (updates) => set((state) => ({ ...state, ...updates })),
  reset: () =>
    set({
      lastQuery: null,
      executionTimeMs: null,
      rowCount: null,
      selectedCellInfo: null,
      statusMessage: null,
    }),
}));

export default useStatusStore;
