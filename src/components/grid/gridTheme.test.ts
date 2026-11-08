import { describe, it, expect } from 'vitest';
import { lightGridTheme, darkGridTheme } from './gridTheme';

describe('gridTheme', () => {
  it('defines light grid theme tokens matching classic desktop client', () => {
    expect(lightGridTheme.bgCell).toBe('#ffffff');
    expect(lightGridTheme.bgHeader).toBe('#f0f0f2');
    expect(lightGridTheme.bgHeaderHasFocus).toBe('#e0e0e4');
    expect(lightGridTheme.textHeaderSelected).toBe('#ffffff');
    expect(lightGridTheme.accentColor).toBe('#2d6cdf');
    expect(lightGridTheme.baseFontStyle).toBe('12px');
    expect(lightGridTheme.cellHorizontalPadding).toBe(8);
  });

  it('defines dark grid theme tokens with charcoal palette', () => {
    expect(darkGridTheme.bgCell).toBe('#1e1e20');
    expect(darkGridTheme.bgHeader).toBe('#2b2b2d');
    expect(darkGridTheme.bgHeaderHasFocus).toBe('#38383c');
    expect(darkGridTheme.textHeaderSelected).toBe('#ffffff');
    expect(darkGridTheme.accentColor).toBe('#4a8bf0');
    expect(darkGridTheme.baseFontStyle).toBe('12px');
    expect(darkGridTheme.borderColor).toBe('#3e3e42');
  });
});
