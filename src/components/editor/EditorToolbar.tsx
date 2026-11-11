import React from 'react';
import { Play, Square, Check, RotateCcw, Loader2, History, Bookmark } from 'lucide-react';

export interface EditorToolbarProps {
  isRunning: boolean;
  autoCommit: boolean;
  executionTimeMs?: number | null;
  rowCount?: number | null;
  rowsAffected?: number | null;
  errorMessage?: string | null;
  onRun: () => void;
  onCancel: () => void;
  onToggleAutoCommit: (enabled: boolean) => void;
  onCommit: () => void;
  onRollback: () => void;
  onOpenHistory?: () => void;
  onOpenSnippets?: () => void;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  isRunning,
  autoCommit,
  executionTimeMs,
  rowCount,
  rowsAffected,
  errorMessage,
  onRun,
  onCancel,
  onToggleAutoCommit,
  onCommit,
  onRollback,
  onOpenHistory,
  onOpenSnippets,
}) => {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const shortcutHint = isMac ? '⌘Enter' : 'Ctrl+Enter';

  return (
    <div
      className="editor-toolbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 12px',
        borderBottom: '1px solid var(--border-color, #e5e7eb)',
        backgroundColor: 'var(--toolbar-bg, #f9fafb)',
        flexWrap: 'wrap',
        gap: '8px',
        fontSize: '13px',
      }}
    >
      {/* Left controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {/* Run Button */}
        <button
          type="button"
          onClick={onRun}
          disabled={isRunning}
          aria-label="Run Query"
          title={`Run Query (${shortcutHint})`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: isRunning ? '#93c5fd' : '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: '4px',
            padding: '5px 12px',
            fontWeight: 500,
            cursor: isRunning ? 'not-allowed' : 'pointer',
          }}
        >
          <Play size={14} fill="currentColor" />
          <span>Run</span>
          <span style={{ fontSize: '11px', opacity: 0.85 }}>({shortcutHint})</span>
        </button>

        {/* Cancel Button */}
        <button
          type="button"
          onClick={onCancel}
          disabled={!isRunning}
          aria-label="Cancel Query"
          title="Cancel Query"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            backgroundColor: !isRunning ? '#f3f4f6' : '#ef4444',
            color: !isRunning ? '#9ca3af' : '#ffffff',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            padding: '5px 10px',
            fontWeight: 500,
            cursor: !isRunning ? 'not-allowed' : 'pointer',
          }}
        >
          <Square size={13} fill={isRunning ? 'currentColor' : 'none'} />
          <span>Cancel</span>
        </button>

        {/* Separator */}
        <div style={{ width: '1px', height: '18px', backgroundColor: '#d1d5db', margin: '0 4px' }} />

        {/* Auto-Commit Switch */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            role="switch"
            aria-checked={autoCommit}
            aria-label="Auto-Commit"
            onClick={() => onToggleAutoCommit(!autoCommit)}
            disabled={isRunning}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              width: '36px',
              height: '20px',
              borderRadius: '10px',
              backgroundColor: autoCommit ? '#10b981' : '#9ca3af',
              border: 'none',
              padding: '2px',
              cursor: isRunning ? 'not-allowed' : 'pointer',
              position: 'relative',
              transition: 'background-color 0.2s',
            }}
          >
            <span
              style={{
                display: 'block',
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                backgroundColor: '#ffffff',
                transform: autoCommit ? 'translateX(16px)' : 'translateX(0)',
                transition: 'transform 0.2s',
              }}
            />
          </button>
          <span style={{ fontSize: '12px', userSelect: 'none' }}>
            Auto-Commit: {autoCommit ? 'ON' : 'OFF'}
          </span>
        </div>

        {/* Commit Button */}
        <button
          type="button"
          onClick={onCommit}
          disabled={autoCommit || isRunning}
          aria-label="Commit"
          title="Commit Transaction"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            backgroundColor: autoCommit || isRunning ? '#f3f4f6' : '#ffffff',
            color: autoCommit || isRunning ? '#9ca3af' : '#15803d',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            padding: '5px 8px',
            cursor: autoCommit || isRunning ? 'not-allowed' : 'pointer',
          }}
        >
          <Check size={14} />
          <span>Commit</span>
        </button>

        {/* Rollback Button */}
        <button
          type="button"
          onClick={onRollback}
          disabled={autoCommit || isRunning}
          aria-label="Rollback"
          title="Rollback Transaction"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            backgroundColor: autoCommit || isRunning ? '#f3f4f6' : '#ffffff',
            color: autoCommit || isRunning ? '#9ca3af' : '#b91c1c',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            padding: '5px 8px',
            cursor: autoCommit || isRunning ? 'not-allowed' : 'pointer',
          }}
        >
          <RotateCcw size={14} />
          <span>Rollback</span>
        </button>

        {/* Separator */}
        {(onOpenHistory || onOpenSnippets) && (
          <div style={{ width: '1px', height: '18px', backgroundColor: '#d1d5db', margin: '0 4px' }} />
        )}

        {/* History Button */}
        {onOpenHistory && (
          <button
            type="button"
            onClick={onOpenHistory}
            aria-label="History"
            title="Query History"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: '#ffffff',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              padding: '5px 8px',
              cursor: 'pointer',
            }}
          >
            <History size={13} />
            <span>History</span>
          </button>
        )}

        {/* Snippets Button */}
        {onOpenSnippets && (
          <button
            type="button"
            onClick={onOpenSnippets}
            aria-label="Snippets"
            title="Saved SQL Snippets"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: '#ffffff',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              padding: '5px 8px',
              cursor: 'pointer',
            }}
          >
            <Bookmark size={13} />
            <span>Snippets</span>
          </button>
        )}
      </div>

      {/* Right status indicators */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#6b7280', fontSize: '12px' }}>
        {isRunning && (
          <div
            data-testid="running-spinner"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#2563eb' }}
          >
            <Loader2
              size={14}
              style={{
                animation: 'spin 1s linear infinite',
              }}
            />
            <span>Executing...</span>
          </div>
        )}

        {executionTimeMs != null && (
          <div>
            <span>⏱️ </span>
            <span>{executionTimeMs} ms</span>
          </div>
        )}

        {rowCount != null && (
          <div>
            <span>{rowCount} rows</span>
          </div>
        )}

        {rowsAffected != null && (
          <div>
            <span>({rowsAffected} affected)</span>
          </div>
        )}

        {errorMessage && (
          <div style={{ color: '#ef4444', fontWeight: 500 }} title={errorMessage}>
            Error: {errorMessage.slice(0, 50)}
          </div>
        )}
      </div>
    </div>
  );
};
