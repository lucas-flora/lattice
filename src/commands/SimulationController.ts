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
import { PyodideBridge } from '../engine/scripting/PyodideBridge';
import { ExpressionEngine } from '../engine/scripting/ExpressionEngine';
import { GlobalScriptRunner } from '../engine/scripting/GlobalScriptRunner';
import { scriptStoreActions } from '../store/scriptStore';

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

/** Smaller chunk during playback to avoid blocking playback ticks */
const PLAYBACK_CHUNK_SIZE = 10;

/** Round a duration to a "nice" number for smart auto-extend */
function smartExtendDuration(current: number): number {
  const doubled = current * 2;
  if (doubled <= 100) return Math.ceil(doubled / 10) * 10;
  if (doubled <= 1000) return Math.ceil(doubled / 50) * 50;
  return Math.ceil(doubled / 100) * 100;
}

export type PlaybackMode = 'loop' | 'endless' | 'once';

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

  /** Debounce timer for restarting compute-ahead after grid edits */
  private editDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  /** Optional PyodideBridge for Python rule support */
  private pyodideBridge: PyodideBridge | null = null;

  /** Current playback generation (may lag behind computedGeneration) */
  private playbackGeneration: number = 0;

  /** What happens when playback reaches the end of the timeline */
  private playbackMode: PlaybackMode = 'loop';

  /** Timeline duration in frames (for end-of-timeline detection) */
  private timelineDuration: number = 256;

  constructor(eventBus: EventBus, tickIntervalMs: number = 100) {
    this.eventBus = eventBus;
    this.tickIntervalMs = tickIntervalMs;
  }

  /**
   * Clear all scripting state (variables, expressions, scripts) and reset the store.
   * Called on preset load so stale scripts don't carry over between presets.
   */
  private clearScriptingState(): void {
    // Clear engine-side state if it exists
    if (this.simulation) {
      this.simulation.variableStore.clear();
      if (this.simulation.expressionEngine) {
        const exprs = this.simulation.expressionEngine.getAllExpressions();
        for (const prop of Object.keys(exprs)) {
          this.simulation.expressionEngine.clearExpression(prop);
        }
      }
      if (this.simulation.globalScriptRunner) {
        const scripts = this.simulation.globalScriptRunner.getAllScripts();
        for (const s of scripts) {
          this.simulation.globalScriptRunner.removeScript(s.name);
        }
      }
    }
    // Reset the Zustand store directly (covers cases where engine objects are about to be replaced)
    scriptStoreActions.resetAll();
  }

  /**
   * Load a preset by name and create a new Simulation.
   * Stops any running simulation first.
   */
  loadPreset(name: string): void {
    this.pause();
    this.clearScriptingState();

    const config: PresetConfig = loadBuiltinPresetClient(name as BuiltinPresetNameClient);
    this.simulation = new Simulation(config);
    this.commandHistory = new CommandHistory(this.simulation);
    this.activePresetName = config.meta.name;
    this.frameCache.clear();
    this.computedGeneration = 0;
    this.playbackGeneration = 0;

    this.emitPresetLoaded(config);
    this.emitParamDefs();
  }

  /**
   * Load a preset from an already-parsed PresetConfig.
   * For Python presets, use loadPresetConfigAsync() instead.
   */
  loadPresetConfig(config: PresetConfig): void {
    this.pause();
    this.clearScriptingState();

    this.simulation = new Simulation(config);
    this.commandHistory = new CommandHistory(this.simulation);
    this.activePresetName = config.meta.name;
    this.frameCache.clear();
    this.computedGeneration = 0;
    this.playbackGeneration = 0;

    this.emitPresetLoaded(config);
    this.emitParamDefs();
  }

  /**
   * Load a Python preset asynchronously. Creates PyodideBridge and
   * initializes the Python runtime before creating the Simulation.
   */
  async loadPresetConfigAsync(config: PresetConfig, bridge: PyodideBridge): Promise<void> {
    this.pause();
    this.clearScriptingState();

    this.pyodideBridge = bridge;
    this.simulation = await Simulation.create(config, bridge);
    this.commandHistory = new CommandHistory(this.simulation);
    this.activePresetName = config.meta.name;
    this.frameCache.clear();
    this.computedGeneration = 0;
    this.playbackGeneration = 0;

    this.emitPresetLoaded(config);
    this.emitParamDefs();
  }

  /**
   * Check whether the current simulation uses a Python rule.
   */
  isUsingPython(): boolean {
    return this.simulation?.isUsingPython() ?? false;
  }

  /**
   * Check whether the tick pipeline requires async execution.
   */
  needsAsyncTick(): boolean {
    return this.simulation?.needsAsyncTick() ?? false;
  }

  /**
   * Get the variable store from the current simulation.
   */
  getVariableStore() {
    return this.simulation?.variableStore ?? null;
  }

  /**
   * Get the expression engine from the current simulation.
   */
  getExpressionEngine() {
    return this.simulation?.expressionEngine ?? null;
  }

  /**
   * Get the global script runner from the current simulation.
   */
  getGlobalScriptRunner() {
    return this.simulation?.globalScriptRunner ?? null;
  }

  /**
   * Get the PyodideBridge instance.
   */
  getPyodideBridge() {
    return this.pyodideBridge;
  }

  /**
   * Lazily ensure scripting engines are available on the current simulation.
   * Creates a PyodideBridge if needed and attaches ExpressionEngine + GlobalScriptRunner.
   */
  ensureScriptingEngines(): { bridge: PyodideBridge; expressionEngine: ExpressionEngine; scriptRunner: GlobalScriptRunner } | null {
    if (!this.simulation) return null;

    // Create bridge if needed
    if (!this.pyodideBridge) {
      this.pyodideBridge = new PyodideBridge();
    }

    // Attach expression engine if needed
    if (!this.simulation.expressionEngine) {
      this.simulation.expressionEngine = new ExpressionEngine(this.pyodideBridge);
    }

    // Attach script runner if needed
    if (!this.simulation.globalScriptRunner) {
      this.simulation.globalScriptRunner = new GlobalScriptRunner(this.pyodideBridge);
    }

    return {
      bridge: this.pyodideBridge,
      expressionEngine: this.simulation.expressionEngine,
      scriptRunner: this.simulation.globalScriptRunner,
    };
  }

  /**
   * Start simulation playback.
   * Kicks off compute-ahead to fill the cache, then starts
   * the playback loop at display FPS.
   */
  play(): void {
    if (this.playing || !this.simulation) return;
    this.playing = true;

    // If edits were pending a debounced compute-ahead restart, flush it now
    if (this.editDebounceTimer) {
      clearTimeout(this.editDebounceTimer);
      this.editDebounceTimer = null;
    }

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
   * For Python rules, use stepAsync() instead.
   */
  step(): void {
    if (!this.simulation) return;
    if (this.simulation.needsAsyncTick()) {
      void this.stepAsync();
      return;
    }

    const nextGen = this.playbackGeneration + 1;

    // Stepping past timeline end: extend by exactly 1 frame
    if (nextGen >= this.timelineDuration) {
      this.timelineDuration = nextGen + 1;
      this.eventBus.emit('sim:timelineExtend', { duration: this.timelineDuration });
    }

    // Ensure the next frame is computed
    if (nextGen > this.computedGeneration) {
      this.computeFrames(1);
    }
    this.playbackGeneration = nextGen;
    this.restoreFrame(this.playbackGeneration);
  }

  /**
   * Async step for Python rules.
   */
  async stepAsync(): Promise<void> {
    if (!this.simulation) return;

    const nextGen = this.playbackGeneration + 1;

    if (nextGen >= this.timelineDuration) {
      this.timelineDuration = nextGen + 1;
      this.eventBus.emit('sim:timelineExtend', { duration: this.timelineDuration });
    }

    if (nextGen > this.computedGeneration) {
      await this.computeFramesAsync(1);
    }
    this.playbackGeneration = nextGen;
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

    const firstProp = this.simulation.typeRegistry.getPropertyUnion()[0].name;
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
   * Emits a single sim:tick event (via restoreFrame) — no redundant emissions.
   */
  seek(generation: number): void {
    if (!this.simulation) return;

    const targetGen = Math.max(0, generation);

    // Ensure the target frame is available in cache
    if (!this.frameCache.has(targetGen)) {
      if (targetGen > this.computedGeneration) {
        this.computeFrames(targetGen - this.computedGeneration);
      } else {
        // Before computed but evicted — recompute
        this.recomputeTo(targetGen);
      }
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
    const firstProp = this.simulation.typeRegistry.getPropertyUnion()[0].name;
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
   * Set what happens when playback reaches the end of the timeline.
   */
  setPlaybackMode(mode: PlaybackMode): void {
    this.playbackMode = mode;
  }

  /**
   * Update the timeline duration the controller tracks for end-of-timeline detection.
   */
  setTimelineDuration(duration: number): void {
    this.timelineDuration = duration;
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
      this.timelineDuration = cacheTarget;
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
   * Async version of computeFrames for Python rules.
   */
  private async computeFramesAsync(count: number): Promise<void> {
    if (!this.simulation) return;

    if (this.simulation.getGeneration() !== this.computedGeneration) {
      this.advanceSimTo(this.computedGeneration);
    }

    for (let i = 0; i < count; i++) {
      this.cacheCurrentFrame();
      await this.simulation.tickAsync();
      this.computedGeneration = this.simulation.getGeneration();
    }
    this.cacheCurrentFrame();

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

    // Async rules (Python, expressions, scripts) use async playback
    if (this.simulation.needsAsyncTick()) {
      void this.playbackTickAsync();
      return;
    }

    const nextGen = this.playbackGeneration + 1;

    // Check if playback has reached the end of the timeline
    if (nextGen >= this.timelineDuration) {
      switch (this.playbackMode) {
        case 'once':
          this.pause();
          return;
        case 'loop':
          this.playbackGeneration = 0;
          this.restoreFrame(0);
          return;
        case 'endless': {
          const newDuration = smartExtendDuration(this.timelineDuration);
          this.timelineDuration = newDuration;
          this.eventBus.emit('sim:timelineExtend', { duration: newDuration });
          // Extend compute-ahead target and kick off caching if idle
          this.computeAheadTarget = newDuration;
          if (!this.computeAheadTimer) {
            this.runComputeAheadChunk();
          }
          break; // Continue to advance playback below
        }
      }
    }

    // If next frame isn't computed yet, compute just 1 frame to keep playback going
    // (minimal synchronous work — bulk caching is handled by runComputeAheadChunk)
    if (nextGen > this.computedGeneration) {
      this.computeFrames(1);
    }

    // Advance playback if the frame is now available
    if (nextGen <= this.computedGeneration) {
      this.playbackGeneration = nextGen;
      this.restoreFrame(this.playbackGeneration);
    }
    // else: frame still not ready, skip this tick (avoids blocking)
  }

  private async playbackTickAsync(): Promise<void> {
    if (!this.simulation) return;

    const nextGen = this.playbackGeneration + 1;

    if (nextGen >= this.timelineDuration) {
      switch (this.playbackMode) {
        case 'once':
          this.pause();
          return;
        case 'loop':
          this.playbackGeneration = 0;
          this.restoreFrame(0);
          return;
        case 'endless': {
          const newDuration = smartExtendDuration(this.timelineDuration);
          this.timelineDuration = newDuration;
          this.eventBus.emit('sim:timelineExtend', { duration: newDuration });
          this.computeAheadTarget = newDuration;
          break;
        }
      }
    }

    if (nextGen > this.computedGeneration) {
      await this.computeFramesAsync(1);
    }

    if (nextGen <= this.computedGeneration) {
      this.playbackGeneration = nextGen;
      this.restoreFrame(this.playbackGeneration);
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
   * After each chunk, restores the grid to the playback generation so
   * compute-ahead never corrupts the visible grid state (important for
   * drawing while paused).
   */
  private runComputeAheadChunk(): void {
    if (this.computedGeneration >= this.computeAheadTarget) {
      this.computeAheadTimer = null;
      return;
    }

    const remaining = this.computeAheadTarget - this.computedGeneration;
    // Use smaller chunks during playback to avoid blocking playback ticks
    const maxChunk = this.playing ? PLAYBACK_CHUNK_SIZE : COMPUTE_CHUNK_SIZE;
    const chunkSize = Math.min(maxChunk, remaining);
    this.computeFrames(chunkSize);

    // Restore the grid to the playback frame so the visible state isn't corrupted.
    // computeFrames advanced the engine beyond playback; put the grid back.
    if (this.frameCache.has(this.playbackGeneration)) {
      this.applySnapshot(this.frameCache.get(this.playbackGeneration)!);
    }

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
   * Notify the controller that grid cells have been edited (draw/erase).
   * Lightweight: only caches the edited frame and deletes stale future frames.
   * Compute-ahead restart is debounced so rapid drawing stays responsive.
   */
  onGridEdited(): void {
    if (!this.simulation) return;

    const gen = this.playbackGeneration;

    // Sync the engine's generation counter to playback (compute-ahead may have
    // advanced it far beyond playback, but the grid buffers reflect playback gen).
    this.simulation.runner.setGeneration(gen);

    // Snapshot the current (edited) grid
    this.cacheCurrentFrame();

    // Update initial snapshot if at generation 0 so reset preserves edits
    if (gen === 0 && this.initialSnapshot) {
      for (const propName of this.simulation.grid.getPropertyNames()) {
        const buf = this.simulation.grid.getCurrentBuffer(propName);
        this.initialSnapshot.set(propName, new Float32Array(buf));
      }
    }

    // Delete future cache entries (fast, no recomputation)
    this.stopComputeAhead();
    for (const key of this.frameCache.keys()) {
      if (key > gen) {
        this.frameCache.delete(key);
      }
    }
    this.computedGeneration = gen;
    this.eventBus.emit('sim:computeProgress', { computedGeneration: gen });

    // Emit tick to update UI with new cell count
    this.eventBus.emit('sim:tick', {
      generation: gen,
      liveCellCount: this.getLiveCellCount(),
    });

    // Debounce compute-ahead restart — don't block drawing with heavy computation
    if (this.editDebounceTimer) {
      clearTimeout(this.editDebounceTimer);
    }
    this.editDebounceTimer = setTimeout(() => {
      this.editDebounceTimer = null;
      if (this.computeAheadTarget > this.computedGeneration) {
        this.computeAhead(this.computeAheadTarget);
      }
    }, 150);
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
   * Emit preset loaded event with cell type data from the type registry.
   */
  private emitPresetLoaded(config: PresetConfig): void {
    if (!this.simulation) return;

    const registry = this.simulation.typeRegistry;

    // Build cellTypes for the store, filtering out _cellType and tagging inherent
    const cellTypes = registry.getTypes().map((typeDef) => {
      const resolved = registry.resolveProperties(typeDef.id);
      return {
        id: typeDef.id,
        name: typeDef.name,
        color: typeDef.color,
        properties: resolved
          .filter((p) => p.name !== '_cellType')
          .map((p) => ({
            name: p.name,
            type: p.type,
            default: p.default,
            role: p.role,
            isInherent: registry.isInherent(p.name),
          })),
      };
    });

    // Also build flat cellProperties for backward compat
    const unionProps = registry
      .getPropertyUnion()
      .filter((p) => p.name !== '_cellType')
      .map((p) => ({
        name: p.name,
        type: p.type,
        default: p.default,
        role: p.role,
        isInherent: registry.isInherent(p.name),
      }));

    this.eventBus.emit('sim:presetLoaded', {
      name: config.meta.name,
      width: config.grid.width,
      height: config.grid.height ?? 1,
      cellProperties: unionProps,
      cellTypes,
    });
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
    if (this.editDebounceTimer) {
      clearTimeout(this.editDebounceTimer);
      this.editDebounceTimer = null;
    }
    if (this.pyodideBridge) {
      this.pyodideBridge.dispose();
      this.pyodideBridge = null;
    }
    this.simulation = null;
    this.commandHistory = null;
    this.frameCache.clear();
  }
}
