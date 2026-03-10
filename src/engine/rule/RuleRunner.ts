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
import { compileRule } from './RuleCompiler';
import type { RuleFn, RuleContext, TickResult, IRuleRunner } from './types';

export class RuleRunner implements IRuleRunner {
  readonly grid: Grid;
  readonly preset: PresetConfig;
  private ruleFn: RuleFn;
  private generation: number = 0;
  private propertyNames: string[];
  private propertyChannels: Map<string, number>;
  private dt: number = 1;
  private useWasm: boolean = false;

  constructor(grid: Grid, preset: PresetConfig) {
    this.grid = grid;
    this.preset = preset;

    // Build property metadata
    this.propertyNames = preset.cell_properties.map((p) => p.name);
    this.propertyChannels = new Map();
    for (const prop of preset.cell_properties) {
      this.propertyChannels.set(prop.name, CHANNELS_PER_TYPE[prop.type]);
    }

    // Try WASM first, fall back to TS silently
    this.useWasm = this.tryLoadWasm();

    // Compile the TypeScript rule function
    this.ruleFn = compileRule(preset.rule.compute);
  }

  /**
   * Attempt to load a WASM module for this rule.
   * Returns false silently if no WASM is available -- no exceptions thrown.
   */
  private tryLoadWasm(): boolean {
    try {
      // WASM module lookup: check if a WASM implementation exists
      // for this specific preset. In Phase 7, this will actually
      // load and instantiate the WASM module.
      // For now, always returns false (TS fallback).
      return false;
    } catch {
      // Silent fallback -- this is the documented behavior (RULE-05)
      return false;
    }
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
   */
  tick(): TickResult {
    const { width, height, depth, dimensionality } = this.grid.config;
    const gridInfo = { width, height, depth, dimensionality };

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
        params: {},
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
  }

  /**
   * Set the time step for continuous simulations.
   */
  setDt(dt: number): void {
    this.dt = dt;
  }
}
