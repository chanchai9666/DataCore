import React from 'react';
import { useTranslation } from 'react-i18next';
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
  Eye,
  EyeOff,
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
  isApproximateCount?: boolean;
  onExactCount?: () => void;
  isCountingExact?: boolean;
  paginationMode?: 'offset' | 'keyset';
  canUseKeyset?: boolean;
  onTogglePaginationMode?: () => void;
  hasMoreKeyset?: boolean;

  // View Mode
  viewMode?: 'grid' | 'form';
  onViewModeChange?: (mode: 'grid' | 'form') => void;

  // Sensitive Data Masking (PII Protection)
  isMasked?: boolean;
  onToggleMask?: () => void;

  // Fast Edit Mode (Excel-like inline editing + paste)
  isFastEdit?: boolean;
  onToggleFastEdit?: () => void;
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
  isApproximateCount = false,
  onExactCount,
  isCountingExact = false,
  paginationMode = 'offset',
  canUseKeyset = false,
  onTogglePaginationMode,
  hasMoreKeyset = false,
  viewMode = 'grid',
  onViewModeChange,
  isMasked = false,
  onToggleMask,
  isFastEdit = false,
  onToggleFastEdit,
}) => {
  const { t } = useTranslation();
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
            title={t('grid.readOnlyTitle', 'Read-Only Mode: Data modifications are disabled')}
          >
            <Lock size={11} />
            <span>{t('grid.readOnly', 'Read-Only')}</span>
          </span>
        )}
        {onAddRow && (
          <button
            type="button"
            onClick={onAddRow}
            disabled={isLoading}
            aria-label="Add Row"
            title={t('grid.addRowTitle', 'Add new row')}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-text hover:bg-black/5 dark:hover:bg-white/10 active:bg-black/10 disabled:opacity-40 transition-colors"
          >
            <Plus size={13} className="text-emerald-500" />
            <span className="text-[11px] font-medium hidden sm:inline">{t('grid.addRow', 'Add Row')}</span>
          </button>
        )}

        {onDeleteRow && (
          <button
            type="button"
            onClick={onDeleteRow}
            disabled={!canDelete || isLoading}
            aria-label="Delete selected row"
            title={t('grid.deleteTitle', 'Delete selected row(s)')}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-danger hover:bg-danger/10 disabled:opacity-40 transition-colors"
          >
            <Minus size={13} />
            <span className="text-[11px] font-medium hidden sm:inline">{t('grid.delete', 'Delete')}</span>
          </button>
        )}

        {/* Commit / Discard Stage */}
        <div className="h-3.5 w-px bg-line mx-1" />

        {onToggleFastEdit && !isReadOnly && (
          <button
            type="button"
            data-testid="fast-edit-toggle-btn"
            onClick={onToggleFastEdit}
            aria-label={t('grid.fastEditToggle', 'Toggle Fast Edit Mode')}
            title={
              isFastEdit
                ? t('grid.fastEditOnTitle', 'Fast Edit Mode is ON (Excel-like inline edit & paste, requires Commit)')
                : t('grid.fastEditOffTitle', 'Fast Edit Mode is OFF. Click to enable Excel-like inline edit & paste.')
            }
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
              isFastEdit
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25'
                : 'text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10'
            }`}
          >
            <LayoutGrid size={11} />
            <span className="hidden sm:inline">
              {isFastEdit ? t('grid.fastEditOn', 'Fast Edit: On') : t('grid.fastEditOff', 'Fast Edit')}
            </span>
          </button>
        )}

        {onToggleAutoCommit && (
          <button
            type="button"
            onClick={onToggleAutoCommit}
            disabled={isFastEdit}
            aria-label="Toggle Auto-Commit Mode"
            title={
              isFastEdit
                ? t('grid.autoCommitLockedByFastEdit', 'Auto-Commit is disabled while Fast Edit Mode is active (manual Commit required).')
                : isAutoCommit
                ? 'Auto-commit is ON (Changes save directly). Click to switch to Staging Mode.'
                : 'Staging Mode (Manual Commit). Click to switch to Auto-Commit.'
            }
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              isAutoCommit
                ? 'text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10'
                : 'bg-amber-500/15 text-amber-500 border border-amber-500/30 hover:bg-amber-500/25'
            }`}
          >
            {isAutoCommit ? (
              <>
                <Zap size={11} className="text-amber-500" />
                <span className="hidden sm:inline">{t('grid.autoCommitOn', 'Auto-Commit: On')}</span>
                <span className="sm:hidden">{t('grid.auto', 'Auto')}</span>
              </>
            ) : (
              <>
                <Edit3 size={11} className="text-amber-500" />
                <span className="hidden sm:inline">{t('grid.stagingMode', 'Staging Mode')}</span>
                <span className="sm:hidden">{t('grid.stage', 'Stage')}</span>
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
          <span>{t('grid.commit', 'Commit')} {pendingCount > 0 && `(${pendingCount})`}</span>
        </button>

        <button
          type="button"
          onClick={onDiscard}
          disabled={!hasPendingChanges || isCommitting || isLoading}
          aria-label="Discard Changes"
          title={t('grid.discardTitle', 'Discard all pending changes')}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-muted hover:text-danger hover:bg-danger/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <X size={12} />
          <span className="hidden sm:inline">{t('grid.discard', 'Discard')}</span>
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
          {paginationMode === 'keyset'
            ? t('grid.pageKeyset', { page, defaultValue: `Page ${page} (Keyset)` })
            : t('grid.pageOfTotal', { page, total: totalPages, defaultValue: `Page ${page} of ${totalPages}` })}
        </span>

        <button
          type="button"
          onClick={() => onPageChange?.(page + 1)}
          disabled={(paginationMode === 'keyset' ? !hasMoreKeyset : page >= totalPages) || isLoading}
          aria-label="Next page"
          title="Next page"
          className="p-1 rounded hover:text-text hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
        >
          <ChevronRight size={13} />
        </button>

        <button
          type="button"
          onClick={() => onPageChange?.(totalPages)}
          disabled={paginationMode === 'keyset' || page >= totalPages || isLoading}
          aria-label="Last page"
          title="Last page"
          className="p-1 rounded hover:text-text hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
        >
          <ChevronsRight size={13} />
        </button>

        {canUseKeyset && onTogglePaginationMode && (
          <button
            type="button"
            data-testid="keyset-mode-toggle"
            onClick={onTogglePaginationMode}
            disabled={isLoading}
            title={
              paginationMode === 'keyset'
                ? 'Using fast Keyset (cursor) pagination. Click to switch to Offset pagination.'
                : 'Using Offset pagination. Click to switch to fast Keyset pagination.'
            }
            className={`ml-1 px-1.5 py-0.5 rounded text-[10px] border transition-colors ${
              paginationMode === 'keyset'
                ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30 font-medium'
                : 'border-line text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10'
            }`}
          >
            {paginationMode === 'keyset' ? 'Keyset' : 'Offset'}
          </button>
        )}

        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label="Rows per page"
            title="Rows per page"
            className="ml-1 h-[22px] min-h-[22px] bg-transparent border border-line rounded px-1 text-[10px] text-text focus:outline-none"
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
        <span data-testid="grid-row-count" className="text-[11px] text-muted hidden md:inline">
          {isApproximateCount
            ? t('editor.approximateRows', {
                count: totalRows.toLocaleString(),
                defaultValue: `~${totalRows.toLocaleString()} rows (approx.)`,
              })
            : t('grid.rowsCount', { count: totalRows.toLocaleString(), defaultValue: `${totalRows.toLocaleString()} rows` })}
        </span>
        {isApproximateCount && onExactCount && (
          <button
            type="button"
            data-testid="exact-count-btn"
            onClick={onExactCount}
            disabled={isCountingExact || isLoading}
            className="px-1.5 py-0.5 rounded text-[10px] border border-line text-accent hover:bg-accent/10 disabled:opacity-40 transition-colors"
            title={t('grid.exactTitle', 'Count exact number of rows (SELECT COUNT(*))')}
          >
            {isCountingExact ? t('grid.counting', 'Counting...') : t('grid.exact', 'Exact')}
          </button>
        )}

        {onToggleMask && (
          <button
            type="button"
            onClick={onToggleMask}
            aria-label={isMasked ? 'Reveal sensitive data' : 'Mask sensitive data'}
            title={
              isMasked
                ? 'Sensitive data masked (Click to reveal)'
                : 'Sensitive data visible (Click to mask PII)'
            }
            data-testid="grid-mask-toggle"
            className={`px-1.5 py-0.5 rounded flex items-center gap-1 border transition-colors text-[11px] ${
              isMasked
                ? 'bg-amber-500/10 text-amber-500 border-amber-500/30 font-medium'
                : 'border-line text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10'
            }`}
          >
            {isMasked ? <EyeOff size={12} /> : <Eye size={12} />}
            <span className="hidden sm:inline">{isMasked ? 'Masked' : 'Unmasked'}</span>
          </button>
        )}

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
