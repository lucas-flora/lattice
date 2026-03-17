/**
 * HUD: minimal heads-up display overlay showing simulation status.
 *
 * Rendered inside SimulationViewport so it only covers the viewport canvas,
 * not the node editor or other panels.
 */

'use client';

import { useSimStore } from '@/store/simStore';

export function HUD() {
  const generation = useSimStore((s) => s.generation);
  const liveCellCount = useSimStore((s) => s.liveCellCount);

  return (
    <div
      className="absolute top-2 left-2 z-20 flex items-center gap-3 pointer-events-none select-none bg-zinc-900/50 backdrop-blur-sm rounded px-2 py-1"
      data-testid="hud"
    >
      <span
        className="text-xs font-mono text-green-400/80 tabular-nums"
        data-testid="hud-generation"
      >
        Gen {generation}
      </span>
      <span className="text-[10px] font-mono text-zinc-500" data-testid="hud-cell-count">
        {liveCellCount.toLocaleString()} cells
      </span>
    </div>
  );
}
