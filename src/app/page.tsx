/**
 * Lattice main page.
 *
 * Renders the SimulationViewport with a live cellular automaton simulation.
 * Supports switching between Conway's Game of Life (2D) and Rule 110 (1D)
 * to demonstrate the unified renderer path (RNDR-04).
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import { SimulationViewport } from '@/components/viewport/SimulationViewport';
import { loadPresetOrThrow } from '@/engine/preset/loader';

// Conway's Game of Life preset (inlined for browser use -- no fs access)
const CONWAYS_GOL_YAML = `
schema_version: "1"
meta:
  name: "Conway's Game of Life"
  author: "John Conway"
  description: "The classic cellular automaton. Cells live or die based on neighbor count."
  tags: ["classic", "2d", "binary"]
grid:
  dimensionality: "2d"
  width: 128
  height: 128
  topology: "toroidal"
cell_properties:
  - name: "alive"
    type: "bool"
    default: 0
    role: "input_output"
rule:
  type: "typescript"
  compute: |
    const alive = ctx.cell.alive;
    const liveNeighbors = ctx.neighbors.filter(n => n.alive === 1).length;
    if (alive === 1) {
      return { alive: (liveNeighbors === 2 || liveNeighbors === 3) ? 1 : 0 };
    }
    return { alive: liveNeighbors === 3 ? 1 : 0 };
visual_mappings:
  - property: "alive"
    channel: "color"
    mapping:
      "0": "#000000"
      "1": "#00ff00"
`;

// Rule 110 preset (inlined for browser use)
const RULE_110_YAML = `
schema_version: "1"
meta:
  name: "Rule 110"
  author: "Stephen Wolfram"
  description: "1D elementary cellular automaton Rule 110 -- proven Turing-complete."
  tags: ["1d", "elementary", "turing-complete"]
grid:
  dimensionality: "1d"
  width: 256
  topology: "finite"
cell_properties:
  - name: "state"
    type: "bool"
    default: 0
    role: "input_output"
rule:
  type: "typescript"
  compute: |
    const c = ctx.cell.state ? 1 : 0;
    const left = ctx.neighbors.length > 0 ? (ctx.neighbors[0].state ? 1 : 0) : 0;
    const right = ctx.neighbors.length > 1 ? (ctx.neighbors[1].state ? 1 : 0) : 0;
    const pattern = (left << 2) | (c << 1) | right;
    const rule110 = 0b01101110;
    return { state: (rule110 >> pattern) & 1 };
visual_mappings:
  - property: "state"
    channel: "color"
    mapping:
      "0": "#ffffff"
      "1": "#000000"
`;

type PresetKey = 'gol' | 'rule110';

export default function Home() {
  const [generation, setGeneration] = useState(0);
  const [activePreset, setActivePreset] = useState<PresetKey>('gol');

  const preset = useMemo(() => {
    return activePreset === 'gol'
      ? loadPresetOrThrow(CONWAYS_GOL_YAML)
      : loadPresetOrThrow(RULE_110_YAML);
  }, [activePreset]);

  const handleGenerationChange = useCallback((gen: number) => {
    setGeneration(gen);
  }, []);

  const switchPreset = useCallback((key: PresetKey) => {
    setGeneration(0);
    setActivePreset(key);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-black">
      {/* Minimal HUD overlay */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-1 pointer-events-none">
        <h1 className="text-sm font-mono text-zinc-500 tracking-wider uppercase">
          Lattice
        </h1>
        <p className="text-xs font-mono text-zinc-600">{preset.meta.name}</p>
        <p className="text-lg font-mono text-green-400 tabular-nums">
          Gen {generation}
        </p>
      </div>

      {/* Preset switcher */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <button
          onClick={() => switchPreset('gol')}
          className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
            activePreset === 'gol'
              ? 'bg-zinc-700 text-zinc-200'
              : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-400'
          }`}
        >
          GoL
        </button>
        <button
          onClick={() => switchPreset('rule110')}
          className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
            activePreset === 'rule110'
              ? 'bg-zinc-700 text-zinc-200'
              : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-400'
          }`}
        >
          Rule 110
        </button>
      </div>

      {/* Viewport fills remaining space */}
      <div className="flex-1">
        <SimulationViewport
          key={activePreset}
          preset={preset}
          running={true}
          tickInterval={100}
          onGenerationChange={handleGenerationChange}
        />
      </div>
    </div>
  );
}
