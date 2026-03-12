/**
 * ParamPanel: side panel showing current preset parameters and live graphs.
 *
 * GUIP-01: Parameter panel with grid info and preset details.
 * GUIP-02: Live sparkline graphs for cell count and tick rate.
 *
 * Supports two display modes:
 * - floating: absolute-positioned overlay (default, toggled via P)
 * - docked: flex-child that takes layout space (toggled via Ctrl+P)
 */

'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { useSimStore } from '@/store/simStore';
import { useUiStore } from '@/store/uiStore';
import { commandRegistry } from '@/commands/CommandRegistry';
import { ParamGraph } from './ParamGraph';
import { TimelineGraph } from './TimelineGraph';
import { ParamGraphBuffer, TimelineDataBuffer } from '@/lib/paramGraphData';
import { BUILTIN_PRESET_NAMES_CLIENT as BUILTIN_PRESET_NAMES } from '@/engine/preset/builtinPresetsClient';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { uiStoreActions } from '@/store/uiStore';

const PRESET_DISPLAY_NAMES: Record<string, string> = {
  'conways-gol': "Conway's GoL",
  'rule-110': 'Rule 110',
  'langtons-ant': "Langton's Ant",
  'brians-brain': "Brian's Brain",
  'gray-scott': 'Gray-Scott',
  'navier-stokes': 'Navier-Stokes',
};

// Module-level graph buffers (persist across re-renders)
const cellCountBuffer = new ParamGraphBuffer(200);
const tickRateBuffer = new ParamGraphBuffer(200);

// Timeline-indexed buffers (generation → value, for timeline-synced charts)
const tlCellCountBuffer = new TimelineDataBuffer();
const tlTickRateBuffer = new TimelineDataBuffer();

let lastTickTime = 0;
let tickCount = 0;
let lastRateCalc = 0;
let currentTickRate = 0;

interface ParamPanelProps {
  docked?: boolean;
}

