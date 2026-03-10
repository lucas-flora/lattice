/**
 * ParamPanel: side panel showing current preset parameters (read-only).
 *
 * Slides in from the right edge when isParamPanelOpen is true.
 */

'use client';

import { useSimStore } from '@/store/simStore';
import { useUiStore } from '@/store/uiStore';
import { commandRegistry } from '@/commands/CommandRegistry';

export function ParamPanel() {
  const isOpen = useUiStore((s) => s.isParamPanelOpen);
  const activePreset = useSimStore((s) => s.activePreset);
  const gridWidth = useSimStore((s) => s.gridWidth);
  const gridHeight = useSimStore((s) => s.gridHeight);

  return (
    <>
      {/* Toggle button -- always visible */}
      <button
        onClick={() => commandRegistry.execute('ui.toggleParamPanel', {})}
        className="absolute top-4 right-48 z-10 bg-zinc-800/90 text-zinc-400 hover:text-zinc-200 text-xs font-mono px-2 py-1.5 rounded border border-zinc-700 transition-colors"
        title="Toggle Parameters"
        data-testid="param-panel-toggle"
      >
        {'\u2699'}
      </button>

      {/* Panel */}
      <div
        className="absolute top-0 right-0 bottom-0 z-15 w-[300px] transition-transform duration-200 ease-out"
        style={{
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        }}
        data-testid="param-panel"
      >
        <div className="h-full bg-zinc-900/95 border-l border-zinc-700 backdrop-blur-sm overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <span className="text-sm font-mono text-zinc-300">Parameters</span>
            <button
              onClick={() => commandRegistry.execute('ui.toggleParamPanel', {})}
              className="text-zinc-500 hover:text-zinc-300 text-xs"
              aria-label="Close panel"
            >
              {'\u2715'}
            </button>
          </div>

          {/* Content */}
          <div className="px-4 py-3 space-y-4">
            {/* Preset Info */}
            <section>
              <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">
                Preset
              </h3>
              <p className="text-sm font-mono text-zinc-200" data-testid="param-preset-name">
                {activePreset ?? 'None'}
              </p>
            </section>

            {/* Grid */}
            <section>
              <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">
                Grid
              </h3>
              <div className="space-y-1 text-xs font-mono text-zinc-400">
                <div className="flex justify-between">
                  <span>Width</span>
                  <span className="text-zinc-200" data-testid="param-grid-width">{gridWidth}</span>
                </div>
                <div className="flex justify-between">
                  <span>Height</span>
                  <span className="text-zinc-200" data-testid="param-grid-height">{gridHeight}</span>
                </div>
              </div>
            </section>

            {/* Read-only notice */}
            <p className="text-[10px] font-mono text-zinc-600 italic">
              Parameter editing available in a future update
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
