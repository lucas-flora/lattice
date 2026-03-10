/**
 * Grid engine module.
 *
 * Provides the universal grid abstraction for 1D, 2D, and 3D simulations.
 */
export { Grid } from './Grid';
export { getNeighborIndices, getNeighborOffsets } from './neighbors';
export type {
  GridConfig,
  GridDimensionality,
  GridTopology,
  NeighborhoodType,
  PropertyBuffers,
} from './types';
