import '@testing-library/jest-dom/vitest';

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
