import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  buildToggleRlsSql,
  buildGetRlsStatusSql,
  buildGetRlsPoliciesSql,
  type RlsPolicy,
} from '../../api/securityHelpers';
import { dbApi } from '../../api/db';
import { formatCellValue } from '../../utils/cellFormatter';
import { useAuditLogStore } from '../../stores/auditLogStore';
import {
  getFetchColumnsSql,
  parseColumnsFromQueryResult,
  generateTableDdl,
  getFetchTableDdlSql,
  parseTableDdlFromQueryResult,
  enrichColumnsFromSqliteDdl,
  enrichForeignKeysFromSqliteDdl,
  type TableColumnStructure,
} from './tableStructureHelpers';
import {
  getFetchIndexesSql,
  parseIndexesFromQueryResult,
  type TableIndexStructure,
  getFetchForeignKeysSql,
  parseForeignKeysFromQueryResult,
  type TableForeignKeyStructure,
  getFetchConstraintsSql,
  parseConstraintsFromQueryResult,
  getFetchTriggersSql,
  parseTriggersFromQueryResult,
  type TableConstraintStructure,
} from './tableManagementHelpers';
import type { TableTriggerDef } from '../../api/queryBuilder';

export interface UseTableStructureDataOptions {
  tabId: string;
  connectionId: string;
  tableName: string;
  schemaName?: string;
  driver: string;
  showStatus: (type: 'success' | 'error', text: string) => void;
}

