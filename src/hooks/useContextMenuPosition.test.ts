import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { calculateContextMenuPosition, useContextMenuPosition } from './useContextMenuPosition';

describe('calculateContextMenuPosition', () => {
  const viewport = { width: 1000, height: 800 };
  const menuDimensions = { width: 180, height: 240 };
  const padding = 8;

  it('keeps cursor position when menu fits comfortably within viewport', () => {
    const cursor = { mouseX: 100, mouseY: 100 };
    const pos = calculateContextMenuPosition(cursor, menuDimensions, viewport, padding);
    expect(pos).toEqual({ left: 100, top: 100 });
  });

  it('flips menu upward when overflowing bottom edge and sufficient space exists above', () => {
    // cursor at 700, menu height 240 -> bottom = 940 > 792
    // 700 - 240 = 460 >= 8
    const cursor = { mouseX: 100, mouseY: 700 };
    const pos = calculateContextMenuPosition(cursor, menuDimensions, viewport, padding);
    expect(pos).toEqual({ left: 100, top: 460 });
  });

  it('clamps to viewport bottom when overflowing bottom and insufficient space exists above', () => {
    // small viewport height 300, cursor at 200, menu height 240
    // 200 + 240 = 440 > 292
    // upward: 200 - 240 = -40 < 8
    // clamped: 300 - 240 - 8 = 52
    const smallViewport = { width: 1000, height: 300 };
    const cursor = { mouseX: 100, mouseY: 200 };
    const pos = calculateContextMenuPosition(cursor, menuDimensions, smallViewport, padding);
    expect(pos).toEqual({ left: 100, top: 52 });
  });

  it('flips menu leftward when overflowing right edge and sufficient space exists to the left', () => {
    // cursor at 900, menu width 180 -> right = 1080 > 992
    // 900 - 180 = 720 >= 8
    const cursor = { mouseX: 900, mouseY: 100 };
    const pos = calculateContextMenuPosition(cursor, menuDimensions, viewport, padding);
    expect(pos).toEqual({ left: 720, top: 100 });
  });

  it('clamps to viewport right when overflowing right edge and insufficient space exists to the left', () => {
    const narrowViewport = { width: 200, height: 800 };
    const cursor = { mouseX: 150, mouseY: 100 };
    // 150 + 180 = 330 > 192
    // 150 - 180 = -30 < 8
    // clamp: 200 - 180 - 8 = 12
    const pos = calculateContextMenuPosition(cursor, menuDimensions, narrowViewport, padding);
    expect(pos).toEqual({ left: 12, top: 100 });
  });

  it('handles simultaneous horizontal and vertical overflow', () => {
    const cursor = { mouseX: 950, mouseY: 750 };
    const pos = calculateContextMenuPosition(cursor, menuDimensions, viewport, padding);
    expect(pos).toEqual({ left: 770, top: 510 });
  });

  it('prevents menu from being placed before left or top padding', () => {
    const cursor = { mouseX: -10, mouseY: -20 };
    const pos = calculateContextMenuPosition(cursor, menuDimensions, viewport, padding);
    expect(pos).toEqual({ left: 8, top: 8 });
  });
});

describe('useContextMenuPosition', () => {
  it('returns raw coordinates when contextMenu is provided and menu dimensions are 0 (JSDOM fallback)', () => {
    const menuRef = { current: document.createElement('div') };
    const { result } = renderHook(() =>
      useContextMenuPosition({ mouseX: 150, mouseY: 250 }, menuRef)
    );
    expect(result.current).toEqual({ left: 150, top: 250 });
  });

  it('returns default coordinates when contextMenu is null', () => {
    const menuRef = { current: null };
    const { result } = renderHook(() => useContextMenuPosition(null, menuRef));
    expect(result.current).toEqual({ left: 0, top: 0 });
  });

  it('calculates bounded coordinates when element has bounding rect', () => {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({
      width: 200,
      height: 300,
      top: 0,
      left: 0,
      bottom: 300,
      right: 200,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    Object.defineProperty(window, 'innerWidth', { value: 1000, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 600, writable: true });

    const menuRef = { current: el };
    // cursor near bottom (500), menu height 300 -> 500 + 300 = 800 > 592 -> flip to 500 - 300 = 200
    const { result } = renderHook(() =>
      useContextMenuPosition({ mouseX: 100, mouseY: 500 }, menuRef)
    );

    expect(result.current).toEqual({ left: 100, top: 200 });
  });
});
