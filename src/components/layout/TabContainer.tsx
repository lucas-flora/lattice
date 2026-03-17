/**
 * TabContainer: renders a tab bar with panel content for the active tab.
 */

'use client';

import type { ReactNode } from 'react';

interface TabContainerProps {
  labels: string[];
  activeIndex: number;
  children: ReactNode[];
  onTabChange?: (index: number) => void;
  /** Which tab indices are closable (optional — if omitted, none are closable) */
  closableIndices?: Set<number>;
  onTabClose?: (index: number) => void;
}

export function TabContainer({ labels, activeIndex, children, onTabChange, closableIndices, onTabClose }: TabContainerProps) {
  return (
    <div className="flex flex-col w-full h-full">
      {/* Tab bar */}
      {labels.length > 1 && (
        <div className="flex shrink-0 border-b border-zinc-700 bg-zinc-900/95">
          {labels.map((label, i) => (
            <button
              key={i}
              onClick={() => onTabChange?.(i)}
              className={`px-3 py-1.5 text-xs font-mono transition-colors border-b-2 flex items-center gap-1 group/tab ${
                i === activeIndex
                  ? 'text-zinc-200 border-green-500'
                  : 'text-zinc-500 border-transparent hover:text-zinc-300'
              }`}
            >
              {label}
              {closableIndices?.has(i) && (
                <span
                  onClick={(e) => { e.stopPropagation(); onTabClose?.(i); }}
                  className="text-zinc-600 hover:text-zinc-300 ml-1 opacity-0 group-hover/tab:opacity-100 transition-opacity"
                >
                  &times;
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {/* Tab content — all tabs stay mounted to preserve state */}
      <div className="flex-1 min-h-0 relative">
        {children.map((child, i) => (
          <div
            key={i}
            className="absolute inset-0"
            style={{ display: i === activeIndex ? 'block' : 'none' }}
          >
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
