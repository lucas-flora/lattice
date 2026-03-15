/**
 * Tests for grid transfer helpers — extracting and applying buffers
 * for the Pyodide worker roundtrip.
 */

import { describe, it, expect } from 'vitest';
import { Grid } from '../../grid/Grid';
import { extractGridBuffers, applyResultBuffers } from '../gridTransfer';

function makeGrid(): Grid {
  const grid = new Grid({
    dimensionality: '2d',
    width: 4,
    height: 4,
    depth: 1,
    topology: 'toroidal',
  });
  grid.addProperty('alive', 1, 0);
  grid.addProperty('energy', 1, 0.5);
  return grid;
}

describe('Grid Transfer', () => {
  it('TestGridTransfer_ExtractBuffers', () => {
    const grid = makeGrid();

    // Set some values in the current buffer
    const aliveBuf = grid.getCurrentBuffer('alive');
    aliveBuf[0] = 1;
    aliveBuf[5] = 1;
    aliveBuf[10] = 1;

    const extracted = extractGridBuffers(grid);

    expect(Object.keys(extracted)).toContain('alive');
    expect(Object.keys(extracted)).toContain('energy');
    expect(extracted.alive).toBeInstanceOf(Float32Array);
    expect(extracted.alive.length).toBe(16); // 4x4
    expect(extracted.alive[0]).toBe(1);
    expect(extracted.alive[5]).toBe(1);
    expect(extracted.alive[10]).toBe(1);
    expect(extracted.alive[1]).toBe(0);

    // Energy should have defaults
    expect(extracted.energy[0]).toBe(0.5);
  });

  it('TestGridTransfer_ExtractBuffers_IsCopy', () => {
    const grid = makeGrid();
    const extracted = extractGridBuffers(grid);

    // Modifying the extracted buffer should NOT affect the grid
    extracted.alive[0] = 99;
    expect(grid.getCurrentBuffer('alive')[0]).toBe(0);
  });

  it('TestGridTransfer_ApplyResults', () => {
    const grid = makeGrid();

    const results: Record<string, Float32Array> = {
      alive: new Float32Array(16),
      energy: new Float32Array(16),
    };
    results.alive[0] = 1;
    results.alive[3] = 1;
    results.energy.fill(0.75);

    applyResultBuffers(grid, results);

    // Results should be in the NEXT buffer
    const nextAlive = grid.getNextBuffer('alive');
    expect(nextAlive[0]).toBe(1);
    expect(nextAlive[3]).toBe(1);
    expect(nextAlive[1]).toBe(0);

    const nextEnergy = grid.getNextBuffer('energy');
    expect(nextEnergy[0]).toBe(0.75);
  });

  it('TestGridTransfer_UnknownPropertyIgnored', () => {
    const grid = makeGrid();

    const results: Record<string, Float32Array> = {
      alive: new Float32Array(16),
      nonexistent: new Float32Array(16),
    };
    results.alive[0] = 1;

    // Should not throw
    expect(() => applyResultBuffers(grid, results)).not.toThrow();

    const nextAlive = grid.getNextBuffer('alive');
    expect(nextAlive[0]).toBe(1);
  });

  it('TestGridTransfer_SizeMismatchIgnored', () => {
    const grid = makeGrid();

    const results: Record<string, Float32Array> = {
      alive: new Float32Array(8), // Wrong size — should be 16
    };
    results.alive[0] = 1;

    // Should not throw, but should not apply either (size mismatch guard)
    expect(() => applyResultBuffers(grid, results)).not.toThrow();

    const nextAlive = grid.getNextBuffer('alive');
    // Should remain at default (0) since size didn't match
    expect(nextAlive[0]).toBe(0);
  });
});
