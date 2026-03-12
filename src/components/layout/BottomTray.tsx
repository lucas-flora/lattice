/**
 * BottomTray: unified bottom panel containing ControlBar, Timeline,
 * and Terminal content.
 *
 * Layout (all in document flow):
 * ┌────────────────────────────────────────────────┐
 * │ [⏮ ▶ ⏭ | ↺ ✕ | ──●── FPS | 📷 ≡]     [▾]  │ ControlBar
 * ├────────────────────────────────────────────────┤
 * │ ▼  0    50    100    150  ...  |  Gen/Time     │ Timeline ruler
 * ├────────────────────────────────────────────────┤
 * │ Terminal (when open)                           │
 * └────────────────────────────────────────────────┘
 */

'use client';

import { useCallback } from 'react';
import { useUiStore, uiStoreActions } from '@/store/uiStore';
import { ControlBar } from '@/components/hud/ControlBar';
import { Timeline } from '@/components/timeline/Timeline';
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

      {/* ControlBar row — always visible */}
      <div className="flex items-center px-2 bg-zinc-900/95 border-t border-zinc-700">
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

      {/* Timeline ruler — always visible */}
      <div className="bg-zinc-850 border-t border-zinc-800/50">
        <Timeline />
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
