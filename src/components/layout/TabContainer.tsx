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
}

export function TabContainer({ labels, activeIndex, children, onTabChange }: TabContainerProps) {
  return (
    <div className="flex flex-col w-full h-full">
      {/* Tab bar */}
      {labels.length > 1 && (
        <div className="flex shrink-0 border-b border-zinc-700 bg-zinc-900/95">
          {labels.map((label, i) => (
            <button
              key={i}
              onClick={() => onTabChange?.(i)}
              className={`px-3 py-1.5 text-xs font-mono transition-colors border-b-2 ${
                i === activeIndex
                  ? 'text-zinc-200 border-green-500'
                  : 'text-zinc-500 border-transparent hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {/* Active tab content */}
      <div className="flex-1 min-h-0">
        {children[activeIndex]}
      </div>
    </div>
  );
}
