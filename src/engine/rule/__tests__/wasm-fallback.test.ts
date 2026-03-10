/**
 * Tests for WASM fallback behavior in RuleRunner.
 *
 * RULE-05: RuleRunner silently falls back to TypeScript when WASM is unavailable.
 * RULE-03: WASM rule execution pipeline (fallback path)
 */

import { describe, it, expect } from 'vitest';
import { Grid } from '../../grid/Grid';
import { RuleRunner } from '../RuleRunner';
import type { PresetConfig } from '../../preset/types';

function makeWasmPreset(): PresetConfig {
  return {
    schema_version: '1',
    meta: { name: 'WASM Test' },
    grid: { dimensionality: '2d', width: 4, height: 4, topology: 'toroidal' },
    cell_properties: [
      { name: 'u', type: 'float', default: 1.0, role: 'input_output' },
      { name: 'v', type: 'float', default: 0.0, role: 'input_output' },
    ],
    rule: {
      type: 'wasm',
      wasm_module: 'gray_scott_tick',
      compute: `
        const Du = 0.2097;
        const Dv = 0.105;
        const F = 0.037;
        const k = 0.06;
        const dt = 1.0;
        const u = ctx.cell.u;
        const v = ctx.cell.v;
        let lapU = 0;
        let lapV = 0;
        const neighborCount = ctx.neighbors.length;
        for (const n of ctx.neighbors) {
          lapU += n.u - u;
          lapV += n.v - v;
        }
        if (neighborCount > 0) {
          lapU = lapU * (4.0 / neighborCount);
          lapV = lapV * (4.0 / neighborCount);
        }
        const uvv = u * v * v;
        const newU = u + dt * (Du * lapU - uvv + F * (1.0 - u));
        const newV = v + dt * (Dv * lapV + uvv - (F + k) * v);
        return {
          u: Math.max(0, Math.min(1, newU)),
          v: Math.max(0, Math.min(1, newV))
        };
      `,
    },
  } as PresetConfig;
}

function makeTSPreset(): PresetConfig {
  return {
    schema_version: '1',
    meta: { name: 'TS Test' },
    grid: { dimensionality: '2d', width: 4, height: 4, topology: 'toroidal' },
    cell_properties: [{ name: 'state', type: 'float', default: 0 }],
    rule: {
      type: 'typescript',
      compute: 'return { state: 42 };',
    },
  } as PresetConfig;
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
    grid.addProperty(prop.name, 1, prop.default as number);
  }
  return grid;
}

describe('RuleRunner WASM Fallback', () => {
  it('falls back to TypeScript when no WASM module provided', () => {
    const preset = makeWasmPreset();
    const grid = makeGrid(preset);
    // No wasmModule argument -- should fall back silently
    const runner = new RuleRunner(grid, preset);
    expect(runner.isUsingWasm()).toBe(false);
  });

  it('does not throw when WASM module is missing (RULE-05)', () => {
    const preset = makeWasmPreset();
    const grid = makeGrid(preset);
    expect(() => new RuleRunner(grid, preset)).not.toThrow();
  });

  it('tick works with TypeScript fallback for WASM preset', () => {
    const preset = makeWasmPreset();
    const grid = makeGrid(preset);
    const runner = new RuleRunner(grid, preset);

    // Should not throw
    runner.tick();
    expect(runner.getGeneration()).toBe(1);
  });

  it('TypeScript preset never attempts WASM loading', () => {
    const preset = makeTSPreset();
    const grid = makeGrid(preset);
    const runner = new RuleRunner(grid, preset);
    expect(runner.isUsingWasm()).toBe(false);
    runner.tick();
    expect(grid.getCellValue('state', 0)).toBe(42);
  });

  it('WASM preset produces correct output in fallback mode (Gray-Scott)', () => {
    const preset = makeWasmPreset();
    const grid = makeGrid(preset);

    // Seed some V in center
    const buf = grid.getCurrentBuffer('v');
    buf[5] = 0.5; // Set one cell

    const runner = new RuleRunner(grid, preset);
    runner.tick();

    // After one tick, the reaction should have modified U at the seeded cell
    // U starts at 1.0 and should decrease slightly due to reaction
    const uVal = grid.getCellValue('u', 5);
    expect(uVal).toBeLessThan(1.0);
    expect(uVal).toBeGreaterThan(0.0);
  });

  it('simulation continues at lower speed without WASM', () => {
    const preset = makeWasmPreset();
    const grid = makeGrid(preset);
    const runner = new RuleRunner(grid, preset);

    // Run multiple ticks -- should all succeed without errors
    for (let i = 0; i < 10; i++) {
      runner.tick();
    }
    expect(runner.getGeneration()).toBe(10);
  });
});
