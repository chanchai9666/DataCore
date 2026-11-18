import React, { useState, useEffect, useCallback } from 'react';
import { X, Copy, Check, Code, Edit2, Save, Eye, Clock, Calendar, Image as ImageIcon, Network } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CellValue } from '../../types/db';
import { extractCellValue } from './gridUtils';
import { detectDateTime, detectImage } from './cellDetailHelpers';
import { JsonTreeView } from './JsonTreeView';

export interface CellDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cellInfo: {
    columnName: string;
    dataType: string;
    value: CellValue;
    originalValue?: CellValue;
    isStaged?: boolean;
    rowIndex?: number;
    colIndex?: number;
    foreignKeyInfo?: {
      foreignTable: string;
      foreignColumn: string;
    };
  } | null;
  onSaveValue?: (newValue: unknown) => void;
  onNavigateToForeignKey?: (foreignTable: string, foreignColumn: string, value: unknown) => void;
}

export const CellDetailDrawer: React.FC<CellDetailDrawerProps> = ({
  isOpen,
  onClose,
  cellInfo,
  onSaveValue,
  onNavigateToForeignKey,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'formatted' | 'raw' | 'tree'>('formatted');
  const [isEditing, setIsEditing] = useState(Boolean(onSaveValue));
  const [editValue, setEditValue] = useState('');
  const [isNull, setIsNull] = useState(false);

  useEffect(() => {
    if (!isOpen || !cellInfo) return;

    // Open directly in editable mode when editing is supported
    setIsEditing(Boolean(onSaveValue));
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
  }, [isOpen, cellInfo, onSaveValue]);

  const handleSave = useCallback(() => {
    if (!onSaveValue || !cellInfo) return;
    const { dataType } = cellInfo;
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
    onClose();
  }, [onSaveValue, cellInfo, isNull, editValue, onClose]);

  const handleCancel = () => {
    if (!cellInfo) return;
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
    setIsEditing(false);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (isEditing && onSaveValue) {
          e.preventDefault();
          handleSave();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, isEditing, onSaveValue, handleSave]);

  if (!isOpen || !cellInfo) {
    return null;
  }

  const { columnName, dataType, value, rowIndex } = cellInfo;
  const extracted = extractCellValue(value);

  // Prepare display and copy representations
  let formattedText = extracted.displayString;
  let isJson = false;
  let parsedJsonObject: unknown = null;

  if (extracted.type === 'json' && extracted.rawValue !== null) {
    isJson = true;
    try {
      parsedJsonObject =
        typeof extracted.rawValue === 'string'
          ? JSON.parse(extracted.rawValue)
          : extracted.rawValue;
      formattedText = JSON.stringify(parsedJsonObject, null, 2);
    } catch {
      formattedText = extracted.displayString;
    }
  } else if (typeof extracted.rawValue === 'string') {
    const s = extracted.rawValue.trim();
    if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
      try {
        parsedJsonObject = JSON.parse(s);
        isJson = true;
        formattedText = JSON.stringify(parsedJsonObject, null, 2);
      } catch {
        // Not valid JSON
      }
    }
  }

  const dateTimeInfo = detectDateTime(extracted.rawValue);
  const imageInfo = detectImage(extracted.rawValue);

  const rawText =
    typeof extracted.rawValue === 'object' && extracted.rawValue !== null
      ? JSON.stringify(extracted.rawValue)
      : String(extracted.rawValue ?? 'NULL');

  const textToCopy = isEditing
    ? isNull
      ? 'NULL'
      : editValue
    : viewMode === 'formatted' || viewMode === 'tree'
    ? formattedText
    : rawText;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard', err);
    }
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
        backgroundColor: 'var(--bg-panel)',
        boxShadow: 'var(--drawer-shadow)',
        borderLeft: '1px solid var(--border-color)',
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
          borderBottom: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-toolbar)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3
            id="cell-detail-title"
            style={{
              margin: 0,
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            {t('grid.cellDetails', 'Cell Details')}
          </h3>
          {isEditing && (
            <span
              style={{
                fontSize: '11px',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: 'var(--badge-bg)',
                color: 'var(--badge-text)',
                fontWeight: 500,
              }}
            >
              {t('grid.editing', 'Editing')}
            </span>
          )}
          {rowIndex !== undefined && (
            <span
              style={{
                fontSize: '12px',
                color: 'var(--text-secondary)',
              }}
            >
              {t('grid.rowNumber', { row: rowIndex + 1, defaultValue: `(Row ${rowIndex + 1})` })}
            </span>
          )}
        </div>

        <button
          aria-label="Close"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
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
          backgroundColor: 'var(--bg-sidebar)',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontWeight: 600,
              color: 'var(--text-primary)',
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
              backgroundColor: 'var(--badge-bg)',
              color: 'var(--badge-text)',
              fontWeight: 500,
            }}
          >
            {dataType}
          </span>
          {cellInfo.isStaged && (
            <span
              data-testid="staged-badge"
              style={{
                fontSize: '11px',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: 'rgba(245, 158, 11, 0.16)',
                color: 'var(--warn)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                fontWeight: 600,
              }}
            >
              {t('grid.staged', 'Staged')}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {onSaveValue && (
            <>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                title="Edit mode"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 8px',
                  fontSize: '11px',
                  backgroundColor: isEditing ? 'var(--accent)' : 'var(--btn-bg)',
                  color: isEditing ? '#ffffff' : 'var(--text-primary)',
                  border: isEditing ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: isEditing ? 600 : 400,
                }}
              >
                <Edit2 size={12} />
                {t('grid.edit', 'Edit')}
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                title="View mode"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 8px',
                  fontSize: '11px',
                  backgroundColor: !isEditing ? 'var(--accent)' : 'var(--btn-bg)',
                  color: !isEditing ? '#ffffff' : 'var(--text-primary)',
                  border: !isEditing ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: !isEditing ? 600 : 400,
                }}
              >
                <Eye size={12} />
                {t('grid.view', 'View')}
              </button>
            </>
          )}

          {isJson && !isEditing && (
            <div style={{ display: 'inline-flex', borderRadius: '4px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setViewMode('formatted')}
                data-testid="view-formatted-btn"
                title="Formatted JSON"
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  backgroundColor: viewMode === 'formatted' ? 'var(--accent)' : 'var(--btn-bg)',
                  color: viewMode === 'formatted' ? '#ffffff' : 'var(--text-primary)',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: viewMode === 'formatted' ? 600 : 400,
                }}
              >
                {t('grid.formatted', 'Formatted')}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('tree')}
                data-testid="view-tree-btn"
                title="Interactive Tree View"
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  backgroundColor: viewMode === 'tree' ? 'var(--accent)' : 'var(--btn-bg)',
                  color: viewMode === 'tree' ? '#ffffff' : 'var(--text-primary)',
                  borderLeft: '1px solid var(--border-color)',
                  borderRight: '1px solid var(--border-color)',
                  borderTop: 'none',
                  borderBottom: 'none',
                  cursor: 'pointer',
                  fontWeight: viewMode === 'tree' ? 600 : 400,
                }}
              >
                {t('grid.tree', 'Tree')}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('raw')}
                data-testid="view-raw-btn"
                title="Raw JSON"
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  backgroundColor: viewMode === 'raw' ? 'var(--accent)' : 'var(--btn-bg)',
                  color: viewMode === 'raw' ? '#ffffff' : 'var(--text-primary)',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: viewMode === 'raw' ? 600 : 400,
                }}
              >
                Raw
              </button>
            </div>
          )}

          {isJson && isEditing && (
            <button
              type="button"
              onClick={() => {
                try {
                  const parsed = JSON.parse(editValue);
                  setEditValue(JSON.stringify(parsed, null, 2));
                } catch {
                  // Ignore parse error
                }
              }}
              title="Format JSON"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                fontSize: '11px',
                backgroundColor: 'var(--btn-bg)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              <Code size={12} />
              Format JSON
            </button>
          )}

          <button
            type="button"
            aria-label="Copy"
            onClick={handleCopy}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              fontSize: '11px',
              backgroundColor: copied ? 'var(--success)' : 'var(--btn-bg)',
              color: copied ? '#ffffff' : 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Staged diff banner when cell has uncommitted changes */}
      {cellInfo.isStaged && cellInfo.originalValue !== undefined && (
        <div
          data-testid="staged-diff-banner"
          style={{
            padding: '8px 16px',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            borderBottom: '1px solid rgba(245, 158, 11, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, color: 'var(--warn)' }}>
              Pending Staged Edit (Uncommitted)
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
            <span>Original:</span>
            <code
              style={{
                backgroundColor: 'var(--code-bg)',
                padding: '2px 6px',
                borderRadius: '3px',
                color: 'var(--text-primary)',
                fontFamily: 'monospace',
                fontSize: '11px',
              }}
            >
              {extractCellValue(cellInfo.originalValue).displayString}
            </code>
            <span>→</span>
            <span style={{ color: 'var(--accent)', fontWeight: 500 }}>Staged:</span>
            <code
              style={{
                backgroundColor: 'var(--badge-bg)',
                padding: '2px 6px',
                borderRadius: '3px',
                color: 'var(--badge-text)',
                fontFamily: 'monospace',
                fontSize: '11px',
              }}
            >
              {extracted.displayString}
            </code>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '16px',
          backgroundColor: 'var(--bg-grid)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Foreign Key Banner if present */}
        {cellInfo.foreignKeyInfo && (
          <div
            data-testid="fk-info-banner"
            style={{
              padding: '8px 12px',
              marginBottom: '12px',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--fk-text)' }}>
              <Network size={14} />
              <span>
                Foreign Key → <strong>{cellInfo.foreignKeyInfo.foreignTable}</strong>(
                {cellInfo.foreignKeyInfo.foreignColumn})
              </span>
            </div>
            {onNavigateToForeignKey && (
              <button
                type="button"
                data-testid="fk-navigate-btn"
                onClick={() =>
                  onNavigateToForeignKey(
                    cellInfo.foreignKeyInfo!.foreignTable,
                    cellInfo.foreignKeyInfo!.foreignColumn,
                    extracted.rawValue
                  )
                }
                style={{
                  padding: '2px 8px',
                  fontSize: '11px',
                  backgroundColor: 'var(--accent)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Jump to Record
              </button>
            )}
          </div>
        )}

        {/* Date & Time Intelligence Banner */}
        {dateTimeInfo && !isEditing && (
          <div
            data-testid="datetime-intelligence"
            style={{
              padding: '10px 12px',
              marginBottom: '12px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              fontSize: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent)', fontWeight: 600 }}>
              <Calendar size={13} />
              <span>Date & Time Info</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', color: 'var(--text-primary)', fontSize: '11px' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Local: </span>
                <span style={{ fontFamily: 'monospace' }}>{dateTimeInfo.localFormatted}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>UTC: </span>
                <span style={{ fontFamily: 'monospace' }}>{dateTimeInfo.utcFormatted}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--success)' }}>
                <Clock size={11} />
                <span>{dateTimeInfo.relativeFormatted}</span>
              </div>
            </div>
          </div>
        )}

        {/* Image Preview Box */}
        {imageInfo && !isEditing && (
          <div
            data-testid="image-preview"
            style={{
              padding: '10px',
              marginBottom: '12px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', width: '100%', color: 'var(--accent)', fontSize: '11px', fontWeight: 600 }}>
              <ImageIcon size={13} />
              <span>Image Preview</span>
            </div>
            <img
              src={imageInfo.src}
              alt="Cell thumbnail preview"
              style={{
                maxWidth: '100%',
                maxHeight: '180px',
                objectFit: 'contain',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-grid)',
              }}
            />
          </div>
        )}

        {isEditing ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>
            {cellInfo.isStaged && cellInfo.originalValue !== undefined && (
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Original database value:{' '}
                <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                  {extractCellValue(cellInfo.originalValue).displayString}
                </span>
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-primary)' }}>
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
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSave();
                  }
                }}
                placeholder="Enter value..."
                style={{
                  flex: 1,
                  width: '100%',
                  padding: '10px',
                  backgroundColor: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  lineHeight: '1.5',
                  resize: 'none',
                  outline: 'none',
                }}
              />
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {t('grid.tipSaveShortcut', 'Tip: Press ⌘+Enter to save')}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleCancel}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    backgroundColor: 'var(--btn-bg)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  {t('common.cancel', 'Cancel')}
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
                    backgroundColor: 'var(--success)',
                    color: '#ffffff',
                    fontWeight: 500,
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  <Save size={13} />
                  {t('grid.saveChanges', 'Save Changes')}
                </button>
              </div>
            </div>
          </div>
        ) : extracted.type === 'null' ? (
          <div
            style={{
              display: 'inline-block',
              padding: '4px 8px',
              backgroundColor: 'var(--code-bg)',
              color: 'var(--text-secondary)',
              borderRadius: '4px',
              fontStyle: 'italic',
              fontSize: '13px',
            }}
          >
            NULL
          </div>
        ) : viewMode === 'tree' && parsedJsonObject ? (
          <JsonTreeView data={parsedJsonObject} />
        ) : (
          <pre
            style={{
              margin: 0,
              fontFamily: 'var(--font-mono, "JetBrains Mono", Consolas, monospace)',
              fontSize: '12px',
              lineHeight: 1.6,
              color: 'var(--text-primary)',
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
