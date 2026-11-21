import React, { useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bookmark,
  Search,
  Play,
  ExternalLink,
  Pencil,
  Trash2,
  Pin,
  Download,
  Upload,
  Plus,
  Database,
  Server,
  Globe,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSnippetStore } from '../../stores/snippetStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { openQueryTab } from '../sidebar/tabHelpers';
import { SaveQueryModal } from '../editor/SaveQueryModal';
import { showConfirmDialog } from '../../utils/dialog';
import type { AppTheme } from '../../types/theme';
import type { SavedQueryScope, SqlSnippet } from '../../types/queryHistory';

export interface SavedQueriesTabProps {
  connectionId?: string;
  theme?: AppTheme;
}

export const SavedQueriesTab: React.FC<SavedQueriesTabProps> = ({
  connectionId: propConnectionId,
  theme: propTheme,
}) => {
  const { t } = useTranslation();
  const snippets = useSnippetStore((s) => s.snippets);
  const togglePin = useSnippetStore((s) => s.togglePin);
  const deleteSnippet = useSnippetStore((s) => s.deleteSnippet);
  const recordRun = useSnippetStore((s) => s.recordRun);
  const exportQueriesJson = useSnippetStore((s) => s.exportQueriesJson);
  const importQueriesJson = useSnippetStore((s) => s.importQueriesJson);

  const connections = useConnectionStore((s) => s.connections);
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const connectedConnectionIds = useConnectionStore((s) => s.connectedConnectionIds);

  const currentConnectionId = propConnectionId || activeConnectionId || connectedConnectionIds[0] || '';
  const currentConnection = connections.find((c) => c.id === currentConnectionId);

  const [searchQuery, setSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'current' | 'pinned' | SavedQueryScope>('all');
  const [connectionFilter, setConnectionFilter] = useState<string>('all');
  const [editingQuery, setEditingQuery] = useState<SqlSnippet | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDark = propTheme === 'dark';

  const filteredQueries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...snippets]
      .filter((item) => {
        const itemScope = item.scope || 'global';
        if (scopeFilter === 'pinned' && !item.isPinned) return false;
        if (scopeFilter === 'current') {
          if (itemScope === 'global') return false;
          if (currentConnectionId && item.connectionId && item.connectionId !== currentConnectionId) {
            return false;
          }
          if (!currentConnectionId) return false;
        } else if (
          (scopeFilter === 'database' || scopeFilter === 'connection' || scopeFilter === 'global') &&
          itemScope !== scopeFilter
        ) {
          return false;
        }

        if (connectionFilter !== 'all' && item.connectionId !== connectionFilter) {
          return false;
        }

        if (!q) return true;
        return (
          item.title.toLowerCase().includes(q) ||
          (item.description && item.description.toLowerCase().includes(q)) ||
          item.sql.toLowerCase().includes(q) ||
          (item.database && item.database.toLowerCase().includes(q)) ||
          (item.connectionName && item.connectionName.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        const pinDiff = Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned));
        if (pinDiff !== 0) return pinDiff;
        const runDiff = (b.runCount ?? 0) - (a.runCount ?? 0);
        if (runDiff !== 0) return runDiff;
        return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
      });
  }, [snippets, searchQuery, scopeFilter, connectionFilter, currentConnectionId]);

  const resolveTargetConnection = (query: SqlSnippet) => {
    if (query.connectionId) {
      const matched = connections.find((c) => c.id === query.connectionId);
      if (matched) return matched;
    }
    if (query.connectionName) {
      const byName = connections.find(
        (c) => c.name.toLowerCase() === query.connectionName!.toLowerCase()
      );
      if (byName) return byName;
    }
    return currentConnection || connections[0];
  };

  const handleOpenQuery = (query: SqlSnippet, autoRun = false) => {
    const targetConn = resolveTargetConnection(query);
    if (!targetConn) {
      toast.error(t('toolbar.selectConnectionFirst', 'Select a connection first'));
      return;
    }
    if (autoRun) {
      recordRun(query.id);
    }
    openQueryTab({
      connectionId: targetConn.id,
      connectionName: targetConn.name,
      driver: targetConn.driver,
      initialQuery: query.sql,
      savedQueryId: query.id,
      tabTitle: query.title,
      autoRun,
    });
  };

  const handleDelete = async (query: SqlSnippet) => {
    const confirmed = await showConfirmDialog(
      t('savedQueries.confirmDelete', 'Are you sure you want to delete saved query "{{title}}"?', {
        title: query.title,
      }),
      {
        title: t('savedQueries.deleteTitle', 'Delete Saved Query'),
        kind: 'warning',
      }
    );
    if (confirmed) {
      deleteSnippet(query.id);
      toast.success(
        t('savedQueries.deletedToast', 'Deleted saved query "{{title}}"', {
          title: query.title,
        })
      );
    }
  };

  const handleExportJson = () => {
    const ids = filteredQueries.length < snippets.length ? filteredQueries.map((q) => q.id) : undefined;
    const json = exportQueriesJson(ids);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `datacore-saved-queries-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(
      t('savedQueries.exportedToast', 'Exported {{count}} saved queries to JSON', {
        count: ids ? ids.length : snippets.length,
      })
    );
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = importQueriesJson(text, 'merge');
      toast.success(
        t('savedQueries.importedToast', 'Imported {{count}} saved queries', {
          count: result.importedCount,
        })
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(
        t('savedQueries.importFailedToast', 'Failed to import saved queries: {{error}}', {
          error: msg,
        })
      );
    } finally {
      e.target.value = '';
    }
  };

  const renderScopeBadge = (query: SqlSnippet) => {
    const scope = query.scope || 'global';
    if (scope === 'database') {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <Database className="w-2.5 h-2.5" />
          <span>{query.connectionName || query.connectionId || 'DB'} • {query.database || 'default'}</span>
        </span>
      );
    }
    if (scope === 'connection') {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/15 text-blue-600 dark:text-blue-400">
          <Server className="w-2.5 h-2.5" />
          <span>{query.connectionName || query.connectionId || 'Connection'}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/15 text-purple-600 dark:text-purple-400">
        <Globe className="w-2.5 h-2.5" />
        <span>{t('savedQueries.scopeGlobalShort', 'Global')}</span>
      </span>
    );
  };

  return (
    <div
      data-testid="saved-queries-tab"
      className={`flex flex-col h-full font-sans select-none ${
        isDark ? 'bg-[#1e1e1e] text-[#cccccc]' : 'bg-panel text-text'
      }`}
    >
      {/* Top Header & Actions */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2.5 border-b border-line bg-sidebar gap-3">
        <div className="flex items-center gap-2">
          <Bookmark className="w-4 h-4 text-blue-500" />
          <span className="font-semibold text-xs text-text">
            {t('savedQueries.hubTitle', 'Saved Queries')}
          </span>
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-muted font-medium">
            {filteredQueries.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              data-testid="saved-queries-search"
              placeholder={t('savedQueries.searchPlaceholder', 'Search saved queries...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs pl-8 pr-3 py-1 rounded border border-line bg-grid text-text placeholder-muted focus:outline-none focus:border-blue-500 w-56"
            />
          </div>

          {connections.length > 0 && (
            <select
              aria-label={t('savedQueries.filterByConnection', 'Filter by connection')}
              value={connectionFilter}
              onChange={(e) => setConnectionFilter(e.target.value)}
              className="text-xs px-2 py-1 rounded border border-line bg-grid text-text focus:outline-none focus:border-blue-500"
            >
              <option value="all">{t('savedQueries.allConnections', 'All Connections')}</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.database || c.driver})
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            data-testid="saved-queries-new-btn"
            onClick={() => setIsNewModalOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('savedQueries.newQueryBtn', 'New Saved Query')}</span>
          </button>

          <button
            type="button"
            data-testid="saved-queries-export-btn"
            onClick={handleExportJson}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-line bg-panel hover:bg-black/5 dark:hover:bg-white/10 text-xs text-text transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-blue-500" />
            <span>{t('savedQueries.exportJson', 'Export JSON')}</span>
          </button>

          <button
            type="button"
            data-testid="saved-queries-import-btn"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-line bg-panel hover:bg-black/5 dark:hover:bg-white/10 text-xs text-text transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-500" />
            <span>{t('savedQueries.importJson', 'Import JSON')}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            data-testid="saved-queries-import-input"
            className="hidden"
            onChange={handleImportFileChange}
          />
        </div>
      </div>

      {/* Scope Filter Pills */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-line bg-panel text-[11px]">
        {(
          [
            { id: 'all', label: t('savedQueries.filterAll', 'All') },
            { id: 'current', label: t('savedQueries.filterCurrent', 'This Connection / DB') },
            { id: 'pinned', label: t('savedQueries.filterPinned', 'Pinned') },
            { id: 'database', label: t('savedQueries.filterDatabase', 'Database') },
            { id: 'connection', label: t('savedQueries.filterConnection', 'Connection') },
            { id: 'global', label: t('savedQueries.filterGlobal', 'Global') },
          ] as const
        ).map((pill) => (
          <button
            key={pill.id}
            type="button"
            onClick={() => setScopeFilter(pill.id)}
            className={`px-2.5 py-1 rounded-full font-medium transition-colors ${
              scopeFilter === pill.id
                ? 'bg-blue-600 text-white'
                : 'bg-black/5 dark:bg-white/10 text-muted hover:text-text'
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Queries List */}
      <div className="flex-1 overflow-auto p-4">
        {filteredQueries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-xs text-muted py-12">
            <Bookmark className="w-8 h-8 mb-2 opacity-40" />
            <p>{t('savedQueries.emptyState', 'No saved queries match your filter.')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filteredQueries.map((query) => (
              <div
                key={query.id}
                data-testid={`saved-query-card-${query.id}`}
                className="rounded-lg border border-line bg-sidebar p-3 flex flex-col justify-between gap-2.5 hover:border-blue-500/50 transition-colors"
              >
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => togglePin(query.id)}
                          title={query.isPinned ? t('savedQueries.unpin', 'Unpin') : t('savedQueries.pin', 'Pin')}
                          className={`p-0.5 rounded transition-colors ${
                            query.isPinned
                              ? 'text-amber-500'
                              : 'text-muted hover:text-amber-500'
                          }`}
                        >
                          <Pin className="w-3.5 h-3.5" fill={query.isPinned ? 'currentColor' : 'none'} />
                        </button>
                        <span className="font-semibold text-xs text-text truncate">
                          {query.title}
                        </span>
                        {renderScopeBadge(query)}
                      </div>
                      {query.description && (
                        <p className="text-[11px] text-muted mt-0.5 line-clamp-2">
                          {query.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        data-testid={`saved-query-run-${query.id}`}
                        onClick={() => handleOpenQuery(query, true)}
                        title={t('savedQueries.runTooltip', 'Open & Run Query')}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium transition-colors"
                      >
                        <Play className="w-3 h-3" fill="currentColor" />
                        <span>{t('editorToolbar.run', 'Run')}</span>
                      </button>
                      <button
                        type="button"
                        data-testid={`saved-query-open-${query.id}`}
                        onClick={() => handleOpenQuery(query, false)}
                        title={t('savedQueries.openTooltip', 'Open in SQL Editor')}
                        className="p-1 rounded border border-line bg-panel hover:bg-black/5 dark:hover:bg-white/10 text-text transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-blue-500" />
                      </button>
                      <button
                        type="button"
                        data-testid={`saved-query-edit-${query.id}`}
                        onClick={() => setEditingQuery(query)}
                        title={t('common.edit', 'Edit')}
                        className="p-1 rounded border border-line bg-panel hover:bg-black/5 dark:hover:bg-white/10 text-text transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5 text-amber-500" />
                      </button>
                      <button
                        type="button"
                        data-testid={`saved-query-delete-${query.id}`}
                        onClick={() => handleDelete(query)}
                        title={t('common.delete', 'Delete')}
                        className="p-1 rounded border border-line bg-panel hover:bg-red-500/10 text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <pre className="max-h-24 overflow-auto rounded border border-line bg-panel p-2 font-mono text-[11px] text-text select-text">
                    <code>{query.sql}</code>
                  </pre>
                </div>

                <div className="flex items-center justify-between text-[10px] text-muted pt-1 border-t border-line">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {t('savedQueries.usedCount', 'Used {{count}} times', {
                      count: query.runCount ?? 0,
                    })}
                  </span>
                  <span>
                    {new Date(query.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New / Edit Modal */}
      {(isNewModalOpen || editingQuery) && (
        <SaveQueryModal
          isOpen={true}
          onClose={() => {
            setIsNewModalOpen(false);
            setEditingQuery(null);
          }}
          sql={editingQuery?.sql || 'SELECT * FROM '}
          connectionId={editingQuery?.connectionId || currentConnectionId || undefined}
          connectionName={editingQuery?.connectionName || currentConnection?.name}
          database={editingQuery?.database || currentConnection?.database}
          driver={editingQuery?.driver || currentConnection?.driver}
          existingQuery={editingQuery}
        />
      )}
    </div>
  );
};
