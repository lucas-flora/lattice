/**
 * PythonRuleRunner: executes Python rules via PyodideBridge.
 *
 * Follows the WasmRuleRunner delegate pattern: whole-grid execution,
 * async tick, buffer extraction and application.
 *
 * Python rules are inherently async (worker message roundtrip).
 * Calling tick() throws — use tickAsync() instead.
 */

import type { Grid } from '../grid/Grid';
import type { PresetConfig } from '../preset/types';
import type { PyodideBridge } from '../scripting/PyodideBridge';
import { extractGridBuffers, applyResultBuffers } from '../scripting/gridTransfer';
import type { TickResult, IRuleRunner } from './types';

export class PythonRuleRunner implements IRuleRunner {
  readonly grid: Grid;
  readonly preset: PresetConfig;
  private bridge: PyodideBridge;
  private generation: number = 0;
  private paramsProvider: (() => Record<string, number>) | null = null;
  private hasInherentAge: boolean;

  constructor(grid: Grid, preset: PresetConfig, bridge: PyodideBridge) {
    this.grid = grid;
    this.preset = preset;
    this.bridge = bridge;
    this.hasInherentAge = grid.hasProperty('alive') && grid.hasProperty('age');
  }

  /**
   * Async tick: extract buffers → send to Pyodide → apply results → swap.
   */
  async tickAsync(): Promise<TickResult> {
    const { width, height, depth } = this.grid.config;
    const code = this.preset.rule.compute;
    const params = this.paramsProvider ? this.paramsProvider() : {};

    // Extract current grid buffers (copies for postMessage)
    const inputBuffers = extractGridBuffers(this.grid);

    // Execute Python rule in worker
    const resultBuffers = await this.bridge.execRule(
      code,
      inputBuffers,
      width,
      height,
      depth,
      params,
    );

    // Apply results to grid's next buffers
    applyResultBuffers(this.grid, resultBuffers);

    // Age auto-increment (same logic as RuleRunner)
    if (this.hasInherentAge) {
      const aliveNext = this.grid.getNextBuffer('alive');
      const ageCurr = this.grid.getCurrentBuffer('age');
      const ageNext = this.grid.getNextBuffer('age');
      for (let i = 0; i < this.grid.cellCount; i++) {
        ageNext[i] = aliveNext[i] > 0 ? ageCurr[i] + 1 : 0;
      }
    }

    // Swap and advance generation
    this.grid.swap();
    this.generation++;

    return { generation: this.generation };
  }

  /**
   * Sync tick is not supported for Python rules.
   * @throws Error always — use tickAsync() instead
   */
  tick(): TickResult {
    throw new Error('PythonRuleRunner requires tickAsync(). Python rules are async-only.');
  }

  getGeneration(): number {
    return this.generation;
  }

  reset(): void {
    this.grid.reset();
    this.generation = 0;
  }

  isUsingWasm(): boolean {
    return false;
  }

  isUsingPython(): boolean {
    return true;
  }

  setGeneration(gen: number): void {
    this.generation = gen;
  }

  setParamsProvider(provider: () => Record<string, number>): void {
    this.paramsProvider = provider;
  }
}
