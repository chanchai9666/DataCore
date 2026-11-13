import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { EditorView, keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { sql, SQLite, PostgreSQL, MySQL, StandardSQL } from '@codemirror/lang-sql';
import { toast } from 'sonner';
import { EditorToolbar } from './EditorToolbar';
import { applySafeLimit, type SafeLimitOption } from '../../utils/sqlLimitHelper';
import { HistorySnippetsDrawer } from './HistorySnippetsDrawer';
import { ExecutionPlanDrawer } from './ExecutionPlanDrawer';
import { SavepointModal } from '../transactions/SavepointModal';
import { LockInspectorModal } from '../transactions/LockInspectorModal';
import { DatabaseMetricsModal } from '../performance/DatabaseMetricsModal';
import { AuditLogDrawer } from '../security/AuditLogDrawer';
import { useTabStore } from '../../stores/tabStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useStatusStore } from '../../stores/statusStore';
import { useQueryHistoryStore } from '../../stores/queryHistoryStore';
import { useAuditLogStore } from '../../stores/auditLogStore';
import { dbApi } from '../../api/db';
import { buildExplainSql } from '../../api/queryBuilder';
import { buildSetIsolationLevelSql, type IsolationLevel } from '../../api/transactionHelpers';
import type { QueryResult } from '../../types/db';

export interface SqlEditorProps {
  tabId?: string;
  onQueryResult?: (result: QueryResult) => void;
  onError?: (error: unknown) => void;
  theme?: 'light' | 'dark';
  onEditorCreated?: (view: EditorView) => void;
}

export const SqlEditor: React.FC<SqlEditorProps> = ({
  tabId,
  onQueryResult,
  onError,
  theme: themeProp,
  onEditorCreated,
}) => {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const targetTabId = tabId ?? activeTabId;
  const tab = useTabStore((s) => s.tabs.find((t) => t.id === targetTabId));
  const setQueryContent = useTabStore((s) => s.setQueryContent);
  const setAutoCommitStore = useTabStore((s) => s.setAutoCommit);

  const connection = useConnectionStore((s) =>
    s.connections.find((c) => c.id === tab?.connectionId)
  );

  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const editorViewRef = useRef<EditorView | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const [executionTimeMs, setExecutionTimeMs] = useState<number | null>(null);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [rowsAffected, setRowsAffected] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isHistorySnippetsOpen, setIsHistorySnippetsOpen] = useState(false);
  const [historySnippetsTab, setHistorySnippetsTab] = useState<'history' | 'snippets'>('history');
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [planResult, setPlanResult] = useState<QueryResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [explainTargetSql, setExplainTargetSql] = useState('');

  // Safe Limit state
  const [safeLimit, setSafeLimit] = useState<SafeLimitOption>(1000);
  const [isLimitedActive, setIsLimitedActive] = useState(false);

  // Enterprise features states
  const [isolationLevel, setIsolationLevel] = useState<IsolationLevel>('READ COMMITTED');
  const [isSavepointOpen, setIsSavepointOpen] = useState(false);
  const [isLocksOpen, setIsLocksOpen] = useState(false);
  const [isMetricsOpen, setIsMetricsOpen] = useState(false);
  const [isAuditLogOpen, setIsAuditLogOpen] = useState(false);

  // System dark mode detection
  const [systemDark, setSystemDark] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const activeTheme = themeProp ?? (systemDark ? 'dark' : 'light');

  // SQL Dialect based on active connection driver
  const sqlExtension = useMemo(() => {
    let dialect = StandardSQL;
    if (connection?.driver === 'sqlite') {
      dialect = SQLite;
    } else if (connection?.driver === 'postgres') {
      dialect = PostgreSQL;
    } else if (connection?.driver === 'mysql') {
      dialect = MySQL;
    }
    return sql({ dialect });
  }, [connection?.driver]);

  // Execute query handler
  const handleRunQuery = useCallback(
    async (viewParam?: EditorView) => {
      if (!targetTabId) return;

      const view = viewParam ?? editorViewRef.current ?? editorRef.current?.view;
      const currentTab = useTabStore.getState().tabs.find((t) => t.id === targetTabId) ?? tab;
      let sqlToExecute = '';

      if (view) {
        const { from, to } = view.state.selection.main;
        const selectedText = view.state.sliceDoc(from, to).trim();
        if (selectedText.length > 0) {
          sqlToExecute = selectedText;
        } else {
          sqlToExecute = (currentTab ? currentTab.queryContent.trim() : '') || view.state.doc.toString().trim();
        }
      } else if (currentTab) {
        sqlToExecute = currentTab.queryContent.trim();
      }

      if (!sqlToExecute) return;

      const { modifiedSql, isLimited } = applySafeLimit(sqlToExecute, safeLimit);
      setIsLimitedActive(isLimited);

      setIsRunning(true);
      setErrorMessage(null);

      try {
        const result = await dbApi.executeQuery(targetTabId, modifiedSql);
        setExecutionTimeMs(result.execution_time_ms);
        setRowCount(result.rows ? result.rows.length : 0);
        setRowsAffected(result.rows_affected ?? null);
        useStatusStore.getState().setTabStatus(targetTabId, {
          lastQuery: modifiedSql,
          executionTimeMs: result.execution_time_ms,
          rowCount: result.rows ? result.rows.length : (result.rows_affected ?? 0),
          statusMessage: isLimited ? `Safe Limit: Results capped at ${safeLimit} rows` : null,
        });

        // Record successful query to query history
        const conn = useConnectionStore.getState().connections.find((c) => c.id === currentTab?.connectionId);
        useQueryHistoryStore.getState().addHistoryItem({
          sql: modifiedSql,
          executionTimeMs: result.execution_time_ms,
          rowCount: result.rows ? result.rows.length : undefined,
          rowsAffected: result.rows_affected ?? null,
          status: 'success',
          connectionId: currentTab?.connectionId,
          connectionName: conn?.name,
          database: conn?.database,
        });

        // Record to security audit log
        useAuditLogStore.getState().addLog({
          action: /^\s*(CREATE|ALTER|DROP|TRUNCATE)\b/i.test(sqlToExecute) ? 'DDL' : 'QUERY',
          user: conn?.user || 'default',
          connectionId: currentTab?.connectionId,
          connectionName: conn?.name,
          database: conn?.database,
          query: sqlToExecute,
          executionTimeMs: result.execution_time_ms,
          rowsAffected: result.rows_affected ?? (result.rows ? result.rows.length : 0),
          status: 'SUCCESS',
        });

        onQueryResult?.(result);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(msg);
        useStatusStore.getState().setTabStatus(targetTabId, {
          lastQuery: sqlToExecute,
          statusMessage: `Error: ${msg}`,
        });

        // Record failed query to query history
        const conn = useConnectionStore.getState().connections.find((c) => c.id === currentTab?.connectionId);
        useQueryHistoryStore.getState().addHistoryItem({
          sql: sqlToExecute,
          executionTimeMs: 0,
          status: 'error',
          errorMessage: msg,
          connectionId: currentTab?.connectionId,
          connectionName: conn?.name,
          database: conn?.database,
        });

        // Record failure to audit log
        useAuditLogStore.getState().addLog({
          action: /^\s*(CREATE|ALTER|DROP|TRUNCATE)\b/i.test(sqlToExecute) ? 'DDL' : 'QUERY',
          user: conn?.user || 'default',
          connectionId: currentTab?.connectionId,
          connectionName: conn?.name,
          database: conn?.database,
          query: sqlToExecute,
          status: 'FAILURE',
          errorMessage: msg,
        });

        onError?.(err);
      } finally {
        setIsRunning(false);
      }
    },
    [targetTabId, tab, onQueryResult, onError, safeLimit]
  );

  // Keymap extension for Cmd+Enter / Ctrl+Enter
  const runKeymap = useMemo(() => {
    return Prec.highest(
      keymap.of([
        {
          key: 'Mod-Enter',
          run: (view) => {
            handleRunQuery(view);
            return true;
          },
        },
      ])
    );
  }, [handleRunQuery]);

  // Cancel query handler
  const handleCancel = useCallback(async () => {
    if (!targetTabId) return;
    try {
      await dbApi.cancelQuery(targetTabId);
    } catch (err: unknown) {
      console.error('Cancel query failed:', err);
    } finally {
      setIsRunning(false);
    }
  }, [targetTabId]);

  // Toggle Auto-Commit
  const handleToggleAutoCommit = useCallback(
    async (enabled: boolean) => {
      if (!targetTabId) return;
      try {
        await dbApi.setAutocommit(targetTabId, enabled);
        setAutoCommitStore(targetTabId, enabled);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(msg);
        onError?.(err);
      }
    },
    [targetTabId, setAutoCommitStore, onError]
  );

  // Commit Transaction
  const handleCommit = useCallback(async () => {
    if (!targetTabId) return;
    try {
      await dbApi.commitTransaction(targetTabId);
      toast.success('Transaction committed');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      toast.error(`Commit failed: ${msg}`);
      onError?.(err);
    }
  }, [targetTabId, onError]);

  // Rollback Transaction
  const handleRollback = useCallback(async () => {
    if (!targetTabId) return;
    try {
      await dbApi.rollbackTransaction(targetTabId);
      toast.info('Transaction rolled back');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      toast.error(`Rollback failed: ${msg}`);
      onError?.(err);
    }
  }, [targetTabId, onError]);

  // Change Isolation Level
  const handleChangeIsolationLevel = useCallback(
    async (level: IsolationLevel) => {
      if (!targetTabId) return;
      setIsolationLevel(level);
      const sql = buildSetIsolationLevelSql(level, connection?.driver || 'postgres');
      try {
        await dbApi.executeQuery(targetTabId, sql);
        toast.success(`Transaction isolation set to ${level}`);
        useAuditLogStore.getState().addLog({
          action: 'TRANSACTION',
          connectionName: connection?.name,
          query: sql,
          status: 'SUCCESS',
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Failed to set isolation level: ${msg}`);
      }
    },
    [targetTabId, connection?.driver, connection?.name]
  );

  // Explain query handler
  const handleExplain = useCallback(
    async (analyze: boolean) => {
      if (!targetTabId) return;

      const view = editorViewRef.current ?? editorRef.current?.view;
      const currentTab = useTabStore.getState().tabs.find((t) => t.id === targetTabId) ?? tab;
      let sqlToExplain = '';

      if (view) {
        const { from, to } = view.state.selection.main;
        const selectedText = view.state.sliceDoc(from, to).trim();
        if (selectedText.length > 0) {
          sqlToExplain = selectedText;
        } else {
          sqlToExplain =
            (currentTab ? currentTab.queryContent.trim() : '') || view.state.doc.toString().trim();
        }
      } else if (currentTab) {
        sqlToExplain = currentTab.queryContent.trim();
      }

      if (!sqlToExplain) {
        toast.info('Please enter a query to explain');
        return;
      }

      const explainSql = buildExplainSql({
        sql: sqlToExplain,
        driver: connection?.driver,
        analyze,
      });

      setIsRunning(true);
      setErrorMessage(null);

      try {
        const result = await dbApi.executeQuery(targetTabId, explainSql);
        setPlanResult(result);
        setIsAnalyzing(analyze);
        setExplainTargetSql(sqlToExplain);
        setIsPlanOpen(true);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(msg);
        toast.error(`Explain failed: ${msg}`);
        onError?.(err);
      } finally {
        setIsRunning(false);
      }
    },
    [targetTabId, tab, connection?.driver, onError]
  );

  const handleEditorChange = useCallback(
    (value: string) => {
      if (targetTabId) {
        setQueryContent(targetTabId, value);
      }
    },
    [targetTabId, setQueryContent]
  );

  const handleSelectSql = useCallback(
    (sql: string, mode: 'insert' | 'replace' | 'run') => {
      if (!targetTabId) return;

      if (mode === 'insert') {
        const view = editorViewRef.current ?? editorRef.current?.view;
        const currentTab = useTabStore.getState().tabs.find((t) => t.id === targetTabId) ?? tab;
        const currentDoc = (currentTab ? currentTab.queryContent : '') || (view ? view.state.doc.toString() : '');
        const newContent = currentDoc.trim() ? `${currentDoc.trim()}\n\n${sql}` : sql;
        setQueryContent(targetTabId, newContent);
      } else {
        // replace or run
        setQueryContent(targetTabId, sql);
        if (mode === 'run') {
          setTimeout(() => {
            handleRunQuery();
          }, 50);
        }
      }
    },
    [targetTabId, tab, setQueryContent, handleRunQuery]
  );

  if (!tab) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#6b7280',
          fontSize: '14px',
        }}
      >
        No query tab selected
      </div>
    );
  }

  return (
    <div
      className="sql-editor-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        backgroundColor: activeTheme === 'dark' ? '#1e1e1e' : '#ffffff',
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          handleRunQuery();
        }
      }}
    >
      <EditorToolbar
        isRunning={isRunning}
        autoCommit={tab.autoCommit}
        isolationLevel={isolationLevel}
        onChangeIsolationLevel={handleChangeIsolationLevel}
        safeLimit={safeLimit}
        onChangeSafeLimit={setSafeLimit}
        isLimitedActive={isLimitedActive}
        executionTimeMs={executionTimeMs}
        rowCount={rowCount}
        rowsAffected={rowsAffected}
        errorMessage={errorMessage}
        onRun={() => handleRunQuery()}
        onCancel={handleCancel}
        onToggleAutoCommit={handleToggleAutoCommit}
        onCommit={handleCommit}
        onRollback={handleRollback}
        onOpenSavepoints={() => setIsSavepointOpen(true)}
        onOpenLocks={() => setIsLocksOpen(true)}
        onOpenMetrics={() => setIsMetricsOpen(true)}
        onOpenAuditLog={() => setIsAuditLogOpen(true)}
        onOpenHistory={() => {
          setHistorySnippetsTab('history');
          setIsHistorySnippetsOpen(true);
        }}
        onOpenSnippets={() => {
          setHistorySnippetsTab('snippets');
          setIsHistorySnippetsOpen(true);
        }}
        onExplain={handleExplain}
      />

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <CodeMirror
          ref={editorRef}
          value={tab.queryContent}
          theme={activeTheme}
          height="100%"
          extensions={[sqlExtension, runKeymap]}
          onChange={handleEditorChange}
          onCreateEditor={(view) => {
            editorViewRef.current = view;
            onEditorCreated?.(view);
          }}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            highlightActiveLine: true,
            foldGutter: true,
            autocompletion: true,
            bracketMatching: true,
            closeBrackets: true,
          }}
        />
      </div>

      <HistorySnippetsDrawer
        isOpen={isHistorySnippetsOpen}
        onClose={() => setIsHistorySnippetsOpen(false)}
        initialTab={historySnippetsTab}
        currentConnectionId={tab.connectionId}
        currentConnectionName={connection?.name}
        currentDatabase={connection?.database}
        onSelectSql={(sql, mode) => {
          handleSelectSql(sql, mode);
          if (mode === 'replace' || mode === 'run') {
            setIsHistorySnippetsOpen(false);
          }
        }}
      />

      <ExecutionPlanDrawer
        isOpen={isPlanOpen}
        onClose={() => setIsPlanOpen(false)}
        sql={explainTargetSql}
        planResult={planResult}
        isAnalyzing={isAnalyzing}
        driver={connection?.driver}
      />

      <SavepointModal
        isOpen={isSavepointOpen}
        tabId={targetTabId || ''}
        driver={connection?.driver}
        connectionName={connection?.name}
        onClose={() => setIsSavepointOpen(false)}
      />

      <LockInspectorModal
        isOpen={isLocksOpen}
        connectionId={tab.connectionId}
        driver={connection?.driver}
        connectionName={connection?.name}
        onClose={() => setIsLocksOpen(false)}
      />

      <DatabaseMetricsModal
        isOpen={isMetricsOpen}
        connectionId={tab.connectionId}
        driver={connection?.driver}
        databaseName={connection?.database}
        onClose={() => setIsMetricsOpen(false)}
      />

      <AuditLogDrawer
        isOpen={isAuditLogOpen}
        onClose={() => setIsAuditLogOpen(false)}
      />
    </div>
  );
};
