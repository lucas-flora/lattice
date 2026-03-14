/**
 * BottomTray: unified bottom panel. Timeline is the topmost control
 * (closest to the viewport edge), then transport controls, then terminal.
 *
 * Layout:
 * ┌────────────────────────────────────────────────┐
 * │ ▐═══[====]════════════════════════════════════▐│ Mini-map
 * │ ▼  50   60   70   ...                          │ Timeline ruler (full width)
 * ├────────────────────────────────────────────────┤
 * │ [100/300] [⏮ ▶ ⏭ | ↺ ✕ | ──●── FPS]   [▾]  │ Counter + ControlBar
 * ├─────────────────···───────────────────────────┤ Resize grip (when terminal open)
 * │ Terminal (when open)                           │
 * └────────────────────────────────────────────────┘
 */

'use client';

import { useCallback } from 'react';
import { useLayoutStore, layoutStoreActions } from '@/store/layoutStore';
import { ControlBar } from '@/components/hud/ControlBar';
import { Timeline, TimelineCounter } from '@/components/timeline/Timeline';
import { Terminal } from '@/components/terminal/Terminal';
import { ResizeHandle } from '@/components/ui/ResizeHandle';

export function BottomTray() {
  const isTerminalOpen = useLayoutStore((s) => s.isTerminalOpen);
  const terminalHeight = useLayoutStore((s) => s.terminalHeight);

  const handleToggleTerminal = useCallback(() => {
    layoutStoreActions.setTerminalOpen(!isTerminalOpen);
  }, [isTerminalOpen]);

  const handleResize = useCallback((delta: number) => {
    layoutStoreActions.setTerminalHeight(terminalHeight - delta);
  }, [terminalHeight]);

  return (
    <div className="shrink-0 flex flex-col" data-testid="bottom-tray">
      {/* Timeline — topmost control, closest to viewport */}
      <div className="border-t border-zinc-700 bg-zinc-900/95">
        <Timeline />
      </div>

      {/* ControlBar row with frame counter — double-click empty space to toggle terminal */}
      <div
        className="flex items-center gap-2 px-2 bg-zinc-900/95 border-t border-zinc-800/50"
        onDoubleClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('button, input, select, [role="button"], a')) return;
          handleToggleTerminal();
        }}
      >
        <TimelineCounter />
        <div className="flex-1">
          <ControlBar />
        </div>
        {/* Terminal toggle chevron */}
        <button
          onClick={handleToggleTerminal}
          className="text-zinc-500 hover:text-zinc-300 text-xs px-2 py-2 font-mono transition-colors"
          title={isTerminalOpen ? 'Hide terminal' : 'Show terminal'}
          data-testid="terminal-toggle"
        >
          {isTerminalOpen ? '\u25BE' : '\u25B4'}
        </button>
      </div>

      {/* Terminal — resize handle overlaps top edge (no gap) */}
      {isTerminalOpen && (
        <div className="relative" style={{ height: terminalHeight }}>
          {/* Resize handle at top — absolute, overlaps terminal top edge */}
          <div className="absolute top-0 left-0 right-0 z-10">
            <ResizeHandle direction="vertical" onResize={handleResize} />
          </div>
          <Terminal docked />
        </div>
      )}
    </div>
  );
}
