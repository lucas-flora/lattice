/**
 * Core engine types for the Lattice simulation substrate.
 *
 * These types define the fundamental interfaces for the simulation engine.
 * The engine is pure TypeScript with zero UI dependencies — independently testable in Node.js.
 */

// --- Grid Types ---

/** Dimensions of the simulation grid */
export interface GridDimensions {
  width: number;
  height: number;
  /** Optional depth for 3D grids */
  depth?: number;
}

/** Supported grid topologies */
export type GridTopology = 'finite' | 'toroidal';

/** Grid dimensionality */
export type GridDimensionality = '1d' | '2d' | '3d';

// --- Worker Communication Types ---

/** Messages sent from main thread to simulation Worker */
export type WorkerInMessage =
  | { type: 'init' }
  | { type: 'tick' }
  | { type: 'stop' };

/** Messages sent from simulation Worker to main thread */
export type WorkerOutMessage =
  | { type: 'initialized'; generation: number }
  | { type: 'tick-result'; generation: number; timestamp: number }
  | { type: 'error'; message: string };

// --- Simulation Config Types ---

/** Minimal simulation configuration (expanded in Phase 2) */
export interface SimulationConfig {
  meta: {
    name: string;
    schemaVersion: string;
  };
  grid: GridDimensions & {
    topology: GridTopology;
    dimensionality: GridDimensionality;
  };
}

// --- Worker State ---

/** Internal state of the simulation Worker */
export interface WorkerState {
  generation: number;
  isRunning: boolean;
}
