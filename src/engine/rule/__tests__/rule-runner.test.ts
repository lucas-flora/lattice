/**
 * Tests for RuleRunner — the perceive-update engine.
 *
 * RULE-01: Perceive-update contract
 * RULE-02: TypeScript rule execution
 * RULE-05: Silent WASM fallback
 */

import { describe, it, expect } from 'vitest';
import { Grid } from '../../grid/Grid';
import { RuleRunner } from '../RuleRunner';
import type { PresetConfig } from '../../preset/types';

function makeSimplePreset(compute: string): PresetConfig {
  return {
    schema_version: '1',
    meta: { name: 'Test' },
    grid: { dimensionality: '2d', width: 4, height: 4, topology: 'toroidal' },
    cell_properties: [
      { name: 'state', type: 'float', default: 0 },
    ],
    rule: { type: 'typescript', compute },
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

describe('RuleRunner', () => {
  it('initializes with generation 0', () => {
    const preset = makeSimplePreset('return { state: 0 };');
    const grid = makeGrid(preset);
    const runner = new RuleRunner(grid, preset);
    expect(runner.getGeneration()).toBe(0);
  });

  it('increments generation after each tick', () => {
    const preset = makeSimplePreset('return { state: 0 };');
    const grid = makeGrid(preset);
    const runner = new RuleRunner(grid, preset);
    runner.tick();
    expect(runner.getGeneration()).toBe(1);
    runner.tick();
    expect(runner.getGeneration()).toBe(2);
  });

  it('applies rule computation to all cells', () => {
    const preset = makeSimplePreset('return { state: 1 };');
    const grid = makeGrid(preset);
    const runner = new RuleRunner(grid, preset);
    runner.tick();
    // After tick, all cells should be 1
    for (let i = 0; i < grid.cellCount; i++) {
      expect(grid.getCellValue('state', i)).toBe(1);
    }
  });

  it('preserves cell values between ticks correctly', () => {
    // Set one cell to 1, rule copies current state
    const preset = makeSimplePreset('return { state: ctx.cell.state };');
    const grid = makeGrid(preset);
    // Set cell 0 to 1 in the current buffer
    const buf = grid.getCurrentBuffer('state');
    buf[0] = 1;
    const runner = new RuleRunner(grid, preset);
    runner.tick();
    expect(grid.getCellValue('state', 0)).toBe(1);
    expect(grid.getCellValue('state', 1)).toBe(0);
  });

  it('provides neighbor values to rule function', () => {
    // Rule sums neighbor states
    const preset = makeSimplePreset(`
      let sum = 0;
      for (const n of ctx.neighbors) { sum += n.state; }
      return { state: sum };
    `);
    const grid = makeGrid(preset);
    // Set a few cells to 1
    const buf = grid.getCurrentBuffer('state');
    buf[0] = 1; // (0,0)
    buf[1] = 1; // (1,0)
    const runner = new RuleRunner(grid, preset);
    runner.tick();
    // Cell at (0,0) should have neighbors with various states
    // The sum depends on neighborhood (toroidal Moore for 4x4)
    const val = grid.getCellValue('state', 0);
    expect(val).toBeGreaterThan(0);
  });

  it('resets to initial state', () => {
    const preset = makeSimplePreset('return { state: 1 };');
    const grid = makeGrid(preset);
    const runner = new RuleRunner(grid, preset);
    runner.tick();
    expect(runner.getGeneration()).toBe(1);
    runner.reset();
    expect(runner.getGeneration()).toBe(0);
    // All cells should be back to default (0)
    for (let i = 0; i < grid.cellCount; i++) {
      expect(grid.getCellValue('state', i)).toBe(0);
    }
  });

  it('falls back to TypeScript when no WASM is present (RULE-05)', () => {
    const preset = makeSimplePreset('return { state: 42 };');
    const grid = makeGrid(preset);
    // RuleRunner should NOT throw — silent fallback
    const runner = new RuleRunner(grid, preset);
    expect(runner.isUsingWasm()).toBe(false);
    // Should still work with TS
    runner.tick();
    expect(grid.getCellValue('state', 0)).toBe(42);
  });

  it('does not throw exceptions when WASM is unavailable (RULE-05)', () => {
    const preset = makeSimplePreset('return { state: 0 };');
    const grid = makeGrid(preset);
    expect(() => new RuleRunner(grid, preset)).not.toThrow();
  });

  it('tick returns correct generation in result', () => {
    const preset = makeSimplePreset('return { state: 0 };');
    const grid = makeGrid(preset);
    const runner = new RuleRunner(grid, preset);
    const result = runner.tick();
    expect(result.generation).toBe(1);
  });
});
