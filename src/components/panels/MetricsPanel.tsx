/**
 * MetricsPanel: standalone live sparkline graphs for simulation metrics.
 *
 * Extracted from ParamPanel's graph sections. Shows both "Live" (ring buffer)
 * and "Timeline" (generation-synced) sections for cell count and tick rate.
 *
 * GUIP-02: Parameter graphs with live data sampling and graph updates.
 */

'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useSimStore } from '@/store/simStore';
import { commandRegistry } from '@/commands/CommandRegistry';
import { ParamGraph } from './ParamGraph';
import { TimelineGraph } from './TimelineGraph';
import { ParamGraphBuffer, TimelineDataBuffer } from '@/lib/paramGraphData';

// Module-level graph buffers (persist across re-renders)
const cellCountBuffer = new ParamGraphBuffer(200);
const tickRateBuffer = new ParamGraphBuffer(200);

// Timeline-indexed buffers (generation -> value, for timeline-synced charts)
const tlCellCountBuffer = new TimelineDataBuffer();
const tlTickRateBuffer = new TimelineDataBuffer();

let tickCount = 0;
let lastRateCalc = 0;
let currentTickRate = 0;

export function MetricsPanel() {
  const generation = useSimStore((s) => s.generation);
  const liveCellCount = useSimStore((s) => s.liveCellCount);
  const isRunning = useSimStore((s) => s.isRunning);
  const speed = useSimStore((s) => s.speed);
  const maxGeneration = useSimStore((s) => s.maxGeneration);
  const activePreset = useSimStore((s) => s.activePreset);

  const prevGenRef = useRef(0);

  // Track tick rate and push samples when generation changes
  useEffect(() => {
    if (generation === prevGenRef.current) return;
    const isForwardStep = generation === prevGenRef.current + 1;
    prevGenRef.current = generation;

    const now = performance.now();

    // Live buffers always update (rolling window of recent activity)
    cellCountBuffer.push({ generation, value: liveCellCount });

    // Timeline cell count: always record — deterministic per generation
    tlCellCountBuffer.record(generation, liveCellCount);

    // Tick rate: only meaningful during forward playback, not scrubbing
    if (isForwardStep && isRunning) {
      tickCount++;
      if (now - lastRateCalc >= 1000) {
        currentTickRate = tickCount;
        tickCount = 0;
        lastRateCalc = now;
      }
      tickRateBuffer.push({ generation, value: currentTickRate });
      tlTickRateBuffer.record(generation, currentTickRate);
    } else {
      // During scrub: update live buffer with last known rate
      tickRateBuffer.push({ generation, value: currentTickRate });
    }
  }, [generation, liveCellCount, isRunning]);

  // Reset buffers when preset changes
  useEffect(() => {
    cellCountBuffer.clear();
    tickRateBuffer.clear();
    tlCellCountBuffer.clear();
    tlTickRateBuffer.clear();
    tickCount = 0;
    currentTickRate = 0;
    lastRateCalc = performance.now();
    prevGenRef.current = 0;
  }, [activePreset]);

  const handleClose = useCallback(() => {
    commandRegistry.execute('ui.toggleMetrics', {});
  }, []);

  return (
    <div className="h-full bg-zinc-900/95 overflow-y-auto" data-testid="metrics-panel">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-sm font-mono text-zinc-300">Metrics</span>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-zinc-600 tabular-nums">
            gen {generation}
          </span>
          <button
            onClick={handleClose}
            className="text-zinc-500 hover:text-zinc-300 text-xs"
            aria-label="Close metrics panel"
          >
            {'\u2715'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-3 space-y-4">
        {/* Status bar */}
        <div className="flex items-center justify-between text-xs font-mono">
          <span className={isRunning ? 'text-green-400' : 'text-zinc-500'}>
            {isRunning ? 'Running' : 'Paused'}
          </span>
          <span className="text-zinc-500 tabular-nums">
            {speed === 0 ? 'Max FPS' : `${speed} FPS`}
          </span>
        </div>

        {/* Live Metrics -- ring buffer, real-time */}
        <section data-testid="metrics-live">
          <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-1">
            Live
          </h3>
          <p className="text-[9px] font-mono text-zinc-600 mb-3">
            Real-time values as they occur
          </p>
          <div className="space-y-3">
            <ParamGraph
              label="Cell Count"
              samples={cellCountBuffer.getSamples()}
              currentValue={liveCellCount}
              testId="metrics-graph-cell-count"
            />
            <ParamGraph
              label="Tick Rate"
              samples={tickRateBuffer.getSamples()}
              currentValue={currentTickRate}
              formatValue={(v) => `${v} t/s`}
              testId="metrics-graph-tick-rate"
            />
          </div>
        </section>

        {/* Timeline Metrics -- indexed by generation, scrubs with playhead */}
        <section data-testid="metrics-timeline">
          <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-1">
            Timeline
          </h3>
          <p className="text-[9px] font-mono text-zinc-600 mb-3">
            Synced to playhead position
          </p>
          <div className="space-y-3">
            <TimelineGraph
              label="Cell Count"
              samples={tlCellCountBuffer.getAllSamples()}
              currentGeneration={generation}
              maxGeneration={maxGeneration}
              valueAtPlayhead={tlCellCountBuffer.getValueAt(generation)}
              testId="metrics-timeline-cell-count"
            />
            <TimelineGraph
              label="Tick Rate"
              samples={tlTickRateBuffer.getAllSamples()}
              currentGeneration={generation}
              maxGeneration={maxGeneration}
              valueAtPlayhead={tlTickRateBuffer.getValueAt(generation)}
              formatValue={(v) => `${v} t/s`}
              testId="metrics-timeline-tick-rate"
            />
          </div>
        </section>

        {/* Footer */}
        <p className="text-[10px] font-mono text-zinc-600 italic">
          Graphs update live during simulation
        </p>
      </div>
    </div>
  );
}
