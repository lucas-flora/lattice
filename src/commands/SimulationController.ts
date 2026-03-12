/**
 * SimulationController: wraps Simulation with play/pause lifecycle and event emission.
 *
 * This is the bridge between commands and the engine. Commands call controller
 * methods, which operate on the Simulation and emit events via the EventBus.
 *
 * Supports compute-ahead: frames are pre-computed into a cache so the timeline
 * can be scrubbed instantly. Playback is decoupled from computation — the sim
 * computes as fast as possible while playback runs at display FPS.
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

/** Snapshot of grid state at a generation for scrubbing/playback */
interface TickSnapshot {
  generation: number;
  /** Map of property name -> copy of the current buffer at that generation */
  buffers: Map<string, Float32Array>;
  liveCellCount: number;
}

/** How many frames to compute per async chunk during compute-ahead */
const COMPUTE_CHUNK_SIZE = 50;

export class SimulationController {
  private eventBus: EventBus;
  private simulation: Simulation | null = null;
  private commandHistory: CommandHistory | null = null;
  private playing: boolean = false;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private tickIntervalMs: number;
  private activePresetName: string | null = null;

  /** Frame cache: generation -> snapshot. Replaces the old tickHistory array. */
  private frameCache: Map<number, TickSnapshot> = new Map();
  private maxCacheSize: number = 2000;

  /** How far ahead the sim has been computed (the frontier). */
  private computedGeneration: number = 0;

  /** Snapshot of the grid state right after initialization (for seek/reset to replay from) */
  private initialSnapshot: Map<string, Float32Array> | null = null;

  /** Compute-ahead state */
  private computeAheadTimer: ReturnType<typeof setTimeout> | null = null;
  private computeAheadTarget: number = 0;

  /** Current playback generation (may lag behind computedGeneration) */
  private playbackGeneration: number = 0;

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
    this.frameCache.clear();
    this.computedGeneration = 0;
    this.playbackGeneration = 0;

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
    this.frameCache.clear();
    this.computedGeneration = 0;
    this.playbackGeneration = 0;

