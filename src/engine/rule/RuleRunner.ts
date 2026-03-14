/**
 * RuleRunner: executes perceive-update cycles on a Grid.
 *
 * Follows the perceive-update contract:
 *   1. Perceive: gather neighborhood state for each cell
 *   2. Update: compute next state using the compiled rule function
 *
 * Checks for WASM module availability and falls back to TypeScript silently.
 * No exceptions thrown when WASM is unavailable.
 */

import { Grid } from '../grid/Grid';
import type { PresetConfig } from '../preset/types';
import { CHANNELS_PER_TYPE } from '../cell/types';
import type { CellTypeRegistry } from '../cell/CellTypeRegistry';
import { compileRule } from './RuleCompiler';
import { WasmRuleRunner } from './WasmRuleRunner';
import type { RuleFn, RuleContext, TickResult, IRuleRunner, WasmModule } from './types';

export class RuleRunner implements IRuleRunner {
  readonly grid: Grid;
  readonly preset: PresetConfig;
  private ruleFn: RuleFn;
  private generation: number = 0;
  private propertyNames: string[];
  private propertyChannels: Map<string, number>;
  private dt: number = 1;
  private useWasm: boolean = false;
  private wasmDelegate: WasmRuleRunner | null = null;
  private paramsProvider: (() => Record<string, number>) | null = null;
  private hasInherentAge: boolean;
  private copyThroughProperties: string[];

  constructor(grid: Grid, preset: PresetConfig, wasmModule?: WasmModule, typeRegistry?: CellTypeRegistry) {
    this.grid = grid;
    this.preset = preset;

    // Build property metadata from type registry union (includes inherent props)
    // or fall back to preset.cell_properties for backward compat
    const propertyUnion = typeRegistry
      ? typeRegistry.getPropertyUnion()
      : (preset.cell_properties ?? []);

    this.propertyNames = propertyUnion.map((p) => p.name);
    this.propertyChannels = new Map();
    for (const prop of propertyUnion) {
      this.propertyChannels.set(prop.name, CHANNELS_PER_TYPE[prop.type]);
    }

    // Determine inherent behavior flags
    this.hasInherentAge = grid.hasProperty('alive') && grid.hasProperty('age');
    this.copyThroughProperties = ['alpha', '_cellType'].filter((p) => grid.hasProperty(p));

    // Try to set up WASM delegate if this is a WASM-type preset
    if (wasmModule && preset.rule.type === 'wasm' && preset.rule.wasm_module) {
      try {
        this.wasmDelegate = new WasmRuleRunner(grid, preset, wasmModule);
        this.useWasm = true;
      } catch {
        // Silent fallback -- RULE-05
        this.wasmDelegate = null;
        this.useWasm = false;
      }
    }

    // Compile the TypeScript rule function (always needed as fallback)
    const computeBody = preset.rule.compute || preset.rule.fallback_compute || '';
    this.ruleFn = compileRule(computeBody);
  }

  /**
   * Create a RuleRunner with async WASM module loading.
   * Falls back to TypeScript silently if WASM loading fails.
   */
  static async create(grid: Grid, preset: PresetConfig, typeRegistry?: CellTypeRegistry): Promise<RuleRunner> {
    let wasmModule: WasmModule | undefined;

    if (preset.rule.type === 'wasm' && preset.rule.wasm_module) {
      try {
        // Dynamically import the wasm-bindgen generated module.
        // Use variable path to prevent Vite from statically resolving the import
        // at build/test time -- the WASM pkg is gitignored and only exists after build.
        const wasmPath = '../../wasm/pkg/lattice_engine.js';
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore -- WASM pkg is build-time generated, not in git
        const mod = await import(/* @vite-ignore */ wasmPath);
        // Initialize the WASM module if it has a default init function
        // wasm-bindgen's init function auto-detects the .wasm path when no arg is given
        if (typeof mod.default === 'function') {
          await (mod.default as (input?: unknown) => Promise<unknown>)();
        }
        wasmModule = mod as unknown as WasmModule;
      } catch {
        // Silent fallback -- no WASM available, use TypeScript
        wasmModule = undefined;
      }
    }

    return new RuleRunner(grid, preset, wasmModule, typeRegistry);
  }

