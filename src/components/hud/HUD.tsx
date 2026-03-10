/**
 * HUD: heads-up display overlay showing simulation status.
 *
 * Shows preset name, generation counter (tabular-nums), and live cell count.
 * Reads reactively from simStore.
 */

'use client';

import { useSimStore } from '@/store/simStore';

export function HUD() {
  const generation = useSimStore((s) => s.generation);
  const liveCellCount = useSimStore((s) => s.liveCellCount);
  const activePreset = useSimStore((s) => s.activePreset);

  return (
    <div
      className="absolute top-4 left-4 z-10 flex flex-col gap-1 pointer-events-none select-none"
      data-testid="hud"
    >
      <h1 className="text-sm font-mono text-zinc-500 tracking-wider uppercase">
        Lattice
      </h1>
      {activePreset && (
        <p className="text-xs font-mono text-zinc-600" data-testid="hud-preset">
          {activePreset}
        </p>
      )}
      <p
        className="text-lg font-mono text-green-400"
        style={{ fontVariantNumeric: 'tabular-nums' }}
        data-testid="hud-generation"
      >
        Gen {generation}
      </p>
      <p className="text-xs font-mono text-zinc-400" data-testid="hud-cell-count">
        {liveCellCount.toLocaleString()} cells
      </p>
    </div>
  );
}
