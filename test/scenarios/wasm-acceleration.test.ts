/**
 * Scenario tests for WASM acceleration.
 *
 * End-to-end workflows verifying WASM fallback, preset loading,
 * and correctness of the full simulation pipeline.
 *
 * RULE-03: WASM rule execution pipeline
 * RULE-04: Whole-tick API
 * RULE-05: Silent WASM fallback
 */

import { describe, it, expect } from 'vitest';
import { loadBuiltinPreset, BUILTIN_PRESET_NAMES } from '../../src/engine/preset/builtinPresets';
import { Simulation } from '../../src/engine/rule/Simulation';
import { RuleRunner } from '../../src/engine/rule/RuleRunner';
import { Grid } from '../../src/engine/grid/Grid';
import { CHANNELS_PER_TYPE } from '../../src/engine/cell/types';
import type { PresetConfig } from '../../src/engine/preset/types';

function createSimFromPreset(preset: PresetConfig): Simulation {
  return new Simulation(preset);
}

function makeGrid(preset: PresetConfig): Grid {
  const grid = new Grid({
    dimensionality: preset.grid.dimensionality,
    width: preset.grid.width,
    height: preset.grid.height ?? 1,
    depth: preset.grid.depth ?? 1,
    topology: preset.grid.topology,
  });
  for (const prop of preset.cell_properties) {
    const channels = CHANNELS_PER_TYPE[prop.type];
    grid.addProperty(prop.name, channels, prop.default);
  }
  return grid;
}

describe('WASM Acceleration Scenarios', () => {
  it('Gray-Scott fallback produces non-trivial reaction-diffusion output', () => {
    const preset = loadBuiltinPreset('gray-scott');
    const sim = createSimFromPreset(preset);

    // Seed center with V (activator)
    const w = preset.grid.width;
    const h = preset.grid.height ?? 1;
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);

    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = (cx + dx + w) % w;
        const y = (cy + dy + h) % h;
        const idx = x + y * w;
        sim.setCellDirect('v', idx, 0.5);
      }
    }

    // Run 10 ticks
    sim.tickN(10);

    // Verify reaction-diffusion pattern has formed
    // V should have spread beyond the initial seed
    let vNonZeroCount = 0;
    for (let i = 0; i < sim.grid.cellCount; i++) {
      if (sim.getCellDirect('v', i) > 0.001) {
        vNonZeroCount++;
      }
    }
    expect(vNonZeroCount).toBeGreaterThan(25); // More than the initial 5x5=25 seed
  });

  it('Navier-Stokes fallback produces non-trivial fluid output', () => {
    const preset = loadBuiltinPreset('navier-stokes');
    const sim = createSimFromPreset(preset);

    // Seed center with velocity and density
    const w = preset.grid.width;
    const h = preset.grid.height ?? 1;
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    const centerIdx = cx + cy * w;

    sim.setCellDirect('vx', centerIdx, 2.0);
    sim.setCellDirect('vy', centerIdx, 1.0);
    sim.setCellDirect('density', centerIdx, 5.0);

    sim.tickN(10);

    // Verify fluid dynamics output: velocity should have diffused
    let vxNonZero = 0;
    for (let i = 0; i < sim.grid.cellCount; i++) {
      if (Math.abs(sim.getCellDirect('vx', i)) > 0.001) {
        vxNonZero++;
      }
    }
    expect(vxNonZero).toBeGreaterThan(1); // Should have spread beyond center
  });

  it('silent fallback -- no errors during entire lifecycle', () => {
    const preset = loadBuiltinPreset('gray-scott');
    expect(preset.rule.type).toBe('wasm');

    // Full lifecycle: create -> tick -> reset -> tick
    // No WASM available -- should use TS silently
    const sim = createSimFromPreset(preset);
    expect(sim.runner.isUsingWasm()).toBe(false);

    sim.tick();
    expect(sim.getGeneration()).toBe(1);

    sim.reset();
    expect(sim.getGeneration()).toBe(0);

    sim.tick();
    expect(sim.getGeneration()).toBe(1);
    // No errors thrown throughout
  });

  it('all 6 built-in presets still load and tick correctly', () => {
    for (const name of BUILTIN_PRESET_NAMES) {
      const preset = loadBuiltinPreset(name);
      const sim = createSimFromPreset(preset);

      // Tick should not throw
      sim.tick();
      expect(sim.getGeneration()).toBe(1);
    }
  });

  it('WASM preset in fallback mode matches manual TS preset output', () => {
    // Load the WASM-type Gray-Scott preset
    const wasmPreset = loadBuiltinPreset('gray-scott');
    expect(wasmPreset.rule.type).toBe('wasm');

    // Create a manual TS-type copy with same compute body
    const tsPreset = {
      ...wasmPreset,
      rule: {
        type: 'typescript' as const,
        compute: wasmPreset.rule.compute,
      },
    } as PresetConfig;

    const wasmGrid = makeGrid(wasmPreset);
    const tsGrid = makeGrid(tsPreset);

    // Seed both identically
    const w = wasmPreset.grid.width;
    const centerIdx = Math.floor(w / 2) + Math.floor((wasmPreset.grid.height ?? 1) / 2) * w;
    wasmGrid.getCurrentBuffer('v')[centerIdx] = 0.5;
    tsGrid.getCurrentBuffer('v')[centerIdx] = 0.5;

    // Create runners (both will use TS since no WASM module loaded)
    const wasmRunner = new RuleRunner(wasmGrid, wasmPreset);
    const tsRunner = new RuleRunner(tsGrid, tsPreset);

    // Run 5 ticks
    for (let i = 0; i < 5; i++) {
      wasmRunner.tick();
      tsRunner.tick();
    }

    // Outputs should be identical
    const wasmU = wasmGrid.getCurrentBuffer('u');
    const tsU = tsGrid.getCurrentBuffer('u');
    const wasmV = wasmGrid.getCurrentBuffer('v');
    const tsV = tsGrid.getCurrentBuffer('v');

    for (let i = 0; i < wasmU.length; i++) {
      expect(wasmU[i]).toBeCloseTo(tsU[i], 6);
      expect(wasmV[i]).toBeCloseTo(tsV[i], 6);
    }
  });
});
