import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserPrivilegeManagerModal } from './UserPrivilegeManagerModal';
import * as userManagerApi from '../../api/userManagerApi';
import { useConnectionStore } from '../../stores/connectionStore';
import type { ConnectionConfig } from '../../types/db';

vi.mock('../../api/userManagerApi', async () => {
  const actual = await vi.importActual<typeof userManagerApi>('../../api/userManagerApi');
  return {
    ...actual,
    fetchDatabaseUsers: vi.fn(),
  };
});

describe('UserPrivilegeManagerModal', () => {
  const mockConnections: ConnectionConfig[] = [
    {
      id: 'conn_1',
      name: 'Production PG',
      driver: 'postgres',
      database: 'prod_db',
    } as ConnectionConfig,
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    useConnectionStore.setState({
      connections: mockConnections,
      activeConnectionId: 'conn_1',
    });

    vi.mocked(userManagerApi.fetchDatabaseUsers).mockResolvedValue([
      {
        name: 'postgres',
        isSuperuser: true,
        canLogin: true,
        canCreateDb: true,
        canCreateRole: true,
        roles: ['admin_group', 'pg_read_all_data'],
      },
      {
        name: 'read_only_user',
        isSuperuser: false,
        canLogin: true,
        canCreateDb: false,
        canCreateRole: false,
        roles: [],
      },
    ]);
  });

  it('renders users list and displays attributes for selected user', async () => {
    render(
      <UserPrivilegeManagerModal
        isOpen={true}
        onClose={vi.fn()}
        connectionId="conn_1"
      />
    );

    expect(screen.getByText(/database users, roles & privileges/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('user-list-item-postgres')).toBeInTheDocument();
      expect(screen.getByTestId('user-list-item-read_only_user')).toBeInTheDocument();
    });

    // Check superuser badge
    expect(screen.getAllByText(/superuser/i).length).toBeGreaterThan(0);
  });

  it('filters users by search query', async () => {
    render(
      <UserPrivilegeManagerModal
        isOpen={true}
        onClose={vi.fn()}
        connectionId="conn_1"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-list-item-postgres')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search users/i);
    fireEvent.change(searchInput, { target: { value: 'read' } });

    expect(screen.queryByTestId('user-list-item-postgres')).not.toBeInTheDocument();
    expect(screen.getByTestId('user-list-item-read_only_user')).toBeInTheDocument();
  });

  it('loads database users without infinite re-render loops', async () => {
    render(
      <UserPrivilegeManagerModal
        isOpen={true}
        onClose={vi.fn()}
        connectionId="conn_1"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-list-item-postgres')).toBeInTheDocument();
    });

    // In an infinite loop, fetchDatabaseUsers is called multiple times continuously
    expect(userManagerApi.fetchDatabaseUsers).toHaveBeenCalledTimes(1);
  });

  it('renders assigned roles badges in user attributes tab', async () => {
    render(
      <UserPrivilegeManagerModal
        isOpen={true}
        onClose={vi.fn()}
        connectionId="conn_1"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-list-item-postgres')).toBeInTheDocument();
    });

    expect(screen.getByText('admin_group')).toBeInTheDocument();
    expect(screen.getByText('pg_read_all_data')).toBeInTheDocument();
  });

  it('renders all granular privileges in privileges tab', async () => {
    render(
      <UserPrivilegeManagerModal
        isOpen={true}
        onClose={vi.fn()}
        connectionId="conn_1"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-list-item-postgres')).toBeInTheDocument();
    });

    const privTabBtn = screen.getByRole('button', { name: /grant \/ revoke privileges/i });
    fireEvent.click(privTabBtn);

    expect(screen.getByTestId('privilege-checkbox-SELECT')).toBeInTheDocument();
    expect(screen.getByTestId('privilege-checkbox-INSERT')).toBeInTheDocument();
    expect(screen.getByTestId('privilege-checkbox-UPDATE')).toBeInTheDocument();
    expect(screen.getByTestId('privilege-checkbox-DELETE')).toBeInTheDocument();
    expect(screen.getByTestId('privilege-checkbox-CREATE')).toBeInTheDocument();
    expect(screen.getByTestId('privilege-checkbox-DROP')).toBeInTheDocument();
    expect(screen.getByTestId('privilege-checkbox-ALTER')).toBeInTheDocument();
    expect(screen.getByTestId('privilege-checkbox-REFERENCES')).toBeInTheDocument();
    expect(screen.getByTestId('privilege-checkbox-INDEX')).toBeInTheDocument();
    expect(screen.getByTestId('privilege-checkbox-TRIGGER')).toBeInTheDocument();
    expect(screen.getByTestId('privilege-checkbox-ALL PRIVILEGES')).toBeInTheDocument();
  });
});
