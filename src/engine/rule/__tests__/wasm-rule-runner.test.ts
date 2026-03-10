/**
 * Tests for WasmRuleRunner -- WASM delegate for whole-tick rule execution.
 *
 * RULE-03: WASM rule execution pipeline
 * RULE-04: Whole-tick API (not per-cell)
 */

import { describe, it, expect, vi } from 'vitest';
import { Grid } from '../../grid/Grid';
import { WasmRuleRunner } from '../WasmRuleRunner';
import type { PresetConfig } from '../../preset/types';
import type { WasmModule } from '../types';

function makeGrayScottPreset(): PresetConfig {
  return {
    schema_version: '1',
    meta: { name: 'GS Test' },
    grid: { dimensionality: '2d', width: 4, height: 4, topology: 'toroidal' },
    cell_properties: [
      { name: 'u', type: 'float', default: 1.0, role: 'input_output' },
      { name: 'v', type: 'float', default: 0.0, role: 'input_output' },
    ],
    rule: {
      type: 'wasm',
      compute: 'return { u: ctx.cell.u, v: ctx.cell.v };',
      wasm_module: 'gray_scott_tick',
    },
  } as PresetConfig;
}

function makeNavierStokesPreset(): PresetConfig {
  return {
    schema_version: '1',
    meta: { name: 'NS Test' },
    grid: { dimensionality: '2d', width: 4, height: 4, topology: 'toroidal' },
    cell_properties: [
      { name: 'vx', type: 'float', default: 0.0, role: 'input_output' },
      { name: 'vy', type: 'float', default: 0.0, role: 'input_output' },
      { name: 'density', type: 'float', default: 0.0, role: 'input_output' },
      { name: 'pressure', type: 'float', default: 0.0, role: 'input_output' },
    ],
    rule: {
      type: 'wasm',
      compute: 'return { vx: 0, vy: 0, density: 0, pressure: 0 };',
      wasm_module: 'navier_stokes_tick',
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

function makeMockWasmModule(): WasmModule {
  return {
    gray_scott_tick: vi.fn(
      (
        uIn: Float32Array,
        vIn: Float32Array,
        uOut: Float32Array,
        vOut: Float32Array,
      ) => {
        // Simple mock: copy input to output with slight modification
        for (let i = 0; i < uIn.length; i++) {
          uOut[i] = uIn[i] * 0.99;
          vOut[i] = vIn[i] + 0.01;
        }
      },
    ),
    navier_stokes_tick: vi.fn(
      (
        vxIn: Float32Array,
        vyIn: Float32Array,
        densityIn: Float32Array,
        pressureIn: Float32Array,
        vxOut: Float32Array,
        vyOut: Float32Array,
        densityOut: Float32Array,
        pressureOut: Float32Array,
      ) => {
        for (let i = 0; i < vxIn.length; i++) {
          vxOut[i] = vxIn[i] + 0.1;
          vyOut[i] = vyIn[i] + 0.1;
          densityOut[i] = densityIn[i];
          pressureOut[i] = pressureIn[i];
        }
      },
    ),
  };
}

describe('WasmRuleRunner', () => {
  it('delegates Gray-Scott tick to WASM function', () => {
    const preset = makeGrayScottPreset();
    const grid = makeGrid(preset);
    const wasmModule = makeMockWasmModule();
    const runner = new WasmRuleRunner(grid, preset, wasmModule);

    runner.tick();

    expect(wasmModule.gray_scott_tick).toHaveBeenCalledTimes(1);
  });

  it('swaps buffers after Gray-Scott tick', () => {
    const preset = makeGrayScottPreset();
    const grid = makeGrid(preset);
    const wasmModule = makeMockWasmModule();
    const runner = new WasmRuleRunner(grid, preset, wasmModule);

    const bufBefore = grid.getCurrentBuffer('u');
    runner.tick();
    const bufAfter = grid.getCurrentBuffer('u');

    // After swap, current buffer should be the one that was "next" before
    expect(bufAfter).not.toBe(bufBefore);
  });

  it('passes all 4 buffer pairs for Navier-Stokes', () => {
    const preset = makeNavierStokesPreset();
    const grid = makeGrid(preset);
    const wasmModule = makeMockWasmModule();
    const runner = new WasmRuleRunner(grid, preset, wasmModule);

    runner.tick();

    expect(wasmModule.navier_stokes_tick).toHaveBeenCalledTimes(1);
    // Should have been called with 8 buffers (4 in + 4 out) + dimensions + params
    const call = (wasmModule.navier_stokes_tick as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call.length).toBeGreaterThanOrEqual(8); // 8 buffers + width + height + params
  });

  it('increments generation on each tick', () => {
    const preset = makeGrayScottPreset();
    const grid = makeGrid(preset);
    const wasmModule = makeMockWasmModule();
    const runner = new WasmRuleRunner(grid, preset, wasmModule);

    expect(runner.getGeneration()).toBe(0);
    runner.tick();
    expect(runner.getGeneration()).toBe(1);
    runner.tick();
    expect(runner.getGeneration()).toBe(2);
  });

  it('isUsingWasm returns true', () => {
    const preset = makeGrayScottPreset();
    const grid = makeGrid(preset);
    const wasmModule = makeMockWasmModule();
    const runner = new WasmRuleRunner(grid, preset, wasmModule);

    expect(runner.isUsingWasm()).toBe(true);
  });

  it('throws if wasm_module not set on preset', () => {
    const preset = makeGrayScottPreset();
    (preset.rule as { wasm_module?: string }).wasm_module = undefined;
    const grid = makeGrid(preset);
    const wasmModule = makeMockWasmModule();

    expect(() => new WasmRuleRunner(grid, preset, wasmModule)).toThrow(
      'WasmRuleRunner requires preset.rule.wasm_module',
    );
  });

  it('throws if WASM module does not export the function', () => {
    const preset = makeGrayScottPreset();
    (preset.rule as { wasm_module: string }).wasm_module = 'nonexistent_function';
    const grid = makeGrid(preset);
    const wasmModule = makeMockWasmModule();

    expect(() => new WasmRuleRunner(grid, preset, wasmModule)).toThrow(
      "WASM module does not export function 'nonexistent_function'",
    );
  });
});