export function ParamPanel({ docked = false }: ParamPanelProps) {
  const isOpen = useUiStore((s) => s.isParamPanelOpen);
  const paramPanelWidth = useUiStore((s) => s.paramPanelWidth);
  const activePreset = useSimStore((s) => s.activePreset);
  const gridWidth = useSimStore((s) => s.gridWidth);
  const gridHeight = useSimStore((s) => s.gridHeight);
  const generation = useSimStore((s) => s.generation);
  const liveCellCount = useSimStore((s) => s.liveCellCount);
  const speed = useSimStore((s) => s.speed);
  const isRunning = useSimStore((s) => s.isRunning);
  const maxGeneration = useSimStore((s) => s.maxGeneration);
  const paramDefs = useSimStore((s) => s.paramDefs);
  const params = useSimStore((s) => s.params);

  const prevGenRef = useRef(0);

  // Local state for grid resize inputs
  const [editWidth, setEditWidth] = useState(String(gridWidth));
  const [editHeight, setEditHeight] = useState(String(gridHeight));

  // Local state for rule editor
  const [ruleExpanded, setRuleExpanded] = useState(false);
  const [ruleBody, setRuleBody] = useState('');
  const [ruleEditing, setRuleEditing] = useState(false);

  // Sync grid inputs when store values change
  useEffect(() => { setEditWidth(String(gridWidth)); }, [gridWidth]);
  useEffect(() => { setEditHeight(String(gridHeight)); }, [gridHeight]);

  // Load rule body when preset changes
  useEffect(() => {
    commandRegistry.execute('rule.show', {}).then((result) => {
      if (result.success && result.data) {
        setRuleBody((result.data as { body: string }).body);
      }
    });
    setRuleEditing(false);
  }, [activePreset]);

  // Track tick rate and push samples when generation changes
  useEffect(() => {
    if (generation === prevGenRef.current) return;
    const isForwardStep = generation === prevGenRef.current + 1;
    prevGenRef.current = generation;

    const now = performance.now();

    // Live buffers always update (they're a rolling window of recent activity)
    cellCountBuffer.push({ generation, value: liveCellCount });

    // Timeline cell count: always record — cell count is deterministic per generation
    tlCellCountBuffer.record(generation, liveCellCount);

    // Tick rate: only meaningful during forward playback, not scrubbing
    if (isForwardStep && isRunning) {
      tickCount++;
      if (now - lastRateCalc >= 1000) {
        currentTickRate = tickCount;
        tickCount = 0;
        lastRateCalc = now;
      }
      lastTickTime = now;

      tickRateBuffer.push({ generation, value: currentTickRate });
      tlTickRateBuffer.record(generation, currentTickRate);
    } else {
      // During scrub: update live buffer with last known rate but don't record to timeline
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
    commandRegistry.execute('ui.toggleParamPanel', {});
  }, []);

  const handleGridResize = useCallback(() => {
    const w = parseInt(editWidth, 10);
    const h = parseInt(editHeight, 10);
    if (w > 0 && h > 0) {
      commandRegistry.execute('grid.resize', { width: w, height: h });
    }
  }, [editWidth, editHeight]);

  const handlePanelResize = useCallback((delta: number) => {
    // Drag left = negative delta = increase width
    uiStoreActions.setParamPanelWidth(paramPanelWidth - delta);
  }, [paramPanelWidth]);

  const handleRuleApply = useCallback(() => {
    commandRegistry.execute('rule.edit', { body: ruleBody }).then((result) => {
      if (result.success) {
        setRuleEditing(false);
      }
    });
  }, [ruleBody]);

  // Shared panel content
  const panelContent = (
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
        {/* Preset Selector */}
        <section>
          <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">
            Preset
          </h3>
          <select
            value={Object.entries(PRESET_DISPLAY_NAMES).find(
              ([, displayName]) => activePreset?.includes(displayName)
            )?.[0] ?? ''}
            onChange={(e) => {
              if (e.target.value) {
                commandRegistry.execute('preset.load', { name: e.target.value });
              }
            }}
            className="w-full bg-zinc-800 text-zinc-200 text-xs font-mono rounded px-2 py-1.5 border border-zinc-700 outline-none cursor-pointer hover:bg-zinc-700 transition-colors"
            data-testid="preset-dropdown"
          >
            <option value="" disabled>Select preset...</option>
            {BUILTIN_PRESET_NAMES.map((name) => (
              <option key={name} value={name}>
                {PRESET_DISPLAY_NAMES[name] || name}
              </option>
            ))}
          </select>
        </section>

        {/* Grid */}
        <section>
          <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">
            Grid
          </h3>
          <div className="space-y-1.5 text-xs font-mono text-zinc-400">
            <div className="flex items-center justify-between">
              <span>Width</span>
              <input
                type="number"
                value={editWidth}
                onChange={(e) => setEditWidth(e.target.value)}
                onBlur={handleGridResize}
                onKeyDown={(e) => { if (e.key === 'Enter') handleGridResize(); }}
                min={1}
                className="w-20 bg-zinc-800 text-zinc-200 text-xs font-mono tabular-nums rounded px-2 py-1 border border-zinc-700 outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                data-testid="param-grid-width"
              />
            </div>
            <div className="flex items-center justify-between">
              <span>Height</span>
              <input
                type="number"
                value={editHeight}
                onChange={(e) => setEditHeight(e.target.value)}
                onBlur={handleGridResize}
                onKeyDown={(e) => { if (e.key === 'Enter') handleGridResize(); }}
                min={1}
                className="w-20 bg-zinc-800 text-zinc-200 text-xs font-mono tabular-nums rounded px-2 py-1 border border-zinc-700 outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                data-testid="param-grid-height"
              />
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

        {/* Simulation Parameters */}
        {paramDefs.length > 0 && (
          <section data-testid="sim-params">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-wider">
                Simulation Parameters
              </h3>
              <button
                onClick={() => commandRegistry.execute('param.reset', {})}
                className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                Reset
              </button>
            </div>
            <div className="space-y-2.5">
              {paramDefs.map((def) => {
                const value = params[def.name] ?? def.default;
                return (
                  <div key={def.name} className="space-y-0.5">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-zinc-400">{def.label ?? def.name}</span>
                      <span className="text-zinc-200 tabular-nums" data-testid={`param-value-${def.name}`}>
                        {def.type === 'int' ? value : value.toFixed(4)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={def.min ?? 0}
                      max={def.max ?? 1}
                      step={def.step ?? (def.type === 'int' ? 1 : 0.001)}
                      value={value}
                      onChange={(e) => {
                        commandRegistry.execute('param.set', {
                          name: def.name,
                          value: parseFloat(e.target.value),
                        });
                      }}
                      className="w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-green-500"
                      data-testid={`param-slider-${def.name}`}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Live Metrics — ring buffer, real-time, not synced to playhead */}
        <section data-testid="param-graphs">
          <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-1">
            Live
          </h3>
          <p className="text-[9px] font-mono text-zinc-600 mb-3">Real-time values as they occur</p>
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

        {/* Timeline Metrics — indexed by generation, scrubs with playhead */}
        <section data-testid="timeline-graphs">
          <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-1">
            Timeline
          </h3>
          <p className="text-[9px] font-mono text-zinc-600 mb-3">Synced to playhead position</p>
          <div className="space-y-3">
            <TimelineGraph
              label="Cell Count"
              samples={tlCellCountBuffer.getAllSamples()}
              currentGeneration={generation}
              maxGeneration={maxGeneration}
              valueAtPlayhead={tlCellCountBuffer.getValueAt(generation)}
              testId="timeline-graph-cell-count"
            />
            <TimelineGraph
              label="Tick Rate"
              samples={tlTickRateBuffer.getAllSamples()}
              currentGeneration={generation}
              maxGeneration={maxGeneration}
              valueAtPlayhead={tlTickRateBuffer.getValueAt(generation)}
              formatValue={(v) => `${v} t/s`}
              testId="timeline-graph-tick-rate"
            />
          </div>
        </section>

        {/* Rule Viewer/Editor */}
        <section data-testid="rule-section">
          <button
            onClick={() => setRuleExpanded(!ruleExpanded)}
            className="flex items-center gap-1 text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2 hover:text-zinc-400 transition-colors"
          >
            <span className="text-[10px]">{ruleExpanded ? '\u25BC' : '\u25B6'}</span>
            Rule
          </button>
          {ruleExpanded && (
            <div className="space-y-2">
              {ruleEditing ? (
                <>
                  <textarea
                    value={ruleBody}
                    onChange={(e) => setRuleBody(e.target.value)}
                    className="w-full h-40 bg-zinc-800 text-zinc-200 text-[10px] font-mono rounded px-2 py-1.5 border border-zinc-700 outline-none resize-y"
                    spellCheck={false}
                    data-testid="rule-editor"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleRuleApply}
                      className="text-[10px] font-mono bg-green-600 hover:bg-green-500 text-white px-2 py-0.5 rounded transition-colors"
                    >
                      Apply
                    </button>
                    <button
                      onClick={() => setRuleEditing(false)}
                      className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 px-2 py-0.5 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <pre className="bg-zinc-800 text-zinc-300 text-[10px] font-mono rounded px-2 py-1.5 overflow-x-auto max-h-40 overflow-y-auto border border-zinc-700" data-testid="rule-viewer">
                    {ruleBody}
                  </pre>
                  <button
                    onClick={() => setRuleEditing(true)}
                    className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Edit
                  </button>
                </>
              )}
            </div>
          )}
        </section>

        {/* Info */}
        <p className="text-[10px] font-mono text-zinc-600 italic">
          Graphs update live during simulation
        </p>
      </div>
    </div>
  );

  if (docked) {
    return (
      <div className="shrink-0 h-full flex" data-testid="param-panel">
        <ResizeHandle direction="horizontal" onResize={handlePanelResize} />
        <div style={{ width: paramPanelWidth }} className="h-full">
          {panelContent}
        </div>
      </div>
    );
  }

  // Floating mode
  return (
    <>
      {/* Edge tab toggle — flush against right edge, only visible when drawer is closed */}
      {!isOpen && (
        <button
          onClick={() => commandRegistry.execute('ui.toggleParamPanel', {})}
          className="absolute top-1/3 right-0 z-10 bg-zinc-800/80 text-zinc-500 hover:text-zinc-200 text-[10px] font-mono py-3 px-1 rounded-l border border-r-0 border-zinc-700 transition-colors pointer-events-auto"
          title="Parameters (P)"
          data-testid="param-panel-toggle"
        >
          {'\u25C0'}
        </button>
      )}

      {/* Panel */}
      <div
        className={`absolute top-0 right-0 bottom-0 z-15 w-[300px] transition-transform duration-200 ease-out pointer-events-auto ${isOpen ? '' : 'pointer-events-none'}`}
        style={{
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        }}
        data-testid="param-panel"
      >
        {panelContent}
      </div>
    </>
  );
}
