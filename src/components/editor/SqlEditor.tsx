import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { EditorView, keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { sql, SQLite, PostgreSQL, MySQL, StandardSQL } from '@codemirror/lang-sql';
import { toast } from 'sonner';
import { EditorToolbar } from './EditorToolbar';
import { useTabStore } from '../../stores/tabStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { dbApi } from '../../api/db';
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

      setIsRunning(true);
      setErrorMessage(null);

      try {
        const result = await dbApi.executeQuery(targetTabId, sqlToExecute);
        setExecutionTimeMs(result.execution_time_ms);
        setRowCount(result.rows ? result.rows.length : 0);
        setRowsAffected(result.rows_affected ?? null);
        onQueryResult?.(result);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(msg);
        onError?.(err);
      } finally {
        setIsRunning(false);
      }
    },
    [targetTabId, tab, onQueryResult, onError]
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

  const handleEditorChange = useCallback(
    (value: string) => {
      if (targetTabId) {
        setQueryContent(targetTabId, value);
      }
    },
    [targetTabId, setQueryContent]
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
        executionTimeMs={executionTimeMs}
        rowCount={rowCount}
        rowsAffected={rowsAffected}
        errorMessage={errorMessage}
        onRun={() => handleRunQuery()}
        onCancel={handleCancel}
        onToggleAutoCommit={handleToggleAutoCommit}
        onCommit={handleCommit}
        onRollback={handleRollback}
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
    </div>
  );
};
