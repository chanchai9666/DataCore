import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Activity,
  RefreshCw,
  X,
  Loader2,
  StopCircle,
  Trash2,
  Search,
  Clock,
  Users,
  AlertOctagon,
  Copy,
  Check,
  Terminal,
} from 'lucide-react';
import { toast } from 'sonner';
import { useConnectionStore } from '../../stores/connectionStore';
import {
  fetchServerProcesses,
  computeActivitySummary,
  buildCancelQuerySql,
  buildTerminateSessionSql,
} from '../../api/activityMonitorApi';
import { dbApi } from '../../api/db';
import { showConfirmDialog } from '../../utils/dialog';
import type { ServerProcess, ActivitySummary } from '../../types/activityMonitor';

export interface ActivityMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId?: string;
}

export const ActivityMonitorModal: React.FC<ActivityMonitorModalProps> = ({
  isOpen,
  onClose,
  connectionId: propConnectionId,
}) => {
  const { connections } = useConnectionStore();

  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('');
  const [processes, setProcesses] = useState<ServerProcess[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [refreshIntervalSec, setRefreshIntervalSec] = useState<number>(0); // 0 = manual
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedProcess, setSelectedProcess] = useState<ServerProcess | null>(null);
  const [copiedQuery, setCopiedQuery] = useState<boolean>(false);

  // Initialize connection
  useEffect(() => {
    if (connections.length > 0) {
      const activeId = propConnectionId || connections[0].id;
      setSelectedConnectionId(activeId);
    }
  }, [connections, propConnectionId]);

  const currentConnection = connections.find((c) => c.id === selectedConnectionId);

  // Load process list
  const loadProcesses = useCallback(async () => {
    if (!selectedConnectionId || !currentConnection) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchServerProcesses(selectedConnectionId, currentConnection.driver);
      setProcesses(data);
    } catch (err: any) {
      console.error('Failed to fetch activity monitor processes:', err);
      setError(err?.message || 'Failed to inspect server processes.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedConnectionId, currentConnection]);

  // Initial load
  useEffect(() => {
    if (isOpen && selectedConnectionId) {
      loadProcesses();
    }
  }, [isOpen, selectedConnectionId, loadProcesses]);

  // Auto refresh timer
  useEffect(() => {
    if (!isOpen || refreshIntervalSec <= 0) return;
    const interval = setInterval(() => {
      loadProcesses();
    }, refreshIntervalSec * 1000);
    return () => clearInterval(interval);
  }, [isOpen, refreshIntervalSec, loadProcesses]);

  // Actions
  const handleCancelQuery = async (proc: ServerProcess) => {
    if (!currentConnection) return;
    const confirmed = await showConfirmDialog(
      `Cancel currently executing query for PID/ID ${proc.id}?`,
      {
        title: 'Cancel Query',
        okLabel: 'Cancel Query',
        kind: 'warning',
      }
    );
    if (!confirmed) return;

    try {
      const sql = buildCancelQuerySql(proc.id, currentConnection.driver);
      await dbApi.executeDirectQuery(selectedConnectionId, sql);
      toast.success(`Query cancelled for process ${proc.id}`);
      await loadProcesses();
    } catch (err: any) {
      toast.error(`Failed to cancel query: ${err?.message || 'Unknown error'}`);
    }
  };

  const handleTerminateSession = async (proc: ServerProcess) => {
    if (!currentConnection) return;
    const confirmed = await showConfirmDialog(
      `Terminate session and disconnect client (PID/ID ${proc.id}, User: ${proc.user})? Any active transactions will be rolled back.`,
      {
        title: 'Terminate Connection',
        okLabel: 'Terminate Session',
        kind: 'error',
      }
    );
    if (!confirmed) return;

    try {
      const sql = buildTerminateSessionSql(proc.id, currentConnection.driver);
      await dbApi.executeDirectQuery(selectedConnectionId, sql);
      toast.success(`Session terminated for process ${proc.id}`);
      await loadProcesses();
    } catch (err: any) {
      toast.error(`Failed to terminate session: ${err?.message || 'Unknown error'}`);
    }
  };

  const handleCopyQuery = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedQuery(true);
    setTimeout(() => setCopiedQuery(false), 2000);
    toast.success('Query copied to clipboard.');
  };

  // Summary
  const summary: ActivitySummary = useMemo(() => {
    return computeActivitySummary(processes);
  }, [processes]);

  // Filtered process list
  const filteredProcesses = useMemo(() => {
    if (!searchQuery.trim()) return processes;
    const q = searchQuery.toLowerCase().trim();
    return processes.filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        p.user.toLowerCase().includes(q) ||
        (p.database && p.database.toLowerCase().includes(q)) ||
        p.state.toLowerCase().includes(q) ||
        (p.query && p.query.toLowerCase().includes(q))
    );
  }, [processes, searchQuery]);

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-100" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-5xl h-[85vh] bg-panel border border-line rounded-xl shadow-2xl flex flex-col overflow-hidden z-50 text-text">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-line bg-black/10 dark:bg-white/5">
            <div className="flex items-center gap-2.5">
              <Activity className="w-5 h-5 text-emerald-400" />
              <div>
                <Dialog.Title className="text-sm font-semibold text-text">
                  Server Activity Monitor & Process List
                </Dialog.Title>
                <Dialog.Description className="text-xs text-muted">
                  Inspect active client sessions, running queries, lock waits, and terminate problematic processes
                </Dialog.Description>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Connection selector */}
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

              {/* Auto Refresh dropdown */}
              <select
                value={refreshIntervalSec}
                onChange={(e) => setRefreshIntervalSec(Number(e.target.value))}
                className="text-xs bg-black/10 dark:bg-white/5 border border-line rounded px-2.5 py-1.5 outline-none focus:border-accent text-text"
              >
                <option value={0}>Manual Refresh</option>
                <option value={2}>Auto: Every 2s</option>
                <option value={5}>Auto: Every 5s</option>
                <option value={10}>Auto: Every 10s</option>
                <option value={30}>Auto: Every 30s</option>
              </select>

              {/* Manual Refresh button */}
              <button
                type="button"
                data-testid="activity-refresh-btn"
                onClick={loadProcesses}
                disabled={isLoading}
                title="Refresh now"
                className="p-1.5 rounded-md hover:bg-white/10 text-muted hover:text-text transition-colors border border-line disabled:opacity-50"
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

          {/* Metric Badges Summary Bar */}
          <div className="px-5 py-2.5 border-b border-line bg-black/5 dark:bg-white/5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-muted">Total:</span>
                <span className="font-semibold text-text font-mono">{summary.totalConnections}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-muted">Active:</span>
                <span className="font-semibold text-emerald-400 font-mono">{summary.activeCount}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-gray-400" />
                <span className="text-muted">Idle:</span>
                <span className="font-semibold text-muted font-mono">{summary.idleCount}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-muted">Long-running (&gt;10s):</span>
                <span className="font-semibold text-amber-400 font-mono">{summary.longRunningCount}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-muted">Locked/Waiting:</span>
                <span className="font-semibold text-rose-400 font-mono">{summary.waitingCount}</span>
              </div>
            </div>

            {/* Quick Search Box */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-black/10 dark:bg-white/5 border border-line text-xs">
              <Search className="w-3.5 h-3.5 text-muted" />
              <input
                type="text"
                placeholder="Search query, user, PID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-xs text-text placeholder-muted/60 w-44"
              />
            </div>
          </div>

          {/* Processes Table Content */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-panel">
            {error ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-rose-400">
                <AlertOctagon className="w-10 h-10 mb-2" />
                <p className="text-xs font-medium">{error}</p>
                <button
                  type="button"
                  onClick={loadProcesses}
                  className="mt-3 px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-text text-xs"
                >
                  Retry
                </button>
              </div>
            ) : filteredProcesses.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted text-xs">
                {isLoading ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin mb-2 text-blue-500" />
                    <span>Loading server processes...</span>
                  </>
                ) : (
                  <span>No active processes found matching criteria.</span>
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="sticky top-0 bg-panel border-b border-line z-10 text-muted font-medium">
                    <tr>
                      <th className="py-2 px-3 w-20">PID / ID</th>
                      <th className="py-2 px-3 w-28">User</th>
                      <th className="py-2 px-3 w-28">Database</th>
                      <th className="py-2 px-3 w-28">Host</th>
                      <th className="py-2 px-3 w-24">State</th>
                      <th className="py-2 px-3 w-24">Duration</th>
                      <th className="py-2 px-3">Query / Command</th>
                      <th className="py-2 px-3 w-24 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/30 font-mono text-[11px]">
                    {filteredProcesses.map((proc) => {
                      const isSelected = selectedProcess?.id === proc.id;
                      const s = proc.state.toLowerCase();
                      const isActive = s.includes('active') || s === 'query';
                      const isWaiting = proc.isBlocked;

                      return (
                        <tr
                          key={proc.id}
                          onClick={() => setSelectedProcess(proc)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-blue-500/15'
                              : isWaiting
                              ? 'bg-rose-500/5 hover:bg-rose-500/10'
                              : isActive
                              ? 'bg-emerald-500/5 hover:bg-emerald-500/10'
                              : 'hover:bg-white/5'
                          }`}
                        >
                          <td className="py-2 px-3 text-text font-semibold">{proc.id}</td>
                          <td className="py-2 px-3 text-text truncate max-w-[110px]">
                            {proc.user}
                          </td>
                          <td className="py-2 px-3 text-muted truncate max-w-[110px]">
                            {proc.database || '-'}
                          </td>
                          <td className="py-2 px-3 text-muted truncate max-w-[110px]">
                            {proc.host || '-'}
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-medium uppercase ${
                                isWaiting
                                  ? 'bg-rose-500/20 text-rose-400'
                                  : isActive
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-white/5 text-muted'
                              }`}
                            >
                              {proc.state}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-text">
                            {proc.durationSeconds > 0 ? `${proc.durationSeconds}s` : '-'}
                          </td>
                          <td className="py-2 px-3 text-text/90 font-mono truncate max-w-[320px]">
                            {proc.query || proc.command || '-'}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {currentConnection?.driver?.toLowerCase() !== 'sqlite' && proc.query && isActive && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCancelQuery(proc);
                                  }}
                                  title="Cancel running query without disconnecting"
                                  className="p-1 rounded hover:bg-amber-500/20 text-amber-400 transition-colors"
                                >
                                  <StopCircle className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {currentConnection?.driver?.toLowerCase() !== 'sqlite' && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleTerminateSession(proc);
                                  }}
                                  title="Terminate session (kill connection)"
                                  className="p-1 rounded hover:bg-rose-500/20 text-rose-400 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Bottom Query Detail Drawer */}
            {selectedProcess && (
              <div className="border-t border-line bg-black/10 dark:bg-black/30 p-3 h-36 flex flex-col shrink-0">
                <div className="flex items-center justify-between pb-1.5 border-b border-line/50 text-xs">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-blue-400" />
                    <span className="font-semibold text-text">
                      PID {selectedProcess.id} ({selectedProcess.user}@{selectedProcess.host || 'local'})
                    </span>
                    {selectedProcess.waitEvent && (
                      <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 text-[10px] font-mono">
                        Wait Event: {selectedProcess.waitEvent}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {selectedProcess.query && (
                      <button
                        type="button"
                        onClick={() => handleCopyQuery(selectedProcess.query || '')}
                        className="px-2 py-0.5 rounded border border-line hover:bg-white/10 text-muted hover:text-text text-[11px] flex items-center gap-1 transition-colors"
                      >
                        {copiedQuery ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>Copy</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedProcess(null)}
                      className="p-0.5 text-muted hover:text-text rounded"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-auto mt-2 font-mono text-xs text-text select-text whitespace-pre-wrap">
                  {selectedProcess.query || 'No active query payload.'}
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default ActivityMonitorModal;
