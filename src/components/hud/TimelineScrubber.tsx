/**
 * TimelineScrubber: generation timeline slider for reverse playback.
 *
 * Allows dragging to any generation in the tick history.
 * Calls sim.seek via CommandRegistry for reverse/forward navigation.
 * Visual display updates as fast as possible during scrub (RNDR-08).
 */

'use client';

import { useCallback, useRef } from 'react';
import { useSimStore } from '@/store/simStore';
import { commandRegistry } from '@/commands/CommandRegistry';

export function TimelineScrubber() {
  const generation = useSimStore((s) => s.generation);
  const maxGeneration = useSimStore((s) => s.maxGeneration);
  const isRunning = useSimStore((s) => s.isRunning);
  const seekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScrub = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const target = parseInt(e.target.value, 10);

      // Debounce seek calls to avoid overwhelming the controller
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current);
      }

      seekTimeoutRef.current = setTimeout(() => {
        commandRegistry.execute('sim.seek', { generation: target });
      }, 16); // ~60fps debounce
    },
    [],
  );

  // Only show if there's history to scrub
  if (maxGeneration === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2" data-testid="timeline-scrubber">
      <span className="text-xs font-mono text-zinc-500 w-6 text-right">0</span>
      <input
        type="range"
        min="0"
        max={maxGeneration}
        value={generation}
        onChange={handleScrub}
        disabled={isRunning}
        className="w-32 accent-green-500 disabled:opacity-50"
        title={`Generation ${generation} / ${maxGeneration}`}
        data-testid="timeline-slider"
      />
      <span
        className="text-xs font-mono text-zinc-400 w-12"
        style={{ fontVariantNumeric: 'tabular-nums' }}
        data-testid="timeline-max"
      >
        {maxGeneration}
      </span>
    </div>
  );
}
