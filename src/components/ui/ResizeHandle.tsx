/**
 * ResizeHandle: drag handle for resizing panels.
 *
 * Uses pointer capture for reliable dragging over canvas/iframes.
 * Real element width/height (6px) — no zero-size tricks.
 * Subtle grip dots centered in the handle, accent line on hover.
 */

'use client';

import { useRef, useCallback } from 'react';

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
  onDoubleClick?: () => void;
}

export function ResizeHandle({ direction, onResize, onDoubleClick }: ResizeHandleProps) {
  const draggingRef = useRef(false);
  const lastPosRef = useRef(0);

  const isVertical = direction === 'vertical';

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    lastPosRef.current = isVertical ? e.clientY : e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [isVertical]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const pos = isVertical ? e.clientY : e.clientX;
    const delta = pos - lastPosRef.current;
    lastPosRef.current = pos;
    onResize(delta);
  }, [isVertical, onResize]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    draggingRef.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  return (
    <div
      className={`shrink-0 group relative select-none ${
        isVertical
          ? 'h-[6px] cursor-row-resize'
          : 'w-[6px] cursor-col-resize'
      }`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
      data-testid="resize-handle"
    >
      {/* Accent line on hover/drag */}
      <div className={`absolute pointer-events-none ${
        isVertical
          ? 'inset-x-0 top-1/2 -translate-y-1/2 h-[2px]'
          : 'inset-y-0 left-1/2 -translate-x-1/2 w-[2px]'
      } bg-transparent group-hover:bg-green-500/40 group-active:bg-green-500/70 transition-colors`} />

      {/* Grip dots — centered, subtle */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className={`flex ${isVertical ? 'flex-row gap-1' : 'flex-col gap-[3px]'}`}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`rounded-full bg-zinc-700 group-hover:bg-zinc-500 transition-colors ${
                isVertical ? 'w-1 h-[2px]' : 'w-[2px] h-1'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
