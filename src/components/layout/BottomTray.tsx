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
 * ├────────────────────────────────────────────────┤
 * │ Terminal (when open)                           │
 * └────────────────────────────────────────────────┘
 */

'use client';

import { useCallback } from 'react';
import { useUiStore, uiStoreActions } from '@/store/uiStore';
import { ControlBar } from '@/components/hud/ControlBar';
import { Timeline, TimelineCounter } from '@/components/timeline/Timeline';
import { Terminal } from '@/components/terminal/Terminal';
import { ResizeHandle } from '@/components/ui/ResizeHandle';

export function BottomTray() {
  const isTerminalOpen = useUiStore((s) => s.isTerminalOpen);
  const terminalHeight = useUiStore((s) => s.terminalHeight);

  const handleToggleTerminal = useCallback(() => {
    uiStoreActions.setTerminalOpen(!isTerminalOpen);
  }, [isTerminalOpen]);

  const handleResize = useCallback((delta: number) => {
    uiStoreActions.setTerminalHeight(terminalHeight - delta);
  }, [terminalHeight]);

  return (
    <div className="shrink-0 flex flex-col" data-testid="bottom-tray">
      {/* Resize handle at top edge — only when terminal is open */}
      {isTerminalOpen && (
        <ResizeHandle direction="vertical" onResize={handleResize} />
      )}

      {/* Timeline — topmost control, closest to viewport */}
      <div className="border-t border-zinc-700 bg-zinc-900/95">
        <Timeline />
      </div>

      {/* ControlBar row with frame counter */}
      <div className="flex items-center gap-2 px-2 bg-zinc-900/95 border-t border-zinc-800/50">
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

      {/* Terminal content — shown when open */}
      {isTerminalOpen && (
        <div style={{ height: terminalHeight }}>
          <Terminal docked />
        </div>
      )}
    </div>
  );
}
