import React, { useState, useEffect } from 'react';
import { Network, ExternalLink, X, Loader2 } from 'lucide-react';

export interface ForeignKeyPeekPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  targetTable: string;
  targetColumn: string;
  value: unknown;
  position?: { x: number; y: number };
  onNavigate?: (targetTable: string, targetColumn: string, value: unknown) => void;
  onPeek?: (targetTable: string, targetColumn: string, value: unknown) => Promise<Record<string, unknown> | null>;
}

export const ForeignKeyPeekPopover: React.FC<ForeignKeyPeekPopoverProps> = ({
  isOpen,
  onClose,
  targetTable,
  targetColumn,
  value,
  position = { x: 100, y: 100 },
  onNavigate,
  onPeek,
}) => {
  const [peekData, setPeekData] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !onPeek) return;

    let isMounted = true;
    setIsLoading(true);

    onPeek(targetTable, targetColumn, value)
      .then((res) => {
        if (isMounted) setPeekData(res);
      })
      .catch((err) => {
        console.error('Failed to peek foreign key record', err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, onPeek, targetTable, targetColumn, value]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="fk-peek-popover"
      style={{
        position: 'fixed',
        left: `${Math.min(position.x, window.innerWidth - 340)}px`,
        top: `${Math.min(position.y, window.innerHeight - 260)}px`,
        width: '320px',
        backgroundColor: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '8px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
        zIndex: 1100,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        color: '#f8fafc',
        fontSize: '12px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid #334155',
          backgroundColor: '#0f172a',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8', fontWeight: 600 }}>
          <Network size={14} />
          <span>Foreign Key Reference</span>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '2px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <X size={15} />
        </button>
      </div>

      {/* Target Info */}
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ color: '#94a3b8', fontSize: '11px' }}>Target:</span>
          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#93c5fd' }}>
            <span>{targetTable}</span>.<span>{targetColumn}</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ color: '#94a3b8', fontSize: '11px' }}>Current Value:</span>
          <span
            style={{
              fontFamily: 'monospace',
              padding: '2px 6px',
              backgroundColor: '#0f172a',
              borderRadius: '4px',
              border: '1px solid #334155',
              color: '#34d399',
            }}
          >
            {String(value ?? 'NULL')}
          </span>
        </div>

        {/* Peek Preview Data if present */}
        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', padding: '8px 0' }}>
            <Loader2 size={13} className="animate-spin" />
            <span>Loading preview...</span>
          </div>
        )}

        {peekData && !isLoading && (
          <div
            data-testid="fk-peek-data"
            style={{
              padding: '8px',
              backgroundColor: '#0f172a',
              borderRadius: '4px',
              border: '1px solid #334155',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              maxHeight: '120px',
              overflowY: 'auto',
            }}
          >
            {Object.entries(peekData).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '11px' }}>
                <span style={{ color: '#94a3b8' }}>{k}:</span>
                <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{String(v ?? 'NULL')}</span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        {onNavigate && (
          <button
            type="button"
            onClick={() => {
              onNavigate(targetTable, targetColumn, value);
              onClose();
            }}
            style={{
              marginTop: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '6px 12px',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            <ExternalLink size={13} />
            <span>Jump to Record</span>
          </button>
        )}
      </div>
    </div>
  );
};
