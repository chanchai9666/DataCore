import React, { useState, useMemo } from 'react';
import { Shield, ShieldAlert, Trash2, Plus, X } from 'lucide-react';
import { dbApi } from '../../../api/db';
import {
  buildToggleRlsSql,
  buildCreatePolicySql,
  buildDropPolicySql,
  type RlsPolicy,
  type PolicyCommand,
} from '../../../api/securityHelpers';
import { useAuditLogStore } from '../../../stores/auditLogStore';

export interface RlsSecurityTabProps {
  tabId: string;
  connectionId: string;
  tableName: string;
  schemaName?: string;
  driver?: string;
  isDark: boolean;
  rlsEnabled: boolean;
  rlsPolicies: RlsPolicy[];
  loadStructure: () => Promise<void>;
  showStatus: (type: 'success' | 'error', text: string) => void;
  isAddModalOpen?: boolean;
  onCloseAddModal?: () => void;
  onOpenAddModal?: () => void;
  onToggleRls?: () => void;
}

export const RlsSecurityTab: React.FC<RlsSecurityTabProps> = ({
  tabId,
  connectionId,
  tableName,
  schemaName,
  driver = 'postgres',
  isDark,
  rlsEnabled,
  rlsPolicies,
  loadStructure,
  showStatus,
  isAddModalOpen: controlledAddOpen,
  onCloseAddModal,
  onOpenAddModal,
  onToggleRls,
}) => {
  const [internalAddOpen, setInternalAddOpen] = useState(false);
  const isAddOpen = controlledAddOpen !== undefined ? controlledAddOpen : internalAddOpen;
  const setAddOpen = (open: boolean) => {
    if (controlledAddOpen !== undefined && onCloseAddModal && !open) {
      onCloseAddModal();
    } else if (controlledAddOpen !== undefined && onOpenAddModal && open) {
      onOpenAddModal();
    } else {
      setInternalAddOpen(open);
    }
  };

  const [submitting, setSubmitting] = useState(false);

  // Add Policy form states
  const [newPolicyName, setNewPolicyName] = useState('');
  const [newPolicyCmd, setNewPolicyCmd] = useState<PolicyCommand>('ALL');
  const [newPolicyRoles, setNewPolicyRoles] = useState('PUBLIC');
  const [newPolicyPermissive, setNewPolicyPermissive] = useState(true);
  const [newPolicyUsingExpr, setNewPolicyUsingExpr] = useState('');
  const [newPolicyCheckExpr, setNewPolicyCheckExpr] = useState('');

  // Drop Policy state
  const [dropPolicyTarget, setDropPolicyTarget] = useState<RlsPolicy | null>(null);

  const openAddPolicy = () => {
    setNewPolicyName(`policy_${tableName}_isolation`);
    setNewPolicyCmd('ALL');
    setNewPolicyRoles('PUBLIC');
    setNewPolicyPermissive(true);
    setNewPolicyUsingExpr('');
    setNewPolicyCheckExpr('');
    setAddOpen(true);
  };

  // Toggle RLS
  const handleToggleRls = async () => {
    if (onToggleRls) {
      onToggleRls();
      return;
    }
    if (driver !== 'postgres') {
      showStatus('error', 'Row-Level Security (RLS) is natively supported only on PostgreSQL.');
      return;
    }
    setSubmitting(true);
    try {
      const nextState = !rlsEnabled;
      const sql = buildToggleRlsSql(tableName, schemaName, nextState, driver);
      await dbApi.executeQuery(tabId, sql);
      useAuditLogStore.getState().addLog({
        connectionId,
        action: 'SECURITY',
        query: sql,
        status: 'SUCCESS',
      });
      showStatus('success', `Row-Level Security ${nextState ? 'enabled' : 'disabled'} successfully.`);
      await loadStructure();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus('error', `Failed to toggle RLS: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Preview SQL for Add Policy
  const addPolicyPreviewSql = useMemo(() => {
    if (!newPolicyName.trim()) return '';
    try {
      const rolesArray = newPolicyRoles.split(',').map((r) => r.trim()).filter(Boolean);
      return buildCreatePolicySql({
        policyName: newPolicyName.trim(),
        tableName,
        schemaName,
        driver,
        command: newPolicyCmd,
        roles: rolesArray.length > 0 ? rolesArray : ['PUBLIC'],
        permissive: newPolicyPermissive,
        usingExpr: newPolicyUsingExpr.trim() || undefined,
        checkExpr: newPolicyCheckExpr.trim() || undefined,
      });
    } catch {
      return '';
    }
  }, [newPolicyName, tableName, schemaName, driver, newPolicyCmd, newPolicyRoles, newPolicyPermissive, newPolicyUsingExpr, newPolicyCheckExpr]);

  // Handle Add Policy Submit
  const handleAddPolicySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (driver !== 'postgres') {
      showStatus('error', 'Row-Level Security (RLS) policies are natively supported only on PostgreSQL.');
      return;
    }
    if (!newPolicyName.trim()) return;
    setSubmitting(true);
    try {
      const rolesArray = newPolicyRoles.split(',').map((r) => r.trim()).filter(Boolean);
      const sql = buildCreatePolicySql({
        policyName: newPolicyName.trim(),
        tableName,
        schemaName,
        driver,
        command: newPolicyCmd,
        roles: rolesArray.length > 0 ? rolesArray : ['PUBLIC'],
        permissive: newPolicyPermissive,
        usingExpr: newPolicyUsingExpr.trim() || undefined,
        checkExpr: newPolicyCheckExpr.trim() || undefined,
      });
      await dbApi.executeQuery(tabId, sql);
      useAuditLogStore.getState().addLog({
        connectionId,
        action: 'SECURITY',
        query: sql,
        status: 'SUCCESS',
      });
      setAddOpen(false);
      showStatus('success', `Policy "${newPolicyName.trim()}" created successfully.`);
      await loadStructure();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus('error', `Failed to create policy: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Drop Policy Confirm
  const handleDropPolicyConfirm = async () => {
    if (!dropPolicyTarget) return;
    if (driver !== 'postgres') {
      showStatus('error', 'Row-Level Security (RLS) policies are natively supported only on PostgreSQL.');
      return;
    }
    setSubmitting(true);
    try {
      const sql = buildDropPolicySql(dropPolicyTarget.name, tableName, schemaName, driver);
      await dbApi.executeQuery(tabId, sql);
      useAuditLogStore.getState().addLog({
        connectionId,
        action: 'SECURITY',
        query: sql,
        status: 'SUCCESS',
      });
      const droppedName = dropPolicyTarget.name;
      setDropPolicyTarget(null);
      showStatus('success', `Policy "${droppedName}" dropped successfully.`);
      await loadStructure();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus('error', `Failed to drop policy: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* RLS Status Card */}
      <div
        data-testid="rls-status-banner"
        className={`p-3.5 rounded-lg border flex items-center justify-between ${
          rlsEnabled
            ? isDark
              ? 'bg-emerald-950/20 border-emerald-900/40 text-emerald-300'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : isDark
            ? 'bg-amber-950/20 border-amber-900/40 text-amber-300'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}
      >
        <div className="flex items-center space-x-3">
          <Shield className={`w-5 h-5 flex-shrink-0 ${rlsEnabled ? 'text-emerald-400' : 'text-amber-400'}`} />
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-xs">Row-Level Security (RLS)</span>
              <span
                data-testid="rls-status-state"
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  rlsEnabled
                    ? 'bg-emerald-900/80 text-emerald-200 border border-emerald-700'
                    : 'bg-amber-900/80 text-amber-200 border border-amber-700'
                }`}
              >
                {rlsEnabled ? 'ENABLED' : 'DISABLED'}
              </span>
            </div>
            <p className="text-[11px] opacity-80 mt-0.5">
              {rlsEnabled
                ? 'Row-level access policies are strictly enforced for queries on this table.'
                : 'RLS is currently disabled. All rows are visible according to normal role permissions.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          data-testid="rls-toggle-status-btn"
          onClick={handleToggleRls}
          disabled={submitting || driver !== 'postgres'}
          title={driver !== 'postgres' ? 'RLS is only supported on PostgreSQL' : undefined}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            driver !== 'postgres'
              ? 'bg-gray-700 opacity-50 cursor-not-allowed'
              : rlsEnabled
              ? 'bg-amber-700/80 hover:bg-amber-600 text-white'
              : 'bg-emerald-700/80 hover:bg-emerald-600 text-white'
          }`}
        >
          {rlsEnabled ? 'Disable RLS' : 'Enable RLS'}
        </button>
      </div>

      {/* Policies Section */}
      {rlsPolicies.length === 0 ? (
        <div
          data-testid="no-policies-view"
          className={`p-8 text-center border rounded-lg ${
            isDark ? 'border-gray-800 bg-gray-900/40 text-gray-400' : 'border-gray-200 bg-white text-gray-500'
          }`}
        >
          <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-30 text-amber-400" />
          <h4 className="font-semibold text-xs mb-1">No Security Policies Defined</h4>
          <p className="text-[11px] max-w-sm mx-auto mb-3 opacity-80">
            {rlsEnabled
              ? 'Because RLS is enabled without any policy, queries executed by non-superusers will return zero rows.'
              : 'Add security policies to control row access based on user role or column values.'}
          </p>
          <button
            type="button"
            data-testid="create-policy-empty-btn"
            onClick={openAddPolicy}
            className="px-3 py-1.5 rounded text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center space-x-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Security Policy</span>
          </button>
        </div>
      ) : (
        <div
          className={`border rounded-lg overflow-hidden ${
            isDark ? 'border-gray-800 bg-gray-900/50' : 'border-gray-200 bg-white'
          }`}
        >
          <div
            className={`flex items-center justify-between px-3 py-2 border-b text-xs font-semibold ${
              isDark ? 'bg-gray-900 border-gray-800 text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-700'
            }`}
          >
            <span>Configured Policies ({rlsPolicies.length})</span>
            <button
              type="button"
              data-testid="add-policy-table-btn"
              onClick={openAddPolicy}
              className="px-2 py-1 rounded text-[11px] font-medium bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center space-x-1 transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>Add Policy</span>
            </button>
          </div>

          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr
                className={`border-b text-[11px] font-medium ${
                  isDark ? 'bg-gray-900/80 border-gray-800 text-gray-400' : 'bg-gray-50 border-gray-200 text-gray-500'
                }`}
              >
                <th className="py-2 px-3">Policy Name</th>
                <th className="py-2 px-3 w-20 text-center">Command</th>
                <th className="py-2 px-3 w-32">Roles</th>
                <th className="py-2 px-3">USING Expression</th>
                <th className="py-2 px-3">WITH CHECK Expression</th>
                <th className="py-2 px-3 w-16 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {rlsPolicies.map((p) => (
                <tr
                  key={p.name}
                  data-testid={`policy-row-${p.name}`}
                  className={`transition-colors ${
                    isDark ? 'hover:bg-gray-800/40 text-gray-200' : 'hover:bg-gray-50 text-gray-800 divide-gray-100'
                  }`}
                >
                  <td className="py-2 px-3 font-medium font-mono text-xs text-blue-300">
                    {p.name}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-gray-800 text-gray-300 border border-gray-700">
                      {p.command}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-gray-300 font-mono text-[11px]">
                    {p.roles.join(', ')}
                  </td>
                  <td className="py-2 px-3 font-mono text-[11px] text-gray-400">
                    {p.usingExpr ? (
                      <span className="text-emerald-300/90">{p.usingExpr}</span>
                    ) : (
                      <span className="text-gray-600">-</span>
                    )}
                  </td>
                  <td className="py-2 px-3 font-mono text-[11px] text-gray-400">
                    {p.checkExpr ? (
                      <span className="text-blue-300/90">{p.checkExpr}</span>
                    ) : (
                      <span className="text-gray-600">-</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button
                      type="button"
                      data-testid={`drop-policy-btn-${p.name}`}
                      onClick={() => setDropPolicyTarget(p)}
                      title="Drop Policy"
                      className="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Policy Modal */}
      {isAddOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <div
            className={`w-full max-w-lg rounded-lg shadow-xl border overflow-hidden ${
              isDark ? 'bg-gray-900 border-gray-700 text-gray-200' : 'bg-white border-gray-300 text-gray-900'
            }`}
          >
            <div
              className={`flex items-center justify-between px-4 py-3 border-b ${
                isDark ? 'border-gray-800 bg-gray-850' : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold">Add RLS Policy to {tableName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="p-1 rounded text-gray-400 hover:text-gray-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddPolicySubmit} className="p-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-medium mb-1">
                  Policy Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  data-testid="new-policy-name-input"
                  placeholder="e.g. policy_user_isolation, tenant_access"
                  value={newPolicyName}
                  onChange={(e) => setNewPolicyName(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded border text-xs font-mono outline-none focus:border-emerald-500 ${
                    isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Command Action</label>
                  <select
                    value={newPolicyCmd}
                    onChange={(e) => setNewPolicyCmd(e.target.value as PolicyCommand)}
                    className={`w-full px-2.5 py-1.5 rounded border text-xs outline-none focus:border-emerald-500 ${
                      isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    <option value="ALL">ALL (SELECT, INSERT, UPDATE, DELETE)</option>
                    <option value="SELECT">SELECT</option>
                    <option value="INSERT">INSERT</option>
                    <option value="UPDATE">UPDATE</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium mb-1">Target Roles</label>
                  <input
                    type="text"
                    placeholder="PUBLIC or authenticated, anon"
                    value={newPolicyRoles}
                    onChange={(e) => setNewPolicyRoles(e.target.value)}
                    className={`w-full px-2.5 py-1.5 rounded border text-xs font-mono outline-none focus:border-emerald-500 ${
                      isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1">
                  USING Expression (Filter Rows for Read / Delete / Update Old)
                </label>
                <textarea
                  rows={2}
                  data-testid="new-policy-using-input"
                  placeholder="e.g. user_id = current_user OR auth.uid() = user_id"
                  value={newPolicyUsingExpr}
                  onChange={(e) => setNewPolicyUsingExpr(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded border text-xs font-mono outline-none focus:border-emerald-500 ${
                    isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>

              <div>
                <label className="block font-medium mb-1">
                  WITH CHECK Expression (Validate New Rows on Insert / Update)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. user_id = current_user"
                  value={newPolicyCheckExpr}
                  onChange={(e) => setNewPolicyCheckExpr(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded border text-xs font-mono outline-none focus:border-emerald-500 ${
                    isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>

              {addPolicyPreviewSql && (
                <div>
                  <label className="block font-medium mb-1 text-gray-400">SQL Preview</label>
                  <div
                    data-testid="add-policy-preview-sql"
                    className="p-2 rounded bg-gray-950 border border-gray-800 font-mono text-[11px] text-emerald-300 select-text break-all"
                  >
                    {addPolicyPreviewSql}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className={`px-3 py-1.5 rounded transition-colors ${
                    isDark ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="confirm-add-policy-btn"
                  disabled={submitting || !newPolicyName.trim()}
                  className="px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drop Policy Confirmation Modal */}
      {dropPolicyTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <div
            className={`w-full max-w-sm rounded-lg shadow-xl border overflow-hidden ${
              isDark ? 'bg-gray-900 border-gray-700 text-gray-200' : 'bg-white border-gray-300 text-gray-900'
            }`}
          >
            <div className="p-4 space-y-3 text-xs">
              <div className="flex items-center space-x-2 text-red-400 font-semibold text-sm">
                <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                <h3 className="text-sm font-semibold">Drop RLS Policy</h3>
              </div>

              <p className="text-gray-300">
                Are you sure you want to drop policy{' '}
                <strong className="text-white font-mono bg-red-950/60 px-1 py-0.5 rounded border border-red-900/60">
                  {dropPolicyTarget.name}
                </strong>{' '}
                from table <strong className="font-mono text-white">{tableName}</strong>?
              </p>

              <div className="p-2 rounded bg-gray-950 border border-gray-800 font-mono text-[11px] text-red-300">
                {buildDropPolicySql(dropPolicyTarget.name, tableName, schemaName, driver)}
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDropPolicyTarget(null)}
                  className={`px-3 py-1.5 rounded transition-colors ${
                    isDark ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="confirm-drop-policy-btn"
                  onClick={handleDropPolicyConfirm}
                  disabled={submitting}
                  className="px-3.5 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white font-medium shadow-sm transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Dropping...' : 'Drop Policy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
