import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { EditorView, Decoration, keymap, type DecorationSet } from '@codemirror/view';
import { Prec, StateField, StateEffect } from '@codemirror/state';
import { sql, SQLite, PostgreSQL, MySQL, StandardSQL } from '@codemirror/lang-sql';
import {
  AlertCircle,
  Copy,
  Check,
  X,
  CornerDownRight,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { EditorToolbar } from './EditorToolbar';
import { applySafeLimit, type SafeLimitOption } from '../../utils/sqlLimitHelper';
import { analyzeDangerousQuery, type DangerousQueryAnalysis } from '../../utils/dangerousQueryDetector';
import { DangerousQueryConfirmModal } from '../dialogs/DangerousQueryConfirmModal';
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
import { parseSqlError, type ParsedSqlError } from '../../utils/sqlErrorParser';
import type { QueryResult } from '../../types/db';

export function isWriteQuery(sql: string): boolean {
  if (!sql) return false;
  // Strip comments (-- ... and /* ... */)
  const stripped = sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();

  if (!stripped) return false;

  const statements = stripped.split(';').map((s) => s.trim()).filter(Boolean);
  const writeKeywordRegex = /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|MERGE|GRANT|REVOKE)\b/i;
  const embeddedWriteRegex = /\b(INSERT\s+INTO|UPDATE\s+[`"'\w]+|DELETE\s+FROM|DROP\s+(TABLE|VIEW|INDEX|DATABASE|SCHEMA)|ALTER\s+TABLE|TRUNCATE\s+TABLE)\b/i;

  return statements.some((stmt) => writeKeywordRegex.test(stmt) || embeddedWriteRegex.test(stmt));
}

export const setErrorLineEffect = StateEffect.define<number | null>();

export const errorLineTheme = EditorView.baseTheme({
  '.cm-error-line': {
    backgroundColor: 'rgba(239, 68, 68, 0.15) !important',
    borderLeft: '4px solid #ef4444 !important',
  },
  '&.cm-editor.cm-focused .cm-error-line': {
    backgroundColor: 'rgba(239, 68, 68, 0.22) !important',
  },
});

export const errorLineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setErrorLineEffect)) {
        if (!effect.value) {
          return Decoration.none;
        }
        const lineNum = effect.value;
        if (lineNum >= 1 && lineNum <= tr.state.doc.lines) {
          const line = tr.state.doc.line(lineNum);
          return Decoration.set([
            Decoration.line({
              attributes: { class: 'cm-error-line' },
            }).range(line.from),
          ]);
        }
        return Decoration.none;
      }
    }
    return decorations.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

export interface SqlErrorCalloutProps {
  error: ParsedSqlError;
  theme: 'light' | 'dark';
  onDismiss: () => void;
  onJumpToLine?: (line: number, column?: number) => void;
}

export const SqlErrorCallout: React.FC<SqlErrorCalloutProps> = ({
  error,
  theme,
  onDismiss,
  onJumpToLine,
}) => {
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(error.originalMessage);
      }
      setCopied(true);
      toast.success('Error copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  const isDark = theme === 'dark';
  const bgColor = isDark ? '#2b1517' : '#fef2f2';
  const borderColor = isDark ? '#7f1d1d' : '#fecaca';
  const textColor = isDark ? '#fecaca' : '#991b1b';
  const badgeBg = isDark ? '#450a0a' : '#fee2e2';
  const badgeBorder = isDark ? '#991b1b' : '#f87171';

  const hasExtraDetails =
    Boolean(error.originalMessage) &&
    error.originalMessage.trim() !== error.cleanMessage.trim() &&
    error.originalMessage.length > error.cleanMessage.length;

  return (
    <div
      data-testid="sql-error-callout"
      role="alert"
      style={{
        backgroundColor: bgColor,
        borderBottom: `1px solid ${borderColor}`,
        borderLeft: '4px solid #ef4444',
        padding: '10px 14px',
        color: textColor,
        fontSize: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        flexShrink: 0,
        zIndex: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <AlertCircle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
          <span
            style={{
              fontWeight: 600,
              fontSize: '13px',
              color: isDark ? '#f87171' : '#b91c1c',
            }}
          >
            {error.errorType}
          </span>

          {error.errorCode && (
            <span
              data-testid="error-code-badge"
              style={{
                fontSize: '11px',
                padding: '1px 6px',
                borderRadius: '4px',
                backgroundColor: badgeBg,
                border: `1px solid ${badgeBorder}`,
                fontWeight: 500,
              }}
            >
              Code: {error.errorCode}
            </span>
          )}

          {error.driver && error.driver !== 'unknown' && (
            <span
              data-testid="error-driver-badge"
              style={{
                fontSize: '10px',
                padding: '1px 5px',
                borderRadius: '4px',
                backgroundColor: isDark ? '#374151' : '#e5e7eb',
                color: isDark ? '#d1d5db' : '#374151',
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              {error.driver}
            </span>
          )}

          {error.line !== undefined && (
            <button
              type="button"
              data-testid="error-line-badge"
              onClick={() => onJumpToLine?.(error.line!, error.column)}
              title="Jump to error line in editor"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                padding: '2px 7px',
                borderRadius: '4px',
                backgroundColor: isDark ? '#991b1b' : '#dc2626',
                color: '#ffffff',
                border: 'none',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <span>Line {error.line}{error.column ? `:${error.column}` : ''}</span>
              <CornerDownRight size={11} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            data-testid="copy-error-btn"
            onClick={handleCopy}
            title="Copy full error message to clipboard"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '4px',
              border: `1px solid ${borderColor}`,
              backgroundColor: isDark ? '#3b1215' : '#ffffff',
              color: isDark ? '#fca5a5' : '#7f1d1d',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {copied ? <Check size={12} style={{ color: '#16a34a' }} /> : <Copy size={12} />}
            <span>{copied ? 'Copied!' : 'Copy Error'}</span>
          </button>

          <button
            type="button"
            data-testid="dismiss-error-btn"
            onClick={onDismiss}
            aria-label="Dismiss error"
            title="Dismiss error callout"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '22px',
              height: '22px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: 'transparent',
              color: isDark ? '#9ca3af' : '#6b7280',
              cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div
        data-testid="error-callout-message"
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: '12px',
          lineHeight: '1.45',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          marginTop: '2px',
          color: isDark ? '#fecaca' : '#7f1d1d',
        }}
      >
        {error.cleanMessage || error.originalMessage}
      </div>

      {hasExtraDetails && (
        <div style={{ marginTop: '2px' }}>
          <button
            type="button"
            onClick={() => setShowRaw(!showRaw)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: 'none',
              border: 'none',
              color: isDark ? '#f87171' : '#dc2626',
              fontSize: '11px',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {showRaw ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>{showRaw ? 'Hide full details' : 'Show full details'}</span>
          </button>
          {showRaw && (
            <pre
              data-testid="error-callout-raw"
              style={{
                marginTop: '4px',
                padding: '6px 8px',
                backgroundColor: isDark ? '#1a0b0d' : '#fee2e2',
                borderRadius: '4px',
                fontSize: '11px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '120px',
                overflowY: 'auto',
              }}
            >
              {error.originalMessage}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

export interface SqlEditorProps {
  tabId?: string;
  onQueryResult?: (result: QueryResult) => void;
  onError?: (error: unknown) => void;
  theme?: 'light' | 'dark';
  onEditorCreated?: (view: EditorView) => void;
  isReadOnly?: boolean;
}

export const SqlEditor: React.FC<SqlEditorProps> = ({
  tabId,
  onQueryResult,
  onError,
  theme: themeProp,
  onEditorCreated,
  isReadOnly: isReadOnlyProp,
}) => {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const targetTabId = tabId ?? activeTabId;
  const tab = useTabStore((s) => s.tabs.find((t) => t.id === targetTabId));
  const setQueryContent = useTabStore((s) => s.setQueryContent);
  const setAutoCommitStore = useTabStore((s) => s.setAutoCommit);

  const connection = useConnectionStore((s) =>
    s.connections.find((c) => c.id === tab?.connectionId)
  );

  const isReadOnly = isReadOnlyProp ?? Boolean(connection?.readOnly || connection?.read_only);

  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const editorViewRef = useRef<EditorView | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const [executionTimeMs, setExecutionTimeMs] = useState<number | null>(null);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [rowsAffected, setRowsAffected] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [parsedError, setParsedError] = useState<ParsedSqlError | null>(null);
  const [isHistorySnippetsOpen, setIsHistorySnippetsOpen] = useState(false);
  const [historySnippetsTab, setHistorySnippetsTab] = useState<'history' | 'snippets'>('history');
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [planResult, setPlanResult] = useState<QueryResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [explainTargetSql, setExplainTargetSql] = useState('');

  // Safe Limit state
  const [safeLimit, setSafeLimit] = useState<SafeLimitOption>(1000);
  const [isLimitedActive, setIsLimitedActive] = useState(false);

  // Dangerous Query Guard state
  const [pendingDangerousQuery, setPendingDangerousQuery] = useState<{
    sql: string;
    analysis: DangerousQueryAnalysis;
    onConfirm: () => void;
  } | null>(null);

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

  // Reset errors when active tab changes
  useEffect(() => {
    setErrorMessage(null);
    setParsedError(null);
    const view = editorViewRef.current ?? editorRef.current?.view;
    if (view) {
      view.dispatch({ effects: setErrorLineEffect.of(null) });
    }
  }, [targetTabId]);

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

      if (isReadOnly && isWriteQuery(sqlToExecute)) {
        const errorMsg = 'Read-Only Mode: Write query rejected (INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE are disabled).';
        const parsed = parseSqlError(errorMsg, sqlToExecute, connection?.driver);
        setErrorMessage(errorMsg);
        setParsedError(parsed);
        toast.error(errorMsg);
        useStatusStore.getState().setTabStatus(targetTabId, {
          lastQuery: sqlToExecute,
          statusMessage: `Blocked: ${errorMsg}`,
        });
        onError?.(new Error(errorMsg));
        return;
      }

      const { modifiedSql, isLimited } = applySafeLimit(sqlToExecute, safeLimit);
      setIsLimitedActive(isLimited);

      const executeSql = async (sqlToRun: string, isLim: boolean) => {
        setIsRunning(true);
        setErrorMessage(null);
        setParsedError(null);

        // Clear previous error line highlights
        const activeView = editorViewRef.current ?? editorRef.current?.view;
        if (activeView) {
          activeView.dispatch({ effects: setErrorLineEffect.of(null) });
        }

        try {
          const result = await dbApi.executeQuery(targetTabId, sqlToRun);
          setExecutionTimeMs(result.execution_time_ms);
          setRowCount(result.rows ? result.rows.length : 0);
          setRowsAffected(result.rows_affected ?? null);
          useStatusStore.getState().setTabStatus(targetTabId, {
            lastQuery: sqlToRun,
            executionTimeMs: result.execution_time_ms,
            rowCount: result.rows ? result.rows.length : (result.rows_affected ?? 0),
            statusMessage: isLim ? `Safe Limit: Results capped at ${safeLimit} rows` : null,
          });

          // Record successful query to query history
          const conn = useConnectionStore.getState().connections.find((c) => c.id === currentTab?.connectionId);
          useQueryHistoryStore.getState().addHistoryItem({
            sql: sqlToRun,
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
            action: /^\s*(CREATE|ALTER|DROP|TRUNCATE)\b/i.test(sqlToRun) ? 'DDL' : 'QUERY',
            user: conn?.user || 'default',
            connectionId: currentTab?.connectionId,
            connectionName: conn?.name,
            database: conn?.database,
            query: sqlToRun,
            executionTimeMs: result.execution_time_ms,
            rowsAffected: result.rows_affected ?? (result.rows ? result.rows.length : 0),
            status: 'SUCCESS',
          });

          onQueryResult?.(result);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          const parsed = parseSqlError(msg, sqlToRun, connection?.driver);
          setErrorMessage(msg);
          setParsedError(parsed);
          useStatusStore.getState().setTabStatus(targetTabId, {
            lastQuery: sqlToRun,
            statusMessage: `Error: ${parsed.cleanMessage || msg}`,
          });

          // Highlight error line in CodeMirror if line is parsed
          const currentView = editorViewRef.current ?? editorRef.current?.view;
          if (currentView && parsed.line) {
            const lineNum = Math.min(Math.max(1, parsed.line), currentView.state.doc.lines);
            const line = currentView.state.doc.line(lineNum);
            const col = parsed.column ? Math.min(Math.max(1, parsed.column), line.length + 1) : 1;
            const targetPos = line.from + col - 1;
            currentView.dispatch({
              effects: [
                setErrorLineEffect.of(lineNum),
                EditorView.scrollIntoView(targetPos, { y: 'center' }),
              ],
              selection: { anchor: targetPos },
            });
          }

          // Record failed query to query history
          const conn = useConnectionStore.getState().connections.find((c) => c.id === currentTab?.connectionId);
          useQueryHistoryStore.getState().addHistoryItem({
            sql: sqlToRun,
            executionTimeMs: 0,
            status: 'error',
            errorMessage: msg,
            connectionId: currentTab?.connectionId,
            connectionName: conn?.name,
            database: conn?.database,
          });

          // Record failure to audit log
          useAuditLogStore.getState().addLog({
            action: /^\s*(CREATE|ALTER|DROP|TRUNCATE)\b/i.test(sqlToRun) ? 'DDL' : 'QUERY',
            user: conn?.user || 'default',
            connectionId: currentTab?.connectionId,
            connectionName: conn?.name,
            database: conn?.database,
            query: sqlToRun,
            status: 'FAILURE',
            errorMessage: msg,
          });

          onError?.(err);
        } finally {
          setIsRunning(false);
        }
      };

      const analysis = analyzeDangerousQuery(modifiedSql);
      if (analysis.isDangerous) {
        setPendingDangerousQuery({
          sql: modifiedSql,
          analysis,
          onConfirm: () => {
            setPendingDangerousQuery(null);
            executeSql(modifiedSql, isLimited);
          },
        });
        return;
      }

      await executeSql(modifiedSql, isLimited);
    },
    [targetTabId, tab, onQueryResult, onError, safeLimit, connection?.driver, isReadOnly]
  );

  const handleDismissError = useCallback(() => {
    setErrorMessage(null);
    setParsedError(null);
    const view = editorViewRef.current ?? editorRef.current?.view;
    if (view) {
      view.dispatch({ effects: setErrorLineEffect.of(null) });
    }
  }, []);

  const handleJumpToErrorLine = useCallback(
    (lineNum: number, columnNum?: number) => {
      const view = editorViewRef.current ?? editorRef.current?.view;
      if (!view) return;
      const safeLineNum = Math.min(Math.max(1, lineNum), view.state.doc.lines);
      const line = view.state.doc.line(safeLineNum);
      const col = columnNum ? Math.min(Math.max(1, columnNum), line.length + 1) : 1;
      const targetPos = line.from + col - 1;
      view.dispatch({
        effects: [
          setErrorLineEffect.of(safeLineNum),
          EditorView.scrollIntoView(targetPos, { y: 'center' }),
        ],
        selection: { anchor: targetPos },
      });
      view.focus();
    },
    []
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

      {isReadOnly && (
        <div
          data-testid="sql-readonly-banner"
          className="flex items-center justify-between px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/30 text-amber-400 text-xs select-none shrink-0"
        >
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} className="text-amber-400 shrink-0" />
            <span className="font-medium">
              Read-Only Mode Active: Write queries (INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE) are blocked.
            </span>
          </div>
          <span className="text-[10px] uppercase font-bold tracking-wider bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/40">
            Read-Only
          </span>
        </div>
      )}

      {parsedError && (
        <SqlErrorCallout
          error={parsedError}
          theme={activeTheme}
          onDismiss={handleDismissError}
          onJumpToLine={handleJumpToErrorLine}
        />
      )}

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <CodeMirror
          ref={editorRef}
          value={tab.queryContent}
          theme={activeTheme}
          height="100%"
          extensions={[sqlExtension, runKeymap, errorLineField, errorLineTheme]}
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

      {/* Dangerous Query Confirmation Modal */}
      {pendingDangerousQuery && (
        <DangerousQueryConfirmModal
          isOpen={true}
          sql={pendingDangerousQuery.sql}
          analysis={pendingDangerousQuery.analysis}
          onConfirm={pendingDangerousQuery.onConfirm}
          onCancel={() => setPendingDangerousQuery(null)}
        />
      )}
    </div>
  );
};
