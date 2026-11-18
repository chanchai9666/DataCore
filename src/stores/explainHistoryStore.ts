import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { QueryResult } from '../types/db';
import type { ParsedPlan } from '../api/planParser';

export interface ExplainSnapshot {
  id: string;
  title?: string;
  sql: string;
  connectionId?: string;
  driver?: string;
  timestamp: number;
  planResult: QueryResult;
  parsedPlan: ParsedPlan;
  executionTimeMs?: number;
  totalCost?: number;
}

export interface ExplainHistoryState {
  snapshots: ExplainSnapshot[];
  selectedSnapshotAId: string | null;
  selectedSnapshotBId: string | null;

  addSnapshot: (
    data: Omit<ExplainSnapshot, 'id' | 'timestamp'> & { id?: string; timestamp?: number }
  ) => ExplainSnapshot;
  removeSnapshot: (id: string) => void;
  clearSnapshots: () => void;
  setSelectedSnapshots: (idA: string | null, idB: string | null) => void;
}

function parseCostNumber(costStr?: string): number | undefined {
  if (!costStr) return undefined;
  const match = costStr.match(/[\d.]+/);
  if (match) {
    const val = parseFloat(match[0]);
    return isNaN(val) ? undefined : val;
  }
  return undefined;
}

function parseTimeMs(timeStr?: string): number | undefined {
  if (!timeStr) return undefined;
  const match = timeStr.match(/([\d.]+)\s*(ms|s)?/i);
  if (match) {
    const num = parseFloat(match[1]);
    if (isNaN(num)) return undefined;
    if (match[2]?.toLowerCase() === 's') {
      return num * 1000;
    }
    return num;
  }
  return undefined;
}

export const useExplainHistoryStore = create<ExplainHistoryState>()(
  persist(
    (set) => ({
      snapshots: [],
      selectedSnapshotAId: null,
      selectedSnapshotBId: null,

      addSnapshot: (data) => {
        const id = data.id || `snapshot-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const timestamp = data.timestamp || Date.now();

        const totalCost =
          data.totalCost ?? parseCostNumber(data.parsedPlan?.totalCost);
        const executionTimeMs =
          data.executionTimeMs ?? parseTimeMs(data.parsedPlan?.executionTime);

        const newSnapshot: ExplainSnapshot = {
          ...data,
          id,
          timestamp,
          totalCost,
          executionTimeMs,
        };

        set((state) => {
          // Keep newest snapshots, max 50
          const updated = [newSnapshot, ...state.snapshots.filter((s) => s.id !== id)].slice(0, 50);
          return { snapshots: updated };
        });

        return newSnapshot;
      },

      removeSnapshot: (id) => {
        set((state) => ({
          snapshots: state.snapshots.filter((s) => s.id !== id),
          selectedSnapshotAId: state.selectedSnapshotAId === id ? null : state.selectedSnapshotAId,
          selectedSnapshotBId: state.selectedSnapshotBId === id ? null : state.selectedSnapshotBId,
        }));
      },

      clearSnapshots: () => {
        set({
          snapshots: [],
          selectedSnapshotAId: null,
          selectedSnapshotBId: null,
        });
      },

      setSelectedSnapshots: (idA, idB) => {
        set({
          selectedSnapshotAId: idA,
          selectedSnapshotBId: idB,
        });
      },
    }),
    {
      name: 'datacore:explain_history',
    }
  )
);
