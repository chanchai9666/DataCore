import React, { useState } from 'react';
import {
  Play,
  Square,
  Check,
  RotateCcw,
  Loader2,
  History,
  Bookmark,
  Activity,
  Zap,
  Lock,
  Cpu,
  ShieldCheck,
  Flag,
  Eye,
  AlignLeft,
  Columns2,
  Rows2,
} from 'lucide-react';
import type { IsolationLevel } from '../../api/transactionHelpers';
import type { SafeLimitOption } from '../../utils/sqlLimitHelper';
import { ImpactPreviewModal } from './ImpactPreviewModal';

export interface EditorToolbarProps {
  isRunning: boolean;
  autoCommit: boolean;
  isolationLevel?: IsolationLevel;
  onChangeIsolationLevel?: (level: IsolationLevel) => void;
  safeLimit?: SafeLimitOption;
  onChangeSafeLimit?: (limit: SafeLimitOption) => void;
  isLimitedActive?: boolean;
  executionTimeMs?: number | null;
  rowCount?: number | null;
  rowsAffected?: number | null;
  errorMessage?: string | null;
  onRun: () => void;
  onCancel: () => void;
  onToggleAutoCommit: (enabled: boolean) => void;
  onCommit: () => void;
  onRollback: () => void;
  onOpenSavepoints?: () => void;
  onOpenLocks?: () => void;
  onOpenMetrics?: () => void;
  onOpenAuditLog?: () => void;
  onOpenHistory?: () => void;
  onOpenSnippets?: () => void;
  onExplain?: (analyze: boolean) => void;
  onFormat?: () => void;
  splitDirection?: 'vertical' | 'horizontal';
  onToggleSplit?: () => void;
  onImpactPreview?: () => void;
  connectionId?: string;
  sql?: string;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  isRunning,
  autoCommit,
  isolationLevel = 'READ COMMITTED',
  onChangeIsolationLevel,
  safeLimit = 1000,
  onChangeSafeLimit,
  isLimitedActive = false,
  executionTimeMs,
  rowCount,
  rowsAffected,
  errorMessage,
  onRun,
  onCancel,
  onToggleAutoCommit,
  onCommit,
  onRollback,
  onOpenSavepoints,
  onOpenLocks,
  onOpenMetrics,
  onOpenAuditLog,
  onOpenHistory,
  onOpenSnippets,
  onExplain,
  onFormat,
  splitDirection = 'vertical',
  onToggleSplit,
  onImpactPreview,
  connectionId,
  sql,
}) => {
  const [isImpactModalOpen, setIsImpactModalOpen] = useState(false);

  const handleImpactPreviewClick = () => {
    if (onImpactPreview) {
      onImpactPreview();
    } else {
      setIsImpactModalOpen(true);
    }
  };

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

        {/* Explain Buttons */}
        {onExplain && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <button
              type="button"
              onClick={() => onExplain(false)}
              disabled={isRunning}
              aria-label="Explain"
              title="Explain Query Execution Plan (Estimate Cost)"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: isRunning ? '#f3f4f6' : '#ffffff',
                color: isRunning ? '#9ca3af' : '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                padding: '5px 8px',
                fontWeight: 500,
                cursor: isRunning ? 'not-allowed' : 'pointer',
              }}
            >
              <Activity size={13} className="text-blue-500" />
              <span>Explain</span>
            </button>

            <button
              type="button"
              onClick={() => onExplain(true)}
              disabled={isRunning}
              aria-label="Explain Analyze"
              title="Explain Analyze (Run and measure actual execution)"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: isRunning ? '#f3f4f6' : '#ffffff',
                color: isRunning ? '#9ca3af' : '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                padding: '5px 8px',
                fontWeight: 500,
                cursor: isRunning ? 'not-allowed' : 'pointer',
              }}
            >
              <Zap size={13} className="text-amber-500" />
              <span>Analyze</span>
            </button>
          </div>
        )}

        {/* Impact Preview Button */}
        <button
          type="button"
          onClick={handleImpactPreviewClick}
          disabled={isRunning}
          aria-label="Impact Preview"
          title="Simulate query impact and affected rows without committing"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            backgroundColor: isRunning ? '#f3f4f6' : '#ffffff',
            color: isRunning ? '#9ca3af' : '#2563eb',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            padding: '5px 8px',
            fontWeight: 500,
            cursor: isRunning ? 'not-allowed' : 'pointer',
          }}
        >
          <Eye size={13} className="text-blue-500" />
          <span>Impact Preview</span>
        </button>

        {/* Format SQL Button */}
        {onFormat && (
          <button
            type="button"
            data-testid="format-sql-btn"
            onClick={onFormat}
            disabled={isRunning}
            aria-label="Format SQL"
            title={isMac ? 'Format SQL (⌘⇧F)' : 'Format SQL (Ctrl+Shift+F)'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: isRunning ? '#f3f4f6' : '#ffffff',
              color: isRunning ? '#9ca3af' : '#7c3aed',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              padding: '5px 8px',
              fontWeight: 500,
              cursor: isRunning ? 'not-allowed' : 'pointer',
            }}
          >
            <AlignLeft size={13} className="text-purple-600" />
            <span>Format</span>
          </button>
        )}

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

        {/* Isolation Level Selector */}
        {onChangeIsolationLevel && (
          <select
            value={isolationLevel}
            onChange={(e) => onChangeIsolationLevel(e.target.value as IsolationLevel)}
            disabled={isRunning}
            aria-label="Isolation Level"
            title="Transaction Isolation Level"
            style={{
              padding: '4px 6px',
              fontSize: '11px',
              fontWeight: 500,
              borderRadius: '4px',
              border: '1px solid #d1d5db',
              backgroundColor: '#ffffff',
              color: '#374151',
              cursor: isRunning ? 'not-allowed' : 'pointer',
            }}
          >
            <option value="READ COMMITTED">Read Committed</option>
            <option value="REPEATABLE READ">Repeatable Read</option>
            <option value="SERIALIZABLE">Serializable</option>
            <option value="READ UNCOMMITTED">Read Uncommitted</option>
          </select>
        )}

        {/* Savepoint Button */}
        {onOpenSavepoints && (
          <button
            type="button"
            onClick={onOpenSavepoints}
            aria-label="Savepoints"
            title="Manage Transaction Savepoints"
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
            <Flag size={13} className="text-blue-500" />
            <span>Savepoint</span>
          </button>
        )}

        {/* Locks Button */}
        {onOpenLocks && (
          <button
            type="button"
            onClick={onOpenLocks}
            aria-label="Locks"
            title="Inspect Active Locks & Concurrency"
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
            <Lock size={13} className="text-amber-500" />
            <span>Locks</span>
          </button>
        )}

        {/* Separator */}
        <div style={{ width: '1px', height: '18px', backgroundColor: '#d1d5db', margin: '0 4px' }} />

        {/* Performance Metrics Button */}
        {onOpenMetrics && (
          <button
            type="button"
            onClick={onOpenMetrics}
            aria-label="Metrics"
            title="Database Buffer Cache & Performance Metrics"
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
            <Cpu size={13} className="text-indigo-500" />
            <span>Metrics</span>
          </button>
        )}

        {/* Audit Log Button */}
        {onOpenAuditLog && (
          <button
            type="button"
            onClick={onOpenAuditLog}
            aria-label="Audit Log"
            title="Security & Query Audit Log"
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
            <ShieldCheck size={13} className="text-emerald-500" />
            <span>Audit Log</span>
          </button>
        )}

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

        {/* Separator */}
        {onChangeSafeLimit && (
          <div style={{ width: '1px', height: '18px', backgroundColor: '#d1d5db', margin: '0 4px' }} />
        )}

        {/* Safe Limit Dropdown */}
        {onChangeSafeLimit && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontSize: '11px', color: '#6b7280', userSelect: 'none' }}>Limit:</span>
            <select
              aria-label="Safe Limit"
              value={String(safeLimit)}
              onChange={(e) => {
                const val = e.target.value;
                onChangeSafeLimit(val === 'none' ? 'none' : (Number(val) as SafeLimitOption));
              }}
              style={{
                fontSize: '11px',
                padding: '3px 6px',
                borderRadius: '4px',
                border: '1px solid #d1d5db',
                backgroundColor: '#ffffff',
                color: '#374151',
                cursor: 'pointer',
              }}
            >
              <option value="1000">1,000 (Safe Default)</option>
              <option value="5000">5,000</option>
              <option value="10000">10,000</option>
              <option value="none">No Limit</option>
            </select>
          </div>
        )}

        {/* Split Layout Toggle Button */}
        {onToggleSplit && (
          <button
            type="button"
            data-testid="toggle-split-btn"
            onClick={onToggleSplit}
            aria-label="Toggle Split Direction"
            title={`Switch to ${splitDirection === 'vertical' ? 'Horizontal (Left/Right)' : 'Vertical (Top/Bottom)'} Split`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: '#ffffff',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              padding: '4px 8px',
              fontWeight: 500,
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            {splitDirection === 'vertical' ? (
              <Columns2 size={13} className="text-blue-600" />
            ) : (
              <Rows2 size={13} className="text-blue-600" />
            )}
            <span>{splitDirection === 'vertical' ? 'Horizontal' : 'Vertical'}</span>
          </button>
        )}
      </div>

      {/* Right status indicators */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#6b7280', fontSize: '12px' }}>
        {isLimitedActive && rowCount != null && (
          <div
            data-testid="safe-limit-badge"
            title="Query results were automatically capped by Safe Limit Guard"
            style={{
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: '#fef3c7',
              color: '#b45309',
              fontSize: '11px',
              fontWeight: 500,
            }}
          >
            Safe Limit (1,000) Active
          </div>
        )}
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
          <div
            data-testid="toolbar-error-message"
            style={{
              color: '#ef4444',
              fontWeight: 500,
              maxWidth: '400px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={errorMessage}
          >
            Error: {errorMessage}
          </div>
        )}
      </div>

      <ImpactPreviewModal
        isOpen={isImpactModalOpen}
        onClose={() => setIsImpactModalOpen(false)}
        onConfirm={onRun}
        connectionId={connectionId}
        sql={sql}
      />
    </div>
  );
};
