import { describe, it, expect, beforeEach } from 'vitest';
import { useFastEditStore } from './fastEditStore';

describe('fastEditStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useFastEditStore.getState().reset();
  });

  it('defaults to false for unknown connections and persists enabled state per connection', () => {
    expect(useFastEditStore.getState().isFastEditEnabled('conn-1')).toBe(false);
    expect(useFastEditStore.getState().isFastEditEnabled(undefined)).toBe(false);

    useFastEditStore.getState().setFastEditEnabled('conn-1', true);
    expect(useFastEditStore.getState().isFastEditEnabled('conn-1')).toBe(true);
    expect(useFastEditStore.getState().isFastEditEnabled('conn-2')).toBe(false);

    const saved = JSON.parse(localStorage.getItem('datacore-fast-edit-mode') || '{}');
    expect(saved['conn-1']).toBe(true);
  });

  it('toggles fast edit state and persists across reset/reload', () => {
    const nextOn = useFastEditStore.getState().toggleFastEdit('conn-a');
    expect(nextOn).toBe(true);
    expect(useFastEditStore.getState().isFastEditEnabled('conn-a')).toBe(true);

    const nextOff = useFastEditStore.getState().toggleFastEdit('conn-a');
    expect(nextOff).toBe(false);
    expect(useFastEditStore.getState().isFastEditEnabled('conn-a')).toBe(false);
  });
});
