/**
 * DrawerShell: collapsible container for a zone's layout tree.
 *
 * Resize handle is absolute-positioned at the edge (within bounds).
 * Double-click the grip to close. Small inset for visual breathing room.
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
  onClose?: () => void;
  children: ReactNode;
}

export function DrawerShell({ position, size, collapsed, onResize, onClose, children }: DrawerShellProps) {
  const isHorizontal = position === 'left' || position === 'right';

  const handleResize = useCallback(
    (delta: number) => {
      const sign = position === 'left' ? 1 : -1;
      onResize(size + delta * sign);
    },
    [position, size, onResize],
  );

  if (collapsed) return null;

  const sizeStyle = isHorizontal
    ? { width: size, minWidth: 0 }
    : { height: size, minHeight: 0 };

  return (
    <div
      className="relative shrink-0"
      style={sizeStyle}
      data-testid={`drawer-${position}`}
    >
      {/* Content fills full area */}
      <div className="absolute inset-0 overflow-hidden">
        {children}
      </div>

      {/* Resize handle at the edge — within bounds, slight inset for breathing room */}
      {position === 'left' && (
        <div className="absolute right-1 top-0 bottom-0 z-10 flex">
          <ResizeHandle direction="horizontal" onResize={handleResize} onDoubleClick={onClose} />
        </div>
      )}
      {position === 'right' && (
        <div className="absolute left-1 top-0 bottom-0 z-10 flex">
          <ResizeHandle direction="horizontal" onResize={handleResize} onDoubleClick={onClose} />
        </div>
      )}
    </div>
  );
}
