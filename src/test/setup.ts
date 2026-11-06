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
