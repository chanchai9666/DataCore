import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { openSession, closeSession, disconnectConnection, clearSessionCache } from './db';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('dbApi session management & deduplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSessionCache();
  });

  it('calls invoke("open_session") when openSession is called', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await openSession('conn-1', 'tab-1');

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('open_session', {
      connectionId: 'conn-1',
      tabId: 'tab-1',
    });
  });

  it('deduplicates concurrent in-flight calls to openSession for the same connection and tab', async () => {
    let resolveInvoke: () => void = () => {};
    const pendingPromise = new Promise<void>((resolve) => {
      resolveInvoke = resolve;
    });

    vi.mocked(invoke).mockReturnValueOnce(pendingPromise);

    const call1 = openSession('conn-1', 'tab-1');
    const call2 = openSession('conn-1', 'tab-1');

    // Both should be awaiting the same promise; invoke should only be called once
    expect(invoke).toHaveBeenCalledTimes(1);

    resolveInvoke();
    await Promise.all([call1, call2]);

    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('returns immediately without calling invoke if session is already established', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await openSession('conn-1', 'tab-1');
    expect(invoke).toHaveBeenCalledTimes(1);

    // Second call after resolution should not call invoke again
    await openSession('conn-1', 'tab-1');
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('clears in-flight promise on error so subsequent call can retry', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('Connection failed'));

    await expect(openSession('conn-1', 'tab-1')).rejects.toThrow('Connection failed');
    expect(invoke).toHaveBeenCalledTimes(1);

    // Next attempt should call invoke again
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await expect(openSession('conn-1', 'tab-1')).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('invalidates established session when closeSession is called', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await openSession('conn-1', 'tab-1');
    expect(invoke).toHaveBeenCalledTimes(1);

    await closeSession('tab-1');
    expect(invoke).toHaveBeenCalledWith('close_session', { tabId: 'tab-1' });

    // Next openSession for tab-1 should invoke again
    await openSession('conn-1', 'tab-1');
    expect(invoke).toHaveBeenCalledTimes(3); // open_session, close_session, open_session
  });

  it('invalidates all established sessions for a connection when disconnectConnection is called', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await openSession('conn-1', 'tab-1');
    await openSession('conn-1', 'tab-2');
    expect(invoke).toHaveBeenCalledTimes(2);

    await disconnectConnection('conn-1');
    expect(invoke).toHaveBeenCalledWith('disconnect_connection', { connectionId: 'conn-1' });

    // Both tab-1 and tab-2 should invoke again
    await openSession('conn-1', 'tab-1');
    await openSession('conn-1', 'tab-2');
    expect(invoke).toHaveBeenCalledTimes(5);
  });
});
