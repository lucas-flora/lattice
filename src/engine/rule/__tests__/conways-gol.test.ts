/**
 * Conway's Game of Life — glider test.
 *
 * Success Criterion 1: Conway's Game of Life runs a glider pattern for 100
 * generations in a Vitest test and the glider is at the correct translated position.
 *
 * YAML-04: Built-in preset: Conway's Game of Life
 */

import { describe, it, expect } from 'vitest';
import { loadBuiltinPreset } from '../../preset/builtinPresets';
import { Simulation } from '../Simulation';

describe("Conway's Game of Life", () => {
  it('loads from built-in YAML preset', () => {
    const preset = loadBuiltinPreset('conways-gol');
    expect(preset.meta.name).toBe("Conway's Game of Life");
    expect(preset.grid.dimensionality).toBe('2d');
    expect(preset.cell_properties[0].name).toBe('alive');
  });

  it('runs a glider for 100 generations and verifies position', () => {
    const preset = loadBuiltinPreset('conways-gol');
    const sim = new Simulation(preset);

    // Place a glider at position (1,1)
    // Standard glider pattern (going down-right on toroidal grid):
    //   .X.
    //   ..X
    //   XXX
    const width = preset.grid.width;
    const gliderCells = [
      [2, 1], // row 1, col 2
      [3, 2], // row 2, col 3
      [1, 3], // row 3, col 1
      [2, 3], // row 3, col 2
      [3, 3], // row 3, col 3
    ];

    for (const [x, y] of gliderCells) {
      const index = x + y * width;
      sim.setCellDirect('alive', index, 1);
    }

    // Verify initial state
    const initialAlive = countAlive(sim);
    expect(initialAlive).toBe(5);

    // Run 100 generations
    // A glider in GoL moves 1 cell diagonally every 4 generations
    // After 100 generations (= 25 full cycles), it moves +25 in x and +25 in y
    sim.tickN(100);

    expect(sim.getGeneration()).toBe(100);

    // Count alive cells — should still be exactly 5
    const finalAlive = countAlive(sim);
    expect(finalAlive).toBe(5);

    // Find the centroid of alive cells after 100 generations
    const aliveCells = getAliveCells(sim, width, preset.grid.height!);

    // The glider should have translated +25, +25 from original position
    // Original centroid: (2.2, 2.4) (average of glider cells)
    // Expected centroid after 100 gens: (27.2, 27.4) on toroidal grid
    // On a 128x128 toroidal grid this stays within bounds
    const expectedDx = 25;
    const expectedDy = 25;

    // Original centroid
    const origCx = (2 + 3 + 1 + 2 + 3) / 5; // 2.2
    const origCy = (1 + 2 + 3 + 3 + 3) / 5; // 2.4

    const expectedCx = origCx + expectedDx;
    const expectedCy = origCy + expectedDy;

    // Compute actual centroid
    let cx = 0, cy = 0;
    for (const [ax, ay] of aliveCells) {
      cx += ax;
      cy += ay;
    }
    cx /= aliveCells.length;
    cy /= aliveCells.length;

    // The glider should be at the expected position (within floating point tolerance)
    expect(cx).toBeCloseTo(expectedCx, 0);
    expect(cy).toBeCloseTo(expectedCy, 0);
  });

  it('correctly applies B3/S23 rules', () => {
    const preset = loadBuiltinPreset('conways-gol');
    const sim = new Simulation(preset);
    const width = preset.grid.width;

    // Place a blinker (period-2 oscillator) horizontally at (10,10)
    // X X X
    sim.setCellDirect('alive', 9 + 10 * width, 1);
    sim.setCellDirect('alive', 10 + 10 * width, 1);
    sim.setCellDirect('alive', 11 + 10 * width, 1);

    // After 1 tick, blinker should become vertical
    sim.tick();

    // Horizontal cells should be dead (except center)
    expect(sim.getCellDirect('alive', 9 + 10 * width)).toBe(0);
    expect(sim.getCellDirect('alive', 11 + 10 * width)).toBe(0);
    // Center and new vertical cells should be alive
    expect(sim.getCellDirect('alive', 10 + 10 * width)).toBe(1);
    expect(sim.getCellDirect('alive', 10 + 9 * width)).toBe(1);
    expect(sim.getCellDirect('alive', 10 + 11 * width)).toBe(1);
  });

  it('produces stable block pattern', () => {
    const preset = loadBuiltinPreset('conways-gol');
    const sim = new Simulation(preset);
    const width = preset.grid.width;

    // Place a 2x2 block at (10,10) - this is a still life
    sim.setCellDirect('alive', 10 + 10 * width, 1);
    sim.setCellDirect('alive', 11 + 10 * width, 1);
    sim.setCellDirect('alive', 10 + 11 * width, 1);
    sim.setCellDirect('alive', 11 + 11 * width, 1);

    // Run 10 ticks
    sim.tickN(10);

    // Block should be unchanged
    expect(sim.getCellDirect('alive', 10 + 10 * width)).toBe(1);
    expect(sim.getCellDirect('alive', 11 + 10 * width)).toBe(1);
    expect(sim.getCellDirect('alive', 10 + 11 * width)).toBe(1);
    expect(sim.getCellDirect('alive', 11 + 11 * width)).toBe(1);
    expect(countAlive(sim)).toBe(4);
  });
});

function countAlive(sim: Simulation): number {
  let count = 0;
  for (let i = 0; i < sim.grid.cellCount; i++) {
    if (sim.getCellDirect('alive', i) === 1) count++;
  }
  return count;
}

function getAliveCells(sim: Simulation, width: number, height: number): [number, number][] {
  const cells: [number, number][] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (sim.getCellDirect('alive', x + y * width) === 1) {
        cells.push([x, y]);
      }
    }
  }
  return cells;
}
