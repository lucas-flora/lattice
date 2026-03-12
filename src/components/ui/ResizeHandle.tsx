/**
 * ResizeHandle: thin drag handle for resizing panels.
 *
 * Uses pointer capture for reliable dragging over canvas/iframes.
 */

'use client';

import { useRef, useCallback } from 'react';

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
}

export function ResizeHandle({ direction, onResize }: ResizeHandleProps) {
  const draggingRef = useRef(false);
  const lastPosRef = useRef(0);
  const handleRef = useRef<HTMLDivElement>(null);

  const isVertical = direction === 'vertical';

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    lastPosRef.current = isVertical ? e.clientY : e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
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
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  return (
    <div
      ref={handleRef}
      className={`shrink-0 ${isVertical ? 'h-1 cursor-row-resize' : 'w-1 cursor-col-resize'} group relative select-none`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      data-testid="resize-handle"
    >
      {/* Wider hit area */}
      <div className={`absolute ${isVertical ? 'inset-x-0 -top-1 -bottom-1' : 'inset-y-0 -left-1 -right-1'}`} />
      {/* Visual accent */}
      <div className={`absolute ${isVertical ? 'inset-x-0 top-0 h-[2px]' : 'inset-y-0 left-0 w-[2px]'} bg-transparent group-hover:bg-green-500/30 group-active:bg-green-500/60 transition-colors`} />
    </div>
  );
}
