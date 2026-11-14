import '@testing-library/jest-dom/vitest';
import '../i18n';

// Polyfill Canvas 2D context for jsdom
if (typeof window !== 'undefined' && typeof HTMLCanvasElement !== 'undefined') {
  const dummyCtx = {
    fillRect: () => {},
    clearRect: () => {},
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Array(w * h * 4),
    }),
    putImageData: () => {},
    createImageData: () => [],
    setTransform: () => {},
    drawImage: () => {},
    save: () => {},
    fillText: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    stroke: () => {},
    translate: () => {},
    scale: () => {},
    rotate: () => {},
    arc: () => {},
    fill: () => {},
    measureText: (text: string) => ({
      width: (text?.length || 0) * 8,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 2,
      fontBoundingBoxAscent: 10,
      fontBoundingBoxDescent: 2,
    }),
    transform: () => {},
    rect: () => {},
    clip: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => null,
    canvas: { width: 800, height: 600 },
  };

  HTMLCanvasElement.prototype.getContext = function (contextType: string) {
    if (contextType === '2d') {
      return dummyCtx as any;
    }
    return null;
  } as any;
}

// Polyfill ResizeObserver for jsdom if needed
if (typeof window !== 'undefined') {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = ResizeObserverMock as any;
    global.ResizeObserver = ResizeObserverMock as any;
  }
}

// Polyfill Range getBoundingClientRect / getClientRects for CodeMirror in JSDOM
if (typeof document !== 'undefined') {
  const origCreateRange = document.createRange?.bind(document);
  document.createRange = () => {
    const range = origCreateRange ? origCreateRange() : new Range();
    if (!range.getBoundingClientRect) {
      range.getBoundingClientRect = () => ({
        x: 0,
        y: 0,
        bottom: 0,
        height: 0,
        left: 0,
        right: 0,
        top: 0,
        width: 0,
        toJSON: () => {},
      });
    }
    if (!range.getClientRects) {
      range.getClientRects = () => ({
        item: () => null,
        length: 0,
        [Symbol.iterator]: function* () {},
      } as any);
    }
    return range;
  };
}
