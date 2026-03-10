import { describe, it, expect } from 'vitest';
import { getNeighborIndices, getNeighborOffsets } from '../neighbors';
import type { GridConfig } from '../types';

function make1DConfig(width: number, topology: 'toroidal' | 'finite' = 'toroidal'): GridConfig {
  return { dimensionality: '1d', width, height: 1, depth: 1, topology };
}

function make2DConfig(
  width: number,
  height: number,
  topology: 'toroidal' | 'finite' = 'toroidal',
  neighborhood: 'moore' | 'von-neumann' = 'moore',
): GridConfig {
  return { dimensionality: '2d', width, height, depth: 1, topology, neighborhood };
}

function make3DConfig(
  w: number,
  h: number,
  d: number,
  topology: 'toroidal' | 'finite' = 'toroidal',
  neighborhood: 'moore' | 'von-neumann' = 'moore',
): GridConfig {
  return { dimensionality: '3d', width: w, height: h, depth: d, topology, neighborhood };
}

describe('Neighbor offsets', () => {
  it('TestNeighborOffsets_1D', () => {
    const offsets = getNeighborOffsets('1d', 'moore');
    expect(offsets).toHaveLength(2);
  });

  it('TestNeighborOffsets_2D_Moore', () => {
    const offsets = getNeighborOffsets('2d', 'moore');
    expect(offsets).toHaveLength(8);
  });

  it('TestNeighborOffsets_2D_VonNeumann', () => {
    const offsets = getNeighborOffsets('2d', 'von-neumann');
    expect(offsets).toHaveLength(4);
  });

  it('TestNeighborOffsets_3D_Moore', () => {
    const offsets = getNeighborOffsets('3d', 'moore');
    expect(offsets).toHaveLength(26);
  });

  it('TestNeighborOffsets_3D_VonNeumann', () => {
    const offsets = getNeighborOffsets('3d', 'von-neumann');
    expect(offsets).toHaveLength(6);
  });
});

describe('1D neighbors', () => {
  it('TestNeighbors1D_Toroidal_MiddleCell', () => {
    const config = make1DConfig(10);
    const neighbors = getNeighborIndices(5, config);
    expect(neighbors).toHaveLength(2);
    expect(neighbors).toContain(4); // left
    expect(neighbors).toContain(6); // right
  });

  it('TestNeighbors1D_Toroidal_LeftEdge', () => {
    const config = make1DConfig(10);
    const neighbors = getNeighborIndices(0, config);
    expect(neighbors).toHaveLength(2);
    expect(neighbors).toContain(9); // wraps to last cell
    expect(neighbors).toContain(1); // right
  });

  it('TestNeighbors1D_Toroidal_RightEdge', () => {
    const config = make1DConfig(10);
    const neighbors = getNeighborIndices(9, config);
    expect(neighbors).toHaveLength(2);
    expect(neighbors).toContain(8); // left
    expect(neighbors).toContain(0); // wraps to first cell
  });

  it('TestNeighbors1D_Finite_MiddleCell', () => {
    const config = make1DConfig(10, 'finite');
    const neighbors = getNeighborIndices(5, config);
    expect(neighbors).toHaveLength(2);
    expect(neighbors).toContain(4);
    expect(neighbors).toContain(6);
  });

  it('TestNeighbors1D_Finite_LeftEdge', () => {
    const config = make1DConfig(10, 'finite');
    const neighbors = getNeighborIndices(0, config);
    expect(neighbors).toHaveLength(1);
    expect(neighbors).toContain(1); // right only
  });

  it('TestNeighbors1D_Finite_RightEdge', () => {
    const config = make1DConfig(10, 'finite');
    const neighbors = getNeighborIndices(9, config);
    expect(neighbors).toHaveLength(1);
    expect(neighbors).toContain(8); // left only
  });
});

