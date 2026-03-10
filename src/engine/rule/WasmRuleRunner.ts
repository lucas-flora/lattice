/**
 * WasmRuleRunner: executes whole-tick WASM rule functions on a Grid.
 *
 * Delegates tick() to Rust functions that operate on full grid buffers
 * in a single call per tick (RULE-04).
 *
 * This class is used internally by RuleRunner when WASM is available.
 */

import { Grid } from '../grid/Grid';
import type { PresetConfig } from '../preset/types';
import type { TickResult, IRuleRunner, WasmModule } from './types';

export class WasmRuleRunner implements IRuleRunner {
  readonly grid: Grid;
  readonly preset: PresetConfig;
  private wasmModule: WasmModule;
  private wasmFnName: string;
  private generation: number = 0;

  constructor(grid: Grid, preset: PresetConfig, wasmModule: WasmModule) {
    this.grid = grid;
    this.preset = preset;
    this.wasmModule = wasmModule;

    const fnName = preset.rule.wasm_module;
    if (!fnName) {
      throw new Error('WasmRuleRunner requires preset.rule.wasm_module to be set');
    }
    this.wasmFnName = fnName;

    // Verify the function exists on the module
    if (typeof (this.wasmModule as Record<string, unknown>)[this.wasmFnName] !== 'function') {
      throw new Error(`WASM module does not export function '${this.wasmFnName}'`);
    }
  }

  /**
   * Run one full tick using the WASM function.
   * Passes full grid buffers to Rust in a single call (whole-tick API).
   */
  tick(): TickResult {
    if (this.wasmFnName === 'gray_scott_tick') {
      this.tickGrayScott();
    } else if (this.wasmFnName === 'navier_stokes_tick') {
      this.tickNavierStokes();
    } else {
      throw new Error(`Unknown WASM function: ${this.wasmFnName}`);
    }

    this.grid.swap();
    this.generation++;

    return { generation: this.generation };
  }

  private tickGrayScott(): void {
    const uCurrent = this.grid.getCurrentBuffer('u');
    const vCurrent = this.grid.getCurrentBuffer('v');
    const uNext = this.grid.getNextBuffer('u');
    const vNext = this.grid.getNextBuffer('v');

    const { width, height } = this.grid.config;

    // Default Gray-Scott parameters (matching the YAML preset)
    const Du = 0.2097;
    const Dv = 0.105;
    const F = 0.037;
    const k = 0.06;
    const dt = 1.0;

    this.wasmModule.gray_scott_tick(
      uCurrent,
      vCurrent,
      uNext,
      vNext,
      width,
      height ?? 1,
      Du,
      Dv,
      F,
      k,
      dt,
    );
  }

  private tickNavierStokes(): void {
    const vxCurrent = this.grid.getCurrentBuffer('vx');
    const vyCurrent = this.grid.getCurrentBuffer('vy');
    const densityCurrent = this.grid.getCurrentBuffer('density');
    const pressureCurrent = this.grid.getCurrentBuffer('pressure');
    const vxNext = this.grid.getNextBuffer('vx');
    const vyNext = this.grid.getNextBuffer('vy');
    const densityNext = this.grid.getNextBuffer('density');
    const pressureNext = this.grid.getNextBuffer('pressure');

    const { width, height } = this.grid.config;

    // Default Navier-Stokes parameters (matching the YAML preset)
    const viscosity = 0.1;
    const diffusion = 0.0001;
    const dt = 0.1;

    this.wasmModule.navier_stokes_tick(
      vxCurrent,
      vyCurrent,
      densityCurrent,
      pressureCurrent,
      vxNext,
      vyNext,
      densityNext,
      pressureNext,
      width,
      height ?? 1,
      viscosity,
      diffusion,
      dt,
    );
  }

  getGeneration(): number {
    return this.generation;
  }

  reset(): void {
    this.grid.reset();
    this.generation = 0;
  }

  isUsingWasm(): boolean {
    return true;
  }

  setGeneration(gen: number): void {
    this.generation = gen;
  }
}
