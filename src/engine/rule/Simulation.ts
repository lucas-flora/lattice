/**
 * Simulation: high-level facade that creates a Grid + RuleRunner from a PresetConfig.
 *
 * This is the primary entry point for loading and running a simulation.
 * It handles:
 *   1. Creating the Grid with correct dimensions and properties
 *   2. Applying initial cell state from the preset
 *   3. Creating the RuleRunner with the compiled rule
 *   4. Running tick cycles
 */

import { Grid } from '../grid/Grid';
import type { GridConfig } from '../grid/types';
import type { PresetConfig } from '../preset/types';
import { CHANNELS_PER_TYPE } from '../cell/types';
import { CellTypeRegistry } from '../cell/CellTypeRegistry';
import { RuleRunner } from './RuleRunner';
import { compileRule } from './RuleCompiler';
import type { TickResult } from './types';

export class Simulation {
  readonly grid: Grid;
  runner: RuleRunner;
  readonly preset: PresetConfig;
  readonly params: Map<string, number> = new Map();
  readonly typeRegistry: CellTypeRegistry;

  constructor(preset: PresetConfig) {
    this.preset = preset;

    // Initialize params from preset defaults
    if (preset.params) {
      for (const p of preset.params) {
        this.params.set(p.name, p.default);
      }
    }

    // Build type registry from preset (backward compatible)
    this.typeRegistry = CellTypeRegistry.fromPreset(preset);

    // Build grid config from preset
    const gridConfig: GridConfig = {
      dimensionality: preset.grid.dimensionality,
      width: preset.grid.width,
      height: preset.grid.height ?? 1,
      depth: preset.grid.depth ?? 1,
      topology: preset.grid.topology,
      neighborhood: 'moore', // Default; could be added to preset schema later
    };

    this.grid = new Grid(gridConfig);

    // Register all cell properties on the grid (from type registry union)
    for (const prop of this.typeRegistry.getPropertyUnion()) {
      const channels = CHANNELS_PER_TYPE[prop.type];
      this.grid.addProperty(prop.name, channels, prop.default);
    }

    // Create the rule runner (synchronous path -- always uses TS fallback)
    this.runner = new RuleRunner(this.grid, preset, undefined, this.typeRegistry);
    this.runner.setParamsProvider(() => this.getParamsObject());
  }

  /**
   * Create a Simulation with async WASM module loading.
   * Falls back to TypeScript silently if WASM loading fails.
   */
  static async create(preset: PresetConfig): Promise<Simulation> {
    const sim = new Simulation(preset);
    // If the preset requests WASM, try to load it
    if (preset.rule.type === 'wasm') {
      const wasmRunner = await RuleRunner.create(sim.grid, preset, sim.typeRegistry);
      wasmRunner.setParamsProvider(() => sim.getParamsObject());
      // Replace the runner with the WASM-enabled one
      (sim as { runner: RuleRunner }).runner = wasmRunner;
    }
    return sim;
  }

  /**
   * Run one tick of the simulation.
   */
  tick(): TickResult {
    return this.runner.tick();
  }

  /**
   * Run multiple ticks.
   */
  tickN(n: number): TickResult {
    let result: TickResult = { generation: 0 };
    for (let i = 0; i < n; i++) {
      result = this.runner.tick();
    }
    return result;
  }

  /**
   * Get the current generation.
   */
  getGeneration(): number {
    return this.runner.getGeneration();
  }

  /**
   * Reset the simulation to initial state.
   */
  reset(): void {
    this.runner.reset();
  }

  /**
   * Set a cell's value in the current (read) buffer directly.
   * Used for initial state setup and cell editing.
   */
  setCellDirect(propertyName: string, index: number, value: number, channel: number = 0): void {
    const currentBuf = this.grid.getCurrentBuffer(propertyName);
    const prop = this.typeRegistry.getPropertyUnion().find((p) => p.name === propertyName);
    if (!prop) throw new Error(`Property '${propertyName}' not found`);
    const channels = CHANNELS_PER_TYPE[prop.type];
    currentBuf[index * channels + channel] = value;
  }

  /**
   * Get a cell's value from the current (read) buffer.
   */
  getCellDirect(propertyName: string, index: number, channel: number = 0): number {
    return this.grid.getCellValue(propertyName, index, channel);
  }

  /**
   * Set a runtime parameter value.
   */
  setParam(name: string, value: number): void {
    this.params.set(name, value);
  }

  /**
   * Get a runtime parameter value.
   */
  getParam(name: string): number | undefined {
    return this.params.get(name);
  }

  /**
   * Get all params as a plain object (for passing to RuleContext).
   */
  getParamsObject(): Record<string, number> {
    const obj: Record<string, number> = {};
    for (const [k, v] of this.params) {
      obj[k] = v;
    }
    return obj;
  }

  /**
   * Replace the compute body and recompile the rule runner.
   */
  updateRule(newBody: string): void {
    // Validate that it compiles
    compileRule(newBody);
    // Create updated preset config with new compute body
    const updatedPreset = {
      ...this.preset,
      rule: { ...this.preset.rule, compute: newBody },
    };
    // Replace runner with recompiled one
    const gen = this.getGeneration();
    this.runner = new RuleRunner(this.grid, updatedPreset, undefined, this.typeRegistry);
    this.runner.setGeneration(gen);
    this.runner.setParamsProvider(() => this.getParamsObject());
  }
}
