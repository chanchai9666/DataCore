import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  X,
  Send,
  Loader2,
  Trash2,
  Settings,
  Copy,
  Check,
  Code,
  ShieldCheck,
  AlertTriangle,
  ArrowRightCircle,
} from 'lucide-react';
import { useAiStore, buildPrivacySafeSchemaContext } from '../../stores/aiStore';
import { useSchemaStore } from '../../stores/schemaStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useTabStore } from '../../stores/tabStore';
import { toast } from 'sonner';

export interface AiAssistantDrawerProps {
  onInsertSql?: (sql: string) => void;
}

export const AiAssistantDrawer: React.FC<AiAssistantDrawerProps> = ({ onInsertSql }) => {
  const isOpen = useAiStore((s) => s.isOpen);
  const setOpen = useAiStore((s) => s.setOpen);
  const settings = useAiStore((s) => s.settings);
  const updateSettings = useAiStore((s) => s.updateSettings);
  const messages = useAiStore((s) => s.messages);
  const isLoading = useAiStore((s) => s.isLoading);
  const sendMessage = useAiStore((s) => s.sendMessage);
  const clearMessages = useAiStore((s) => s.clearMessages);

  const activeTabId = useTabStore((s) => s.activeTabId);
  const tabs = useTabStore((s) => s.tabs);
  const currentTab = tabs.find((t) => t.id === activeTabId);

  // Schema metadata
  const schemas = useSchemaStore((s) => s.schemas);
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const schemaMap = activeConnectionId ? schemas[activeConnectionId] : undefined;

  const [inputPrompt, setInputPrompt] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  if (!isOpen) return null;

  // Build schema context safely (tables and column definitions only)
  const getSchemaSummary = (): string => {
    if (!schemaMap) return '';
    const tablesList: Array<{ name: string; columns: Array<{ name: string; type: string }> }> = [];
    for (const [table, columns] of Object.entries(schemaMap)) {
      tablesList.push({
        name: table,
        columns: (columns || []).map((col) => ({ name: col, type: 'COLUMN' })),
      });
    }
    return buildPrivacySafeSchemaContext(tablesList);
  };

  const handleSend = async () => {
    if (!inputPrompt.trim() || isLoading) return;
    const prompt = inputPrompt;
    setInputPrompt('');
    const schemaContext = getSchemaSummary();
    await sendMessage(prompt, schemaContext, 'generate');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopySql = (id: string, sql: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedId(id);
    toast.success('SQL copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleInsert = (sql: string) => {
    if (onInsertSql) {
      onInsertSql(sql);
      toast.success('Inserted into query editor');
    } else {
      navigator.clipboard.writeText(sql);
      toast.success('SQL copied to clipboard');
    }
  };

  const handleQuickExplain = async () => {
    const currentSql = currentTab?.queryContent || '';
    if (!currentSql.trim()) {
      toast.info('No query found in current tab to explain');
      return;
    }
    const schemaContext = getSchemaSummary();
    await sendMessage(`Explain this SQL query and suggest optimizations:\n\n${currentSql}`, schemaContext, 'explain');
  };

  return (
    <div
      data-testid="ai-assistant-drawer"
      className="fixed right-0 top-0 bottom-0 w-96 max-w-full bg-panel border-l border-line shadow-2xl flex flex-col z-40 transition-transform duration-200"
    >
      {/* Drawer Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-sidebar">
        <div className="flex items-center space-x-2">
          <div className="p-1 rounded bg-purple-500/20 text-purple-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text flex items-center gap-1.5">
              <span>Local AI Assistant</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono font-medium">
                Local-First
              </span>
            </h2>
            <p className="text-[11px] text-muted flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>Zero cloud leakage</span>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded transition-colors ${
              showSettings ? 'bg-purple-600 text-white' : 'text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/5'
            }`}
            title="Local AI Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={clearMessages}
            disabled={messages.length === 0}
            className="p-1.5 rounded text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Clear Chat History"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-1.5 rounded text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            title="Close Assistant"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Settings Panel Popover / Section */}
      {showSettings && (
        <div className="p-4 bg-sidebar/95 border-b border-line space-y-3 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-line">
            <span className="font-semibold text-text">Local AI Configuration</span>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => updateSettings({ enabled: e.target.checked })}
                className="rounded bg-gray-800 border-gray-700 text-purple-600 focus:ring-0 w-3.5 h-3.5"
              />
              <span className="text-xs text-text font-medium">
                {settings.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          </div>

          <div>
            <label className="block text-[11px] text-muted mb-1 font-medium">
              Local Endpoint URL (Ollama / LM Studio)
            </label>
            <input
              type="text"
              value={settings.endpointUrl}
              onChange={(e) => updateSettings({ endpointUrl: e.target.value })}
              placeholder="http://localhost:11434/v1"
              className="w-full px-2.5 py-1.5 rounded bg-panel border border-line text-text focus:outline-none focus:border-purple-500 font-mono text-xs"
            />
          </div>

          <div>
            <label className="block text-[11px] text-muted mb-1 font-medium">Model Name</label>
            <input
              type="text"
              value={settings.model}
              onChange={(e) => updateSettings({ model: e.target.value })}
              placeholder="sqlcoder, deepseek-coder, llama3"
              className="w-full px-2.5 py-1.5 rounded bg-panel border border-line text-text focus:outline-none focus:border-purple-500 font-mono text-xs"
            />
          </div>

          <div className="p-2.5 rounded bg-purple-500/10 border border-purple-500/20 text-[11px] text-purple-300 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
            <span>
              Queries run purely on your local machine. Only schema table & column names are provided to generate accurate SQL.
            </span>
          </div>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!settings.enabled && (
          <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-2">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="w-4 h-4" />
              <span>Local AI Assistant is currently disabled</span>
            </div>
            <p className="text-[11px] text-amber-300/80">
              To keep full control over system resources, Local AI is opt-in. Click the Settings icon above or the button below to enable it.
            </p>
            <button
              type="button"
              onClick={() => updateSettings({ enabled: true })}
              className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs transition-colors"
            >
              Enable Local AI
            </button>
          </div>
        )}

        {messages.length === 0 && settings.enabled && (
          <div className="py-8 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-text">How can I help with your database?</p>
              <p className="text-xs text-muted mt-1 max-w-xs mx-auto">
                Ask to generate SQL queries, explain execution plans, or diagnose errors.
              </p>
            </div>

            {/* Quick Action Pills */}
            <div className="pt-2 flex flex-col gap-1.5 text-left">
              <button
                type="button"
                onClick={() => setInputPrompt('Show the top 10 users by total order amount')}
                className="p-2 rounded bg-sidebar hover:bg-sidebar/80 border border-line text-xs text-text transition-colors flex items-center justify-between"
              >
                <span>"Show top 10 users by total order amount"</span>
                <ArrowRightCircle className="w-3.5 h-3.5 text-muted" />
              </button>
              <button
                type="button"
                onClick={handleQuickExplain}
                className="p-2 rounded bg-sidebar hover:bg-sidebar/80 border border-line text-xs text-text transition-colors flex items-center justify-between"
              >
                <span>Explain currently active SQL tab query</span>
                <ArrowRightCircle className="w-3.5 h-3.5 text-muted" />
              </button>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.role === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div
              className={`max-w-[90%] rounded-lg px-3.5 py-2.5 text-xs ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-sidebar border border-line text-text'
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>

              {/* Extracted SQL Snippet Card */}
              {msg.sqlSnippet && (
                <div className="mt-2.5 pt-2 border-t border-line/60">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-mono font-medium text-purple-400 flex items-center gap-1">
                      <Code className="w-3 h-3" />
                      <span>SQL Snippet</span>
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleCopySql(msg.id, msg.sqlSnippet!)}
                        className="p-1 rounded text-muted hover:text-text hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                        title="Copy SQL"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsert(msg.sqlSnippet!)}
                        className="px-2 py-0.5 rounded bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-medium transition-colors"
                      >
                        Insert
                      </button>
                    </div>
                  </div>
                  <pre className="p-2 rounded bg-black/40 font-mono text-[11px] text-gray-200 overflow-x-auto select-all">
                    {msg.sqlSnippet}
                  </pre>
                </div>
              )}
            </div>
            <span className="text-[10px] text-muted mt-1 px-1">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center space-x-2 text-muted text-xs p-2">
            <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
            <span>Thinking with local model...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form Bar */}
      <div className="p-3 border-t border-line bg-sidebar">
        <div className="relative">
          <textarea
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!settings.enabled || isLoading}
            placeholder={
              settings.enabled
                ? 'Ask a question or describe query (Enter to send)...'
                : 'Enable Assistant to type prompts...'
            }
            rows={2}
            className="w-full pl-3 pr-10 py-2 rounded-lg bg-panel border border-line text-text placeholder-muted focus:outline-none focus:border-purple-500 text-xs resize-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!settings.enabled || !inputPrompt.trim() || isLoading}
            className="absolute right-2 bottom-2.5 p-1.5 rounded-md bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:hover:bg-purple-600 text-white transition-colors cursor-pointer"
            title="Send Prompt"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
};