export function useTableStructureData({
  tabId,
  connectionId,
  tableName,
  schemaName,
  driver,
  showStatus,
}: UseTableStructureDataOptions) {
  const [columns, setColumns] = useState<TableColumnStructure[]>([]);
  const [indexes, setIndexes] = useState<TableIndexStructure[]>([]);
  const [triggers, setTriggers] = useState<TableTriggerDef[]>([]);
  const [foreignKeys, setForeignKeys] = useState<TableForeignKeyStructure[]>([]);
  const [constraints, setConstraints] = useState<TableConstraintStructure[]>([]);
  const [tableDdl, setTableDdl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rlsEnabled, setRlsEnabled] = useState(false);
  const [rlsPolicies, setRlsPolicies] = useState<RlsPolicy[]>([]);
  const [submittingRls, setSubmittingRls] = useState(false);

  const loadStructure = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await dbApi.openSession(connectionId, tabId);
      const sql = getFetchColumnsSql(driver, tableName, schemaName);
      let parsedCols: TableColumnStructure[] = [];

      try {
        const result = await dbApi.executeQuery(tabId, sql);
        parsedCols = parseColumnsFromQueryResult(result, driver);
      } catch (queryErr) {
        console.warn('Specialized structure query failed, trying fetchTableData fallback:', queryErr);
      }

      if (parsedCols.length === 0) {
        const tableData = await dbApi.fetchTableData(tabId, tableName, schemaName, 1, 0);
        parsedCols = parseColumnsFromQueryResult(
          { columns: [], rows: [], execution_time_ms: 0 },
          driver,
          tableData.columns
        );
      }

      let parsedDdl: string | null = null;
      if ((driver || '').toLowerCase() === 'sqlite') {
        try {
          const ddlSql = getFetchTableDdlSql(driver, tableName, schemaName);
          if (ddlSql) {
            const ddlRes = await dbApi.executeQuery(tabId, ddlSql);
            parsedDdl = parseTableDdlFromQueryResult(ddlRes);
            parsedCols = enrichColumnsFromSqliteDdl(parsedCols, parsedDdl);
          }
        } catch (ddlErr) {
          console.warn('DDL load fallback error:', ddlErr);
        }
      }
      setTableDdl(parsedDdl);
      setColumns(parsedCols);

      try {
        const idxSql = getFetchIndexesSql(driver, tableName, schemaName);
        const idxRes = await dbApi.executeQuery(tabId, idxSql);
        setIndexes(parseIndexesFromQueryResult(idxRes, driver));
      } catch (idxErr) {
        console.warn('Index load fallback error:', idxErr);
      }

      try {
        const triggerSql = getFetchTriggersSql(driver, tableName);
        if (triggerSql) {
          const triggerRes = await dbApi.executeQuery(tabId, triggerSql);
          setTriggers(parseTriggersFromQueryResult(triggerRes, driver));
        } else {
          setTriggers([]);
        }
      } catch (triggerErr) {
        console.warn('Trigger load fallback error:', triggerErr);
      }

      try {
        const fkSql = getFetchForeignKeysSql(driver, tableName, schemaName);
        const fkRes = await dbApi.executeQuery(tabId, fkSql);
        let parsedFk = parseForeignKeysFromQueryResult(fkRes, driver);
        if ((driver || '').toLowerCase().includes('sqlite') && parsedDdl) {
          parsedFk = enrichForeignKeysFromSqliteDdl(parsedFk, parsedDdl);
        }
        setForeignKeys(parsedFk);
      } catch (fkErr) {
        console.warn('Foreign key load fallback error:', fkErr);
      }

      try {
        const constSql = getFetchConstraintsSql(driver, tableName, schemaName);
        const constRes = await dbApi.executeQuery(tabId, constSql);
        setConstraints(parseConstraintsFromQueryResult(constRes, driver));
      } catch (constErr) {
        console.warn('Constraint load fallback error:', constErr);
      }

      try {
        const rlsStatusSql = buildGetRlsStatusSql(tableName, schemaName, driver);
        if (rlsStatusSql && !rlsStatusSql.startsWith('--')) {
          const rlsRes = await dbApi.executeQuery(tabId, rlsStatusSql);
          if (rlsRes.rows && rlsRes.rows.length > 0) {
            const rawVal = rlsRes.rows[0][0];
            const strVal = formatCellValue(rawVal).toLowerCase();
            setRlsEnabled(strVal === 'true' || strVal === 't' || strVal === '1');
          }
        }
        const rlsPoliciesSql = buildGetRlsPoliciesSql(tableName, schemaName, driver);
        if (rlsPoliciesSql && !rlsPoliciesSql.startsWith('--')) {
          const policiesRes = await dbApi.executeQuery(tabId, rlsPoliciesSql);
          const parsedPolicies: RlsPolicy[] = (policiesRes.rows || []).map((r) => {
            const pVal = formatCellValue(r[1]).toLowerCase();
            return {
              name: formatCellValue(r[0]),
              permissive: pVal === 'true' || pVal === 't' || pVal === 'permissive' || pVal === '1',
              roles: formatCellValue(r[2] ?? 'PUBLIC').split(',').map((x) => x.trim()).filter(Boolean),
              command: (formatCellValue(r[3] ?? 'ALL').toUpperCase() || 'ALL') as RlsPolicy['command'],
              usingExpr: r[4] ? formatCellValue(r[4]) : undefined,
              checkExpr: r[5] ? formatCellValue(r[5]) : undefined,
            };
          });
          setRlsPolicies(parsedPolicies);
        }
      } catch (rlsErr) {
        console.warn('RLS load fallback/unsupported:', rlsErr);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [connectionId, tabId, tableName, schemaName, driver]);

  useEffect(() => {
    loadStructure();
  }, [loadStructure]);

  const handleToggleRls = useCallback(async () => {
    setSubmittingRls(true);
    try {
      const targetState = !rlsEnabled;
      const sql = buildToggleRlsSql(tableName, schemaName, targetState, driver);
      await dbApi.executeQuery(tabId, sql);

      useAuditLogStore.getState().addLog({
        connectionId,
        action: 'SECURITY',
        query: sql,
        status: 'SUCCESS',
      });

      setRlsEnabled(targetState);
      showStatus('success', `${targetState ? 'Enabled' : 'Disabled'} Row-Level Security successfully`);
      await loadStructure();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus('error', `Failed to toggle RLS: ${msg}`);
    } finally {
      setSubmittingRls(false);
    }
  }, [rlsEnabled, tableName, schemaName, driver, tabId, connectionId, showStatus, loadStructure]);

  const fullDdl = useMemo(() => {
    if ((driver || '').toLowerCase() === 'sqlite' && tableDdl) {
      return tableDdl;
    }
    return generateTableDdl({
      tableName,
      schemaName,
      driver,
      columns,
    });
  }, [tableName, schemaName, driver, columns, tableDdl]);

  return {
    columns,
    indexes,
    triggers,
    foreignKeys,
    constraints,
    tableDdl,
    loading,
    error,
    rlsEnabled,
    rlsPolicies,
    submittingRls,
    loadStructure,
    handleToggleRls,
    fullDdl,
  };
}
