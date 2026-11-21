import { useState, useLayoutEffect, RefObject } from 'react';

export interface CursorPosition {
  mouseX: number;
  mouseY: number;
}

export interface Dimensions {
  width: number;
  height: number;
}

export interface ContextMenuPosition {
  top: number;
  left: number;
}

/**
 * Calculates collision-free context menu coordinates inside the viewport.
 * Automatically flips upward or leftward if there is room; otherwise clamps to viewport padding.
 */
export function calculateContextMenuPosition(
  cursor: CursorPosition,
  menuDimensions: Dimensions,
  viewport: Dimensions,
  padding = 8
): ContextMenuPosition {
  let left = cursor.mouseX;
  let top = cursor.mouseY;

  // Horizontal collision check
  if (left + menuDimensions.width > viewport.width - padding) {
    if (cursor.mouseX - menuDimensions.width >= padding) {
      left = cursor.mouseX - menuDimensions.width;
    } else {
      left = Math.max(padding, viewport.width - menuDimensions.width - padding);
    }
  } else {
    left = Math.max(padding, left);
  }

  // Vertical collision check
  if (top + menuDimensions.height > viewport.height - padding) {
    if (cursor.mouseY - menuDimensions.height >= padding) {
      top = cursor.mouseY - menuDimensions.height;
    } else {
      top = Math.max(padding, viewport.height - menuDimensions.height - padding);
    }
  } else {
    top = Math.max(padding, top);
  }

  return { top, left };
}

/**
 * Hook to position a context menu within the viewport boundaries.
 */
export function useContextMenuPosition(
  contextMenu: CursorPosition | null,
  menuRef: RefObject<HTMLElement | null>,
  padding = 8
): ContextMenuPosition {
  const [adjusted, setAdjusted] = useState<{
    mouseX: number;
    mouseY: number;
    pos: ContextMenuPosition;
  } | null>(null);

  useLayoutEffect(() => {
    if (!contextMenu) {
      setAdjusted(null);
      return;
    }

    if (!menuRef.current) {
      setAdjusted({
        mouseX: contextMenu.mouseX,
        mouseY: contextMenu.mouseY,
        pos: { top: contextMenu.mouseY, left: contextMenu.mouseX },
      });
      return;
    }

    const rect = menuRef.current.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      // In JSDOM or prior to initial layout, default to raw cursor coordinates
      setAdjusted({
        mouseX: contextMenu.mouseX,
        mouseY: contextMenu.mouseY,
        pos: { top: contextMenu.mouseY, left: contextMenu.mouseX },
      });
      return;
    }

    const viewport: Dimensions = {
      width: typeof window !== 'undefined' ? window.innerWidth : 1024,
      height: typeof window !== 'undefined' ? window.innerHeight : 768,
    };

    const calculatedPos = calculateContextMenuPosition(
      contextMenu,
      { width: rect.width, height: rect.height },
      viewport,
      padding
    );

    // Apply directly to element style for immediate paint without flicker
    if (menuRef.current) {
      menuRef.current.style.top = `${calculatedPos.top}px`;
      menuRef.current.style.left = `${calculatedPos.left}px`;
    }

    setAdjusted({
      mouseX: contextMenu.mouseX,
      mouseY: contextMenu.mouseY,
      pos: calculatedPos,
    });
  }, [contextMenu?.mouseX, contextMenu?.mouseY, menuRef, padding]);

  if (!contextMenu) {
    return { top: 0, left: 0 };
  }

  if (
    adjusted &&
    adjusted.mouseX === contextMenu.mouseX &&
    adjusted.mouseY === contextMenu.mouseY
  ) {
    return adjusted.pos;
  }

  return { top: contextMenu.mouseY, left: contextMenu.mouseX };
}
