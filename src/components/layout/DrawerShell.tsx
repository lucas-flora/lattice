/**
 * DrawerShell: collapsible container for a zone's layout tree.
 *
 * Renders a resize handle and wraps a LayoutRenderer for the drawer's content.
 */

'use client';

import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { ResizeHandle } from '@/components/ui/ResizeHandle';

interface DrawerShellProps {
  position: 'left' | 'right' | 'bottom';
  size: number;
  collapsed: boolean;
  onResize: (size: number) => void;
  children: ReactNode;
}

export function DrawerShell({ position, size, collapsed, onResize, children }: DrawerShellProps) {
  const isHorizontal = position === 'left' || position === 'right';

  const handleResize = useCallback(
    (delta: number) => {
      // Left drawer: dragging right = bigger (+delta)
      // Right drawer: dragging left = bigger (-delta)
      // Bottom drawer: dragging up = bigger (-delta)
      const sign = position === 'left' ? 1 : -1;
      onResize(size + delta * sign);
    },
    [position, size, onResize],
  );

  if (collapsed) return null;

  const sizeStyle = isHorizontal
    ? { width: size, minWidth: 0 }
    : { height: size, minHeight: 0 };

  const borderClass =
    position === 'left'
      ? 'border-r border-zinc-700'
      : position === 'right'
        ? 'border-l border-zinc-700'
        : '';

  // Resize handle position
  const resizeDirection = isHorizontal ? 'horizontal' : 'vertical';
  const handlePosition = position === 'left' ? 'right' : position === 'right' ? 'left' : 'top';

  return (
    <div
      className={`relative shrink-0 flex ${isHorizontal ? 'flex-col' : 'flex-row'} ${borderClass}`}
      style={sizeStyle}
      data-testid={`drawer-${position}`}
    >
      {/* Resize handle on the edge facing center */}
      {handlePosition === 'top' && (
        <ResizeHandle direction={resizeDirection} onResize={handleResize} />
      )}
      {handlePosition === 'left' && (
        <div className="absolute left-0 top-0 bottom-0 z-10">
          <ResizeHandle direction={resizeDirection} onResize={handleResize} />
        </div>
      )}

      {/* Drawer content */}
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
        {children}
      </div>

      {handlePosition === 'right' && (
        <div className="absolute right-0 top-0 bottom-0 z-10">
          <ResizeHandle direction={resizeDirection} onResize={handleResize} />
        </div>
      )}
    </div>
  );
}
