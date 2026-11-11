import React, { useState, useMemo } from 'react';
import {
  History,
  Bookmark,
  Search,
  Trash2,
  Plus,
  Copy,
  Check,
  Play,
  ArrowRightToLine,
  X,
  Clock,
  Database,
  CheckCircle2,
  AlertCircle,
  Edit2,
  FolderPlus,
} from 'lucide-react';
import { useQueryHistoryStore } from '../../stores/queryHistoryStore';
import { useSnippetStore } from '../../stores/snippetStore';
import type { SqlSnippet } from '../../types/queryHistory';

export interface HistorySnippetsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'history' | 'snippets';
  currentConnectionId?: string;
  currentConnectionName?: string;
  currentDatabase?: string;
  onSelectSql: (sql: string, mode: 'insert' | 'replace' | 'run') => void;
}

export const HistorySnippetsDrawer: React.FC<HistorySnippetsDrawerProps> = ({
  isOpen,
  onClose,
  initialTab = 'history',
  currentConnectionId,
  currentConnectionName,
  currentDatabase,
  onSelectSql,
}) => {
  const [activeTab, setActiveTab] = useState<'history' | 'snippets'>(initialTab);
  const [historySearch, setHistorySearch] = useState('');
  const [snippetsSearch, setSnippetsSearch] = useState('');
  const [filterThisConnOnly, setFilterThisConnOnly] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Snippet Modal state
  const [isSnippetModalOpen, setIsSnippetModalOpen] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<SqlSnippet | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState('General');
  const [formDescription, setFormDescription] = useState('');
  const [formTags, setFormTags] = useState('');
  const [formSql, setFormSql] = useState('');

  const history = useQueryHistoryStore((s) => s.history);
  const removeHistoryItem = useQueryHistoryStore((s) => s.removeHistoryItem);
  const clearAllHistory = useQueryHistoryStore((s) => s.clearAll);

  const snippets = useSnippetStore((s) => s.snippets);
  const addSnippet = useSnippetStore((s) => s.addSnippet);
  const updateSnippet = useSnippetStore((s) => s.updateSnippet);
  const deleteSnippet = useSnippetStore((s) => s.deleteSnippet);

  // Sync initial tab when changed
  React.useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    snippets.forEach((s) => {
      if (s.category) set.add(s.category);
    });
    return ['All', ...Array.from(set)];
  }, [snippets]);

  // Filtered history
  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      if (filterThisConnOnly && currentConnectionId && item.connectionId !== currentConnectionId) {
        return false;
      }
      if (!historySearch.trim()) return true;
      const q = historySearch.toLowerCase();
      return (
        item.sql.toLowerCase().includes(q) ||
        (item.connectionName && item.connectionName.toLowerCase().includes(q)) ||
        (item.database && item.database.toLowerCase().includes(q)) ||
        (item.errorMessage && item.errorMessage.toLowerCase().includes(q))
      );
    });
  }, [history, historySearch, filterThisConnOnly, currentConnectionId]);

  // Filtered snippets
  const filteredSnippets = useMemo(() => {
    return snippets.filter((s) => {
      if (selectedCategory !== 'All' && s.category !== selectedCategory) {
        return false;
      }
      if (!snippetsSearch.trim()) return true;
      const q = snippetsSearch.toLowerCase();
      return (
        s.title.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q)) ||
        s.sql.toLowerCase().includes(q) ||
        (s.tags && s.tags.some((t) => t.toLowerCase().includes(q)))
      );
    });
  }, [snippets, selectedCategory, snippetsSearch]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenNewSnippet = (initialSql: string = '') => {
    setEditingSnippet(null);
    setFormTitle('');
    setFormCategory('General');
    setFormDescription('');
    setFormTags('');
    setFormSql(initialSql);
    setIsSnippetModalOpen(true);
  };

  const handleOpenEditSnippet = (snippet: SqlSnippet) => {
    setEditingSnippet(snippet);
    setFormTitle(snippet.title);
    setFormCategory(snippet.category || 'General');
    setFormDescription(snippet.description || '');
    setFormTags((snippet.tags || []).join(', '));
    setFormSql(snippet.sql);
    setIsSnippetModalOpen(true);
  };

  const handleSaveSnippet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formSql.trim()) return;

    const tags = formTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (editingSnippet) {
      updateSnippet(editingSnippet.id, {
        title: formTitle.trim(),
        category: formCategory.trim() || 'General',
        description: formDescription.trim(),
        tags,
        sql: formSql.trim(),
      });
    } else {
      addSnippet({
        title: formTitle.trim(),
        category: formCategory.trim() || 'General',
        description: formDescription.trim(),
        tags,
        sql: formSql.trim(),
      });
    }

    setIsSnippetModalOpen(false);
  };

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-label="Query History & Snippets"
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-zinc-200 bg-white shadow-2xl transition-all dark:border-zinc-800 dark:bg-zinc-900"
      style={{
        boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.15)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <History size={18} className="text-blue-500" />
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Query History & Snippets
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <X size={18} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-200 bg-zinc-50 px-4 pt-2 dark:border-zinc-800 dark:bg-zinc-900/50">
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'history'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
          }`}
        >
          <History size={14} />
          <span>History</span>
          <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {history.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('snippets')}
          className={`flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'snippets'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
          }`}
        >
          <Bookmark size={14} />
          <span>Snippets</span>
          <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {snippets.length}
          </span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {activeTab === 'history' ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Filter controls */}
            <div className="border-b border-zinc-200 p-3 dark:border-zinc-800">
              <div className="relative mb-2">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
                />
                <input
                  type="text"
                  placeholder="Search history by SQL, DB, or error..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full rounded border border-zinc-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={filterThisConnOnly}
                    onChange={(e) => setFilterThisConnOnly(e.target.checked)}
                    className="rounded border-zinc-300 text-blue-600"
                  />
                  <span>
                    This connection only
                    {currentConnectionName
                      ? ` (${currentConnectionName}${currentDatabase ? ` • ${currentDatabase}` : ''})`
                      : ''}
                  </span>
                </label>

                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Clear all query history?')) {
                        clearAllHistory();
                      }
                    }}
                    className="text-[11px] text-red-500 hover:underline"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {/* History List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {filteredHistory.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-400">
                  No query history recorded yet
                </div>
              ) : (
                filteredHistory.map((item) => (
                  <div
                    key={item.id}
                    className="group rounded-md border border-zinc-200 bg-white p-2.5 text-xs shadow-sm hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-800/40 dark:hover:border-zinc-700"
                  >
                    {/* Item Top Meta */}
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                      <div className="flex items-center gap-1.5">
                        {item.status === 'success' ? (
                          <CheckCircle2 size={13} className="text-emerald-500" />
                        ) : (
                          <AlertCircle size={13} className="text-red-500" />
                        )}
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">
                          {item.rowCount !== undefined ? `${item.rowCount} rows` : ''}
                          {item.rowsAffected !== undefined && item.rowsAffected !== null
                            ? `${item.rowsAffected} affected`
                            : ''}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {item.executionTimeMs}ms
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {item.connectionName && (
                          <span
                            className="flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                            title={`Database: ${item.database || 'default'}`}
                          >
                            <Database size={10} />
                            {item.connectionName}
                          </span>
                        )}
                        <span>{formatTimestamp(item.executedAt)}</span>
                      </div>
                    </div>

                    {/* SQL Body */}
                    <pre className="max-h-28 overflow-x-auto rounded bg-zinc-50 p-2 font-mono text-[11px] leading-relaxed text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                      <code>{item.sql}</code>
                    </pre>

                    {item.errorMessage && (
                      <div className="mt-1 text-[11px] text-red-500">{item.errorMessage}</div>
                    )}

                    {/* Item Actions */}
                    <div className="mt-2 flex items-center justify-between border-t border-zinc-100 pt-1.5 dark:border-zinc-800">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onSelectSql(item.sql, 'run')}
                          className="flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600 hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300"
                        >
                          <Play size={10} fill="currentColor" />
                          <span>Run</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectSql(item.sql, 'insert')}
                          className="flex items-center gap-1 rounded border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          <ArrowRightToLine size={10} />
                          <span>Insert</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(item.id, item.sql)}
                          className="flex items-center gap-1 rounded border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          {copiedId === item.id ? (
                            <>
                              <Check size={10} className="text-emerald-500" />
                              <span className="text-emerald-500">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy size={10} />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            handleOpenNewSnippet(item.sql);
                          }}
                          title="Save as Snippet"
                          className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                        >
                          <FolderPlus size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeHistoryItem(item.id)}
                          title="Delete from history"
                          className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/50"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Snippet Header Controls */}
            <div className="border-b border-zinc-200 p-3 dark:border-zinc-800">
              <div className="mb-2 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
                  />
                  <input
                    type="text"
                    placeholder="Search snippets by title, tag, or SQL..."
                    value={snippetsSearch}
                    onChange={(e) => setSnippetsSearch(e.target.value)}
                    className="w-full rounded border border-zinc-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenNewSnippet('')}
                  className="flex items-center gap-1.5 rounded bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
                >
                  <Plus size={13} />
                  <span>+ New Snippet</span>
                </button>
              </div>

              {/* Categories Pills */}
              <div className="flex flex-wrap gap-1">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                      selectedCategory === cat
                        ? 'bg-blue-600 text-white'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Snippets List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {filteredSnippets.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-400">
                  No SQL snippets found
                </div>
              ) : (
                filteredSnippets.map((snippet) => (
                  <div
                    key={snippet.id}
                    className="rounded-md border border-zinc-200 bg-white p-2.5 text-xs shadow-sm dark:border-zinc-800 dark:bg-zinc-800/40"
                  >
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                            {snippet.title}
                          </span>
                          {snippet.category && (
                            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
                              {snippet.category}
                            </span>
                          )}
                        </div>
                        {snippet.description && (
                          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                            {snippet.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditSnippet(snippet)}
                          className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSnippet(snippet.id)}
                          className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/50"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    {/* Tags */}
                    {snippet.tags && snippet.tags.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1">
                        {snippet.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded bg-zinc-100 px-1.5 py-0.2 text-[9px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* SQL Body */}
                    <pre className="max-h-28 overflow-x-auto rounded bg-zinc-50 p-2 font-mono text-[11px] leading-relaxed text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                      <code>{snippet.sql}</code>
                    </pre>

                    {/* Actions */}
                    <div className="mt-2 flex items-center justify-between border-t border-zinc-100 pt-1.5 dark:border-zinc-800">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onSelectSql(snippet.sql, 'run')}
                          className="flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600 hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300"
                        >
                          <Play size={10} fill="currentColor" />
                          <span>Run</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectSql(snippet.sql, 'insert')}
                          className="flex items-center gap-1 rounded border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          <ArrowRightToLine size={10} />
                          <span>Insert</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(snippet.id, snippet.sql)}
                          className="flex items-center gap-1 rounded border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          {copiedId === snippet.id ? (
                            <>
                              <Check size={10} className="text-emerald-500" />
                              <span className="text-emerald-500">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy size={10} />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Snippet Modal Form */}
      {isSnippetModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsSnippetModalOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {editingSnippet ? 'Edit SQL Snippet' : 'New SQL Snippet'}
            </h3>
            <form onSubmit={handleSaveSnippet} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Snippet Title *
                </label>
                <input
                  type="text"
                  placeholder="Snippet Title"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full rounded border border-zinc-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Category
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Analytics, Schema"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full rounded border border-zinc-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Tags (comma separated)
                  </label>
                  <input
                    type="text"
                    placeholder="users, count, weekly"
                    value={formTags}
                    onChange={(e) => setFormTags(e.target.value)}
                    className="w-full rounded border border-zinc-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="Short explanation of what this query does"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full rounded border border-zinc-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  SQL Query *
                </label>
                <textarea
                  required
                  rows={6}
                  placeholder="Enter SQL query..."
                  value={formSql}
                  onChange={(e) => setFormSql(e.target.value)}
                  className="w-full rounded border border-zinc-300 bg-white p-2 font-mono text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSnippetModalOpen(false)}
                  className="rounded border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Save Snippet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
