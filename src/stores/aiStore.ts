import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  sqlSnippet?: string;
}

export interface AiSettings {
  enabled: boolean;
  endpointUrl: string; // e.g. http://localhost:11434/v1 or http://localhost:1234/v1
  model: string; // e.g. sqlcoder, deepseek-coder, llama3
  temperature: number;
}

export interface AiStoreState {
  settings: AiSettings;
  isOpen: boolean;
  isLoading: boolean;
  error: string | null;
  messages: AiMessage[];

  // Actions
  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  updateSettings: (partial: Partial<AiSettings>) => void;
  clearMessages: () => void;
  addMessage: (message: Omit<AiMessage, 'id' | 'timestamp'>) => void;
  sendMessage: (
    userPrompt: string,
    schemaContext?: string,
    actionType?: 'generate' | 'explain' | 'error'
  ) => Promise<string | null>;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  endpointUrl: 'http://localhost:11434/v1',
  model: 'sqlcoder',
  temperature: 0.1,
};

/**
 * Builds a schema context string strictly from table & column metadata.
 * Strictly guarantees that NO row data or cell contents are included.
 */
export function buildPrivacySafeSchemaContext(
  tables: Array<{ name: string; columns: Array<{ name: string; type: string }> }>
): string {
  if (!tables || tables.length === 0) return '';
  return tables
    .map(
      (t) =>
        `Table: ${t.name}\nColumns:\n` +
        t.columns.map((c) => `  - ${c.name} (${c.type})`).join('\n')
    )
    .join('\n\n');
}

/**
 * Parses markdown code block or bare SQL from LLM response
 */
export function extractSqlFromResponse(text: string): string | undefined {
  const codeBlockMatch = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].trim();
  }
  return undefined;
}

export const useAiStore = create<AiStoreState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_AI_SETTINGS,
      isOpen: false,
      isLoading: false,
      error: null,
      messages: [],

      toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
      setOpen: (open) => set({ isOpen: open }),

      updateSettings: (partial) =>
        set((s) => ({
          settings: { ...s.settings, ...partial },
        })),

      clearMessages: () => set({ messages: [], error: null }),

      addMessage: (msg) => {
        const newMessage: AiMessage = {
          id: `ai-msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          timestamp: Date.now(),
          ...msg,
        };
        set((s) => ({ messages: [...s.messages, newMessage] }));
      },

      sendMessage: async (userPrompt, schemaContext, actionType = 'generate') => {
        const { settings, addMessage } = get();

        if (!settings.enabled) {
          const err = 'Local AI Assistant is currently disabled. Please enable it in Settings.';
          set({ error: err });
          return null;
        }

        const trimmedPrompt = userPrompt.trim();
        if (!trimmedPrompt) return null;

        // Add user prompt to history
        addMessage({
          role: 'user',
          content: trimmedPrompt,
        });

        set({ isLoading: true, error: null });

        // System prompt strictly limiting to SQL and local assistance
        let systemPrompt =
          'You are DataCore AI, a local-first SQL database expert assistant. ' +
          'Provide concise, standard, correct SQL queries and helpful explanations. ' +
          'Wrap SQL in ```sql ... ``` code blocks.';

        if (schemaContext) {
          systemPrompt += `\n\nDatabase Schema:\n${schemaContext}`;
        }

        if (actionType === 'explain') {
          systemPrompt += '\nGoal: Explain the following query, its plan or performance characteristics.';
        } else if (actionType === 'error') {
          systemPrompt += '\nGoal: Diagnose the database error message and provide the corrected query.';
        }

        try {
          const cleanEndpoint = settings.endpointUrl.replace(/\/+$/, '');
          const response = await fetch(`${cleanEndpoint}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: settings.model || 'sqlcoder',
              temperature: settings.temperature ?? 0.1,
              messages: [
                { role: 'system', content: systemPrompt },
                ...get().messages.map((m) => ({
                  role: m.role,
                  content: m.content,
                })),
              ],
            }),
          });

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Endpoint error (${response.status}): ${errText || response.statusText}`);
          }

          const data = await response.json();
          const assistantReply =
            data.choices?.[0]?.message?.content ||
            data.message?.content ||
            'No response from local model.';

          const extractedSql = extractSqlFromResponse(assistantReply);

          addMessage({
            role: 'assistant',
            content: assistantReply,
            sqlSnippet: extractedSql,
          });

          set({ isLoading: false });
          return assistantReply;
        } catch (err: any) {
          const errorMsg =
            err?.message || 'Failed to connect to local AI endpoint (e.g. Ollama or LM Studio)';
          set({ isLoading: false, error: errorMsg });
          addMessage({
            role: 'assistant',
            content: `⚠️ Error: ${errorMsg}\n\nMake sure your local endpoint (${settings.endpointUrl}) is running.`,
          });
          return null;
        }
      },
    }),
    {
      name: 'datacore:ai_assistant_settings',
      partialize: (state) => ({
        settings: state.settings,
      }),
    }
  )
);
