import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BookmarkPlus, X, Pin, Database, Globe, Server } from 'lucide-react';
import { toast } from 'sonner';
import { useSnippetStore, findDuplicateSnippetTitle } from '../../stores/snippetStore';
import type { SavedQueryScope, SqlSnippet } from '../../types/queryHistory';

export interface SaveQueryModalProps {
  isOpen: boolean;
  onClose: () => void;
  sql: string;
  connectionId?: string;
  connectionName?: string;
  database?: string;
  driver?: string;
  existingQuery?: SqlSnippet | null;
  onSaved?: (saved: SqlSnippet) => void;
}

export const SaveQueryModal: React.FC<SaveQueryModalProps> = ({
  isOpen,
  onClose,
  sql,
  connectionId,
  connectionName,
  database,
  driver,
  existingQuery,
  onSaved,
}) => {
  const { t } = useTranslation();
  const snippets = useSnippetStore((s) => s.snippets);
  const addSnippet = useSnippetStore((s) => s.addSnippet);
  const updateSnippet = useSnippetStore((s) => s.updateSnippet);

  const defaultScope: SavedQueryScope = existingQuery?.scope
    ? existingQuery.scope
    : database
    ? 'database'
    : connectionId
    ? 'connection'
    : 'global';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<SavedQueryScope>(defaultScope);
  const [isPinned, setIsPinned] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (existingQuery) {
      setTitle(existingQuery.title);
      setDescription(existingQuery.description || '');
      setScope(existingQuery.scope || defaultScope);
      setIsPinned(Boolean(existingQuery.isPinned));
    } else {
      setTitle('');
      setDescription('');
      setScope(database ? 'database' : connectionId ? 'connection' : 'global');
      setIsPinned(false);
    }
  }, [isOpen, existingQuery, database, connectionId, defaultScope]);

  const duplicateForSave = useMemo(
    () =>
      findDuplicateSnippetTitle(snippets, {
        title,
        scope,
        connectionId,
        database,
        excludeId: existingQuery?.id,
      }),
    [snippets, title, scope, connectionId, database, existingQuery?.id]
  );

  const duplicateForSaveAsNew = useMemo(
    () =>
      existingQuery
        ? findDuplicateSnippetTitle(snippets, {
            title,
            scope,
            connectionId,
            database,
          })
        : undefined,
    [snippets, existingQuery, title, scope, connectionId, database]
  );

  if (!isOpen) return null;

  const buildPayload = () => ({
    title: title.trim(),
    description: description.trim() || undefined,
    sql: sql.trim(),
    category: 'Saved',
    scope,
    connectionId: scope === 'global' ? undefined : connectionId,
    connectionName: scope === 'global' ? undefined : connectionName,
    database: scope === 'database' ? database : undefined,
    driver,
    isPinned,
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !sql.trim()) return;
    if (duplicateForSave) {
      toast.error(
        t('savedQueries.duplicateTitleError', 'A saved query named "{{title}}" already exists in this scope.', {
          title: title.trim(),
        })
      );
      return;
    }

    if (existingQuery) {
      updateSnippet(existingQuery.id, buildPayload());
      const updated =
        useSnippetStore.getState().snippets.find((s) => s.id === existingQuery.id) || {
          ...existingQuery,
          ...buildPayload(),
          updatedAt: Date.now(),
        };
      toast.success(
        t('savedQueries.updatedToast', 'Updated saved query "{{title}}"', {
          title: updated.title,
        })
      );
      onSaved?.(updated);
      onClose();
      return;
    }

    const created = addSnippet(buildPayload());
    toast.success(
      t('savedQueries.savedToast', 'Saved query "{{title}}"', {
        title: created.title,
      })
    );
    onSaved?.(created);
    onClose();
  };

  const handleSaveAsNew = () => {
    if (!title.trim() || !sql.trim()) return;
    if (duplicateForSaveAsNew) {
      toast.error(
        t('savedQueries.duplicateTitleError', 'A saved query named "{{title}}" already exists in this scope.', {
          title: title.trim(),
        })
      );
      return;
    }
    const created = addSnippet(buildPayload());
    toast.success(
      t('savedQueries.savedToast', 'Saved query "{{title}}"', {
        title: created.title,
      })
    );
    onSaved?.(created);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('savedQueries.saveModalTitle', 'Save Query')}
      data-testid="save-query-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-line bg-panel text-text shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-sidebar">
          <div className="flex items-center gap-2">
            <BookmarkPlus className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-text">
              {existingQuery
                ? t('savedQueries.updateModalTitle', 'Update Saved Query')
                : t('savedQueries.saveModalTitle', 'Save Query')}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close', 'Close')}
            className="p-1 rounded text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 space-y-3 text-xs">
          <div>
            <label className="block font-medium text-text mb-1">
              {t('savedQueries.nameLabel', 'Query Name')} *
            </label>
            <input
              type="text"
              autoFocus
              required
              data-testid="save-query-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('savedQueries.namePlaceholder', 'e.g. Daily Sales Summary')}
              className={`w-full rounded border bg-grid px-2.5 py-1.5 text-xs text-text focus:outline-none ${
                duplicateForSave
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-line focus:border-blue-500'
              }`}
            />
            {duplicateForSave && (
              <p data-testid="save-query-duplicate-error" className="mt-1 text-[11px] text-red-500">
                {t(
                  'savedQueries.duplicateTitleError',
                  'A saved query named "{{title}}" already exists in this scope.',
                  { title: title.trim() }
                )}
              </p>
            )}
          </div>

          <div>
            <label className="block font-medium text-text mb-1">
              {t('savedQueries.descriptionLabel', 'Description (Optional)')}
            </label>
            <input
              type="text"
              data-testid="save-query-desc-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('savedQueries.descriptionPlaceholder', 'Short note about what this query is for')}
              className="w-full rounded border border-line bg-grid px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block font-medium text-text mb-1.5">
              {t('savedQueries.scopeLabel', 'Scope')}
            </label>
            <div className="grid grid-cols-1 gap-1.5">
              {connectionId && database && (
                <label className="flex items-center gap-2 rounded border border-line px-2.5 py-1.5 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5">
                  <input
                    type="radio"
                    name="saved-query-scope"
                    value="database"
                    checked={scope === 'database'}
                    onChange={() => setScope('database')}
                    className="text-blue-600"
                  />
                  <Database className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="truncate">
                    {t('savedQueries.scopeDatabase', 'This database only')} ({connectionName || connectionId} • {database})
                  </span>
                </label>
              )}

              {connectionId && (
                <label className="flex items-center gap-2 rounded border border-line px-2.5 py-1.5 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5">
                  <input
                    type="radio"
                    name="saved-query-scope"
                    value="connection"
                    checked={scope === 'connection'}
                    onChange={() => setScope('connection')}
                    className="text-blue-600"
                  />
                  <Server className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span className="truncate">
                    {t('savedQueries.scopeConnection', 'This connection')} ({connectionName || connectionId})
                  </span>
                </label>
              )}

              <label className="flex items-center gap-2 rounded border border-line px-2.5 py-1.5 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5">
                <input
                  type="radio"
                  name="saved-query-scope"
                  value="global"
                  checked={scope === 'global'}
                  onChange={() => setScope('global')}
                  className="text-blue-600"
                />
                <Globe className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                <span>{t('savedQueries.scopeGlobal', 'Global (All databases)')}</span>
              </label>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="rounded border-line text-amber-500"
            />
            <Pin className="w-3.5 h-3.5 text-amber-500" />
            <span>{t('savedQueries.pinToTop', 'Pin as frequently used query')}</span>
          </label>

          <div>
            <div className="text-[11px] font-medium text-muted mb-1">SQL</div>
            <pre className="max-h-24 overflow-auto rounded border border-line bg-sidebar p-2 font-mono text-[11px] text-text">
              <code>{sql.trim()}</code>
            </pre>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-line text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10"
            >
              {t('common.cancel', 'Cancel')}
            </button>

            {existingQuery && (
              <button
                type="button"
                data-testid="save-query-as-new-btn"
                onClick={handleSaveAsNew}
                disabled={!title.trim() || !sql.trim() || Boolean(duplicateForSaveAsNew)}
                className="px-3 py-1.5 rounded border border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 disabled:opacity-50"
              >
                {t('savedQueries.saveAsNew', 'Save as New')}
              </button>
            )}

            <button
              type="submit"
              data-testid="save-query-submit-btn"
              disabled={!title.trim() || !sql.trim() || Boolean(duplicateForSave)}
              className="px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50"
            >
              {existingQuery
                ? t('savedQueries.updateBtn', 'Update Query')
                : t('common.save', 'Save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
