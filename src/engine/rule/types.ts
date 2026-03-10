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
  /** Check whether the runner is using WASM or TypeScript */
  isUsingWasm(): boolean;
}

/** WASM module interface for lattice-engine exports */
export interface WasmModule {
  gray_scott_tick: (
    u_in: Float32Array,
    v_in: Float32Array,
    u_out: Float32Array,
    v_out: Float32Array,
    width: number,
    height: number,
    du: number,
    dv: number,
    f: number,
    k: number,
    dt: number,
  ) => void;
  navier_stokes_tick: (
    vx_in: Float32Array,
    vy_in: Float32Array,
    density_in: Float32Array,
    pressure_in: Float32Array,
    vx_out: Float32Array,
    vy_out: Float32Array,
    density_out: Float32Array,
    pressure_out: Float32Array,
    width: number,
    height: number,
    viscosity: number,
    diffusion: number,
    dt: number,
  ) => void;
}

/** WASM tick function type -- whole-tick API */
export type WasmTickFn = (...args: unknown[]) => void;

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
