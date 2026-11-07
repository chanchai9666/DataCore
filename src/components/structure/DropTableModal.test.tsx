import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DropTableModal } from './DropTableModal';
import { dbApi } from '../../api/db';
import { useTabStore } from '../../stores/tabStore';

vi.mock('../../api/db', () => ({
  dbApi: {
    executeQuery: vi.fn(),
    closeSession: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('DropTableModal', () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useTabStore.setState({
      tabs: [
        {
          id: 'tab-1',
          title: 'users',
          type: 'table',
          connectionId: 'conn-1',
          tableName: 'users',
          schemaName: 'public',
          autoCommit: true,
          queryContent: '',
        },
        {
          id: 'tab-2',
          title: 'orders',
          type: 'table',
          connectionId: 'conn-1',
          tableName: 'orders',
          schemaName: 'public',
          autoCommit: true,
          queryContent: '',
        },
      ],
      activeTabId: 'tab-1',
    });
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <DropTableModal
        isOpen={false}
        tableName="users"
        schemaName="public"
        connectionId="conn-1"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders modal with table name and requires exact confirmation name', async () => {
    render(
      <DropTableModal
        isOpen={true}
        tableName="users"
        schemaName="public"
        connectionId="conn-1"
        driver="postgres"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByRole('heading', { name: /drop table/i })).toBeInTheDocument();
    expect(screen.getByText('public.users')).toBeInTheDocument();

    const submitBtn = screen.getByTestId('confirm-drop-table-btn');
    expect(submitBtn).toBeDisabled();

    const input = screen.getByTestId('drop-table-confirm-input');
    fireEvent.change(input, { target: { value: 'wrong_name' } });
    expect(submitBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: 'users' } });
    expect(submitBtn).not.toBeDisabled();
  });

  it('executes DROP TABLE with CASCADE when checked and closes tabs', async () => {
    (dbApi.executeQuery as any).mockResolvedValue({
      columns: [],
      rows: [],
      execution_time_ms: 10,
    });

    render(
      <DropTableModal
        isOpen={true}
        tableName="users"
        schemaName="public"
        connectionId="conn-1"
        driver="postgres"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const cascadeCheckbox = screen.getByRole('checkbox');
    fireEvent.click(cascadeCheckbox);

    const input = screen.getByTestId('drop-table-confirm-input');
    fireEvent.change(input, { target: { value: 'users' } });

    const submitBtn = screen.getByTestId('confirm-drop-table-btn');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(dbApi.executeQuery).toHaveBeenCalledWith(
        'conn-1',
        'DROP TABLE "public"."users" CASCADE;'
      );
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    // Verify matching tab was closed
    const currentTabs = useTabStore.getState().tabs;
    expect(currentTabs.find((t) => t.tableName === 'users')).toBeUndefined();
    expect(currentTabs.find((t) => t.tableName === 'orders')).toBeDefined();
  });
});
