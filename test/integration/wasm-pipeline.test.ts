/**
 * Integration tests for the WASM rule execution pipeline.
 *
 * RULE-03: WASM (Rust) rule execution pipeline
 * RULE-04: WASM API operates on whole ticks
 *
 * Tests run with TypeScript fallback since WASM binary is not available
 * in Node.js test environment. Verifies the full pipeline: preset load ->
 * schema validation -> Simulation creation -> ticking -> correct output.
 */

import { describe, it, expect } from 'vitest';
import { loadPresetOrThrow } from '../../src/engine/preset/loader';
import { loadBuiltinPreset } from '../../src/engine/preset/builtinPresets';
import { Simulation } from '../../src/engine/rule/Simulation';
import { PresetSchema } from '../../src/engine/preset/schema';

describe('WASM Pipeline Integration', () => {
  it('Gray-Scott preset loads and ticks with TS fallback', () => {
    const preset = loadBuiltinPreset('gray-scott');
    expect(preset.rule.type).toBe('wasm');
    expect(preset.rule.wasm_module).toBe('gray_scott_tick');

    const sim = new Simulation(preset);

    // Seed center with V
    const cx = preset.grid.width / 2;
    const cy = (preset.grid.height ?? 1) / 2;
    const width = preset.grid.width;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const idx = (cx + dx) + (cy + dy) * width;
        sim.setCellDirect('v', idx, 0.5);
      }
    }

    // Run 10 ticks
    sim.tickN(10);
    expect(sim.getGeneration()).toBe(10);

    // Verify non-trivial output
    const centerIdx = cx + cy * width;
    const uVal = sim.getCellDirect('u', centerIdx);
    const vVal = sim.getCellDirect('v', centerIdx);
    expect(uVal).toBeLessThan(1.0); // U should have decreased from reaction
    expect(vVal).toBeGreaterThan(0.0); // V should still be active
  });

  it('Navier-Stokes preset loads and ticks with TS fallback', () => {
    const preset = loadBuiltinPreset('navier-stokes');
    expect(preset.rule.type).toBe('wasm');
    expect(preset.rule.wasm_module).toBe('navier_stokes_tick');

    const sim = new Simulation(preset);

    // Seed with some velocity and density
    const cx = preset.grid.width / 2;
    const cy = (preset.grid.height ?? 1) / 2;
    const width = preset.grid.width;
    const centerIdx = cx + cy * width;
    sim.setCellDirect('vx', centerIdx, 1.0);
    sim.setCellDirect('vy', centerIdx, 0.5);
    sim.setCellDirect('density', centerIdx, 5.0);

    sim.tickN(10);
    expect(sim.getGeneration()).toBe(10);

    // Verify the sim produced some output (density should have spread)
    // The exact values depend on the rule computation
    let totalDensity = 0;
    for (let i = 0; i < sim.grid.cellCount; i++) {
      totalDensity += sim.getCellDirect('density', i);
    }
    // Total density should be non-zero (fluid didn't completely dissipate)
    expect(totalDensity).toBeGreaterThan(0);
  });

  it('schema accepts wasm rule type', () => {
    const yamlObj = {
      schema_version: '1',
      meta: { name: 'WASM Test' },
      grid: { dimensionality: '2d', width: 4, height: 4, topology: 'toroidal' },
      cell_properties: [{ name: 'state', type: 'float', default: 0 }],
      rule: {
        type: 'wasm',
        compute: 'return { state: 0 };',
        wasm_module: 'test_tick',
      },
    };
    const result = PresetSchema.safeParse(yamlObj);
    expect(result.success).toBe(true);
  });

  it('schema still accepts typescript rule type', () => {
    const yamlObj = {
      schema_version: '1',
      meta: { name: 'TS Test' },
      grid: { dimensionality: '2d', width: 4, height: 4, topology: 'toroidal' },
      cell_properties: [{ name: 'state', type: 'float', default: 0 }],
      rule: { type: 'typescript', compute: 'return { state: 0 };' },
    };
    const result = PresetSchema.safeParse(yamlObj);
    expect(result.success).toBe(true);
  });

  it('schema accepts fallback_compute field', () => {
    const yamlObj = {
      schema_version: '1',
      meta: { name: 'Fallback Test' },
      grid: { dimensionality: '2d', width: 4, height: 4, topology: 'toroidal' },
      cell_properties: [{ name: 'state', type: 'float', default: 0 }],
      rule: {
        type: 'wasm',
        compute: 'return { state: 0 };',
        wasm_module: 'test_tick',
        fallback_compute: 'return { state: 1 };',
      },
    };
    const result = PresetSchema.safeParse(yamlObj);
    expect(result.success).toBe(true);
  });
});
