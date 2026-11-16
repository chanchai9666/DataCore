import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useAiStore,
  buildPrivacySafeSchemaContext,
  extractSqlFromResponse,
  DEFAULT_AI_SETTINGS,
} from './aiStore';

describe('aiStore', () => {
  beforeEach(() => {
    useAiStore.setState({
      settings: { ...DEFAULT_AI_SETTINGS },
      isOpen: false,
      isLoading: false,
      error: null,
      messages: [],
    });
    vi.restoreAllMocks();
  });

  describe('buildPrivacySafeSchemaContext', () => {
    it('returns empty string when no tables provided', () => {
      expect(buildPrivacySafeSchemaContext([])).toBe('');
    });

    it('formats schema metadata correctly with table and column names and types', () => {
      const tables = [
        {
          name: 'users',
          columns: [
            { name: 'id', type: 'INTEGER' },
            { name: 'email', type: 'TEXT' },
          ],
        },
        {
          name: 'orders',
          columns: [
            { name: 'id', type: 'BIGINT' },
            { name: 'amount', type: 'NUMERIC' },
          ],
        },
      ];
      const context = buildPrivacySafeSchemaContext(tables);
      expect(context).toContain('Table: users');
      expect(context).toContain('- id (INTEGER)');
      expect(context).toContain('- email (TEXT)');
      expect(context).toContain('Table: orders');
      expect(context).toContain('- amount (NUMERIC)');
      // Assures NO row data is involved
      expect(context).not.toContain('SELECT');
    });
  });

  describe('extractSqlFromResponse', () => {
    it('extracts sql from markdown ```sql block', () => {
      const md = 'Here is the query:\n```sql\nSELECT * FROM users WHERE active = true;\n```\nHope it helps!';
      expect(extractSqlFromResponse(md)).toBe('SELECT * FROM users WHERE active = true;');
    });

    it('extracts sql from generic ``` block', () => {
      const md = '```\nSELECT 1;\n```';
      expect(extractSqlFromResponse(md)).toBe('SELECT 1;');
    });

    it('returns undefined when no code block is present', () => {
      expect(extractSqlFromResponse('Just a plain text response without code.')).toBeUndefined();
    });
  });

  describe('store actions', () => {
    it('toggles open state', () => {
      expect(useAiStore.getState().isOpen).toBe(false);
      useAiStore.getState().toggleOpen();
      expect(useAiStore.getState().isOpen).toBe(true);
      useAiStore.getState().setOpen(false);
      expect(useAiStore.getState().isOpen).toBe(false);
    });

    it('updates settings', () => {
      useAiStore.getState().updateSettings({ enabled: true, model: 'deepseek-coder' });
      expect(useAiStore.getState().settings.enabled).toBe(true);
      expect(useAiStore.getState().settings.model).toBe('deepseek-coder');
    });

    it('adds and clears messages', () => {
      useAiStore.getState().addMessage({ role: 'user', content: 'Count users' });
      expect(useAiStore.getState().messages).toHaveLength(1);
      expect(useAiStore.getState().messages[0].content).toBe('Count users');

      useAiStore.getState().clearMessages();
      expect(useAiStore.getState().messages).toHaveLength(0);
    });

    it('fails when calling sendMessage while disabled', async () => {
      const res = await useAiStore.getState().sendMessage('Hello');
      expect(res).toBeNull();
      expect(useAiStore.getState().error).toContain('disabled');
    });

    it('sends prompt to local endpoint and parses sql when enabled', async () => {
      useAiStore.getState().updateSettings({ enabled: true });

      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Here is your query:\n```sql\nSELECT count(*) FROM users;\n```',
            },
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const res = await useAiStore.getState().sendMessage('How many users?');
      expect(res).toContain('SELECT count(*) FROM users;');
      expect(useAiStore.getState().messages).toHaveLength(2);
      expect(useAiStore.getState().messages[1].sqlSnippet).toBe('SELECT count(*) FROM users;');
      expect(useAiStore.getState().isLoading).toBe(false);
    });
  });
});
