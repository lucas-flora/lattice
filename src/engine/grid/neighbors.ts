/**
 * Neighbor calculation for all grid dimensionalities and topologies.
 *
 * Pure math, zero browser API dependencies.
 */

import type { GridConfig, GridDimensionality, NeighborhoodType } from './types';

/**
 * Get pre-computed neighbor offsets for a given dimensionality and neighborhood type.
 *
 * @returns Array of offset tuples [dx, dy, dz]
 */
export function getNeighborOffsets(
  dimensionality: GridDimensionality,
  neighborhood: NeighborhoodType,
): number[][] {
  switch (dimensionality) {
    case '1d':
      // 1D always has 2 neighbors regardless of neighborhood type
      return [[-1, 0, 0], [1, 0, 0]];

    case '2d':
      if (neighborhood === 'von-neumann') {
        return [
          [0, -1, 0],  // up
          [-1, 0, 0],  // left
          [1, 0, 0],   // right
          [0, 1, 0],   // down
        ];
      }
      // Moore neighborhood (8 surrounding cells)
      return [
        [-1, -1, 0], [0, -1, 0], [1, -1, 0],
        [-1, 0, 0],              [1, 0, 0],
        [-1, 1, 0],  [0, 1, 0],  [1, 1, 0],
      ];

    case '3d':
      if (neighborhood === 'von-neumann') {
        return [
          [-1, 0, 0], [1, 0, 0],   // x-axis
          [0, -1, 0], [0, 1, 0],   // y-axis
          [0, 0, -1], [0, 0, 1],   // z-axis
        ];
      }
      // Moore neighborhood (26 surrounding cells)
      return generate3DMooreOffsets();

    default:
      return [];
  }
}

/**
 * Generate all 26 offsets for the 3D Moore neighborhood (3x3x3 cube minus center).
 */
function generate3DMooreOffsets(): number[][] {
  const offsets: number[][] = [];
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        offsets.push([dx, dy, dz]);
      }
    }
  }
  return offsets;
}

/**
 * Wrap a coordinate using modular arithmetic for toroidal topology.
 * Handles negative values correctly.
 */
function wrapCoord(coord: number, size: number): number {
  return ((coord % size) + size) % size;
}

/**
 * Get flat indices of all valid neighbors for a cell at the given index.
 *
 * @param index - Flat index of the cell
 * @param config - Grid configuration
 * @returns Array of flat indices for valid neighbor cells
 */
export function getNeighborIndices(index: number, config: GridConfig): number[] {
  const { width, height, depth, topology } = config;
  const neighborhood = config.neighborhood ?? 'moore';
  const offsets = getNeighborOffsets(config.dimensionality, neighborhood);

  // Convert flat index to coordinates
  const x = index % width;
  const y = Math.floor(index / width) % height;
  const z = Math.floor(index / (width * height));

  const neighbors: number[] = [];

  for (const [dx, dy, dz] of offsets) {
    let nx = x + dx;
    let ny = y + dy;
    let nz = z + dz;

    if (topology === 'toroidal') {
      nx = wrapCoord(nx, width);
      ny = wrapCoord(ny, height);
      nz = wrapCoord(nz, depth);
    } else {
      // Finite topology: skip out-of-bounds neighbors
      if (nx < 0 || nx >= width) continue;
      if (ny < 0 || ny >= height) continue;
      if (nz < 0 || nz >= depth) continue;
    }

    const neighborIndex = nx + ny * width + nz * width * height;
    neighbors.push(neighborIndex);
  }

  return neighbors;
}
