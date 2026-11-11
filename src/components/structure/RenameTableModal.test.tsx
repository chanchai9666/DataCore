import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RenameTableModal } from './RenameTableModal';
import { dbApi } from '../../api/db';
import { useTabStore } from '../../stores/tabStore';

vi.mock('../../api/db', () => ({
  dbApi: {
    executeDirectQuery: vi.fn().mockResolvedValue({ columns: [], rows: [], execution_time_ms: 1 }),
  },
}));

describe('RenameTableModal', () => {
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
      <RenameTableModal
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

  it('renders modal with table details and preview', () => {
    render(
      <RenameTableModal
        isOpen={true}
        tableName="users"
        schemaName="public"
        connectionId="conn-1"
        driver="postgres"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByRole('heading', { name: 'Rename Table' })).toBeInTheDocument();
    expect(screen.getByText('public.users')).toBeInTheDocument();
    expect(screen.getByLabelText(/New Table Name/i)).toHaveValue('users');
    expect(screen.getByText(/ALTER TABLE "public"\."users" RENAME TO "users";/i)).toBeInTheDocument();
  });

  it('validates that new table name cannot be empty', async () => {
    render(
      <RenameTableModal
        isOpen={true}
        tableName="users"
        schemaName="public"
        connectionId="conn-1"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const input = screen.getByLabelText(/New Table Name/i);
    fireEvent.change(input, { target: { value: '   ' } });

    const submitBtn = screen.getByRole('button', { name: /Rename/i });
    fireEvent.click(submitBtn);

    expect(screen.getByText('Please provide a new table name.')).toBeInTheDocument();
    expect(dbApi.executeDirectQuery).not.toHaveBeenCalled();
  });

  it('validates that new table name cannot be identical to current name', async () => {
    render(
      <RenameTableModal
        isOpen={true}
        tableName="users"
        schemaName="public"
        connectionId="conn-1"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /Rename/i });
    fireEvent.click(submitBtn);

    expect(
      screen.getByText('The new table name must be different from the current name.')
    ).toBeInTheDocument();
    expect(dbApi.executeDirectQuery).not.toHaveBeenCalled();
  });

  it('executes rename query, synchronizes open tabs, and triggers onSuccess', async () => {
    render(
      <RenameTableModal
        isOpen={true}
        tableName="users"
        schemaName="public"
        connectionId="conn-1"
        driver="postgres"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const input = screen.getByLabelText(/New Table Name/i);
    fireEvent.change(input, { target: { value: 'customers' } });

    const submitBtn = screen.getByRole('button', { name: /Rename/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(dbApi.executeDirectQuery).toHaveBeenCalledWith(
        'conn-1',
        'ALTER TABLE "public"."users" RENAME TO "customers";'
      );
    });

    // Check tab synchronization
    const { tabs } = useTabStore.getState();
    const updatedTab = tabs.find((t) => t.id === 'tab-1');
    expect(updatedTab?.tableName).toBe('customers');
    expect(updatedTab?.title).toBe('customers');

    // Unrelated tab untouched
    const untouchedTab = tabs.find((t) => t.id === 'tab-2');
    expect(untouchedTab?.tableName).toBe('orders');

    expect(onSuccess).toHaveBeenCalledWith('customers');
    expect(onClose).toHaveBeenCalled();
  });

  it('displays error if execution fails', async () => {
    (dbApi.executeDirectQuery as any).mockRejectedValueOnce(
      new Error('relation "customers" already exists')
    );

    render(
      <RenameTableModal
        isOpen={true}
        tableName="users"
        schemaName="public"
        connectionId="conn-1"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const input = screen.getByLabelText(/New Table Name/i);
    fireEvent.change(input, { target: { value: 'customers' } });

    const submitBtn = screen.getByRole('button', { name: /Rename/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('relation "customers" already exists')).toBeInTheDocument();
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
