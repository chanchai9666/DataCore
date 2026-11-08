import { describe, it, expect, beforeEach } from 'vitest';
import { usePendingChangesStore } from './pendingChangesStore';

describe('pendingChangesStore', () => {
  beforeEach(() => {
    usePendingChangesStore.getState().clearAll();
  });

  it('stages cell edits and checks pending status', () => {
    const tableKey = 'conn1.users';
    expect(usePendingChangesStore.getState().hasPendingChanges(tableKey)).toBe(false);

    usePendingChangesStore.getState().stageCellEdit(tableKey, {
      rowIndex: 0,
      colIndex: 1,
      colName: 'name',
      oldValue: 'Alice',
      newValue: 'Alice Smith',
    });

    expect(usePendingChangesStore.getState().hasPendingChanges(tableKey)).toBe(true);
    expect(usePendingChangesStore.getState().getPendingChangesCount(tableKey)).toBe(1);

    const changes = usePendingChangesStore.getState().getTableChanges(tableKey);
    expect(changes.cellEdits['0:1']).toBeDefined();
    expect(changes.cellEdits['0:1'].newValue).toBe('Alice Smith');
  });

  it('clears cell edit when new value is set back to old value', () => {
    const tableKey = 'conn1.users';
    usePendingChangesStore.getState().stageCellEdit(tableKey, {
      rowIndex: 0,
      colIndex: 1,
      colName: 'name',
      oldValue: 'Alice',
      newValue: 'Bob',
    });
    expect(usePendingChangesStore.getState().getPendingChangesCount(tableKey)).toBe(1);

    // Revert to old value
    usePendingChangesStore.getState().stageCellEdit(tableKey, {
      rowIndex: 0,
      colIndex: 1,
      colName: 'name',
      oldValue: 'Alice',
      newValue: 'Alice',
    });
    expect(usePendingChangesStore.getState().getPendingChangesCount(tableKey)).toBe(0);
    expect(usePendingChangesStore.getState().hasPendingChanges(tableKey)).toBe(false);
  });

  it('stages row additions and deletions', () => {
    const tableKey = 'conn1.users';
    usePendingChangesStore.getState().stageAddRow(tableKey, { name: 'New User' });
    usePendingChangesStore.getState().stageDeleteRow(tableKey, 5);

    expect(usePendingChangesStore.getState().getPendingChangesCount(tableKey)).toBe(2);

    usePendingChangesStore.getState().unstageDeleteRow(tableKey, 5);
    expect(usePendingChangesStore.getState().getPendingChangesCount(tableKey)).toBe(1);
  });

  it('discards all staged changes for a table', () => {
    const tableKey = 'conn1.users';
    usePendingChangesStore.getState().stageAddRow(tableKey, { name: 'User 1' });
    usePendingChangesStore.getState().stageDeleteRow(tableKey, 2);

    usePendingChangesStore.getState().discardChanges(tableKey);
    expect(usePendingChangesStore.getState().hasPendingChanges(tableKey)).toBe(false);
    expect(usePendingChangesStore.getState().getPendingChangesCount(tableKey)).toBe(0);
  });

  it('manages auto-commit mode per tableKey', () => {
    const tableKey1 = 'conn1.users';
    const tableKey2 = 'conn1.orders';

    // Default should be true (Auto-Commit on)
    expect(usePendingChangesStore.getState().isAutoCommitMode(tableKey1)).toBe(true);
    expect(usePendingChangesStore.getState().isAutoCommitMode(tableKey2)).toBe(true);

    // Toggle tableKey1 to false (Staging mode)
    usePendingChangesStore.getState().setAutoCommitMode(tableKey1, false);
    expect(usePendingChangesStore.getState().isAutoCommitMode(tableKey1)).toBe(false);
    expect(usePendingChangesStore.getState().isAutoCommitMode(tableKey2)).toBe(true);

    // Toggle tableKey1 back to true
    usePendingChangesStore.getState().setAutoCommitMode(tableKey1, true);
    expect(usePendingChangesStore.getState().isAutoCommitMode(tableKey1)).toBe(true);
  });
});
