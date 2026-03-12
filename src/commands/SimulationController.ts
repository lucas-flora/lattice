/**
 * SimulationController: wraps Simulation with play/pause lifecycle and event emission.
 *
 * This is the bridge between commands and the engine. Commands call controller
 * methods, which operate on the Simulation and emit events via the EventBus.
 *
 * Extended in Phase 6 with stepBack, clear, speed, seek, live cell count.
 */

import { Simulation } from '../engine/rule/Simulation';
import { CommandHistory } from '../engine/rule/CommandHistory';
import { loadBuiltinPresetClient, type BuiltinPresetNameClient } from '../engine/preset/builtinPresetsClient';
import type { EventBus } from '../engine/core/EventBus';
import type { PresetConfig } from '../engine/preset/types';

export interface ParamDef {
  name: string;
  label?: string;
  type: 'float' | 'int';
  default: number;
  min?: number;
  max?: number;
  step?: number;
}

/** Snapshot of grid state at a generation for reverse-step */
interface TickSnapshot {
  generation: number;
  /** Map of property name -> copy of the current buffer at that generation */
  buffers: Map<string, Float32Array>;
}

export class SimulationController {
  private eventBus: EventBus;
  private simulation: Simulation | null = null;
  private commandHistory: CommandHistory | null = null;
  private playing: boolean = false;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private tickIntervalMs: number;
  private activePresetName: string | null = null;

  /** Tick history for reverse-step (circular buffer) */
  private tickHistory: TickSnapshot[] = [];
  private maxTickHistory: number = 1000;

  /** Snapshot of the grid state right after initialization (for seek/reset to replay from) */
  private initialSnapshot: Map<string, Float32Array> | null = null;

  constructor(eventBus: EventBus, tickIntervalMs: number = 100) {
    this.eventBus = eventBus;
    this.tickIntervalMs = tickIntervalMs;
  }

  /**
   * Load a preset by name and create a new Simulation.
   * Stops any running simulation first.
   */
  loadPreset(name: string): void {
    this.pause();

    const config: PresetConfig = loadBuiltinPresetClient(name as BuiltinPresetNameClient);
    this.simulation = new Simulation(config);
    this.commandHistory = new CommandHistory(this.simulation);
    this.activePresetName = config.meta.name;
    this.tickHistory = [];

    this.eventBus.emit('sim:presetLoaded', {
      name: config.meta.name,
      width: config.grid.width,
      height: config.grid.height ?? 1,
    });
    this.emitParamDefs();
  }

  /**
   * Load a preset from an already-parsed PresetConfig.
   */
  loadPresetConfig(config: PresetConfig): void {
    this.pause();

    this.simulation = new Simulation(config);
    this.commandHistory = new CommandHistory(this.simulation);
    this.activePresetName = config.meta.name;
    this.tickHistory = [];

    this.eventBus.emit('sim:presetLoaded', {
      name: config.meta.name,
      width: config.grid.width,
      height: config.grid.height ?? 1,
    });
    this.emitParamDefs();
  }

  /**
   * Start the simulation tick loop.
   */
  play(): void {
    if (this.playing || !this.simulation) return;
    this.playing = true;
    this.eventBus.emit('sim:play', {});

    this.startTickLoop();
  }

  /**
   * Stop the simulation tick loop.
   */
  pause(): void {
    if (!this.playing) return;
    this.playing = false;

    this.stopTickLoop();

    this.eventBus.emit('sim:pause', {});
  }

  /**
   * Run a single tick (step forward one generation).
   */
  step(): void {
    if (!this.simulation) return;
    this.doTick();
  }

  /**
   * Reverse one generation by restoring the previous tick snapshot.
   */
  stepBack(): void {
    if (!this.simulation || this.tickHistory.length === 0) return;

    const snapshot = this.tickHistory.pop()!;

    // Restore grid buffers from snapshot
    for (const [propName, buffer] of snapshot.buffers) {
      const currentBuf = this.simulation.grid.getCurrentBuffer(propName);
      currentBuf.set(buffer);
    }

    // Reset the runner's generation counter
    this.simulation.runner.setGeneration(snapshot.generation);

    const liveCellCount = this.getLiveCellCount();
    this.eventBus.emit('sim:stepBack', { generation: snapshot.generation });
    this.eventBus.emit('sim:tick', { generation: snapshot.generation, liveCellCount });
  }

  /**
   * Clear all cells in the grid (set primary property to 0 for all cells).
   */
  clear(): void {
    if (!this.simulation) return;
    this.pause();

    const firstProp = this.simulation.preset.cell_properties[0].name;
    const buffer = this.simulation.grid.getCurrentBuffer(firstProp);
    buffer.fill(0);

    this.tickHistory = [];
    this.eventBus.emit('sim:clear', {});
    this.eventBus.emit('sim:tick', { generation: this.simulation.getGeneration(), liveCellCount: 0 });
  }

