/**
 * Tests for Simulation — high-level facade for grid + rule runner.
 */

import { describe, it, expect } from 'vitest';
import { loadPresetOrThrow } from '../../preset/loader';
import { Simulation } from '../Simulation';

const PRESET_YAML = `
schema_version: "1"
meta:
  name: "Sim Test"
grid:
  dimensionality: "2d"
  width: 8
  height: 8
  topology: "toroidal"
cell_properties:
  - name: "alive"
    type: "bool"
    default: 0
    role: "input_output"
  - name: "energy"
    type: "float"
    default: 1.0
    role: "input_output"
rule:
  type: "typescript"
  compute: |
    const alive = ctx.cell.alive;
    const liveNeighbors = ctx.neighbors.filter(n => n.alive === 1).length;
    let newAlive;
    if (alive === 1) {
      newAlive = (liveNeighbors === 2 || liveNeighbors === 3) ? 1 : 0;
    } else {
      newAlive = liveNeighbors === 3 ? 1 : 0;
    }
    return { alive: newAlive, energy: newAlive === 1 ? ctx.cell.energy * 0.9 : 1.0 };
`;

describe('Simulation', () => {
  it('creates from a preset config', () => {
    const preset = loadPresetOrThrow(PRESET_YAML);
    const sim = new Simulation(preset);
    expect(sim.grid).toBeDefined();
    expect(sim.runner).toBeDefined();
    expect(sim.getGeneration()).toBe(0);
  });

  it('registers all cell properties on the grid', () => {
    const preset = loadPresetOrThrow(PRESET_YAML);
    const sim = new Simulation(preset);
    expect(sim.grid.hasProperty('alive')).toBe(true);
    expect(sim.grid.hasProperty('energy')).toBe(true);
  });

  it('setCellDirect and getCellDirect work correctly', () => {
    const preset = loadPresetOrThrow(PRESET_YAML);
    const sim = new Simulation(preset);
    sim.setCellDirect('alive', 0, 1);
    expect(sim.getCellDirect('alive', 0)).toBe(1);
    expect(sim.getCellDirect('alive', 1)).toBe(0);
  });

  it('tick advances generation', () => {
    const preset = loadPresetOrThrow(PRESET_YAML);
    const sim = new Simulation(preset);
    sim.tick();
    expect(sim.getGeneration()).toBe(1);
  });

  it('tickN runs multiple ticks', () => {
    const preset = loadPresetOrThrow(PRESET_YAML);
    const sim = new Simulation(preset);
    sim.tickN(5);
    expect(sim.getGeneration()).toBe(5);
  });

  it('reset restores initial state', () => {
    const preset = loadPresetOrThrow(PRESET_YAML);
    const sim = new Simulation(preset);
    sim.setCellDirect('alive', 0, 1);
    sim.tickN(5);
    sim.reset();
    expect(sim.getGeneration()).toBe(0);
    expect(sim.getCellDirect('alive', 0)).toBe(0);
  });

  it('handles multi-property presets', () => {
    const preset = loadPresetOrThrow(PRESET_YAML);
    const sim = new Simulation(preset);

    // Set alive and energy
    sim.setCellDirect('alive', 0, 1);
    sim.setCellDirect('energy', 0, 0.5);

    expect(sim.getCellDirect('alive', 0)).toBe(1);
    expect(sim.getCellDirect('energy', 0)).toBe(0.5);
  });

  it('rule updates multiple properties per tick', () => {
    const preset = loadPresetOrThrow(PRESET_YAML);
    const sim = new Simulation(preset);

    // Create a blinker
    const width = 8;
    sim.setCellDirect('alive', 3 + 4 * width, 1);
    sim.setCellDirect('alive', 4 + 4 * width, 1);
    sim.setCellDirect('alive', 5 + 4 * width, 1);

    sim.tick();

    // Blinker should have rotated and energy should have decayed for alive cells
    const centerAlive = sim.getCellDirect('alive', 4 + 4 * width);
    expect(centerAlive).toBe(1);
  });
});