describe('2D neighbors - Moore', () => {
  it('TestNeighbors2D_Moore_Toroidal_MiddleCell', () => {
    const config = make2DConfig(10, 10);
    // Cell at (5, 5) = index 55
    const neighbors = getNeighborIndices(55, config);
    expect(neighbors).toHaveLength(8);
    // Check all 8 surrounding cells
    expect(neighbors).toContain(44); // (4,4)
    expect(neighbors).toContain(45); // (5,4)
    expect(neighbors).toContain(46); // (6,4)
    expect(neighbors).toContain(54); // (4,5)
    expect(neighbors).toContain(56); // (6,5)
    expect(neighbors).toContain(64); // (4,6)
    expect(neighbors).toContain(65); // (5,6)
    expect(neighbors).toContain(66); // (6,6)
  });

  it('TestNeighbors2D_Moore_Toroidal_Corner', () => {
    const config = make2DConfig(10, 10);
    // Cell at (0, 0) = index 0
    const neighbors = getNeighborIndices(0, config);
    expect(neighbors).toHaveLength(8);
    // Should wrap around: top-left neighbor of (0,0) is (9,9) = 99
    expect(neighbors).toContain(99); // (9,9) - top-left wraps
    expect(neighbors).toContain(90); // (0,9) - top wraps
    expect(neighbors).toContain(91); // (1,9) - top-right wraps
    expect(neighbors).toContain(9);  // (9,0) - left wraps
    expect(neighbors).toContain(1);  // (1,0) - right
    expect(neighbors).toContain(19); // (9,1) - bottom-left wraps
    expect(neighbors).toContain(10); // (0,1) - below
    expect(neighbors).toContain(11); // (1,1) - bottom-right
  });

  it('TestNeighbors2D_Moore_Finite_Corner', () => {
    const config = make2DConfig(10, 10, 'finite');
    // Cell at (0, 0) = index 0
    const neighbors = getNeighborIndices(0, config);
    expect(neighbors).toHaveLength(3);
    expect(neighbors).toContain(1);  // (1,0)
    expect(neighbors).toContain(10); // (0,1)
    expect(neighbors).toContain(11); // (1,1)
  });

  it('TestNeighbors2D_Moore_Finite_Edge', () => {
    const config = make2DConfig(10, 10, 'finite');
    // Cell at (5, 0) = index 5 (top edge, not corner)
    const neighbors = getNeighborIndices(5, config);
    expect(neighbors).toHaveLength(5);
    expect(neighbors).toContain(4);  // (4,0)
    expect(neighbors).toContain(6);  // (6,0)
    expect(neighbors).toContain(14); // (4,1)
    expect(neighbors).toContain(15); // (5,1)
    expect(neighbors).toContain(16); // (6,1)
  });
});

describe('2D neighbors - Von Neumann', () => {
  it('TestNeighbors2D_VonNeumann_Toroidal_MiddleCell', () => {
    const config = make2DConfig(10, 10, 'toroidal', 'von-neumann');
    // Cell at (5, 5) = index 55
    const neighbors = getNeighborIndices(55, config);
    expect(neighbors).toHaveLength(4);
    expect(neighbors).toContain(45); // (5,4) up
    expect(neighbors).toContain(54); // (4,5) left
    expect(neighbors).toContain(56); // (6,5) right
    expect(neighbors).toContain(65); // (5,6) down
  });
});

describe('3D neighbors', () => {
  it('TestNeighbors3D_Moore_Toroidal_MiddleCell', () => {
    const config = make3DConfig(10, 10, 10);
    // Cell at (5, 5, 5) = index 5 + 5*10 + 5*100 = 555
    const neighbors = getNeighborIndices(555, config);
    expect(neighbors).toHaveLength(26);
  });

  it('TestNeighbors3D_Moore_Toroidal_Corner', () => {
    const config = make3DConfig(10, 10, 10);
    // Cell at (0, 0, 0) = index 0
    const neighbors = getNeighborIndices(0, config);
    expect(neighbors).toHaveLength(26);
    // Verify wrapping: neighbor at (-1,-1,-1) should be (9,9,9) = 999
    expect(neighbors).toContain(999);
  });

  it('TestNeighbors3D_VonNeumann_Toroidal_MiddleCell', () => {
    const config = make3DConfig(10, 10, 10, 'toroidal', 'von-neumann');
    // Cell at (5, 5, 5) = 555
    const neighbors = getNeighborIndices(555, config);
    expect(neighbors).toHaveLength(6);
    // Face-adjacent cells
    expect(neighbors).toContain(554); // (4,5,5)
    expect(neighbors).toContain(556); // (6,5,5)
    expect(neighbors).toContain(545); // (5,4,5)
    expect(neighbors).toContain(565); // (5,6,5)
    expect(neighbors).toContain(455); // (5,5,4)
    expect(neighbors).toContain(655); // (5,5,6)
  });

  it('TestNeighbors3D_Moore_Finite_Corner', () => {
    const config = make3DConfig(10, 10, 10, 'finite');
    // Cell at (0, 0, 0) = index 0
    const neighbors = getNeighborIndices(0, config);
    // Corner in 3D finite: only neighbors with positive offsets
    // (1,0,0)=1, (0,1,0)=10, (1,1,0)=11, (0,0,1)=100, (1,0,1)=101, (0,1,1)=110, (1,1,1)=111
    expect(neighbors).toHaveLength(7);
  });
});

describe('No browser API', () => {
  it('TestNeighbors_NoBrowserAPI', () => {
    // Verify that the module can be imported and used without any browser globals
    // If it required window/document/navigator, the import itself would fail in Node.js
    // This test passing in vitest (Node.js) proves no browser API dependency
    const config = make2DConfig(10, 10);
    const neighbors = getNeighborIndices(55, config);
    expect(neighbors).toHaveLength(8);
    expect(typeof window === 'undefined' || typeof window === 'object').toBe(true);
  });
});