  /**
   * Set the simulation speed in FPS. 0 = max speed (1ms interval).
   * Restarts the tick loop if currently playing.
   */
  setSpeed(fps: number): void {
    if (fps <= 0) {
      this.tickIntervalMs = 1; // Max speed
    } else {
      this.tickIntervalMs = Math.round(1000 / fps);
    }

    this.eventBus.emit('sim:speedChange', { fps });

    // Restart tick loop with new interval if currently playing
    if (this.playing) {
      this.stopTickLoop();
      this.startTickLoop();
    }
  }

  /**
   * Seek to a specific generation. If target > current, step forward.
   * If target < current, reset and replay.
   */
  seek(generation: number): void {
    if (!this.simulation) return;

    const current = this.simulation.getGeneration();

    if (generation < current) {
      // Restore to initial state (captured snapshot or engine reset) and replay
      if (this.initialSnapshot) {
        this.restoreInitialState();
      } else {
        this.simulation.reset();
      }
      this.tickHistory = [];
      for (let i = 0; i < generation; i++) {
        this.captureSnapshot();
        this.simulation.tick();
      }
    } else if (generation > current) {
      for (let i = current; i < generation; i++) {
        this.captureSnapshot();
        this.simulation.tick();
      }
    }

    const liveCellCount = this.getLiveCellCount();
    this.eventBus.emit('sim:seek', { generation: this.simulation.getGeneration() });
    this.eventBus.emit('sim:tick', { generation: this.simulation.getGeneration(), liveCellCount });
  }

  /**
   * Reset the simulation to its initial state.
   */
  reset(): void {
    if (!this.simulation) return;
    if (this.initialSnapshot) {
      this.restoreInitialState();
    } else {
      this.simulation.reset();
    }
    this.tickHistory = [];
    this.eventBus.emit('sim:reset', {});
  }

