import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Code, FileText, Edit2, Save } from 'lucide-react';
import { CellValue } from '../../types/db';
import { extractCellValue } from './gridUtils';

export interface CellDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cellInfo: {
    columnName: string;
    dataType: string;
    value: CellValue;
    rowIndex?: number;
    colIndex?: number;
  } | null;
  onSaveValue?: (newValue: unknown) => void;
}

export const CellDetailDrawer: React.FC<CellDetailDrawerProps> = ({
  isOpen,
  onClose,
  cellInfo,
  onSaveValue,
}) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'formatted' | 'raw'>('formatted');
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [isNull, setIsNull] = useState(false);

  useEffect(() => {
    if (!isOpen || !cellInfo) return;

    setIsEditing(false);
    const extracted = extractCellValue(cellInfo.value);
    if (extracted.type === 'null') {
      setIsNull(true);
      setEditValue('');
    } else {
      setIsNull(false);
      setEditValue(
        typeof extracted.rawValue === 'object' && extracted.rawValue !== null
          ? JSON.stringify(extracted.rawValue, null, 2)
          : String(extracted.rawValue ?? '')
      );
    }
  }, [isOpen, cellInfo]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isEditing) {
          setIsEditing(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, isEditing]);

  if (!isOpen || !cellInfo) {
    return null;
  }

  const { columnName, dataType, value, rowIndex } = cellInfo;
  const extracted = extractCellValue(value);

  // Prepare display and copy representations
  let formattedText = extracted.displayString;
  let isJson = false;

  if (extracted.type === 'json' && extracted.rawValue !== null) {
    isJson = true;
    try {
      const obj =
        typeof extracted.rawValue === 'string'
          ? JSON.parse(extracted.rawValue)
          : extracted.rawValue;
      formattedText = JSON.stringify(obj, null, 2);
    } catch {
      formattedText = extracted.displayString;
    }
  }

  const rawText =
    typeof extracted.rawValue === 'object' && extracted.rawValue !== null
      ? JSON.stringify(extracted.rawValue)
      : String(extracted.rawValue ?? 'NULL');

  const textToCopy = viewMode === 'formatted' ? formattedText : rawText;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard', err);
    }
  };

  const handleSave = () => {
    if (!onSaveValue) return;
    if (isNull) {
      onSaveValue(null);
    } else if (dataType.toLowerCase().includes('int') || dataType.toLowerCase().includes('serial')) {
      const parsed = parseInt(editValue, 10);
      onSaveValue(isNaN(parsed) ? editValue : parsed);
    } else if (
      dataType.toLowerCase().includes('float') ||
      dataType.toLowerCase().includes('numeric') ||
      dataType.toLowerCase().includes('double') ||
      dataType.toLowerCase().includes('decimal')
    ) {
      const parsed = parseFloat(editValue);
      onSaveValue(isNaN(parsed) ? editValue : parsed);
    } else if (dataType.toLowerCase().includes('bool')) {
      onSaveValue(editValue.toLowerCase() === 'true' || editValue === '1');
    } else {
      onSaveValue(editValue);
    }
    setIsEditing(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cell-detail-title"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '440px',
        maxWidth: '100vw',
        backgroundColor: 'var(--bg-primary, #181818)',
        boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.5)',
        borderLeft: '1px solid var(--border-color, #333333)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-color, #333333)',
          backgroundColor: 'var(--bg-secondary, #222222)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3
            id="cell-detail-title"
            style={{
              margin: 0,
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text-primary, #ffffff)',
            }}
          >
            {isEditing ? 'Edit Cell Value' : 'Cell Details'}
          </h3>
          {rowIndex !== undefined && (
            <span
              style={{
                fontSize: '12px',
                color: 'var(--text-secondary, #888888)',
              }}
            >
              (Row {rowIndex + 1})
            </span>
          )}
        </div>

        <button
          aria-label="Close"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary, #aaaaaa)',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Column Meta Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          backgroundColor: 'var(--bg-tertiary, #1f1f1f)',
          borderBottom: '1px solid var(--border-color, #2d2d2d)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontWeight: 600,
              color: 'var(--text-primary, #ffffff)',
              fontSize: '13px',
            }}
          >
            {columnName}
          </span>
          <span
            style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: 'var(--badge-bg, #2b384e)',
              color: 'var(--badge-text, #60a5fa)',
              fontWeight: 500,
            }}
          >
            {dataType}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {onSaveValue && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              title="Edit value"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                fontSize: '11px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              <Edit2 size={12} />
              Edit
            </button>
          )}

          {!isEditing && isJson && (
            <button
              onClick={() =>
                setViewMode(viewMode === 'formatted' ? 'raw' : 'formatted')
              }
              title={`Switch to ${viewMode === 'formatted' ? 'Raw' : 'Formatted'}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                fontSize: '11px',
                backgroundColor: 'var(--btn-bg, #2e2e2e)',
                color: 'var(--text-secondary, #cccccc)',
                border: '1px solid var(--border-color, #444444)',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              {viewMode === 'formatted' ? (
                <>
                  <Code size={12} /> Format
                </>
              ) : (
                <>
                  <FileText size={12} /> Raw
                </>
              )}
            </button>
          )}

          {!isEditing && (
            <button
              aria-label="Copy"
              onClick={handleCopy}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                fontSize: '11px',
                backgroundColor: copied ? '#065f46' : 'var(--btn-bg, #2e2e2e)',
                color: copied ? '#34d399' : 'var(--text-primary, #ffffff)',
                border: '1px solid var(--border-color, #444444)',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
              }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '16px',
          backgroundColor: 'var(--bg-editor, #141414)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {isEditing ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#cbd5e1' }}>
              <input
                type="checkbox"
                checked={isNull}
                onChange={(e) => setIsNull(e.target.checked)}
              />
              Set as NULL
            </label>

            {!isNull && (
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="Enter value..."
                style={{
                  flex: 1,
                  width: '100%',
                  padding: '10px',
                  backgroundColor: '#1e293b',
                  color: '#f8fafc',
                  border: '1px solid #475569',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  lineHeight: '1.5',
                  resize: 'none',
                  outline: 'none',
                }}
              />
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '8px' }}>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  backgroundColor: '#334155',
                  color: '#e2e8f0',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  backgroundColor: '#10b981',
                  color: '#ffffff',
                  fontWeight: 500,
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                <Save size={13} />
                Save Changes
              </button>
            </div>
          </div>
        ) : extracted.type === 'null' ? (
          <div
            style={{
              display: 'inline-block',
              padding: '4px 8px',
              backgroundColor: 'rgba(156, 163, 175, 0.15)',
              color: '#9ca3af',
              borderRadius: '4px',
              fontStyle: 'italic',
              fontSize: '13px',
            }}
          >
            NULL
          </div>
        ) : (
          <pre
            style={{
              margin: 0,
              fontFamily: 'var(--font-mono, "JetBrains Mono", Consolas, monospace)',
              fontSize: '12px',
              lineHeight: 1.6,
              color: 'var(--text-primary, #e2e8f0)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {viewMode === 'formatted' ? formattedText : rawText}
          </pre>
        )}
      </div>
    </div>
  );
};
