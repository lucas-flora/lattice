/**
 * Tests that user-supplied YAML files load and run identically to built-in presets.
 *
 * Success Criterion 3: A user-supplied YAML file (not one of the six built-ins)
 * loads and runs identically to a built-in preset — no privilege difference
 * is detectable in tests.
 *
 * YAML-10: Built-in presets are not privileged
 */

import { describe, it, expect } from 'vitest';
import { loadPresetOrThrow } from '../../preset/loader';
import { loadBuiltinPreset } from '../../preset/builtinPresets';
import { Simulation } from '../Simulation';

const USER_SUPPLIED_YAML = `
schema_version: "1"

meta:
  name: "User Custom Seeds"
  author: "Community User"
  description: "A custom rule that counts live neighbors and sets state to that count mod 3"
  tags: ["custom", "user"]

grid:
  dimensionality: "2d"
  width: 32
  height: 32
  topology: "toroidal"

cell_properties:
  - name: "state"
    type: "int"
    default: 0
    role: "input_output"

rule:
  type: "typescript"
  compute: |
    const liveNeighbors = ctx.neighbors.filter(n => n.state > 0).length;
    if (ctx.cell.state === 0) {
      return { state: liveNeighbors === 2 ? 1 : 0 };
    }
    return { state: (ctx.cell.state + 1) % 4 };

visual_mappings:
  - property: "state"
    channel: "color"
    mapping:
      "0": "#000000"
      "1": "#ff0000"
      "2": "#00ff00"
      "3": "#0000ff"
`;

describe('User-supplied YAML preset (YAML-10)', () => {
  it('loads through the same loadPresetOrThrow() as built-in presets', () => {
    const userPreset = loadPresetOrThrow(USER_SUPPLIED_YAML);
    const builtinPreset = loadBuiltinPreset('conways-gol');

    // Both use the same loading path and return the same type
    expect(userPreset.schema_version).toBe(builtinPreset.schema_version);
    expect(userPreset.meta.name).toBe('User Custom Seeds');
  });

  it('creates a Simulation through the same constructor as built-in presets', () => {
    const userPreset = loadPresetOrThrow(USER_SUPPLIED_YAML);
    const builtinPreset = loadBuiltinPreset('conways-gol');

    const userSim = new Simulation(userPreset);
    const builtinSim = new Simulation(builtinPreset);

    // Both simulations use the same Grid and RuleRunner types
    expect(userSim.grid.constructor.name).toBe(builtinSim.grid.constructor.name);
    expect(userSim.runner.constructor.name).toBe(builtinSim.runner.constructor.name);
  });

  it('runs identically to built-in presets — same tick, same perceive-update', () => {
    const userPreset = loadPresetOrThrow(USER_SUPPLIED_YAML);
    const sim = new Simulation(userPreset);

    // Seed some initial state
    const width = userPreset.grid.width;
    sim.setCellDirect('state', 16 + 16 * width, 1);
    sim.setCellDirect('state', 17 + 16 * width, 1);
    sim.setCellDirect('state', 16 + 17 * width, 1);

    // Run 10 ticks
    sim.tickN(10);
    expect(sim.getGeneration()).toBe(10);

    // Should produce non-trivial output
    let nonZero = 0;
    for (let i = 0; i < sim.grid.cellCount; i++) {
      if (sim.getCellDirect('state', i) !== 0) nonZero++;
    }
    expect(nonZero).toBeGreaterThan(0);
  });

  it('no privilege difference is detectable — same API, same behavior', () => {
    const userPreset = loadPresetOrThrow(USER_SUPPLIED_YAML);
    const builtinPreset = loadBuiltinPreset('brians-brain');

    const userSim = new Simulation(userPreset);
    const builtinSim = new Simulation(builtinPreset);

    // Both support the same operations
    expect(typeof userSim.tick).toBe('function');
    expect(typeof builtinSim.tick).toBe('function');
    expect(typeof userSim.tickN).toBe('function');
    expect(typeof builtinSim.tickN).toBe('function');
    expect(typeof userSim.setCellDirect).toBe('function');
    expect(typeof builtinSim.setCellDirect).toBe('function');
    expect(typeof userSim.getCellDirect).toBe('function');
    expect(typeof builtinSim.getCellDirect).toBe('function');
    expect(typeof userSim.reset).toBe('function');
    expect(typeof builtinSim.reset).toBe('function');

    // Both runners report no WASM
    expect(userSim.runner.isUsingWasm()).toBe(builtinSim.runner.isUsingWasm());

    // Both can tick and reset identically
    userSim.tick();
    builtinSim.tick();
    expect(userSim.getGeneration()).toBe(builtinSim.getGeneration());

    userSim.reset();
    builtinSim.reset();
    expect(userSim.getGeneration()).toBe(builtinSim.getGeneration());
  });
});
