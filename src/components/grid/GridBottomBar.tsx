import React from 'react';
import {
  Plus,
  Minus,
  Check,
  X,
  RefreshCw,
  Square,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  LayoutGrid,
  FileText,
  Zap,
  Edit3,
  Lock,
} from 'lucide-react';

export interface GridBottomBarProps {
  isReadOnly?: boolean;
  // Row Operations
  onAddRow?: () => void;
  onDeleteRow?: () => void;
  canDelete?: boolean;

  // Auto-Commit vs Staging Mode
  isAutoCommit?: boolean;
  onToggleAutoCommit?: () => void;

  // Pending Changes
  hasPendingChanges?: boolean;
  pendingCount?: number;
  onCommit?: () => void;
  onDiscard?: () => void;
  isCommitting?: boolean;

  // Refresh & Stop
  onRefresh?: () => void;
  onStop?: () => void;
  isLoading?: boolean;

  // Pagination
  page?: number;
  pageSize?: number;
  totalRows?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;

  // View Mode
  viewMode?: 'grid' | 'form';
  onViewModeChange?: (mode: 'grid' | 'form') => void;
}

export const GridBottomBar: React.FC<GridBottomBarProps> = ({
  isReadOnly = false,
  onAddRow,
  onDeleteRow,
  canDelete = false,
  isAutoCommit = true,
  onToggleAutoCommit,
  hasPendingChanges = false,
  pendingCount = 0,
  onCommit,
  onDiscard,
  isCommitting = false,
  onRefresh,
  onStop,
  isLoading = false,
  page = 1,
  pageSize = 100,
  totalRows = 0,
  onPageChange,
  onPageSizeChange,
  viewMode = 'grid',
  onViewModeChange,
}) => {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  return (
    <div
      data-testid="grid-bottom-bar"
      className="h-[28px] bg-panel border-t border-line text-xs flex items-center justify-between px-2 select-none flex-shrink-0"
    >
      {/* Left: Row actions, commit/discard, and refresh */}
      <div className="flex items-center gap-1">
        {isReadOnly && (
          <span
            data-testid="grid-readonly-badge"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-500/15 text-amber-500 border border-amber-500/30 mr-1"
            title="Read-Only Mode: Data modifications are disabled"
          >
            <Lock size={11} />
            <span>Read-Only</span>
          </span>
        )}
        {onAddRow && (
          <button
            type="button"
            onClick={onAddRow}
            disabled={isLoading}
            aria-label="Add Row"
            title="Add new row"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-text hover:bg-black/5 dark:hover:bg-white/10 active:bg-black/10 disabled:opacity-40 transition-colors"
          >
            <Plus size={13} className="text-emerald-500" />
            <span className="text-[11px] font-medium hidden sm:inline">Add Row</span>
          </button>
        )}

        {onDeleteRow && (
          <button
            type="button"
            onClick={onDeleteRow}
            disabled={!canDelete || isLoading}
            aria-label="Delete selected row"
            title="Delete selected row(s)"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-danger hover:bg-danger/10 disabled:opacity-40 transition-colors"
          >
            <Minus size={13} />
            <span className="text-[11px] font-medium hidden sm:inline">Delete</span>
          </button>
        )}

        {/* Commit / Discard Stage */}
        <div className="h-3.5 w-px bg-line mx-1" />

        {onToggleAutoCommit && (
          <button
            type="button"
            onClick={onToggleAutoCommit}
            aria-label="Toggle Auto-Commit Mode"
            title={
              isAutoCommit
                ? 'Auto-commit is ON (Changes save directly). Click to switch to Staging Mode.'
                : 'Staging Mode (Manual Commit). Click to switch to Auto-Commit.'
            }
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
              isAutoCommit
                ? 'text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10'
                : 'bg-amber-500/15 text-amber-500 border border-amber-500/30 hover:bg-amber-500/25'
            }`}
          >
            {isAutoCommit ? (
              <>
                <Zap size={11} className="text-amber-500" />
                <span className="hidden sm:inline">Auto-Commit: On</span>
                <span className="sm:hidden">Auto</span>
              </>
            ) : (
              <>
                <Edit3 size={11} className="text-amber-500" />
                <span className="hidden sm:inline">Staging Mode</span>
                <span className="sm:hidden">Stage</span>
              </>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={onCommit}
          disabled={!hasPendingChanges || isCommitting || isLoading}
          aria-label="Commit Changes"
          title={hasPendingChanges ? `Commit ${pendingCount} pending change(s)` : 'No pending changes'}
          className="flex items-center gap-1 px-2 py-0.5 rounded font-medium text-[11px] bg-accent/15 text-accent border border-accent/30 hover:bg-accent hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all"
        >
          <Check size={12} strokeWidth={2.5} />
          <span>Commit {pendingCount > 0 && `(${pendingCount})`}</span>
        </button>

        <button
          type="button"
          onClick={onDiscard}
          disabled={!hasPendingChanges || isCommitting || isLoading}
          aria-label="Discard Changes"
          title="Discard all pending changes"
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-muted hover:text-danger hover:bg-danger/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <X size={12} />
          <span className="hidden sm:inline">Discard</span>
        </button>

        <div className="h-3.5 w-px bg-line mx-1" />

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            aria-label="Refresh Data"
            title="Reload data from database"
            className="p-1 rounded text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40 transition-colors"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
          </button>
        )}

        {isLoading && onStop && (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop Loading"
            title="Cancel query execution"
            className="p-1 rounded text-danger hover:bg-danger/10 transition-colors"
          >
            <Square size={12} fill="currentColor" />
          </button>
        )}
      </div>

      {/* Center: Pagination controls */}
      <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted">
        <button
          type="button"
          onClick={() => onPageChange?.(1)}
          disabled={page <= 1 || isLoading}
          aria-label="First page"
          title="First page"
          className="p-1 rounded hover:text-text hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
        >
          <ChevronsLeft size={13} />
        </button>

        <button
          type="button"
          onClick={() => onPageChange?.(page - 1)}
          disabled={page <= 1 || isLoading}
          aria-label="Previous page"
          title="Previous page"
          className="p-1 rounded hover:text-text hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
        >
          <ChevronLeft size={13} />
        </button>

        <span className="px-1 text-text select-text">
          Page {page} of {totalPages}
        </span>

        <button
          type="button"
          onClick={() => onPageChange?.(page + 1)}
          disabled={page >= totalPages || isLoading}
          aria-label="Next page"
          title="Next page"
          className="p-1 rounded hover:text-text hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
        >
          <ChevronRight size={13} />
        </button>

        <button
          type="button"
          onClick={() => onPageChange?.(totalPages)}
          disabled={page >= totalPages || isLoading}
          aria-label="Last page"
          title="Last page"
          className="p-1 rounded hover:text-text hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
        >
          <ChevronsRight size={13} />
        </button>

        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label="Rows per page"
            title="Rows per page"
            className="ml-1 bg-transparent border border-line rounded px-1 py-0.5 text-[10px] text-text focus:outline-none"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
          </select>
        )}
      </div>

      {/* Right: Record count & View Mode toggles */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted hidden md:inline">
          {totalRows.toLocaleString()} rows
        </span>

        {onViewModeChange && (
          <div className="flex items-center border border-line rounded overflow-hidden">
            <button
              type="button"
              onClick={() => onViewModeChange('grid')}
              aria-label="Grid View"
              title="Grid Table View"
              className={`p-1 transition-colors ${
                viewMode === 'grid'
                  ? 'bg-accent/20 text-accent font-semibold'
                  : 'text-muted hover:text-text'
              }`}
            >
              <LayoutGrid size={12} />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('form')}
              aria-label="Form View"
              title="Form Record View"
              className={`p-1 transition-colors ${
                viewMode === 'form'
                  ? 'bg-accent/20 text-accent font-semibold'
                  : 'text-muted hover:text-text'
              }`}
            >
              <FileText size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default GridBottomBar;
