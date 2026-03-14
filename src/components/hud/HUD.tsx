/**
 * HUD: minimal heads-up display overlay showing simulation status.
 *
 * Compact, transparent, informational only. Never overlaps drawers.
 * Titles (app name, preset) live in HotkeyHelp and ControlBar instead.
 */

'use client';

import { useSimStore } from '@/store/simStore';
import { useLayoutStore } from '@/store/layoutStore';

export function HUD() {
  const generation = useSimStore((s) => s.generation);
  const liveCellCount = useSimStore((s) => s.liveCellCount);
  const isLeftDrawerOpen = useLayoutStore((s) => s.isLeftDrawerOpen);
  const leftDrawerWidth = useLayoutStore((s) => s.leftDrawerWidth);

  // Offset HUD to the right when left drawer is open (docked) to avoid overlap
  const leftOffset = isLeftDrawerOpen ? leftDrawerWidth + 8 : 8;

  return (
    <div
      className="absolute top-2 z-20 flex items-center gap-3 pointer-events-none select-none bg-zinc-900/50 backdrop-blur-sm rounded px-2 py-1"
      style={{ left: leftOffset }}
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
