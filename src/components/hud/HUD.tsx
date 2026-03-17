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

  // Account for ALL left-docked drawers
  const d1Open = useLayoutStore((s) => s.isDrawer1Open);
  const d1Mode = useLayoutStore((s) => s.drawer1Mode);
  const d1Width = useLayoutStore((s) => s.drawer1Width);
  const d2Open = useLayoutStore((s) => s.isDrawer2Open);
  const d2Mode = useLayoutStore((s) => s.drawer2Mode);
  const d2Width = useLayoutStore((s) => s.drawer2Width);

  const d1Docked = d1Open && d1Mode === 'docked';
  const d2Docked = d2Open && d2Mode === 'docked';
  const leftOffset = (d1Docked ? d1Width : 0) + (d2Docked ? d2Width : 0) + 8;

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