    this.eventBus.emit('sim:presetLoaded', {
      name: config.meta.name,
      width: config.grid.width,
      height: config.grid.height ?? 1,
    });
    this.emitParamDefs();
  }

  /**
   * Start simulation playback.
   * Kicks off compute-ahead to fill the cache, then starts
   * the playback loop at display FPS.
   */
  play(): void {
    if (this.playing || !this.simulation) return;
    this.playing = true;
    this.eventBus.emit('sim:play', {});

    this.startPlaybackLoop();
  }

  /**
   * Stop the simulation playback.
   */
  pause(): void {
    if (!this.playing) return;
    this.playing = false;

    this.stopPlaybackLoop();
    // Don't stop compute-ahead — keep caching aggressively even when paused

    this.eventBus.emit('sim:pause', {});
  }

  /**
   * Run a single tick (step forward one generation).
   */
  step(): void {
    if (!this.simulation) return;

    // Ensure the next frame is computed
    if (this.playbackGeneration >= this.computedGeneration) {
      this.computeFrames(1);
    }
    this.playbackGeneration++;
    this.restoreFrame(this.playbackGeneration);
  }

  /**
   * Reverse one generation by restoring the previous cached frame.
   */
  stepBack(): void {
    if (!this.simulation || this.playbackGeneration <= 0) return;

    this.playbackGeneration--;
    if (this.frameCache.has(this.playbackGeneration)) {
      this.restoreFrame(this.playbackGeneration);
    } else {
      // Frame not in cache — need to recompute from initial state
      this.recomputeTo(this.playbackGeneration);
      this.restoreFrame(this.playbackGeneration);
    }
    this.eventBus.emit('sim:stepBack', { generation: this.playbackGeneration });
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

    this.frameCache.clear();
    this.computedGeneration = 0;
    this.playbackGeneration = 0;
    this.simulation.runner.setGeneration(0);
    this.eventBus.emit('sim:clear', {});
    this.eventBus.emit('sim:tick', { generation: 0, liveCellCount: 0 });
  }

  /**
   * Set the simulation speed in FPS. 0 = max speed (1ms interval).
   * Restarts the playback loop if currently playing.
   */
  setSpeed(fps: number): void {
    if (fps <= 0) {
      this.tickIntervalMs = 1; // Max speed
    } else {
      this.tickIntervalMs = Math.round(1000 / fps);
    }

    this.eventBus.emit('sim:speedChange', { fps });

    // Restart playback loop with new interval if currently playing
    if (this.playing) {
      this.stopPlaybackLoop();
      this.startPlaybackLoop();
    }
  }

  /**
   * Seek to a specific generation. Uses frame cache for instant access.
   */
  seek(generation: number): void {
    if (!this.simulation) return;

    const targetGen = Math.max(0, generation);

    // If target is already cached, instant restore
    if (this.frameCache.has(targetGen)) {
      this.playbackGeneration = targetGen;
      this.applySnapshot(this.frameCache.get(targetGen)!);
      const liveCellCount = this.frameCache.get(targetGen)!.liveCellCount;
      this.eventBus.emit('sim:seek', { generation: targetGen });
      this.eventBus.emit('sim:tick', { generation: targetGen, liveCellCount });
      return;
    }

    // If target is beyond computed, compute up to it
    if (targetGen > this.computedGeneration) {
      this.computeFrames(targetGen - this.computedGeneration);
    } else {
      // Target is before computed but not in cache (evicted) — recompute
      this.recomputeTo(targetGen);
    }

    this.playbackGeneration = targetGen;
    this.restoreFrame(targetGen);
  }

  /**
   * Compute ahead to a target generation asynchronously (non-blocking).
   * Computes in chunks to avoid freezing the UI.
   */
  computeAhead(targetGeneration: number): void {
    this.computeAheadTarget = targetGeneration;
    if (this.computeAheadTimer) return; // Already running
    this.runComputeAheadChunk();
  }

  /**
   * Get the computed generation frontier.
   */
  getComputedGeneration(): number {
    return this.computedGeneration;
  }

  /**
   * Reset the simulation to its initial state.
   */
  reset(): void {
    if (!this.simulation) return;
    this.stopComputeAhead();
    if (this.initialSnapshot) {
      this.restoreInitialState();
    } else {
      this.simulation.reset();
    }
    this.frameCache.clear();
    this.computedGeneration = 0;
    this.playbackGeneration = 0;
    this.cacheCurrentFrame();
    this.eventBus.emit('sim:reset', {});
    // Restart aggressive compute-ahead
    if (this.computeAheadTarget > 0) {
      this.computeAhead(this.computeAheadTarget);
    }
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
    computedGeneration: number;
  } {
    return {
      generation: this.playbackGeneration,
      liveCellCount: this.getLiveCellCount(),
      isRunning: this.playing,
      activePreset: this.activePresetName,
      speed: this.tickIntervalMs <= 1 ? 0 : Math.round(1000 / this.tickIntervalMs),
      computedGeneration: this.computedGeneration,
    };
  }

  /**
   * Whether the simulation is currently playing.
   */
  isPlaying(): boolean {
    return this.playing;
  }

  /**
   * Get the current playback generation number.
   */
  getGeneration(): number {
    return this.playbackGeneration;
  }

  /**
   * Get the underlying Simulation instance.
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
   * Immediately starts aggressive compute-ahead to fill the cache.
   */
  captureInitialState(cacheTarget?: number): void {
    if (!this.simulation) return;
    this.initialSnapshot = new Map();
    for (const propName of this.simulation.grid.getPropertyNames()) {
      const buf = this.simulation.grid.getCurrentBuffer(propName);
      this.initialSnapshot.set(propName, new Float32Array(buf));
    }
    // Also cache frame 0
    this.cacheCurrentFrame();

    // Aggressively start computing ahead immediately
    if (cacheTarget && cacheTarget > 0) {
      this.computeAhead(cacheTarget);
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
   * Cache the current frame in the frame cache.
   */
  private cacheCurrentFrame(): void {
    if (!this.simulation) return;

    const generation = this.simulation.getGeneration();
    const buffers = new Map<string, Float32Array>();
    for (const propName of this.simulation.grid.getPropertyNames()) {
      const buf = this.simulation.grid.getCurrentBuffer(propName);
      buffers.set(propName, new Float32Array(buf));
    }

    const liveCellCount = this.getLiveCellCount();
    this.frameCache.set(generation, { generation, buffers, liveCellCount });

    // Evict oldest if over capacity
    if (this.frameCache.size > this.maxCacheSize) {
      const firstKey = this.frameCache.keys().next().value;
      if (firstKey !== undefined) {
        this.frameCache.delete(firstKey);
      }
    }
  }

  /**
   * Compute N frames ahead from the current computed frontier.
   * Synchronous — use computeAhead() for async chunked computation.
   */
  private computeFrames(count: number): void {
    if (!this.simulation) return;

    // Ensure the sim is at the computed frontier
    if (this.simulation.getGeneration() !== this.computedGeneration) {
      this.advanceSimTo(this.computedGeneration);
    }

    for (let i = 0; i < count; i++) {
      this.cacheCurrentFrame();
      this.simulation.tick();
      this.computedGeneration = this.simulation.getGeneration();
    }
    // Cache the final frame too
    this.cacheCurrentFrame();

    // Emit progress
    this.eventBus.emit('sim:computeProgress', { computedGeneration: this.computedGeneration });
  }

  /**
   * Advance the sim engine to a specific generation (for internal use).
   * If the target is cached, restores from cache. Otherwise replays from initial state.
   */
  private advanceSimTo(targetGen: number): void {
    if (!this.simulation) return;

    const currentGen = this.simulation.getGeneration();
    if (currentGen === targetGen) return;

    // Check cache
    if (this.frameCache.has(targetGen)) {
      this.applySnapshot(this.frameCache.get(targetGen)!);
      return;
    }

    // Need to replay
    if (targetGen < currentGen || !this.frameCache.has(currentGen)) {
      this.restoreInitialState();
      for (let i = 0; i < targetGen; i++) {
        this.simulation.tick();
      }
    } else {
      for (let i = currentGen; i < targetGen; i++) {
        this.simulation.tick();
      }
    }
  }

  /**
   * Recompute from initial state to target, populating cache along the way.
   */
  private recomputeTo(targetGen: number): void {
    if (!this.simulation) return;
    this.restoreInitialState();
    for (let i = 0; i < targetGen; i++) {
      this.cacheCurrentFrame();
      this.simulation.tick();
    }
    this.cacheCurrentFrame();
    if (targetGen > this.computedGeneration) {
      this.computedGeneration = targetGen;
    }
  }

  /**
   * Apply a snapshot to the live grid (for rendering).
   */
  private applySnapshot(snapshot: TickSnapshot): void {
    if (!this.simulation) return;
    for (const [propName, buffer] of snapshot.buffers) {
      const currentBuf = this.simulation.grid.getCurrentBuffer(propName);
      currentBuf.set(buffer);
    }
    this.simulation.runner.setGeneration(snapshot.generation);
  }

  /**
   * Restore a cached frame and emit events.
   */
  private restoreFrame(generation: number): void {
    const snapshot = this.frameCache.get(generation);
    if (!snapshot) return;

    this.applySnapshot(snapshot);
    this.eventBus.emit('sim:tick', { generation: snapshot.generation, liveCellCount: snapshot.liveCellCount });
  }

  /**
   * Playback loop: advances playbackGeneration at display FPS,
   * restoring cached frames. Also kicks off compute-ahead as needed.
   */
  private startPlaybackLoop(): void {
    this.tickInterval = setInterval(() => {
      this.playbackTick();
    }, this.tickIntervalMs);
  }

  private playbackTick(): void {
    if (!this.simulation) return;

    // If we've caught up to the computed frontier, compute more
    if (this.playbackGeneration >= this.computedGeneration) {
      // Compute a small burst to stay ahead
      this.computeFrames(Math.min(COMPUTE_CHUNK_SIZE, 10));
    }

    // Advance playback
    if (this.playbackGeneration < this.computedGeneration) {
      this.playbackGeneration++;
      this.restoreFrame(this.playbackGeneration);
    }

    // Keep computing ahead in the background
    if (this.computedGeneration < this.computeAheadTarget) {
      this.computeFrames(Math.min(COMPUTE_CHUNK_SIZE, this.computeAheadTarget - this.computedGeneration));
    }
  }

  /**
   * Stop the playback loop.
   */
  private stopPlaybackLoop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  /**
   * Async compute-ahead: computes frames in chunks to avoid blocking.
   */
  private runComputeAheadChunk(): void {
    if (this.computedGeneration >= this.computeAheadTarget) {
      this.computeAheadTimer = null;
      return;
    }

    const remaining = this.computeAheadTarget - this.computedGeneration;
    const chunkSize = Math.min(COMPUTE_CHUNK_SIZE, remaining);
    this.computeFrames(chunkSize);

    // Schedule next chunk
    this.computeAheadTimer = setTimeout(() => {
      this.runComputeAheadChunk();
    }, 0);
  }

  /**
   * Stop compute-ahead.
   */
  private stopComputeAhead(): void {
    if (this.computeAheadTimer) {
      clearTimeout(this.computeAheadTimer);
      this.computeAheadTimer = null;
    }
  }

  // --- Runtime Parameter Methods ---

  /**
   * Set a runtime parameter value. Validates range and emits event.
   * Invalidates cache beyond current playback generation since params changed.
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

    // Invalidate cache beyond current playback position since params changed
    this.invalidateCacheFrom(this.playbackGeneration + 1);
  }

  /**
   * Invalidate cached frames from a given generation onward.
   * Automatically restarts compute-ahead to refill the cache.
   */
  private invalidateCacheFrom(fromGeneration: number): void {
    for (const key of this.frameCache.keys()) {
      if (key >= fromGeneration) {
        this.frameCache.delete(key);
      }
    }
    if (this.computedGeneration > fromGeneration) {
      this.computedGeneration = fromGeneration;
      // Restore sim to the last valid state
      this.advanceSimTo(Math.max(0, fromGeneration - 1));
      this.eventBus.emit('sim:computeProgress', { computedGeneration: this.computedGeneration });
    }
    // Restart compute-ahead to refill the cache
    this.stopComputeAhead();
    if (this.computeAheadTarget > this.computedGeneration) {
      this.computeAhead(this.computeAheadTarget);
    }
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
    this.invalidateCacheFrom(this.playbackGeneration + 1);
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
    // Invalidate cache since rule changed
    this.invalidateCacheFrom(this.playbackGeneration + 1);
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
    this.stopComputeAhead();
    this.simulation = null;
    this.commandHistory = null;
    this.frameCache.clear();
  }
}
