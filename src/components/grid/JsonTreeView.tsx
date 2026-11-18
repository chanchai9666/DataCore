import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

export interface JsonTreeViewProps {
  data: unknown;
  initialExpanded?: boolean;
}

interface TreeNodeProps {
  nodeKey?: string;
  value: unknown;
  isLast?: boolean;
  depth?: number;
}

const TreeNode: React.FC<TreeNodeProps> = ({ nodeKey, value, depth = 0 }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (value === null) {
    return (
      <div style={{ paddingLeft: `${depth * 16}px`, lineHeight: '1.6', fontFamily: 'monospace', fontSize: '12px' }}>
        {nodeKey !== undefined && <span style={{ color: 'var(--json-key)' }}>"{nodeKey}": </span>}
        <span style={{ color: 'var(--json-null)', fontStyle: 'italic' }}>null</span>
      </div>
    );
  }

  if (typeof value === 'boolean') {
    return (
      <div style={{ paddingLeft: `${depth * 16}px`, lineHeight: '1.6', fontFamily: 'monospace', fontSize: '12px' }}>
        {nodeKey !== undefined && <span style={{ color: 'var(--json-key)' }}>"{nodeKey}": </span>}
        <span style={{ color: 'var(--json-bool)', fontWeight: 600 }}>{value ? 'true' : 'false'}</span>
      </div>
    );
  }

  if (typeof value === 'number') {
    return (
      <div style={{ paddingLeft: `${depth * 16}px`, lineHeight: '1.6', fontFamily: 'monospace', fontSize: '12px' }}>
        {nodeKey !== undefined && <span style={{ color: 'var(--json-key)' }}>"{nodeKey}": </span>}
        <span style={{ color: 'var(--json-number)', fontWeight: 500 }}>{value}</span>
      </div>
    );
  }

  if (typeof value === 'string') {
    return (
      <div style={{ paddingLeft: `${depth * 16}px`, lineHeight: '1.6', fontFamily: 'monospace', fontSize: '12px' }}>
        {nodeKey !== undefined && <span style={{ color: 'var(--json-key)' }}>"{nodeKey}": </span>}
        <span style={{ color: 'var(--json-string)' }}>"{value}"</span>
      </div>
    );
  }

  if (Array.isArray(value)) {
    const isEmpty = value.length === 0;
    return (
      <div style={{ paddingLeft: `${depth * 16}px`, fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.6' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {!isEmpty && (
            <button
              type="button"
              aria-label="toggle-node"
              onClick={() => setIsExpanded(!isExpanded)}
              style={{
                background: 'none',
                border: 'none',
                padding: '0',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          )}
          {nodeKey !== undefined && <span style={{ color: 'var(--json-key)' }}>"{nodeKey}": </span>}
          <span style={{ color: 'var(--text-primary)' }}>[</span>
          {!isExpanded && <span style={{ color: 'var(--text-secondary)' }}> ... {value.length} items </span>}
          {!isExpanded && <span style={{ color: 'var(--text-primary)' }}>]</span>}
        </div>
        {isExpanded && !isEmpty && (
          <div>
            {value.map((item, index) => (
              <TreeNode key={index} value={item} depth={depth + 1} />
            ))}
            <div style={{ paddingLeft: `${depth * 16}px`, color: 'var(--text-primary)' }}>]</div>
          </div>
        )}
      </div>
    );
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    const isEmpty = keys.length === 0;
    return (
      <div style={{ paddingLeft: `${depth * 16}px`, fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.6' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {!isEmpty && (
            <button
              type="button"
              aria-label="toggle-node"
              onClick={() => setIsExpanded(!isExpanded)}
              style={{
                background: 'none',
                border: 'none',
                padding: '0',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          )}
          {nodeKey !== undefined && <span style={{ color: 'var(--json-key)' }}>"{nodeKey}": </span>}
          <span style={{ color: 'var(--text-primary)' }}>{'{'}</span>
          {!isExpanded && <span style={{ color: 'var(--text-secondary)' }}> ... {keys.length} keys </span>}
          {!isExpanded && <span style={{ color: 'var(--text-primary)' }}>{'}'}</span>}
        </div>
        {isExpanded && !isEmpty && (
          <div>
            {keys.map((k) => (
              <TreeNode
                key={k}
                nodeKey={k}
                value={(value as Record<string, unknown>)[k]}
                depth={depth + 1}
              />
            ))}
            <div style={{ paddingLeft: `${depth * 16}px`, color: 'var(--text-primary)' }}>{'}'}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ paddingLeft: `${depth * 16}px`, fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-primary)' }}>
      {nodeKey !== undefined && <span>"{nodeKey}": </span>}
      <span>{String(value)}</span>
    </div>
  );
};

export const JsonTreeView: React.FC<JsonTreeViewProps> = ({ data }) => {
  return (
    <div
      data-testid="json-tree-view"
      style={{
        padding: '10px',
        backgroundColor: 'var(--bg-card)',
        borderRadius: '6px',
        border: '1px solid var(--border-color)',
        overflowX: 'auto',
      }}
    >
      <TreeNode value={data} depth={0} />
    </div>
  );
};
