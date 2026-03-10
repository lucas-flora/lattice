/**
 * Grid engine type definitions.
 *
 * Defines configuration, state, and buffer types for the universal grid
 * supporting 1D, 2D, and 3D simulations.
 */

/** Supported grid dimensionalities */
export type GridDimensionality = '1d' | '2d' | '3d';

/** Supported grid topologies */
export type GridTopology = 'toroidal' | 'finite';

/** Supported neighborhood types */
export type NeighborhoodType = 'moore' | 'von-neumann';

/** Configuration for creating a grid */
export interface GridConfig {
  dimensionality: GridDimensionality;
  width: number;
  /** Height of the grid. Must be 1 for 1D grids. */
  height: number;
  /** Depth of the grid. Must be 1 for 1D and 2D grids. */
  depth: number;
  topology: GridTopology;
  /** Neighborhood type for neighbor calculation. Defaults to 'moore'. */
  neighborhood?: NeighborhoodType;
}

/** Ping-pong double buffer pair for a single property */
export interface PropertyBuffers {
  /** First buffer */
  bufferA: Float32Array;
  /** Second buffer */
  bufferB: Float32Array;
  /** Whether bufferA is the current (read) buffer */
  aIsCurrent: boolean;
  /** Number of channels this property occupies per cell */
  channels: number;
  /** Default value(s) for this property */
  defaultValue: number[];
}
