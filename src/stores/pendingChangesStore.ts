import { create } from 'zustand';

export interface CellChange {
  rowIndex: number;
  colIndex: number;
  colName: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface TablePendingState {
  // Keyed by `${rowIndex}:${colIndex}`
  cellEdits: Record<string, CellChange>;
  addedRows: Record<string, unknown>[];
  deletedRowIndices: number[];
}

export interface PendingChangesStoreState {
  tables: Record<string, TablePendingState>;
  autoCommitModes: Record<string, boolean>;
  setAutoCommitMode: (tableKey: string, enabled: boolean) => void;
  isAutoCommitMode: (tableKey: string) => boolean;
  stageCellEdit: (tableKey: string, change: CellChange) => void;
  stageAddRow: (tableKey: string, initialData?: Record<string, unknown>) => void;
  stageDeleteRow: (tableKey: string, rowIndex: number) => void;
  unstageDeleteRow: (tableKey: string, rowIndex: number) => void;
  discardChanges: (tableKey: string) => void;
  hasPendingChanges: (tableKey: string) => boolean;
  getPendingChangesCount: (tableKey: string) => number;
  getTableChanges: (tableKey: string) => TablePendingState;
  clearAll: () => void;
}

const initialTableState: TablePendingState = {
  cellEdits: {},
  addedRows: [],
  deletedRowIndices: [],
};

export const usePendingChangesStore = create<PendingChangesStoreState>((set, get) => ({
  tables: {},
  autoCommitModes: {},

  setAutoCommitMode: (tableKey: string, enabled: boolean) => {
    set((state) => ({
      autoCommitModes: {
        ...state.autoCommitModes,
        [tableKey]: enabled,
      },
    }));
  },

  isAutoCommitMode: (tableKey: string) => {
    const val = get().autoCommitModes[tableKey];
    return val !== undefined ? val : true;
  },

  stageCellEdit: (tableKey: string, change: CellChange) => {
    set((state) => {
      const currentTable = state.tables[tableKey] || { ...initialTableState };
      const cellKey = `${change.rowIndex}:${change.colIndex}`;

      // If new value equals old value, remove pending edit
      if (change.newValue === change.oldValue) {
        const remainingEdits = { ...currentTable.cellEdits };
        delete remainingEdits[cellKey];
        return {
          tables: {
            ...state.tables,
            [tableKey]: {
              ...currentTable,
              cellEdits: remainingEdits,
            },
          },
        };
      }

      return {
        tables: {
          ...state.tables,
          [tableKey]: {
            ...currentTable,
            cellEdits: {
              ...currentTable.cellEdits,
              [cellKey]: change,
            },
          },
        },
      };
    });
  },

  stageAddRow: (tableKey: string, initialData: Record<string, unknown> = {}) => {
    set((state) => {
      const currentTable = state.tables[tableKey] || { ...initialTableState };
      return {
        tables: {
          ...state.tables,
          [tableKey]: {
            ...currentTable,
            addedRows: [...currentTable.addedRows, initialData],
          },
        },
      };
    });
  },

  stageDeleteRow: (tableKey: string, rowIndex: number) => {
    set((state) => {
      const currentTable = state.tables[tableKey] || { ...initialTableState };
      if (currentTable.deletedRowIndices.includes(rowIndex)) return state;
      return {
        tables: {
          ...state.tables,
          [tableKey]: {
            ...currentTable,
            deletedRowIndices: [...currentTable.deletedRowIndices, rowIndex],
          },
        },
      };
    });
  },

  unstageDeleteRow: (tableKey: string, rowIndex: number) => {
    set((state) => {
      const currentTable = state.tables[tableKey];
      if (!currentTable) return state;
      return {
        tables: {
          ...state.tables,
          [tableKey]: {
            ...currentTable,
            deletedRowIndices: currentTable.deletedRowIndices.filter((r) => r !== rowIndex),
          },
        },
      };
    });
  },

  discardChanges: (tableKey: string) => {
    set((state) => {
      const newTables = { ...state.tables };
      delete newTables[tableKey];
      return { tables: newTables };
    });
  },

  hasPendingChanges: (tableKey: string) => {
    const table = get().tables[tableKey];
    if (!table) return false;
    return (
      Object.keys(table.cellEdits).length > 0 ||
      table.addedRows.length > 0 ||
      table.deletedRowIndices.length > 0
    );
  },

  getPendingChangesCount: (tableKey: string) => {
    const table = get().tables[tableKey];
    if (!table) return 0;
    return (
      Object.keys(table.cellEdits).length +
      table.addedRows.length +
      table.deletedRowIndices.length
    );
  },

  getTableChanges: (tableKey: string) => {
    return get().tables[tableKey] || initialTableState;
  },

  clearAll: () => {
    set({ tables: {}, autoCommitModes: {} });
  },
}));

export default usePendingChangesStore;
