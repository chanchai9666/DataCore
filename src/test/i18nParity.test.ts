import { describe, it, expect } from 'vitest';
import en from '../locales/en.json';
import th from '../locales/th.json';

function getLeafKeys(obj: Record<string, any>, prefix = ''): Map<string, string> {
  let keys = new Map<string, string>();
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys = new Map([...keys, ...getLeafKeys(value, fullKey)]);
    } else {
      keys.set(fullKey, String(value));
    }
  }
  return keys;
}

describe('i18n Parity & Integrity', () => {
  const enKeys = getLeafKeys(en);
  const thKeys = getLeafKeys(th);

  it('should have 100% key parity between en.json and th.json', () => {
    const missingInTh = [...enKeys.keys()].filter((k) => !thKeys.has(k)).sort();
    const extraInTh = [...thKeys.keys()].filter((k) => !enKeys.has(k)).sort();

    expect(missingInTh, `Missing keys in th.json: ${missingInTh.join(', ')}`).toEqual([]);
    expect(extraInTh, `Unexpected extra keys in th.json: ${extraInTh.join(', ')}`).toEqual([]);
  });

  it('should not contain empty translation values in either locale', () => {
    enKeys.forEach((value, key) => {
      expect(value.trim(), `Empty value for key "${key}" in en.json`).not.toBe('');
    });
    thKeys.forEach((value, key) => {
      expect(value.trim(), `Empty value for key "${key}" in th.json`).not.toBe('');
    });
  });

  it('should preserve identical interpolation variables across en and th', () => {
    const interpolationRegex = /\{\{([^}]+)\}\}/g;
    enKeys.forEach((enVal, key) => {
      const thVal = thKeys.get(key) || '';
      const enVars = [...enVal.matchAll(interpolationRegex)].map((m) => m[1].trim()).sort();
      const thVars = [...thVal.matchAll(interpolationRegex)].map((m) => m[1].trim()).sort();
      expect(thVars, `Interpolation variable mismatch in key "${key}" (en: ${JSON.stringify(enVars)}, th: ${JSON.stringify(thVars)})`).toEqual(enVars);
    });
  });
});