  /**
   * Count non-zero values in the primary property buffer.
   */
  getLiveCellCount(): number {
    if (!this.simulation) return 0;
    const firstProp = this.simulation.preset.cell_properties[0].name;
    const buffer = this.simulation.grid.getCurrentBuffer(firstProp);
    let count = 0;
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] !== 0) count++;
    }
    return count;
  }

  /**
   * Get full simulation status.
   */
  getStatus(): {
    generation: number;
    liveCellCount: number;
    isRunning: boolean;
    activePreset: string | null;
    speed: number;
  } {
    return {
      generation: this.simulation?.getGeneration() ?? 0,
      liveCellCount: this.getLiveCellCount(),
      isRunning: this.playing,
      activePreset: this.activePresetName,
      speed: this.tickIntervalMs <= 1 ? 0 : Math.round(1000 / this.tickIntervalMs),
    };
  }

  /**
   * Whether the simulation is currently playing.
   */
  isPlaying(): boolean {
    return this.playing;
  }

  /**
   * Get the current generation number.
   */
  getGeneration(): number {
    return this.simulation?.getGeneration() ?? 0;
  }

  /**
   * Get the underlying Simulation instance.
   * Used for direct comparison in tests (Success Criterion #3).
   */
  getSimulation(): Simulation | null {
    return this.simulation;
  }

  /**
   * Get the CommandHistory for undo/redo operations.
   */
  getCommandHistory(): CommandHistory | null {
    return this.commandHistory;
  }

  /**
   * Get the active preset name.
   */
  getActivePresetName(): string | null {
    return this.activePresetName;
  }

  /**
   * Get the current tick interval in milliseconds.
   */
  getTickIntervalMs(): number {
    return this.tickIntervalMs;
  }

  /**
   * Capture the current grid state as the "initial state" for seek/reset.
   * Call after initializeSimulation() to preserve the starting pattern.
   */
  captureInitialState(): void {
    if (!this.simulation) return;
    this.initialSnapshot = new Map();
    for (const propName of this.simulation.grid.getPropertyNames()) {
      const buf = this.simulation.grid.getCurrentBuffer(propName);
      this.initialSnapshot.set(propName, new Float32Array(buf));
    }
  }

  /**
   * Restore grid buffers from the initial snapshot.
   */
  private restoreInitialState(): void {
    if (!this.simulation || !this.initialSnapshot) return;
    for (const [propName, buffer] of this.initialSnapshot) {
      const currentBuf = this.simulation.grid.getCurrentBuffer(propName);
      currentBuf.set(buffer);
    }
    this.simulation.runner.setGeneration(0);
  }

  /**
   * Capture a snapshot of the current grid state before a tick.
   */
  private captureSnapshot(): void {
    if (!this.simulation) return;

    const buffers = new Map<string, Float32Array>();
    for (const propName of this.simulation.grid.getPropertyNames()) {
      const buf = this.simulation.grid.getCurrentBuffer(propName);
      buffers.set(propName, new Float32Array(buf));
    }

    const snapshot: TickSnapshot = {
      generation: this.simulation.getGeneration(),
      buffers,
    };

    this.tickHistory.push(snapshot);
    if (this.tickHistory.length > this.maxTickHistory) {
      this.tickHistory.shift();
    }
  }

  /**
   * Internal: run one tick and emit the event.
   */
  private doTick(): void {
    if (!this.simulation) return;

    // Capture snapshot before tick for reverse-step
    this.captureSnapshot();

    const result = this.simulation.tick();
    const liveCellCount = this.getLiveCellCount();
    this.eventBus.emit('sim:tick', { generation: result.generation, liveCellCount });
  }

  /**
   * Start the tick loop with the current interval.
   */
  private startTickLoop(): void {
    this.tickInterval = setInterval(() => {
      this.doTick();
    }, this.tickIntervalMs);
  }

  /**
   * Stop the tick loop.
   */
  private stopTickLoop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  // --- Runtime Parameter Methods ---

  /**
   * Set a runtime parameter value. Validates range and emits event.
   */
  setParam(name: string, value: number): void {
    if (!this.simulation) return;
    const def = this.simulation.preset.params?.find((p) => p.name === name);
    if (!def) return;

    // Clamp to range
    let clamped = value;
    if (def.min !== undefined) clamped = Math.max(def.min, clamped);
    if (def.max !== undefined) clamped = Math.min(def.max, clamped);
    if (def.type === 'int') clamped = Math.round(clamped);

    this.simulation.setParam(name, clamped);
    this.eventBus.emit('sim:paramChanged', { name, value: clamped });
  }

  /**
   * Get a runtime parameter value.
   */
  getParam(name: string): number | undefined {
    return this.simulation?.getParam(name);
  }

  /**
   * Get all parameter definitions for the current preset.
   */
  getParamDefs(): ParamDef[] {
    if (!this.simulation?.preset.params) return [];
    return this.simulation.preset.params.map((p) => ({
      name: p.name,
      label: p.label,
      type: p.type,
      default: p.default,
      min: p.min,
      max: p.max,
      step: p.step,
    }));
  }

  /**
   * Get all current param values as a record.
   */
  getParamValues(): Record<string, number> {
    return this.simulation?.getParamsObject() ?? {};
  }

  /**
   * Reset all params to their defaults.
   */
  resetParams(): void {
    if (!this.simulation?.preset.params) return;
    for (const p of this.simulation.preset.params) {
      this.simulation.setParam(p.name, p.default);
    }
    this.eventBus.emit('sim:paramsReset', {});
  }

  /**
   * Emit param defs after preset load.
   */
  private emitParamDefs(): void {
    const defs = this.getParamDefs();
    const values = this.getParamValues();
    this.eventBus.emit('sim:paramDefsChanged', { defs, values });
  }

  // --- Grid Configuration Methods ---

  /**
   * Resize the grid by recreating the simulation with new dimensions.
   * Preserves current preset and params.
   */
  resizeGrid(width: number, height?: number): void {
    if (!this.simulation) return;
    const preset = this.simulation.preset;
    const paramValues = this.simulation.getParamsObject();

    // Clone preset with new grid dimensions
    const newPreset = {
      ...preset,
      grid: {
        ...preset.grid,
        width,
        ...(height !== undefined ? { height } : {}),
      },
    };

    this.loadPresetConfig(newPreset);

    // Restore params
    for (const [k, v] of Object.entries(paramValues)) {
      this.simulation!.setParam(k, v);
    }
  }

  /**
   * Get the current preset config.
   */
  getPresetConfig(): PresetConfig | null {
    return this.simulation?.preset ?? null;
  }

  /**
   * Update the rule compute body at runtime.
   */
  updateRule(newBody: string): void {
    if (!this.simulation) return;
    this.simulation.updateRule(newBody);
  }

  /**
   * Get the current rule compute body.
   */
  getRuleBody(): string {
    return this.simulation?.preset.rule.compute ?? '';
  }

  /**
   * Dispose of the controller, stopping the tick loop.
   */
  dispose(): void {
    this.pause();
    this.simulation = null;
    this.commandHistory = null;
    this.tickHistory = [];
  }
}
