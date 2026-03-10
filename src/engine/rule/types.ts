/**
 * Rule execution type definitions.
 *
 * Defines the perceive-update contract and RuleRunner interfaces.
 */

import type { PresetConfig } from '../preset/types';

/** Context passed to a rule's compute function for each cell */
export interface RuleContext {
  /** Current cell's property values (keyed by property name) */
  cell: Record<string, number | number[]>;
  /** Array of neighbor cell property views */
  neighbors: Array<Record<string, number | number[]>>;
  /** Grid metadata */
  grid: {
    width: number;
    height: number;
    depth: number;
    dimensionality: string;
  };
  /** Static parameters from preset */
  params: Record<string, unknown>;
  /** Current cell flat index */
  cellIndex: number;
  /** Current cell coordinates */
  x: number;
  y: number;
  z: number;
  /** Current generation/tick number */
  generation: number;
  /** Simulation dt (for continuous simulations) */
  dt: number;
}

/** Compiled rule function type */
export type RuleFn = (ctx: RuleContext) => Record<string, number | number[]>;

/** Result of a single tick: maps property names to their full next-state buffers */
export interface TickResult {
  generation: number;
}

/** Interface for executing rules on a grid */
export interface IRuleRunner {
  /** Run one perceive-update cycle */
  tick(): TickResult;
  /** Get current generation count */
  getGeneration(): number;
  /** Reset to initial state */
  reset(): void;
}

/** Configuration for creating a Simulation from a PresetConfig */
export interface SimulationSetup {
  preset: PresetConfig;
  /** Override grid dimensions */
  gridOverrides?: {
    width?: number;
    height?: number;
    depth?: number;
  };
}
