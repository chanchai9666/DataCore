import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Design Tokens & CSS Variables (Phase 1)', () => {
  const tokensPath = path.resolve(__dirname, 'tokens.css');
  const tokensContent = fs.readFileSync(tokensPath, 'utf-8');

  it('defines light mode CSS variables in :root', () => {
    expect(tokensContent).toContain('--font-ui:');
    expect(tokensContent).toContain('--font-mono:');
    expect(tokensContent).toContain('--bg-toolbar: #ececee');
    expect(tokensContent).toContain('--bg-sidebar: #f4f4f6');
    expect(tokensContent).toContain('--bg-panel: #fafafb');
    expect(tokensContent).toContain('--bg-grid: #ffffff');
    expect(tokensContent).toContain('--accent: #2d6cdf');
    expect(tokensContent).toContain('--h-btn: 24px');
    expect(tokensContent).toContain('--h-row: 24px');
    expect(tokensContent).toContain('--h-toolbar: 56px');
    expect(tokensContent).toContain('--h-status: 22px');
  });

  it('defines dark mode (charcoal) CSS variables in .dark', () => {
    expect(tokensContent).toContain('.dark {');
    expect(tokensContent).toContain('--bg-toolbar: #323234');
    expect(tokensContent).toContain('--bg-sidebar: #262628');
    expect(tokensContent).toContain('--bg-panel: #2b2b2d');
    expect(tokensContent).toContain('--bg-grid: #1e1e20');
    expect(tokensContent).toContain('--accent: #4a8bf0');
    expect(tokensContent).toContain('--border: #3e3e42');
  });

  it('is imported by src/index.css', () => {
    const indexPath = path.resolve(__dirname, '../index.css');
    const indexContent = fs.readFileSync(indexPath, 'utf-8');
    expect(indexContent).toContain("@import './styles/tokens.css';");
    expect(indexContent).toContain('font-family: var(--font-ui);');
  });
});
