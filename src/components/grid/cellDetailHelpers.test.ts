import { describe, it, expect } from 'vitest';
import { detectDateTime, detectImage } from './cellDetailHelpers';

describe('detectDateTime', () => {
  it('detects ISO 8601 strings and formats local, utc, and relative times', () => {
    const iso = '2026-11-16T09:00:00.000Z';
    const result = detectDateTime(iso);
    expect(result).not.toBeNull();
    expect(result?.isDateTime).toBe(true);
    expect(result?.utcFormatted).toBe('2026-11-16T09:00:00.000Z');
    expect(result?.localFormatted).toContain('2026');
    expect(typeof result?.relativeFormatted).toBe('string');
  });

  it('detects 10-digit unix timestamps in seconds', () => {
    const unixSeconds = 1731747600; // 2024-11-16T09:00:00Z
    const result = detectDateTime(unixSeconds);
    expect(result).not.toBeNull();
    expect(result?.isDateTime).toBe(true);
    expect(result?.utcFormatted).toContain('2024');
  });

  it('detects 13-digit unix timestamps in milliseconds', () => {
    const unixMs = 1731747600000;
    const result = detectDateTime(unixMs);
    expect(result).not.toBeNull();
    expect(result?.isDateTime).toBe(true);
    expect(result?.utcFormatted).toContain('2024');
  });

  it('returns null for non-datetime strings or numbers', () => {
    expect(detectDateTime('Hello world')).toBeNull();
    expect(detectDateTime(42)).toBeNull();
    expect(detectDateTime(null)).toBeNull();
    expect(detectDateTime(true)).toBeNull();
  });
});

describe('detectImage', () => {
  it('detects base64 data image URIs', () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const result = detectImage(dataUri);
    expect(result).not.toBeNull();
    expect(result?.isImage).toBe(true);
    expect(result?.src).toBe(dataUri);
  });

  it('detects image URLs with common extensions', () => {
    const url = 'https://example.com/images/avatar.png';
    const result = detectImage(url);
    expect(result).not.toBeNull();
    expect(result?.isImage).toBe(true);
    expect(result?.src).toBe(url);
  });

  it('returns null for non-image strings', () => {
    expect(detectImage('https://example.com/index.html')).toBeNull();
    expect(detectImage('just some text')).toBeNull();
    expect(detectImage(12345)).toBeNull();
  });
});
