import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SavedQueriesTab } from './SavedQueriesTab';
import { useSnippetStore } from '../../stores/snippetStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useTabStore } from '../../stores/tabStore';
import { showConfirmDialog } from '../../utils/dialog';

vi.mock('../../utils/dialog', () => ({
  showConfirmDialog: vi.fn().mockResolvedValue(true),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('SavedQueriesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    useConnectionStore.setState({
      connections: [
        {
          id: 'conn-pg',
          name: 'POS Production',
          driver: 'postgres',
          host: 'localhost',
          port: 5432,
          database: 'pos_db',
          user: 'postgres',
          environment: 'production',
        },
        {
          id: 'conn-sqlite',
          name: 'Local Analytics',
          driver: 'sqlite',
          database: '/tmp/analytics.db',
        },
      ],
      activeConnectionId: 'conn-pg',
      connectedConnectionIds: ['conn-pg'],
    });

    useTabStore.setState({
      tabs: [],
      activeTabId: null,
    });

    useSnippetStore.setState({
      snippets: [
        {
          id: 'q-sales',
          title: 'Daily Sales Summary',
          description: 'Sum daily sales for POS',
          sql: 'SELECT DATE(created_at), SUM(total) FROM sales GROUP BY 1;',
          category: 'Saved',
          scope: 'database',
          connectionId: 'conn-pg',
          connectionName: 'POS Production',
          database: 'pos_db',
          driver: 'postgres',
          isPinned: true,
          runCount: 5,
          createdAt: 1000,
          updatedAt: 2000,
        },
        {
          id: 'q-events',
          title: 'Recent Events',
          sql: 'SELECT * FROM events LIMIT 50;',
          category: 'Saved',
          scope: 'connection',
          connectionId: 'conn-sqlite',
          connectionName: 'Local Analytics',
          database: '/tmp/analytics.db',
          driver: 'sqlite',
          isPinned: false,
          runCount: 1,
          createdAt: 1000,
          updatedAt: 1500,
        },
        {
          id: 'q-global',
          title: 'Active Connections Check',
          sql: 'SELECT 1;',
          category: 'Saved',
          scope: 'global',
          isPinned: false,
          runCount: 0,
          createdAt: 1000,
          updatedAt: 1200,
        },
      ],
    });
  });

  it('renders saved queries and filters by search and scope', () => {
    render(<SavedQueriesTab connectionId="conn-pg" />);

    expect(screen.getByText('Daily Sales Summary')).toBeInTheDocument();
    expect(screen.getByText('Recent Events')).toBeInTheDocument();
    expect(screen.getByText('Active Connections Check')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('saved-queries-search'), {
      target: { value: 'Sales' },
    });
    expect(screen.getByText('Daily Sales Summary')).toBeInTheDocument();
    expect(screen.queryByText('Recent Events')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('saved-queries-search'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: /This Connection \/ DB|ฐานข้อมูล \/ Connection นี้/i }));
    expect(screen.getByText('Daily Sales Summary')).toBeInTheDocument();
    expect(screen.queryByText('Recent Events')).not.toBeInTheDocument();
    expect(screen.queryByText('Active Connections Check')).not.toBeInTheDocument();
  });

  it('opens a query tab with autoRun=true and increments runCount when clicking Run', () => {
    render(<SavedQueriesTab connectionId="conn-pg" />);

    fireEvent.click(screen.getByTestId('saved-query-run-q-sales'));

    const tabs = useTabStore.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({
      type: 'query',
      connectionId: 'conn-pg',
      title: 'Daily Sales Summary',
      savedQueryId: 'q-sales',
      autoRun: true,
      queryContent: 'SELECT DATE(created_at), SUM(total) FROM sales GROUP BY 1;',
    });

    const updated = useSnippetStore.getState().snippets.find((s) => s.id === 'q-sales');
    expect(updated?.runCount).toBe(6);
  });

  it('opens a query tab without autoRun when clicking Open in Editor', () => {
    render(<SavedQueriesTab connectionId="conn-pg" />);

    fireEvent.click(screen.getByTestId('saved-query-open-q-sales'));

    const tabs = useTabStore.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].autoRun).toBe(false);
    expect(tabs[0].savedQueryId).toBe('q-sales');
  });

  it('edits and deletes a saved query', async () => {
    render(<SavedQueriesTab connectionId="conn-pg" />);

    fireEvent.click(screen.getByTestId('saved-query-edit-q-sales'));
    const titleInput = screen.getByTestId('save-query-title-input') as HTMLInputElement;
    expect(titleInput.value).toBe('Daily Sales Summary');

    fireEvent.change(titleInput, { target: { value: 'Daily Sales V2' } });
    fireEvent.click(screen.getByTestId('save-query-submit-btn'));

    expect(screen.getByText('Daily Sales V2')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('saved-query-delete-q-events'));
    await waitFor(() => {
      expect(showConfirmDialog).toHaveBeenCalled();
      expect(screen.queryByText('Recent Events')).not.toBeInTheDocument();
    });
  });

  it('exports JSON and imports saved queries from JSON file', async () => {
    const createObjectURLMock = vi.fn(() => 'blob:mock-url');
    const revokeObjectURLMock = vi.fn();
    globalThis.URL.createObjectURL = createObjectURLMock;
    globalThis.URL.revokeObjectURL = revokeObjectURLMock;

    render(<SavedQueriesTab connectionId="conn-pg" />);

    fireEvent.click(screen.getByTestId('saved-queries-export-btn'));
    expect(createObjectURLMock).toHaveBeenCalled();

    const bundleJson = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      queries: [
        {
          id: 'q-imported',
          title: 'Imported Query',
          sql: 'SELECT COUNT(*) FROM users;',
          category: 'Saved',
          scope: 'global',
          createdAt: 1000,
          updatedAt: 2000,
        },
      ],
    });

    const file = new File([bundleJson], 'queries.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', {
      value: vi.fn().mockResolvedValue(bundleJson),
    });

    const input = screen.getByTestId('saved-queries-import-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Imported Query')).toBeInTheDocument();
    });
  });

  it('prevents saving or renaming a query with a duplicate title in the same scope', () => {
    render(<SavedQueriesTab connectionId="conn-pg" />);

    useSnippetStore.getState().addSnippet({
      id: 'q-global-2',
      title: 'Existing Global Query',
      sql: 'SELECT 2;',
      category: 'Saved',
      scope: 'global',
    });

    fireEvent.click(screen.getByTestId('saved-query-edit-q-global'));
    const titleInput = screen.getByTestId('save-query-title-input') as HTMLInputElement;

    expect(screen.getByTestId('save-query-as-new-btn')).toBeDisabled();
    expect(screen.getByTestId('save-query-submit-btn')).not.toBeDisabled();

    fireEvent.change(titleInput, { target: { value: 'existing global query' } });
    expect(screen.getByTestId('save-query-duplicate-error')).toBeInTheDocument();
    expect(screen.getByTestId('save-query-submit-btn')).toBeDisabled();
  });
});
