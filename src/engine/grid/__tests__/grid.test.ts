import { describe, it, expect } from 'vitest';
import { Grid } from '../Grid';
import type { GridConfig } from '../types';

function make2DConfig(width: number, height: number, topology: 'toroidal' | 'finite' = 'toroidal'): GridConfig {
  return { dimensionality: '2d', width, height, depth: 1, topology };
}

function make1DConfig(width: number, topology: 'toroidal' | 'finite' = 'toroidal'): GridConfig {
  return { dimensionality: '1d', width, height: 1, depth: 1, topology };
}

function make3DConfig(w: number, h: number, d: number, topology: 'toroidal' | 'finite' = 'toroidal'): GridConfig {
  return { dimensionality: '3d', width: w, height: h, depth: d, topology };
}

describe('Grid initialization', () => {
  it('TestGrid2D_InitializesWithCorrectCellCount', () => {
    const grid = new Grid(make2DConfig(512, 512));
    expect(grid.cellCount).toBe(262144);
  });

  it('TestGrid2D_InitializesAsFloat32Array', () => {
    const grid = new Grid(make2DConfig(512, 512));
    grid.addProperty('state', 1);
    const buffer = grid.getCurrentBuffer('state');
    expect(buffer).toBeInstanceOf(Float32Array);
    expect(buffer.length).toBe(262144);
  });

  it('TestGrid1D_Initialization', () => {
    const grid = new Grid(make1DConfig(100));
    expect(grid.cellCount).toBe(100);
  });

  it('TestGrid3D_Initialization', () => {
    const grid = new Grid(make3DConfig(10, 10, 10));
    expect(grid.cellCount).toBe(1000);
  });
});

describe('Grid ping-pong buffers', () => {
  it('TestGrid2D_PingPongBufferIsolation', () => {
    const grid = new Grid(make2DConfig(512, 512));
    grid.addProperty('state', 1, 0);

    // Write to next buffer
    grid.setCellValue('state', 100, 42.0);

    // Current buffer should be unaffected
    expect(grid.getCellValue('state', 100)).toBe(0);

    // After swap, current buffer has the written value
    grid.swap();
    expect(grid.getCellValue('state', 100)).toBe(42.0);
  });

  it('TestGrid2D_PingPongBufferIsolation_NextBufferPreserved', () => {
    const grid = new Grid(make2DConfig(10, 10));
    grid.addProperty('state', 1, 0);

    // Write value 5 to cell 0 in current buffer (by writing to next, swapping)
    grid.setCellValue('state', 0, 5.0);
    grid.swap();

    // Now cell 0 in current is 5.0
    expect(grid.getCellValue('state', 0)).toBe(5.0);

    // Next buffer (formerly the original current) should have the original default (0)
    const nextBuffer = grid.getNextBuffer('state');
    expect(nextBuffer[0]).toBe(0);
  });

  it('TestGrid2D_PingPongNoDataCopy', () => {
    const grid = new Grid(make2DConfig(10, 10));
    grid.addProperty('state', 1);

    const currentBefore = grid.getCurrentBuffer('state');
    const nextBefore = grid.getNextBuffer('state');

    grid.swap();

    const currentAfter = grid.getCurrentBuffer('state');
    const nextAfter = grid.getNextBuffer('state');

    // After swap, current should be the old next (same object)
    expect(currentAfter).toBe(nextBefore);
    // After swap, next should be the old current (same object)
    expect(nextAfter).toBe(currentBefore);
  });
});

describe('Grid coordinate conversion', () => {
  it('TestGrid_CoordToIndex_Origin', () => {
    const grid = new Grid(make2DConfig(10, 10));
    expect(grid.coordToIndex(0, 0, 0)).toBe(0);
  });

  it('TestGrid_CoordToIndex_XAxis', () => {
    const grid = new Grid(make2DConfig(10, 10));
    expect(grid.coordToIndex(1, 0, 0)).toBe(1);
    expect(grid.coordToIndex(5, 0, 0)).toBe(5);
  });

  it('TestGrid_CoordToIndex_YAxis', () => {
    const grid = new Grid(make2DConfig(10, 10));
    expect(grid.coordToIndex(0, 1, 0)).toBe(10);
    expect(grid.coordToIndex(0, 3, 0)).toBe(30);
  });

  it('TestGrid_CoordToIndex_3D', () => {
    const grid = new Grid(make3DConfig(10, 10, 10));
    expect(grid.coordToIndex(0, 0, 1)).toBe(100);
    expect(grid.coordToIndex(1, 2, 3)).toBe(1 + 2 * 10 + 3 * 100);
  });

  it('TestGrid_IndexToCoord_RoundTrip', () => {
    const grid = new Grid(make3DConfig(10, 10, 10));
    const testCoords: [number, number, number][] = [
      [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1],
      [5, 3, 7], [9, 9, 9], [1, 2, 3],
    ];

    for (const [x, y, z] of testCoords) {
      const index = grid.coordToIndex(x, y, z);
      const [rx, ry, rz] = grid.indexToCoord(index);
      expect([rx, ry, rz]).toEqual([x, y, z]);
    }
  });
});

