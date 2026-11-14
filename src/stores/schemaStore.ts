import { create } from 'zustand';
import { dbApi } from '../api/db';
import { formatCellValue } from '../utils/cellFormatter';
import { formatSqlLiteral } from '../api/queryBuilder';

export type SchemaMap = Record<string, string[]>;

export interface SchemaStoreState {
  schemas: Record<string, SchemaMap>;
  isLoading: Record<string, boolean>;
  fetchSchema: (connectionId: string, driver?: string, schemaName?: string) => Promise<SchemaMap>;
  setSchema: (connectionId: string, schema: SchemaMap) => void;
  invalidateSchema: (connectionId: string) => void;
  getSchema: (connectionId: string) => SchemaMap;
}

export async function fetchDatabaseSchemaMap(
  connectionId: string,
  driver?: string,
  schemaName?: string
): Promise<SchemaMap> {
  const d = (driver || '').toLowerCase();
  const schemaMap: SchemaMap = {};

  if (!connectionId || !dbApi || typeof dbApi.executeDirectQuery !== 'function') {
    return schemaMap;
  }

  try {
    if (d.includes('sqlite')) {
      // 1. Fetch tables and views
      const tableRes = await dbApi.executeDirectQuery(
        connectionId,
        "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name;"
      );
      if (tableRes && tableRes.rows) {
        for (const row of tableRes.rows) {
          const tbl = formatCellValue(row[0]);
          if (tbl) schemaMap[tbl] = [];
        }
      }

      // 2. Fetch columns using pragma_table_info JOIN
      const colRes = await dbApi.executeDirectQuery(
        connectionId,
        "SELECT m.name AS table_name, p.name AS column_name FROM sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type IN ('table', 'view') AND m.name NOT LIKE 'sqlite_%' ORDER BY m.name, p.cid;"
      );
      if (colRes && colRes.rows) {
        for (const row of colRes.rows) {
          const tbl = formatCellValue(row[0]);
          const col = formatCellValue(row[1]);
          if (tbl && col) {
            if (!schemaMap[tbl]) schemaMap[tbl] = [];
            if (!schemaMap[tbl].includes(col)) {
              schemaMap[tbl].push(col);
            }
          }
        }
      }
    } else if (d.includes('mysql') || d.includes('mariadb')) {
      const schemaSql = schemaName ? formatSqlLiteral(schemaName, 'mysql') : 'DATABASE()';
      const tableRes = await dbApi.executeDirectQuery(
        connectionId,
        `SELECT table_name FROM information_schema.tables WHERE table_schema = ${schemaSql} AND table_type IN ('BASE TABLE', 'VIEW') ORDER BY table_name;`
      );
      if (tableRes && tableRes.rows) {
        for (const row of tableRes.rows) {
          const tbl = formatCellValue(row[0]);
          if (tbl) schemaMap[tbl] = [];
        }
      }

      const colRes = await dbApi.executeDirectQuery(
        connectionId,
        `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = ${schemaSql} ORDER BY table_name, ordinal_position;`
      );
      if (colRes && colRes.rows) {
        for (const row of colRes.rows) {
          const tbl = formatCellValue(row[0]);
          const col = formatCellValue(row[1]);
          if (tbl && col) {
            if (!schemaMap[tbl]) schemaMap[tbl] = [];
            if (!schemaMap[tbl].includes(col)) {
              schemaMap[tbl].push(col);
            }
          }
        }
      }
    } else {
      // Postgres
      const s = schemaName || 'public';
      const tableRes = await dbApi.executeDirectQuery(
        connectionId,
        `SELECT table_name FROM information_schema.tables WHERE table_schema = ${formatSqlLiteral(s, 'postgres')} AND table_type IN ('BASE TABLE', 'VIEW') ORDER BY table_name;`
      );
      if (tableRes && tableRes.rows) {
        for (const row of tableRes.rows) {
          const tbl = formatCellValue(row[0]);
          if (tbl) schemaMap[tbl] = [];
        }
      }

      const colRes = await dbApi.executeDirectQuery(
        connectionId,
        `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = ${formatSqlLiteral(s, 'postgres')} ORDER BY table_name, ordinal_position;`
      );
      if (colRes && colRes.rows) {
        for (const row of colRes.rows) {
          const tbl = formatCellValue(row[0]);
          const col = formatCellValue(row[1]);
          if (tbl && col) {
            if (!schemaMap[tbl]) schemaMap[tbl] = [];
            if (!schemaMap[tbl].includes(col)) {
              schemaMap[tbl].push(col);
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn(`Failed to fetch schema map for ${connectionId}:`, err);
  }

  return schemaMap;
}

export const useSchemaStore = create<SchemaStoreState>((set, get) => ({
  schemas: {},
  isLoading: {},

  fetchSchema: async (connectionId: string, driver?: string, schemaName?: string) => {
    if (!connectionId) return {};

    set((state) => ({
      isLoading: { ...state.isLoading, [connectionId]: true },
    }));

    try {
      const map = await fetchDatabaseSchemaMap(connectionId, driver, schemaName);
      set((state) => ({
        schemas: { ...state.schemas, [connectionId]: map },
        isLoading: { ...state.isLoading, [connectionId]: false },
      }));
      return map;
    } catch (err) {
      set((state) => ({
        isLoading: { ...state.isLoading, [connectionId]: false },
      }));
      return get().schemas[connectionId] || {};
    }
  },

  setSchema: (connectionId: string, schema: SchemaMap) => {
    set((state) => ({
      schemas: { ...state.schemas, [connectionId]: schema },
    }));
  },

  invalidateSchema: (connectionId: string) => {
    set((state) => {
      const nextSchemas = { ...state.schemas };
      delete nextSchemas[connectionId];
      return { schemas: nextSchemas };
    });
  },

  getSchema: (connectionId: string) => {
    return get().schemas[connectionId] || {};
  },
}));
