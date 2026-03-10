/**
 * ParamPanel: side panel showing current preset parameters and live graphs.
 *
 * GUIP-01: Parameter panel with grid info and preset details.
 * GUIP-02: Live sparkline graphs for cell count and tick rate.
 *
 * Slides in from the right edge when isParamPanelOpen is true.
 */

'use client';

import { useRef, useCallback, useEffect } from 'react';
import { useSimStore } from '@/store/simStore';
import { useUiStore } from '@/store/uiStore';
import { commandRegistry } from '@/commands/CommandRegistry';
import { ParamGraph } from './ParamGraph';
import { ParamGraphBuffer } from '@/lib/paramGraphData';

// Module-level graph buffers (persist across re-renders)
const cellCountBuffer = new ParamGraphBuffer(200);
const tickRateBuffer = new ParamGraphBuffer(200);

let lastTickTime = 0;
let tickCount = 0;
let lastRateCalc = 0;
let currentTickRate = 0;

export function ParamPanel() {
  const isOpen = useUiStore((s) => s.isParamPanelOpen);
  const activePreset = useSimStore((s) => s.activePreset);
  const gridWidth = useSimStore((s) => s.gridWidth);
  const gridHeight = useSimStore((s) => s.gridHeight);
  const generation = useSimStore((s) => s.generation);
  const liveCellCount = useSimStore((s) => s.liveCellCount);
  const speed = useSimStore((s) => s.speed);
  const isRunning = useSimStore((s) => s.isRunning);

  const prevGenRef = useRef(0);

  // Track tick rate and push samples when generation changes
  useEffect(() => {
    if (generation === prevGenRef.current) return;
    prevGenRef.current = generation;

    const now = performance.now();

    // Cell count sample
    cellCountBuffer.push({ generation, value: liveCellCount });

    // Tick rate calculation
    tickCount++;
    if (now - lastRateCalc >= 1000) {
      currentTickRate = tickCount;
      tickCount = 0;
      lastRateCalc = now;
    }
    lastTickTime = now;

    tickRateBuffer.push({ generation, value: currentTickRate });
  }, [generation, liveCellCount]);

  // Reset buffers when preset changes
  useEffect(() => {
    cellCountBuffer.clear();
    tickRateBuffer.clear();
    tickCount = 0;
    currentTickRate = 0;
    lastRateCalc = performance.now();
    prevGenRef.current = 0;
  }, [activePreset]);

  const handleClose = useCallback(() => {
    commandRegistry.execute('ui.toggleParamPanel', {});
  }, []);

  return (
    <>
      {/* Toggle button -- always visible */}
      <button
        onClick={() => commandRegistry.execute('ui.toggleParamPanel', {})}
        className="absolute top-4 right-48 z-10 bg-zinc-800/90 text-zinc-400 hover:text-zinc-200 text-xs font-mono px-2 py-1.5 rounded border border-zinc-700 transition-colors"
        title="Toggle Parameters (P)"
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
              onClick={handleClose}
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
                <div className="flex justify-between">
                  <span>Speed</span>
                  <span className="text-zinc-200">{speed === 0 ? 'Max' : `${speed} FPS`}</span>
                </div>
                <div className="flex justify-between">
                  <span>Status</span>
                  <span className={isRunning ? 'text-green-400' : 'text-zinc-200'}>
                    {isRunning ? 'Running' : 'Paused'}
                  </span>
                </div>
              </div>
            </section>

            {/* Live Parameter Graphs */}
            <section data-testid="param-graphs">
              <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-3">
                Live Metrics
              </h3>
              <div className="space-y-3">
                <ParamGraph
                  label="Cell Count"
                  samples={cellCountBuffer.getSamples()}
                  currentValue={liveCellCount}
                  testId="param-graph-cell-count"
                />
                <ParamGraph
                  label="Tick Rate"
                  samples={tickRateBuffer.getSamples()}
                  currentValue={currentTickRate}
                  formatValue={(v) => `${v} t/s`}
                  testId="param-graph-tick-rate"
                />
              </div>
            </section>

            {/* Info */}
            <p className="text-[10px] font-mono text-zinc-600 italic">
              Graphs update live during simulation
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