describe('Grid property management', () => {
  it('TestGrid_AddProperty_CorrectBufferSize', () => {
    const grid = new Grid(make2DConfig(10, 10));
    grid.addProperty('state', 1);
    expect(grid.getCurrentBuffer('state').length).toBe(100);
  });

  it('TestGrid_AddProperty_MultiChannel', () => {
    const grid = new Grid(make2DConfig(10, 10));
    grid.addProperty('velocity', 2, [0, 0]);
    expect(grid.getCurrentBuffer('velocity').length).toBe(200);
  });

  it('TestGrid_AddProperty_DefaultValues', () => {
    const grid = new Grid(make2DConfig(5, 5));
    grid.addProperty('energy', 1, 0.5);
    const buffer = grid.getCurrentBuffer('energy');
    for (let i = 0; i < 25; i++) {
      expect(buffer[i]).toBe(0.5);
    }
  });

  it('TestGrid_AddProperty_VectorDefaults', () => {
    const grid = new Grid(make2DConfig(5, 5));
    grid.addProperty('color', 3, [1, 0.5, 0]);
    const buffer = grid.getCurrentBuffer('color');
    expect(buffer[0]).toBe(1);
    expect(buffer[1]).toBe(0.5);
    expect(buffer[2]).toBe(0);
  });

  it('TestGrid_AddProperty_MultipleProperties', () => {
    const grid = new Grid(make2DConfig(10, 10));
    grid.addProperty('alive', 1);
    grid.addProperty('age', 1);
    grid.addProperty('color', 3);
    expect(grid.hasProperty('alive')).toBe(true);
    expect(grid.hasProperty('age')).toBe(true);
    expect(grid.hasProperty('color')).toBe(true);
    expect(grid.getPropertyNames()).toEqual(['alive', 'age', 'color']);
  });

  it('TestGrid_AddProperty_DuplicateThrows', () => {
    const grid = new Grid(make2DConfig(10, 10));
    grid.addProperty('state', 1);
    expect(() => grid.addProperty('state', 1)).toThrow("Property 'state' already exists");
  });
});

describe('Grid cell access', () => {
  it('TestGrid_CellAccess_ReadCurrent', () => {
    const grid = new Grid(make2DConfig(10, 10));
    grid.addProperty('state', 1, 7);
    expect(grid.getCellValue('state', 0)).toBe(7);
    expect(grid.getCellValue('state', 50)).toBe(7);
  });

  it('TestGrid_CellAccess_WriteNext', () => {
    const grid = new Grid(make2DConfig(10, 10));
    grid.addProperty('state', 1, 0);
    grid.setCellValue('state', 5, 99);
    // Current should be unchanged
    expect(grid.getCellValue('state', 5)).toBe(0);
    // Next buffer should have the value
    expect(grid.getNextBuffer('state')[5]).toBe(99);
  });

  it('TestGrid_CellAccess_MultiChannelReadWrite', () => {
    const grid = new Grid(make2DConfig(10, 10));
    grid.addProperty('vel', 2, [0, 0]);

    grid.setCellValue('vel', 3, 1.5, 0); // x component
    grid.setCellValue('vel', 3, -2.0, 1); // y component
    grid.swap();

    expect(grid.getCellValue('vel', 3, 0)).toBe(1.5);
    expect(grid.getCellValue('vel', 3, 1)).toBe(-2.0);
  });

  it('TestGrid_CellAccess_UnknownPropertyThrows', () => {
    const grid = new Grid(make2DConfig(10, 10));
    expect(() => grid.getCellValue('nonexistent', 0)).toThrow("Property 'nonexistent' not found");
  });
});

describe('Grid reset', () => {
  it('TestGrid_Reset_RestoresDefaults', () => {
    const grid = new Grid(make2DConfig(10, 10));
    grid.addProperty('state', 1, 0);

    // Write some values
    grid.setCellValue('state', 0, 42);
    grid.setCellValue('state', 5, 99);
    grid.swap();

    // Values should be in current
    expect(grid.getCellValue('state', 0)).toBe(42);

    // Reset
    grid.reset();

    // Should be back to defaults
    expect(grid.getCellValue('state', 0)).toBe(0);
    expect(grid.getCellValue('state', 5)).toBe(0);
  });
});
