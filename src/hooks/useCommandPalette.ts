import { useState, useCallback } from 'react';

export interface UseCommandPaletteReturn {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

/**
 * Hook for managing Command Palette modal open/close state.
 */
export function useCommandPalette(initialOpen = false): UseCommandPaletteReturn {
  const [isOpen, setIsOpen] = useState(initialOpen);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return {
    isOpen,
    setIsOpen,
    open,
    close,
    toggle,
  };
}

export default useCommandPalette;
