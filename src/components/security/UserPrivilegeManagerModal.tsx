import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Users,
  UserCheck,
  ShieldAlert,
  ShieldCheck,
  Key,
  Plus,
  Trash2,
  X,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { useConnectionStore } from '../../stores/connectionStore';
import {
  fetchDatabaseUsers,
  buildCreateUserSql,
  buildDropUserSql,
  buildAlterUserPasswordSql,
  buildGrantPrivilegeSql,
  buildRevokePrivilegeSql,
} from '../../api/userManagerApi';
import { dbApi } from '../../api/db';
import { showConfirmDialog } from '../../utils/dialog';
import type { DbUser, CreateUserOptions } from '../../types/userManager';

export interface UserPrivilegeManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId?: string;
}

export const UserPrivilegeManagerModal: React.FC<UserPrivilegeManagerModalProps> = ({
  isOpen,
  onClose,
  connectionId: propConnectionId,
}) => {
  const { connections } = useConnectionStore();

  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('');
  const [users, setUsers] = useState<DbUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<DbUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [activeTab, setActiveTab] = useState<'attributes' | 'privileges' | 'password'>('attributes');

  // Change password state
  const [newPassword, setNewPassword] = useState<string>('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState<boolean>(false);

  // Grant privilege state
  const [privilegeTarget, setPrivilegeTarget] = useState<string>('');
  const [selectedPrivileges, setSelectedPrivileges] = useState<string[]>(['SELECT']);

  // Create User Dialog state
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [createOptions, setCreateOptions] = useState<CreateUserOptions>({
    name: '',
    host: '%',
    password: '',
    isSuperuser: false,
    canLogin: true,
    canCreateDb: false,
  });
  const [isCreating, setIsCreating] = useState<boolean>(false);

  useEffect(() => {
    if (connections.length > 0) {
      const activeId = propConnectionId || connections[0].id;
      setSelectedConnectionId(activeId);
    }
  }, [connections, propConnectionId]);

  const currentConnection = connections.find((c) => c.id === selectedConnectionId);

  // Load database users
  const loadUsers = useCallback(async () => {
    if (!selectedConnectionId || !currentConnection) return;
    setIsLoading(true);
    try {
      const data = await fetchDatabaseUsers(selectedConnectionId, currentConnection.driver);
      setUsers(data);
      if (data.length > 0 && !selectedUser) {
        setSelectedUser(data[0]);
      } else if (selectedUser) {
        // Refresh selected user
        const updated = data.find((u) => u.name === selectedUser.name);
        if (updated) setSelectedUser(updated);
      }
    } catch (err: any) {
      console.error('Failed to load database users:', err);
      toast.error(err?.message || 'Failed to inspect database users.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedConnectionId, currentConnection, selectedUser]);

  useEffect(() => {
    if (isOpen && selectedConnectionId) {
      loadUsers();
    }
  }, [isOpen, selectedConnectionId, loadUsers]);

  // Handle Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createOptions.name.trim() || !currentConnection) {
      toast.error('Please enter a username.');
      return;
    }

    setIsCreating(true);
    try {
      const sql = buildCreateUserSql(createOptions, currentConnection.driver);
      await dbApi.executeDirectQuery(selectedConnectionId, sql);
      toast.success(`User '${createOptions.name}' created successfully.`);
      setIsCreateOpen(false);
      setCreateOptions({
        name: '',
        host: '%',
        password: '',
        isSuperuser: false,
        canLogin: true,
        canCreateDb: false,
      });
      await loadUsers();
    } catch (err: any) {
      toast.error(`Create user failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsCreating(false);
    }
  };

  // Handle Drop User
  const handleDropUser = async (user: DbUser) => {
    if (!currentConnection) return;
    const confirmed = await showConfirmDialog(
      `Drop user '${user.name}'? This cannot be undone and will revoke all assigned privileges.`,
      {
        title: 'Drop Database User',
        okLabel: 'Drop User',
        kind: 'error',
      }
    );
    if (!confirmed) return;

    try {
      const sql = buildDropUserSql(user.name, user.host, currentConnection.driver);
      await dbApi.executeDirectQuery(selectedConnectionId, sql);
      toast.success(`User '${user.name}' dropped.`);
      if (selectedUser?.name === user.name) {
        setSelectedUser(null);
      }
      await loadUsers();
    } catch (err: any) {
      toast.error(`Drop user failed: ${err?.message || 'Unknown error'}`);
    }
  };

  // Handle Password Update
  const handleUpdatePassword = async () => {
    if (!selectedUser || !newPassword || !currentConnection) return;
    setIsUpdatingPassword(true);
    try {
      const sql = buildAlterUserPasswordSql(
        selectedUser.name,
        newPassword,
        selectedUser.host,
        currentConnection.driver
      );
      await dbApi.executeDirectQuery(selectedConnectionId, sql);
      toast.success(`Password updated for user '${selectedUser.name}'.`);
      setNewPassword('');
    } catch (err: any) {
      toast.error(`Failed to update password: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  // Handle Grant Privilege
  const handleGrantPrivilege = async () => {
    if (!selectedUser || !privilegeTarget.trim() || !currentConnection) {
      toast.error('Please specify a target table or database.');
      return;
    }
    const privString = selectedPrivileges.join(', ');
    try {
      const sql = buildGrantPrivilegeSql(
        privString,
        privilegeTarget,
        selectedUser.name,
        selectedUser.host,
        currentConnection.driver
      );
      await dbApi.executeDirectQuery(selectedConnectionId, sql);
      toast.success(`Granted ${privString} on '${privilegeTarget}' to ${selectedUser.name}.`);
    } catch (err: any) {
      toast.error(`Grant privilege failed: ${err?.message || 'Unknown error'}`);
    }
  };

  // Handle Revoke Privilege
  const handleRevokePrivilege = async () => {
    if (!selectedUser || !privilegeTarget.trim() || !currentConnection) {
      toast.error('Please specify a target table or database.');
      return;
    }
    const privString = selectedPrivileges.join(', ');
    try {
      const sql = buildRevokePrivilegeSql(
        privString,
        privilegeTarget,
        selectedUser.name,
        selectedUser.host,
        currentConnection.driver
      );
      await dbApi.executeDirectQuery(selectedConnectionId, sql);
      toast.success(`Revoked ${privString} on '${privilegeTarget}' from ${selectedUser.name}.`);
    } catch (err: any) {
      toast.error(`Revoke privilege failed: ${err?.message || 'Unknown error'}`);
    }
  };

  // Filtered users
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase().trim();
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.host && u.host.toLowerCase().includes(q))
    );
  }, [users, searchQuery]);

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-100" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-5xl h-[82vh] bg-panel border border-line rounded-xl shadow-2xl flex flex-col overflow-hidden z-50 text-text">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-line bg-black/10 dark:bg-white/5">
            <div className="flex items-center gap-2.5">
              <Users className="w-5 h-5 text-indigo-400" />
              <div>
                <Dialog.Title className="text-sm font-semibold text-text">
                  Database Users, Roles & Privileges
                </Dialog.Title>
                <Dialog.Description className="text-xs text-muted">
                  Manage database accounts, grant and revoke table/database privileges, and configure authentication
                </Dialog.Description>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={selectedConnectionId}
                onChange={(e) => setSelectedConnectionId(e.target.value)}
                className="text-xs bg-black/10 dark:bg-white/5 border border-line rounded px-2.5 py-1.5 outline-none focus:border-accent text-text"
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.driver})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={loadUsers}
                disabled={isLoading}
                title="Refresh user list"
                className="p-1.5 rounded-md hover:bg-white/10 text-muted hover:text-text transition-colors border border-line"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>

              <Dialog.Close asChild>
                <button
                  type="button"
                  className="p-1 rounded text-muted hover:text-text hover:bg-white/10 transition-colors ml-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Main Layout: Left Users List, Right Details Panel */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Left Sidebar: User Accounts List */}
            <div className="w-72 border-r border-line flex flex-col bg-panel shrink-0">
              <div className="p-2.5 border-b border-line flex items-center gap-2">
                <div className="flex-1 flex items-center gap-1.5 px-2 py-1 rounded bg-black/10 dark:bg-white/5 border border-line text-xs">
                  <Search className="w-3.5 h-3.5 text-muted" />
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-transparent border-none outline-none text-xs text-text placeholder-muted/60 w-full"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(true)}
                  title="Add new user"
                  className="p-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-line/30">
                {isLoading && users.length === 0 ? (
                  <div className="p-8 text-center text-muted text-xs">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                    <span>Loading users...</span>
                  </div>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelected = selectedUser?.name === u.name;
                    return (
                      <button
                        key={`${u.name}-${u.host || 'pg'}`}
                        type="button"
                        data-testid={`user-list-item-${u.name}`}
                        onClick={() => setSelectedUser(u)}
                        className={`w-full text-left px-3 py-2.5 flex items-center justify-between text-xs transition-colors ${
                          isSelected
                            ? 'bg-blue-500/15 border-l-2 border-blue-500 text-text font-medium'
                            : 'hover:bg-white/5 text-muted'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          {u.isSuperuser ? (
                            <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          ) : (
                            <UserCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          )}
                          <div className="truncate">
                            <span className="text-text block truncate">{u.name}</span>
                            {u.host && (
                              <span className="text-[10px] text-muted block font-mono">
                                @{u.host}
                              </span>
                            )}
                          </div>
                        </div>

                        {u.isSuperuser && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 shrink-0 uppercase">
                            Admin
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Main Panel: User Details & Privilege Configuration */}
            <div className="flex-1 flex flex-col bg-panel min-h-0 overflow-hidden">
              {selectedUser ? (
                <>
                  {/* Selected User Header */}
                  <div className="px-6 py-4 border-b border-line bg-black/5 dark:bg-white/5 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h3 className="text-base font-semibold text-text">
                          {selectedUser.name}
                        </h3>
                        {selectedUser.host && (
                          <span className="text-xs text-muted font-mono">
                            @{selectedUser.host}
                          </span>
                        )}
                        {selectedUser.isSuperuser ? (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold uppercase">
                            Superuser
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-medium uppercase">
                            Standard Role
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDropUser(selectedUser)}
                      className="px-2.5 py-1.5 rounded border border-rose-500/30 hover:bg-rose-500/10 text-rose-400 text-xs font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Drop User</span>
                    </button>
                  </div>

                  {/* Tabs Bar */}
                  <div className="px-6 border-b border-line bg-panel flex items-center gap-4 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setActiveTab('attributes')}
                      className={`py-2.5 border-b-2 transition-colors ${
                        activeTab === 'attributes'
                          ? 'border-blue-500 text-blue-400'
                          : 'border-transparent text-muted hover:text-text'
                      }`}
                    >
                      Role Attributes
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('privileges')}
                      className={`py-2.5 border-b-2 transition-colors ${
                        activeTab === 'privileges'
                          ? 'border-blue-500 text-blue-400'
                          : 'border-transparent text-muted hover:text-text'
                      }`}
                    >
                      Grant / Revoke Privileges
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('password')}
                      className={`py-2.5 border-b-2 transition-colors ${
                        activeTab === 'password'
                          ? 'border-blue-500 text-blue-400'
                          : 'border-transparent text-muted hover:text-text'
                      }`}
                    >
                      Security & Password
                    </button>
                  </div>

                  {/* Tab Body */}
                  <div className="flex-1 overflow-y-auto p-6">
                    {/* TAB 1: Role Attributes */}
                    {activeTab === 'attributes' && (
                      <div className="max-w-xl space-y-4 text-xs">
                        <div className="p-4 rounded-lg border border-line bg-black/5 dark:bg-white/5 space-y-3">
                          <h4 className="font-semibold text-text">Account Capabilities:</h4>
                          <div className="space-y-2">
                            <label className="flex items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={selectedUser.isSuperuser}
                                readOnly
                                className="rounded border-line text-blue-600 focus:ring-0"
                              />
                              <span className="text-text font-medium">Superuser / Administrator</span>
                            </label>
                            <label className="flex items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={selectedUser.canLogin}
                                readOnly
                                className="rounded border-line text-blue-600 focus:ring-0"
                              />
                              <span className="text-text font-medium">Can Login (Connect to server)</span>
                            </label>
                            <label className="flex items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={selectedUser.canCreateDb}
                                readOnly
                                className="rounded border-line text-blue-600 focus:ring-0"
                              />
                              <span className="text-text font-medium">Can Create Databases</span>
                            </label>
                            <label className="flex items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={selectedUser.canCreateRole}
                                readOnly
                                className="rounded border-line text-blue-600 focus:ring-0"
                              />
                              <span className="text-text font-medium">Can Create Roles / Users</span>
                            </label>
                          </div>
                        </div>

                        {selectedUser.validUntil && (
                          <div className="p-3 rounded-lg border border-line bg-panel text-muted">
                            Password Expiry / Valid Until:{' '}
                            <span className="text-text font-mono font-medium">{selectedUser.validUntil}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB 2: Grant / Revoke Privileges */}
                    {activeTab === 'privileges' && (
                      <div className="max-w-xl space-y-5 text-xs">
                        <div className="p-4 rounded-lg border border-line bg-black/5 dark:bg-white/5 space-y-4">
                          <h4 className="font-semibold text-text">Assign Privileges:</h4>

                          <div>
                            <label className="block text-muted font-medium mb-1">
                              Target Table or Database (e.g. "users", "public.*", "db.*"):
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. orders"
                              value={privilegeTarget}
                              onChange={(e) => setPrivilegeTarget(e.target.value)}
                              className="w-full bg-panel border border-line rounded px-3 py-1.5 text-text outline-none focus:border-accent"
                            />
                          </div>

                          <div>
                            <label className="block text-muted font-medium mb-1.5">
                              Privilege Types:
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                              {['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL PRIVILEGES'].map((p) => {
                                const isChecked = selectedPrivileges.includes(p);
                                return (
                                  <label
                                    key={p}
                                    className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-white/5"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        if (isChecked) {
                                          setSelectedPrivileges(selectedPrivileges.filter((x) => x !== p));
                                        } else {
                                          setSelectedPrivileges([...selectedPrivileges, p]);
                                        }
                                      }}
                                      className="rounded border-line text-blue-600 focus:ring-0"
                                    />
                                    <span className="text-text font-mono font-medium">{p}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pt-2 border-t border-line/40">
                            <button
                              type="button"
                              onClick={handleGrantPrivilege}
                              className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1.5 transition-colors"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>GRANT</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleRevokePrivilege}
                              className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium flex items-center gap-1.5 transition-colors"
                            >
                              <ShieldAlert className="w-3.5 h-3.5" />
                              <span>REVOKE</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB 3: Security & Password */}
                    {activeTab === 'password' && (
                      <div className="max-w-md space-y-4 text-xs">
                        <div className="p-4 rounded-lg border border-line bg-black/5 dark:bg-white/5 space-y-3">
                          <h4 className="font-semibold text-text">Change Password:</h4>
                          <div>
                            <label className="block text-muted font-medium mb-1">
                              New Password for {selectedUser.name}:
                            </label>
                            <input
                              type="password"
                              placeholder="Enter new password"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              className="w-full bg-panel border border-line rounded px-3 py-1.5 text-text outline-none focus:border-accent"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={handleUpdatePassword}
                            disabled={!newPassword || isUpdatingPassword}
                            className="px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium flex items-center gap-1.5 transition-colors"
                          >
                            {isUpdatingPassword ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Key className="w-3.5 h-3.5" />
                            )}
                            <span>Update Password</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted text-xs">
                  Select a database user from the left list to view or edit privileges
                </div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>

      {/* Nested Create User Dialog */}
      {isCreateOpen && (
        <Dialog.Root open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-100" />
            <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 bg-panel border border-line rounded-xl shadow-2xl p-5 z-50 text-text text-xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-line">
                <h4 className="font-semibold text-sm">Add New Database User</h4>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="p-1 rounded text-muted hover:text-text"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateUser} className="space-y-3">
                <div>
                  <label className="block text-muted font-medium mb-1">Username:</label>
                  <input
                    type="text"
                    required
                    value={createOptions.name}
                    onChange={(e) => setCreateOptions({ ...createOptions, name: e.target.value })}
                    className="w-full bg-black/10 dark:bg-white/5 border border-line rounded px-2.5 py-1.5 text-text outline-none"
                  />
                </div>

                <div>
                  <label className="block text-muted font-medium mb-1">Password:</label>
                  <input
                    type="password"
                    value={createOptions.password}
                    onChange={(e) => setCreateOptions({ ...createOptions, password: e.target.value })}
                    className="w-full bg-black/10 dark:bg-white/5 border border-line rounded px-2.5 py-1.5 text-text outline-none"
                  />
                </div>

                <div className="space-y-2 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createOptions.isSuperuser}
                      onChange={(e) => setCreateOptions({ ...createOptions, isSuperuser: e.target.checked })}
                      className="rounded border-line text-blue-600 focus:ring-0"
                    />
                    <span className="text-text">Superuser / Admin</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createOptions.canLogin}
                      onChange={(e) => setCreateOptions({ ...createOptions, canLogin: e.target.checked })}
                      className="rounded border-line text-blue-600 focus:ring-0"
                    />
                    <span className="text-text">Can Login</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createOptions.canCreateDb}
                      onChange={(e) => setCreateOptions({ ...createOptions, canCreateDb: e.target.checked })}
                      className="rounded border-line text-blue-600 focus:ring-0"
                    />
                    <span className="text-text">Can Create Databases</span>
                  </label>
                </div>

                <div className="pt-3 border-t border-line flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateOpen(false)}
                    className="px-3 py-1.5 rounded border border-line hover:bg-white/10 text-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center gap-1.5"
                  >
                    {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    <span>Create User</span>
                  </button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </Dialog.Root>
  );
};

export default UserPrivilegeManagerModal;