  /**
   * Read a cell's property values from the current buffer.
   */
  private perceiveCell(index: number): Record<string, number | number[]> {
    const values: Record<string, number | number[]> = {};
    for (const name of this.propertyNames) {
      const channels = this.propertyChannels.get(name)!;
      if (channels === 1) {
        values[name] = this.grid.getCellValue(name, index, 0);
      } else {
        const arr: number[] = [];
        for (let c = 0; c < channels; c++) {
          arr.push(this.grid.getCellValue(name, index, c));
        }
        values[name] = arr;
      }
    }
    return values;
  }

  /**
   * Run one full perceive-update cycle on the entire grid.
   * If WASM delegate is available, delegates to it (whole-tick API).
   * Otherwise, uses the TypeScript per-cell loop.
   */
  tick(): TickResult {
    // Delegate to WASM if available
    if (this.wasmDelegate) {
      const result = this.wasmDelegate.tick();
      this.generation = this.wasmDelegate.getGeneration();
      return result;
    }

    // TypeScript fallback: per-cell perceive-update loop
    const { width, height, depth, dimensionality } = this.grid.config;
    const gridInfo = { width, height, depth, dimensionality };

    // Copy through inherent properties that rules don't manage
    for (const propName of this.copyThroughProperties) {
      const src = this.grid.getCurrentBuffer(propName);
      const dst = this.grid.getNextBuffer(propName);
      dst.set(src);
    }

    // For each cell: perceive neighborhood, run rule, write to next buffer
    for (let i = 0; i < this.grid.cellCount; i++) {
      // PERCEIVE: gather current cell state
      const cellValues = this.perceiveCell(i);

      // PERCEIVE: gather neighbor states
      const neighborIndices = this.grid.getNeighborIndices(i);
      const neighbors = neighborIndices.map((ni) => this.perceiveCell(ni));

      // Compute coordinates
      const [x, y, z] = this.grid.indexToCoord(i);

      // Build context
      const ctx: RuleContext = {
        cell: cellValues,
        neighbors,
        grid: gridInfo,
        params: this.paramsProvider ? this.paramsProvider() : {},
        cellIndex: i,
        x,
        y,
        z,
        generation: this.generation,
        dt: this.dt,
      };

      // UPDATE: compute next state
      const result = this.ruleFn(ctx);

      // Write results to next buffer
      if (result !== undefined && result !== null) {
        if (typeof result === 'object' && !Array.isArray(result)) {
          // Result is a record mapping property names to values
          for (const [propName, value] of Object.entries(result)) {
            if (this.grid.hasProperty(propName)) {
              const channels = this.propertyChannels.get(propName)!;
              if (channels === 1) {
                this.grid.setCellValue(propName, i, value as number, 0);
              } else {
                const arr = value as number[];
                for (let c = 0; c < channels; c++) {
                  this.grid.setCellValue(propName, i, arr[c], c);
                }
              }
            }
          }
        }
      }
    }

    // Age auto-increment: after rule results, before swap
    if (this.hasInherentAge) {
      const aliveNext = this.grid.getNextBuffer('alive');
      const ageCurr = this.grid.getCurrentBuffer('age');
      const ageNext = this.grid.getNextBuffer('age');
      for (let i = 0; i < this.grid.cellCount; i++) {
        ageNext[i] = aliveNext[i] > 0 ? ageCurr[i] + 1 : 0;
      }
    }

    // Swap buffers after computing all cells
    this.grid.swap();
    this.generation++;

    return { generation: this.generation };
  }

  /**
   * Get the current generation count.
   */
  getGeneration(): number {
    return this.generation;
  }

  /**
   * Reset grid to initial state and generation to 0.
   */
  reset(): void {
    this.grid.reset();
    this.generation = 0;
    if (this.wasmDelegate) {
      this.wasmDelegate.setGeneration(0);
    }
  }

  /**
   * Check whether the runner is using WASM or TypeScript.
   */
  isUsingWasm(): boolean {
    return this.useWasm;
  }

  /**
   * Set the generation counter directly.
   * Used by SimulationController for reverse-step operations.
   */
  setGeneration(gen: number): void {
    this.generation = gen;
    if (this.wasmDelegate) {
      this.wasmDelegate.setGeneration(gen);
    }
  }

  /**
   * Set the time step for continuous simulations.
   */
  setDt(dt: number): void {
    this.dt = dt;
  }

  /**
   * Set a function that provides runtime params for each tick.
   */
  setParamsProvider(provider: () => Record<string, number>): void {
    this.paramsProvider = provider;
    if (this.wasmDelegate) {
      this.wasmDelegate.setParamsProvider(provider);
    }
  }
}
