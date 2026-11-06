import React from 'react';
import { ChevronLeft, ChevronRight, RotateCw } from 'lucide-react';

export interface PaginationBarProps {
  page: number;
  pageSize: number;
  totalRows: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export const PaginationBar: React.FC<PaginationBarProps> = ({
  page,
  pageSize,
  totalRows,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  isLoading = false,
}) => {
  const totalPages = Math.max(1, Math.ceil(totalRows / Math.max(1, pageSize)));
  const canPrev = page > 1 && !isLoading;
  const canNext = page < totalPages && !isLoading;

  const startRow = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRow = Math.min(page * pageSize, totalRows);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 12px',
        backgroundColor: 'var(--bg-secondary, #1e1e1e)',
        borderTop: '1px solid var(--border-color, #333333)',
        fontSize: '13px',
        color: 'var(--text-secondary, #cccccc)',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span>
          {totalRows > 0 ? `${startRow}-${endRow} of ` : ''}
          <strong style={{ color: 'var(--text-primary, #ffffff)' }}>
            {totalRows} rows
          </strong>
        </span>

        {onPageSizeChange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Rows per page:</span>
            <select
              aria-label="Rows per page"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              disabled={isLoading}
              style={{
                backgroundColor: 'var(--bg-input, #2a2a2a)',
                color: 'var(--text-primary, #ffffff)',
                border: '1px solid var(--border-color, #444444)',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>
          Page {page} of {totalPages}
        </span>

        <button
          aria-label="Previous page"
          title="Previous page"
          onClick={() => canPrev && onPageChange(page - 1)}
          disabled={!canPrev}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px 8px',
            backgroundColor: canPrev ? 'var(--btn-bg, #333333)' : 'transparent',
            color: canPrev ? 'var(--text-primary, #ffffff)' : 'var(--text-disabled, #666666)',
            border: '1px solid var(--border-color, #444444)',
            borderRadius: '4px',
            cursor: canPrev ? 'pointer' : 'not-allowed',
            opacity: canPrev ? 1 : 0.5,
          }}
        >
          <ChevronLeft size={16} />
        </button>

        <button
          aria-label="Next page"
          title="Next page"
          onClick={() => canNext && onPageChange(page + 1)}
          disabled={!canNext}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px 8px',
            backgroundColor: canNext ? 'var(--btn-bg, #333333)' : 'transparent',
            color: canNext ? 'var(--text-primary, #ffffff)' : 'var(--text-disabled, #666666)',
            border: '1px solid var(--border-color, #444444)',
            borderRadius: '4px',
            cursor: canNext ? 'pointer' : 'not-allowed',
            opacity: canNext ? 1 : 0.5,
          }}
        >
          <ChevronRight size={16} />
        </button>

        {onRefresh && (
          <button
            aria-label="Refresh"
            title="Refresh"
            onClick={onRefresh}
            disabled={isLoading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px 8px',
              backgroundColor: 'var(--btn-bg, #333333)',
              color: 'var(--text-primary, #ffffff)',
              border: '1px solid var(--border-color, #444444)',
              borderRadius: '4px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              marginLeft: '4px',
            }}
          >
            <RotateCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>
    </div>
  );
};
