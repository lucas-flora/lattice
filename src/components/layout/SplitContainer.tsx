/**
 * SplitContainer: renders children in a flexbox split with resize handles between them.
 */

'use client';

import { useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { ResizeHandle } from '@/components/ui/ResizeHandle';

interface SplitContainerProps {
  direction: 'h' | 'v';
  sizes: number[];
  children: ReactNode[];
  onResize?: (sizes: number[]) => void;
}

export function SplitContainer({ direction, sizes, children, onResize }: SplitContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sizesRef = useRef(sizes);
  sizesRef.current = sizes;

  const handleResize = useCallback(
    (index: number, delta: number) => {
      if (!containerRef.current || !onResize) return;

      const rect = containerRef.current.getBoundingClientRect();
      const totalPx = direction === 'h' ? rect.width : rect.height;
      if (totalPx === 0) return;

      const deltaPct = (delta / totalPx) * 100;
      const newSizes = [...sizesRef.current];
      const minPct = 10; // minimum 10% per child

      newSizes[index] += deltaPct;
      newSizes[index + 1] -= deltaPct;

      if (newSizes[index] < minPct || newSizes[index + 1] < minPct) return;

      onResize(newSizes);
    },
    [direction, onResize],
  );

  const isHorizontal = direction === 'h';

  return (
    <div
      ref={containerRef}
      className={`flex ${isHorizontal ? 'flex-row' : 'flex-col'} w-full h-full`}
    >
      {children.map((child, i) => (
        <div key={i} className="min-w-0 min-h-0 overflow-hidden" style={{
          [isHorizontal ? 'width' : 'height']: `${sizes[i]}%`,
          flexShrink: 0,
          flexGrow: 0,
        }}>
          {child}
          {i < children.length - 1 && (
            <ResizeHandle
              direction={isHorizontal ? 'horizontal' : 'vertical'}
              onResize={(d) => handleResize(i, d)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
