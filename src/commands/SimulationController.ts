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
import { expressionStoreActions } from '../store/expressionStore';
import type { ExpressionTagRegistry } from '../engine/expression/ExpressionTagRegistry';
import type { SceneGraph } from '../engine/scene/SceneGraph';
import type { SceneNode } from '../engine/scene/SceneNode';
import { NODE_TYPES, generateNodeId } from '../engine/scene/SceneNode';
import { sceneStoreActions, useSceneStore } from '../store/sceneStore';
import { brushStoreActions } from '../store/brushStore';
import { logMin, logDbg, logGPU } from '../lib/debugLog';
import { GPURuleRunner } from '../engine/rule/GPURuleRunner';
import { GPUContext } from '../engine/gpu/GPUContext';
import { CircularFrameBuffer, computeDefaultBufferSize } from '../engine/buffer/CircularFrameBuffer';

export interface ParamDef {
  name: string;
  label?: string;
  type: 'float' | 'int';
  default: number;
  min?: number;
  max?: number;
  step?: number;
}

export type PlaybackMode = 'loop' | 'endless' | 'once';

/**
 * Snapshot of a SimulationController's per-root state.
 * Used by SimulationManager to save/restore state when switching active roots.
 * SG-8: Multi-Sim infrastructure.
 */
export interface ControllerStateSnapshot {
  simulation: Simulation | null;
  commandHistory: CommandHistory | null;
  playing: boolean;
  tickIntervalMs: number;
  activePresetName: string | null;
  circularBuffer: CircularFrameBuffer;
  computedGeneration: number;
  initialSnapshot: Map<string, Float32Array> | null;
  computeAheadTarget: number;
  playbackGeneration: number;
  playbackMode: PlaybackMode;
  timelineDuration: number;
}

export class SimulationController {
  protected eventBus: EventBus;
  protected simulation: Simulation | null = null;
  protected commandHistory: CommandHistory | null = null;
  protected playing: boolean = false;
  protected tickIntervalMs: number;
  protected activePresetName: string | null = null;

  /** Circular frame buffer — ring buffer of GPU readback snapshots for scrubbing. */
  protected circularBuffer: CircularFrameBuffer = new CircularFrameBuffer(500);

  /** How far ahead the sim has been computed (the frontier). */
  protected computedGeneration: number = 0;

  /** Snapshot of the grid state right after initialization (for seek/reset to replay from) */
  protected initialSnapshot: Map<string, Float32Array> | null = null;

  /** Compute-ahead state (legacy — kept for compute-ahead target tracking) */
  protected computeAheadTimer: ReturnType<typeof setTimeout> | null = null;
  protected computeAheadTarget: number = 0;

  /** Debounce timer for restarting compute-ahead after grid edits */
  protected editDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  /** Epoch counter: incremented on preset/resize changes to cancel in-flight async work */
  protected computeEpoch: number = 0;

  /** Current playback generation (may lag behind computedGeneration) */
  protected playbackGeneration: number = 0;

  /** What happens when playback reaches the end of the timeline */
  protected playbackMode: PlaybackMode = 'endless';

  /** Timeline duration in frames (for end-of-timeline detection) */
  protected timelineDuration: number = 256;

  /** GPU rule runner — when set, simulation ticks run on the GPU */
  protected gpuRuleRunner: GPURuleRunner | null = null;

  /** Guard: prevents interaction during GPU→CPU readback on pause */
  protected gpuSyncInFlight: boolean = false;
  /** Resolvers waiting for GPU sync to complete */
  private gpuSyncWaiters: (() => void)[] = [];

  /** requestAnimationFrame handle for live playback loop */
  private rafHandle: number | null = null;
  /** Timestamp of last tick — used for speed control */
  private lastTickTime: number = 0;
  /** Whether a GPU readback is currently in-flight (non-blocking buffer push) */
  private readbackInFlight: boolean = false;
  /** Skip readback for large grids to maintain framerate */
  private readbackEveryN: number = 1;
  /** Counter for readback decimation */
  private ticksSinceReadback: number = 0;


  constructor(eventBus: EventBus, tickIntervalMs: number = 100) {
    this.eventBus = eventBus;
    this.tickIntervalMs = tickIntervalMs;
  }

  /**
   * Try to initialize a GPURuleRunner for the current simulation.
   * Waits for GPUContext if WebGPU is available but not yet initialized.
   * Silently falls back to CPU if WebGPU unavailable or no built-in IR.
   */
  private async tryInitGPURuleRunner(): Promise<void> {
    if (!this.simulation) return;
    // Clean up existing
    if (this.gpuRuleRunner) {
      this.gpuRuleRunner.destroy();
      this.gpuRuleRunner = null;
    }

    const presetName = this.simulation.preset.meta.name;
    try {
      if (!GPUContext.isAvailable()) return;

      // All presets with a compute body or stages can run on GPU via the transpiler
      if (!this.simulation.preset.rule.compute && !this.simulation.preset.rule.stages) return;

      // Wait for GPU context if not yet initialized
      let ctx = GPUContext.tryGet();
      if (!ctx) {
        logGPU(`Waiting for GPU context before initializing rule runner...`);
        ctx = await GPUContext.initialize();
      }

      const epoch = this.computeEpoch;
      const runner = new GPURuleRunner(this.simulation.grid, this.simulation.preset);
      await runner.initialize();

      // Check that preset didn't change while we were waiting
      if (this.computeEpoch !== epoch) {
        runner.destroy();
        return;
      }

      this.gpuRuleRunner = runner;

      // Stop any CPU compute-ahead that may be running — GPU takes over
      this.stopComputeAhead();

      // Ensure GPU has the initial state (not whatever CPU compute-ahead left in the Grid)
      if (this.initialSnapshot) {
        this.restoreInitialState();
        runner.uploadFromGrid();
        // Re-run expression/visual passes — the CPU snapshot has no colorR/G/B
        runner.runExpressionPasses();
      }
      runner.setGeneration(this.playbackGeneration);

      logGPU(`Rule runner active for "${presetName}"`);
      this.eventBus.emit('gpu:ruleRunnerReady', {});

      // Live mode: GPU can compute any frame on demand — no pre-compute needed.
      // computedGeneration tracks actual playback progress, not a pre-authorized ceiling.
      // Timeline scrubbing is unrestricted because seek() always works (GPU-tick forward).

      // Initialize circular buffer with smart default size
      this.initCircularBuffer();
    } catch (err) {
      logGPU(`Rule runner init FAILED for "${presetName}": ${err}`);
      this.gpuRuleRunner = null;
    }
  }

  /** Get the GPU rule runner (for renderer access) */
  getGPURuleRunner(): GPURuleRunner | null {
    return this.gpuRuleRunner;
  }

  /**
   * Wait for any in-flight GPU→CPU readback to complete.
   * Call before editing the CPU grid to ensure it has current GPU state.
   */
  async awaitGPUSync(): Promise<void> {
    if (!this.gpuSyncInFlight) return;
    return new Promise(resolve => this.gpuSyncWaiters.push(resolve));
  }

  /**
   * Upload current CPU Grid state to GPU buffers.
   * Call after any CPU-side modification (edit, reset, seek, clear).
   */
  private syncGridToGPU(): void {
    if (!this.gpuRuleRunner) return;
    this.gpuRuleRunner.uploadFromGrid();
    this.gpuRuleRunner.setGeneration(this.playbackGeneration);
    // Re-run expression/visual passes to recompute colorR/G/B from current state
    this.gpuRuleRunner.runExpressionPasses();
  }

  /**
   * Read display GPU state back into CPU Grid buffers.
   * Call after GPU playback stops so edits see the correct base state.
   */
  private async syncGPUToGrid(): Promise<void> {
    if (!this.gpuRuleRunner || !this.simulation) return;
    try {
      const runner = this.gpuRuleRunner;
      const data = await runner.readBack();
      // Runner may have been destroyed during async readback (e.g., grid resize)
      if (!this.gpuRuleRunner || this.gpuRuleRunner !== runner) return;
      runner.applyToGrid(data);
      this.simulation?.setGeneration(runner.getGeneration());
    } catch {
      // Readback failed (runner destroyed during resize) — safe to ignore
    }
  }


  /**
   * Initialize the circular buffer with smart default size based on grid dimensions.
   */
  private initCircularBuffer(): void {
    if (!this.simulation) return;
    const grid = this.simulation.grid;
    const propCount = grid.getPropertyNames().length;
    const { frames, bytesPerFrame } = computeDefaultBufferSize(
      grid.config.width,
      grid.config.height ?? 1,
      propCount,
    );
    this.circularBuffer.resize(frames);
    // Determine readback decimation: skip readback if per-frame > 4MB
    if (bytesPerFrame > 4 * 1024 * 1024) {
      this.readbackEveryN = Math.max(1, Math.ceil(bytesPerFrame / (4 * 1024 * 1024)));
    } else {
      this.readbackEveryN = 1;
    }
    logGPU(`Circular buffer: ${frames} frames, ${(bytesPerFrame / 1024).toFixed(0)}KB/frame, readback every ${this.readbackEveryN} ticks`);
    this.emitBufferStatus();
  }

  /**
   * Push current GPU state to the circular buffer (async, non-blocking).
   * Skips if a readback is already in flight.
   */
  private pushToBuffer(frameIndex: number): void {
    if (!this.gpuRuleRunner || this.readbackInFlight) return;
    this.ticksSinceReadback++;
    if (this.ticksSinceReadback < this.readbackEveryN) return;
    this.ticksSinceReadback = 0;

    this.readbackInFlight = true;
    const runner = this.gpuRuleRunner;
    const epoch = this.computeEpoch;
    runner.readBack().then((data) => {
      this.readbackInFlight = false;
      // Only store if we haven't changed preset/runner
      if (this.computeEpoch !== epoch || this.gpuRuleRunner !== runner) return;
      this.circularBuffer.push(frameIndex, data);
      this.emitBufferStatus();
    }).catch(() => {
      this.readbackInFlight = false;
    });
  }

  /** Emit buffer status event for UI consumption */
  private emitBufferStatus(): void {
    this.eventBus.emit('sim:bufferStatus', {
      size: this.circularBuffer.size,
      capacity: this.circularBuffer.maxCapacity,
      oldestFrame: this.circularBuffer.oldestFrame,
      newestFrame: this.circularBuffer.newestFrame,
      memoryUsage: this.circularBuffer.memoryUsage,
      bytesPerFrame: this.circularBuffer.bytesPerFrame,
    });
  }

  /** Get the circular buffer (for external access, e.g. buffer settings UI). */
  getCircularBuffer(): CircularFrameBuffer {
    return this.circularBuffer;
  }

  /**
   * Clear all scripting state (variables, tags) and reset stores.
   * Called on preset load so stale scripts don't carry over between presets.
   */
  private clearScriptingState(): void {
    if (this.simulation) {
      this.simulation.variableStore.clear();
      this.simulation.tagRegistry.clear();
    }
    // Destroy GPU runner before loading new preset
    if (this.gpuRuleRunner) {
      this.gpuRuleRunner.destroy();
      this.gpuRuleRunner = null;
    }
    expressionStoreActions.resetAll();
  }

  /**
   * Load a preset by name and create a new Simulation.
   * Stops any running simulation first.
   */
  loadPreset(name: string): void {
    logMin('ctrl', `loadPreset("${name}") — playing=${this.playing}, computedGen=${this.computedGeneration}, playbackGen=${this.playbackGeneration}`);
    this.computeEpoch++;  // Cancel any in-flight async work
    if (this.editDebounceTimer) { clearTimeout(this.editDebounceTimer); this.editDebounceTimer = null; }
    this.pause();
    this.stopComputeAhead();
    this.clearScriptingState();

    const config: PresetConfig = loadBuiltinPresetClient(name as BuiltinPresetNameClient);
    this.simulation = new Simulation(config);
    this.commandHistory = new CommandHistory(this.simulation);
    this.activePresetName = config.meta.name;
    this.circularBuffer.clear();
    this.computedGeneration = 0;
    this.playbackGeneration = 0;

    this.userParamDefs = [];
    // GPU acceleration (async, non-blocking — emit happens immediately, GPU init finishes in background)
    void this.tryInitGPURuleRunner();
    logMin('ctrl', `loadPreset: postRuleTags=${this.simulation.tagRegistry.hasPostRuleTags()}`);
    brushStoreActions.loadFromPreset(config.brushes, config.cell_properties, config.draw_property);
    this.emitPresetLoaded(config);
    this.emitParamDefs();
    this.syncTagStore();
    logMin('ctrl', `loadPreset done — computedGen=${this.computedGeneration}, bufferSize=${this.circularBuffer.size}, computeAheadTarget=${this.computeAheadTarget}`);
  }

  /**
   * Load a preset from an already-parsed PresetConfig.
   */
  loadPresetConfig(config: PresetConfig): void {
    logMin('ctrl', `loadPresetConfig("${config.meta.name}") — playing=${this.playing}, computedGen=${this.computedGeneration}`);
    this.computeEpoch++;  // Cancel any in-flight async work
    if (this.editDebounceTimer) { clearTimeout(this.editDebounceTimer); this.editDebounceTimer = null; }
    this.pause();
    this.stopComputeAhead();
    this.clearScriptingState();

    this.simulation = new Simulation(config);
    this.commandHistory = new CommandHistory(this.simulation);
    this.activePresetName = config.meta.name;
    this.circularBuffer.clear();
    this.computedGeneration = 0;
    this.playbackGeneration = 0;

    this.userParamDefs = [];
    void this.tryInitGPURuleRunner();
    brushStoreActions.loadFromPreset(config.brushes, config.cell_properties, config.draw_property);
    this.emitPresetLoaded(config);
    this.emitParamDefs();
    this.syncTagStore();
    logMin('ctrl', `loadPresetConfig done — computedGen=${this.computedGeneration}, bufferSize=${this.circularBuffer.size}`);
  }

  /**
   * GPU-only pipeline: async tick is never needed.
   */
  needsAsyncTick(): boolean {
    return false;
  }

  /**
   * Get the variable store from the current simulation.
   */
  getVariableStore() {
    return this.simulation?.variableStore ?? null;
  }

  /**
   * Get the expression tag registry from the current simulation.
   */
  getTagRegistry(): ExpressionTagRegistry | null {
    return this.simulation?.tagRegistry ?? null;
  }

  /**
   * Notify the controller that links/tags changed. Invalidates cache.
   */
  onLinkChanged(): void {
    this.invalidateCacheFrom(this.playbackGeneration + 1);
  }

  /**
   * Notify that a tag's code/behavior changed. Invalidates entire cache and
   * resets to frame 0 so the simulation replays cleanly from start state.
   */
  onTagChanged(): void {
    logMin('ctrl', `onTagChanged() — playing=${this.playing}, computedGen=${this.computedGeneration}, playbackGen=${this.playbackGeneration}, hasSnapshot=${!!this.initialSnapshot}`);
    // Full stop: pause playback, kill timers, cancel async work
    this.pause();
    this.stopComputeAhead();
    // Clear all cached frames (tags changed → every frame is stale)
    this.circularBuffer.clear();
    this.computedGeneration = 0;
    this.playbackGeneration = 0;
    // Restore initial state BEFORE anything else touches the grid
    this.restoreInitialState();
    this.syncGridToGPU();
    this.emitBufferStatus();
    // Emit targeted events: generation=0, paused, computedGeneration=0.
    // Don't use sim:reset which nukes maxGeneration (timeline needs that for scrub ceiling).
    this.eventBus.emit('sim:tick', {
      generation: 0,
      liveCellCount: this.getLiveCellCount(),
    });
    this.eventBus.emit('sim:computeProgress', { computedGeneration: 0 });
  }

  /**
   * Called after state.restore writes buffers to the grid.
   * Resets playhead, updates initialSnapshot, clears cache, emits tick.
   */
  onStateRestored(): void {
    if (!this.simulation) return;
    this.stopComputeAhead();
    // Update in-memory snapshot to match what was just restored
    this.initialSnapshot = new Map();
    for (const propName of this.simulation.grid.getPropertyNames()) {
      const buf = this.simulation.grid.getCurrentBuffer(propName);
      this.initialSnapshot.set(propName, new Float32Array(buf));
    }
    this.circularBuffer.clear();
    this.computedGeneration = 0;
    this.playbackGeneration = 0;
    this.syncGridToGPU();
    this.emitBufferStatus();
    this.eventBus.emit('sim:reset', {});
    this.eventBus.emit('sim:tick', {
      generation: 0,
      liveCellCount: this.getLiveCellCount(),
    });
  }

  /**
   * Legacy no-op. PyodideBridge is removed — GPU pipeline handles everything.
   * Kept as public API stub because external command definitions call it.
   */
  ensurePyodideBridge(): null {
    return null;
  }

  /**
   * Start simulation playback.
   * Kicks off compute-ahead to fill the cache, then starts
   * the playback loop at display FPS.
   */
  play(): void {
    logMin('play', `play() — already=${this.playing}, computedGen=${this.computedGeneration}, playbackGen=${this.playbackGeneration}`);
    if (this.playing || !this.simulation) return;
    this.playing = true;

    // If edits were pending a debounced restart, flush it now
    if (this.editDebounceTimer) {
      clearTimeout(this.editDebounceTimer);
      this.editDebounceTimer = null;
    }

    this.eventBus.emit('sim:play', {});
    this.lastTickTime = performance.now();
    this.startPlaybackLoop();
  }

  /**
   * Stop the simulation playback.
   */
  pause(): void {
    logMin('play', `pause() — playing=${this.playing}`);
    if (!this.playing) return;
    this.playing = false;

    this.stopPlaybackLoop();

    // GPU mode: sync display state back to CPU Grid so edits see correct base
    if (this.gpuRuleRunner) {
      this.gpuSyncInFlight = true;
      void this.syncGPUToGrid().finally(() => {
        this.gpuSyncInFlight = false;
        // Resolve any pending edit waiters
        for (const resolve of this.gpuSyncWaiters) resolve();
        this.gpuSyncWaiters = [];
      });
    }

    this.eventBus.emit('sim:pause', {});
  }

  /**
   * Run a single tick (step forward one generation) via GPU.
   */
  step(): void {
    if (!this.simulation || this.gpuSyncInFlight) return;
    logDbg('play', `step() — playbackGen=${this.playbackGeneration}, computedGen=${this.computedGeneration}`);

    if (!this.gpuRuleRunner) return;

    this.gpuRuleRunner.setEnvParams(this.simulation.getParamsObject());
    this.gpuRuleRunner.tick();
    this.playbackGeneration = this.gpuRuleRunner.getGeneration();
    this.simulation.setGeneration(this.playbackGeneration);

    // Push to circular buffer on step (non-blocking)
    this.pushToBuffer(this.playbackGeneration);

    this.eventBus.emit('sim:tick', { generation: this.playbackGeneration, liveCellCount: -1 });
  }

  /**
   * Reverse one generation via GPU seek.
   */
  stepBack(): void {
    if (!this.simulation || this.gpuSyncInFlight || this.playbackGeneration <= 0) return;

    const targetGen = this.playbackGeneration - 1;
    this.seek(targetGen);
    this.eventBus.emit('sim:stepBack', { generation: targetGen });
  }

  /**
   * Clear all cells in the grid (set primary property to 0 for all cells).
   */
  clear(): void {
    if (!this.simulation) return;
    this.pause();

    // Zero all property buffers
    for (const propName of this.simulation.grid.getPropertyNames()) {
      const buffer = this.simulation.grid.getCurrentBuffer(propName);
      buffer.fill(0);
    }

    // Sync initialSnapshot so reset() after clear() stays cleared
    if (this.initialSnapshot) {
      for (const propName of this.simulation.grid.getPropertyNames()) {
        const buf = this.simulation.grid.getCurrentBuffer(propName);
        this.initialSnapshot.set(propName, new Float32Array(buf));
      }
      this.syncInitialStateToScene();
    }

    this.circularBuffer.clear();
    this.computedGeneration = 0;
    this.playbackGeneration = 0;
    this.simulation.setGeneration(0);
    this.syncGridToGPU();
    this.emitBufferStatus();
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

    // No-op if already at target (prevents seek→emit→seek loops)
    if (targetGen === this.playbackGeneration && this.circularBuffer.has(targetGen)) {
      return;
    }
    logDbg('play', `seek(${targetGen}) — playbackGen=${this.playbackGeneration}, computedGen=${this.computedGeneration}`);

    if (!this.gpuRuleRunner) return;

    // Case 1: Target frame is in the circular buffer — instant restore
    const cached = this.circularBuffer.get(targetGen);
    if (cached) {
      this.playbackGeneration = targetGen;
      this.gpuRuleRunner.uploadInterleaved(cached.data);
      this.gpuRuleRunner.setGeneration(targetGen);
      // Re-run expression/visual passes to recompute colors for the restored state
      this.gpuRuleRunner.runExpressionPasses();
      this.simulation.setGeneration(targetGen);
      this.eventBus.emit('sim:tick', { generation: targetGen, liveCellCount: -1 });
      return;
    }

    // Case 2: Target not in buffer — find nearest cached frame and compute forward
    // Check circular buffer for nearest frame before target
    let nearestFrame = -1;
    let nearestData: Float32Array | null = null;
    if (this.circularBuffer.size > 0) {
      // Scan buffer for the closest frame at or before target
      for (let f = targetGen; f >= Math.max(0, this.circularBuffer.oldestFrame); f--) {
        const snap = this.circularBuffer.get(f);
        if (snap) {
          nearestFrame = f;
          nearestData = snap.data;
          break;
        }
      }
    }

    if (nearestFrame >= 0 && nearestData) {
      // Restore from nearest buffered frame
      this.gpuRuleRunner.uploadInterleaved(nearestData);
      this.gpuRuleRunner.setGeneration(nearestFrame);
      this.gpuRuleRunner.runExpressionPasses();
    } else if (this.initialSnapshot) {
      // Restore from initial state (frame 0)
      for (const [propName, buf] of this.initialSnapshot) {
        this.simulation.grid.getCurrentBuffer(propName).set(buf);
      }
      this.syncGridToGPU();
      this.gpuRuleRunner.setGeneration(0);
      nearestFrame = 0;
    } else {
      nearestFrame = 0;
    }

    // GPU-tick forward to target (no readback — just compute)
    const ticksNeeded = targetGen - nearestFrame;
    if (ticksNeeded > 0) {
      this.gpuRuleRunner.setEnvParams(this.simulation.getParamsObject());
      for (let i = 0; i < ticksNeeded; i++) {
        this.gpuRuleRunner.tick();
      }
    }

    this.playbackGeneration = targetGen;
    this.simulation.setGeneration(targetGen);
    this.eventBus.emit('sim:tick', { generation: targetGen, liveCellCount: -1 });
  }

  /**
   * Compute ahead to a target generation asynchronously (non-blocking).
   * Computes in chunks to avoid freezing the UI.
   */
  computeAhead(targetGeneration: number): void {
    this.computeAheadTarget = targetGeneration;
    // GPU ticks live — no CPU compute-ahead needed
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
    logMin('ctrl', `reset() — computedGen=${this.computedGeneration}, playbackGen=${this.playbackGeneration}`);
    this.stopComputeAhead();
    if (this.initialSnapshot) {
      this.restoreInitialState();
    } else {
      this.simulation.reset();
    }
    this.circularBuffer.clear();
    this.computedGeneration = 0;
    this.playbackGeneration = 0;
    this.syncGridToGPU();
    // Reset GPU runner generation so the rAF loop (if still running) resumes from 0
    if (this.gpuRuleRunner) {
      this.gpuRuleRunner.setGeneration(0);
    }
    this.emitBufferStatus();
    this.eventBus.emit('sim:reset', {});
    // If still playing, re-emit so the store's isRunning stays true
    // (sim:reset handler sets isRunning=false via resetState)
    if (this.playing) {
      this.eventBus.emit('sim:play', {});
    }
  }

  /**
   * Count non-zero values in the primary property buffer.
   */
  getLiveCellCount(): number {
    if (!this.simulation) return 0;
    const firstProp = this.simulation.preset.visual_mappings?.find(m => m.channel === 'color')?.property
      ?? this.simulation.preset.cell_properties?.[0]?.name
      ?? this.simulation.typeRegistry.getPropertyUnion()[0].name;
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
   * Get the scene graph. Returns undefined until scene graph is built.
   * Intentionally a method that can be overridden or extended.
   */
  getSceneGraph?: () => SceneGraph | undefined;

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
    logMin('ctrl', `captureInitialState(${cacheTarget}) — simGen=${this.simulation.getGeneration()}`);
    this.initialSnapshot = new Map();
    let perFrameBytes = 0;
    for (const propName of this.simulation.grid.getPropertyNames()) {
      const buf = this.simulation.grid.getCurrentBuffer(propName);
      this.initialSnapshot.set(propName, new Float32Array(buf));
      perFrameBytes += buf.byteLength;
    }

    // Sync to scene graph for persistence
    this.syncInitialStateToScene();

    // Live mode: set timeline duration but don't fake computedGeneration.
    // Scrubbing is unrestricted (GPU computes on demand).
    if (cacheTarget && cacheTarget > 0) {
      this.timelineDuration = cacheTarget;
      this.computeAheadTarget = cacheTarget;
    }
  }

  /**
   * Restore grid buffers from the initial snapshot.
   * Tries scene store state node first, falls back to in-memory snapshot.
   */
  private restoreInitialState(): void {
    if (!this.simulation) return;

    // Try scene store state node first
    const stateNode = this.findInitialStateNode();
    if (stateNode) {
      const buffers = stateNode.properties.buffers as Record<string, number[]> | undefined;
      if (buffers) {
        logMin('ctrl', `restoreInitialState() — from scene store node "${stateNode.name}" (${Object.keys(buffers).length} props)`);
        for (const [propName, data] of Object.entries(buffers)) {
          const gridBuf = this.simulation.grid.getCurrentBuffer(propName);
          gridBuf.set(new Float32Array(data));
        }
        this.simulation.setGeneration(0);
        return;
      }
    }

    // Fall back to in-memory snapshot
    if (!this.initialSnapshot) {
      logMin('ctrl', `restoreInitialState() — NO snapshot available, skipping`);
      return;
    }
    logMin('ctrl', `restoreInitialState() — from in-memory snapshot (${this.initialSnapshot.size} props)`);
    for (const [propName, buffer] of this.initialSnapshot) {
      const currentBuf = this.simulation.grid.getCurrentBuffer(propName);
      currentBuf.set(buffer);
    }
    this.simulation.setGeneration(0);
  }

  /** Find the initial-state node with isInitial:true in the scene store */
  private findInitialStateNode(): SceneNode | null {
    const { nodes } = useSceneStore.getState();
    // Find sim-root, then find its initial-state child with isInitial
    const simRoots = Object.values(nodes).filter((n) => n.type === NODE_TYPES.SIM_ROOT);
    for (const root of simRoots) {
      for (const childId of root.childIds) {
        const child = nodes[childId];
        if (child?.type === NODE_TYPES.INITIAL_STATE && child.properties.isInitial === true) {
          return child;
        }
      }
    }
    return null;
  }

  /**
   * Sync the in-memory initial snapshot to a scene store initial-state node.
   * Creates or updates the node under the first sim-root.
   */
  syncInitialStateToScene(): void {
    if (!this.simulation || !this.initialSnapshot) {
      logMin('ctrl', `syncInitialStateToScene() — skipped (sim=${!!this.simulation}, snapshot=${!!this.initialSnapshot})`);
      return;
    }

    const { nodes } = useSceneStore.getState();
    const simRoots = Object.values(nodes).filter((n) => n.type === NODE_TYPES.SIM_ROOT);
    if (simRoots.length === 0) {
      logMin('ctrl', `syncInitialStateToScene() — no sim-root in store, skipped`);
      return;
    }
    const simRootId = simRoots[0].id;

    // Convert Float32Array buffers to number[] for serialization
    const buffers: Record<string, number[]> = {};
    const propertyNames: string[] = [];
    for (const [propName, buf] of this.initialSnapshot) {
      buffers[propName] = Array.from(buf);
      propertyNames.push(propName);
    }

    // Find existing initial-state node or create new
    const existing = this.findInitialStateNode();
    logMin('ctrl', `syncInitialStateToScene() — ${existing ? 'updating' : 'creating'} state node under ${simRootId} (${propertyNames.length} props)`);
    if (existing) {
      sceneStoreActions.updateNode(existing.id, {
        properties: {
          ...existing.properties,
          buffers,
          width: this.simulation.grid.config.width,
          height: this.simulation.grid.config.height,
          propertyNames,
          capturedAt: new Date().toISOString(),
        },
      });
    } else {
      const nodeId = generateNodeId();
      const node: SceneNode = {
        id: nodeId,
        type: NODE_TYPES.INITIAL_STATE,
        name: 'Initial State',
        parentId: simRootId,
        childIds: [],
        enabled: true,
        properties: {
          buffers,
          width: this.simulation.grid.config.width,
          height: this.simulation.grid.config.height,
          isInitial: true,
          capturedAt: new Date().toISOString(),
          propertyNames,
        },
        tags: [],
      };
      sceneStoreActions.addNode(node);
      this.eventBus.emit('scene:nodeAdded', {
        id: nodeId, type: NODE_TYPES.INITIAL_STATE, name: 'Initial State', parentId: simRootId,
      });
    }
  }


  /**
   * Live playback loop using requestAnimationFrame.
   * Computes tick(s) → renders → pushes snapshot to circular buffer → repeats.
   * Speed control: tickIntervalMs determines how often a tick fires.
   */
  private startPlaybackLoop(): void {
    this.lastTickTime = performance.now();
    const loop = (now: number) => {
      if (!this.playing) return;

      const elapsed = now - this.lastTickTime;

      // Speed gate: only tick if enough time has elapsed
      if (elapsed >= this.tickIntervalMs) {
        // How many ticks to run this frame (for speed > display FPS)
        const ticksThisFrame = this.tickIntervalMs <= 1
          ? 4 // Max speed: 4 ticks per rAF frame
          : Math.min(Math.floor(elapsed / this.tickIntervalMs), 4);

        for (let t = 0; t < ticksThisFrame; t++) {
          this.playbackTick();
          if (!this.playing) return; // pause() may have been called inside playbackTick
        }

        this.lastTickTime = now;
      }

      this.rafHandle = requestAnimationFrame(loop);
    };
    this.rafHandle = requestAnimationFrame(loop);
  }

  private playbackTick(): void {
    if (!this.simulation || !this.gpuRuleRunner) return;
    logDbg('play', `playbackTick() — playbackGen=${this.playbackGeneration}`);

    if (this.gpuSyncInFlight) return; // Wait for readback to finish

    // Live mode: tick forever. No duration boundary. Timeline scrolls to follow.
    this.gpuRuleRunner.setEnvParams(this.simulation.getParamsObject());
    this.gpuRuleRunner.tick();
    this.playbackGeneration = this.gpuRuleRunner.getGeneration();
    this.simulation.setGeneration(this.playbackGeneration);

    // Push snapshot to circular buffer (async, non-blocking)
    this.pushToBuffer(this.playbackGeneration);

    this.eventBus.emit('sim:tick', {
      generation: this.playbackGeneration,
      liveCellCount: -1,
    });
  }

  /**
   * Stop the playback loop (cancels rAF).
   */
  private stopPlaybackLoop(): void {
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  /**
   * Stop compute-ahead timer (GPU mode: no-op since GPU ticks live).
   */
  private stopComputeAhead(): void {
    logDbg('compute', `stopComputeAhead() — timer=${!!this.computeAheadTimer}`);
    if (this.computeAheadTimer) {
      clearTimeout(this.computeAheadTimer);
      this.computeAheadTimer = null;
    }
  }

  // --- Runtime Parameter Methods ---

  /**
   * Set a runtime parameter value. Validates range and emits event.
   */
  setParam(name: string, value: number): void {
    if (!this.simulation) return;
    const def = this.getParamDefs().find((p) => p.name === name);
    if (!def) return;

    let clamped = value;
    if (def.min !== undefined) clamped = Math.max(def.min, clamped);
    if (def.max !== undefined) clamped = Math.min(def.max, clamped);
    if (def.type === 'int') clamped = Math.round(clamped);

    this.simulation.setParam(name, clamped);
    this.eventBus.emit('sim:paramChanged', { name, value: clamped });

    this.invalidateCacheFrom(this.playbackGeneration + 1);
  }

  /**
   * Invalidate cached frames from a given generation onward.
   */
  private invalidateCacheFrom(fromGeneration: number): void {
    // Circular buffer stores interleaved snapshots — parameter changes invalidate all future frames.
    // Since the buffer is a ring and we can't selectively remove, clear it entirely when params change.
    this.circularBuffer.clear();
    if (this.computedGeneration > fromGeneration) {
      this.computedGeneration = fromGeneration;
      this.eventBus.emit('sim:computeProgress', { computedGeneration: this.computedGeneration });
    }
    this.emitBufferStatus();
  }

  /**
   * Notify the controller that grid cells have been edited (draw/erase).
   */
  onGridEdited(): void {
    if (!this.simulation) return;

    const gen = this.playbackGeneration;
    this.simulation.setGeneration(gen);
    this.syncGridToGPU();

    if (gen === 0 && this.initialSnapshot) {
      for (const propName of this.simulation.grid.getPropertyNames()) {
        const buf = this.simulation.grid.getCurrentBuffer(propName);
        this.initialSnapshot.set(propName, new Float32Array(buf));
      }
      this.syncInitialStateToScene();
    }

    this.stopComputeAhead();
    // Grid edit invalidates all future frames — clear the circular buffer
    this.circularBuffer.clear();
    this.computedGeneration = gen;
    this.eventBus.emit('sim:computeProgress', { computedGeneration: gen });
    this.emitBufferStatus();

    this.eventBus.emit('sim:tick', {
      generation: gen,
      liveCellCount: this.getLiveCellCount(),
    });
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
  /** User-added parameter definitions (not from preset) */
  protected userParamDefs: ParamDef[] = [];

  getParamDefs(): ParamDef[] {
    const presetDefs: ParamDef[] = this.simulation?.preset.params
      ? this.simulation.preset.params.map((p) => ({
          name: p.name,
          label: p.label,
          type: p.type,
          default: p.default,
          min: p.min,
          max: p.max,
          step: p.step,
        }))
      : [];
    return [...presetDefs, ...this.userParamDefs];
  }

  /**
   * Add a user-defined parameter at runtime.
   */
  addParamDef(def: ParamDef): void {
    // Check for duplicates across preset + user params
    const existing = this.getParamDefs();
    if (existing.some((d) => d.name === def.name)) return;
    this.userParamDefs.push(def);
    // Set initial value on simulation
    if (this.simulation) {
      this.simulation.setParam(def.name, def.default);
    }
    this.emitParamDefs();
  }

  /**
   * Remove a user-defined parameter. Cannot remove preset params.
   */
  removeParamDef(name: string): boolean {
    const idx = this.userParamDefs.findIndex((d) => d.name === name);
    if (idx === -1) return false;
    this.userParamDefs.splice(idx, 1);
    this.emitParamDefs();
    return true;
  }

  /**
   * Check if a param name belongs to user-added (not preset) params.
   */
  isUserParam(name: string): boolean {
    return this.userParamDefs.some((d) => d.name === name);
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
    const allDefs = this.getParamDefs();
    if (allDefs.length === 0) return;
    for (const p of allDefs) {
      this.simulation?.setParam(p.name, p.default);
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
    const defs = this.getParamDefs().map((d) => ({
      ...d,
      isUser: this.userParamDefs.some((u) => u.name === d.name),
    }));
    const values = this.getParamValues();
    this.eventBus.emit('sim:paramDefsChanged', { defs, values });
  }

  /**
   * Sync tag store with registry state after preset load.
   */
  private syncTagStore(): void {
    if (!this.simulation) return;
    const tags = this.simulation.tagRegistry.getAll();
    expressionStoreActions.setTags(tags);
  }

  // --- Grid Configuration Methods ---

  /**
   * Resize the grid by recreating the simulation with new dimensions.
   */
  resizeGrid(width: number, height?: number): void {
    if (!this.simulation) return;
    const preset = this.simulation.preset;
    const paramValues = this.simulation.getParamsObject();

    const newPreset = {
      ...preset,
      grid: {
        ...preset.grid,
        width,
        ...(height !== undefined ? { height } : {}),
      },
    };

    this.loadPresetConfig(newPreset);

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
  updateRule(_newBody: string): void {
    if (!this.simulation) return;
    // Rule update requires GPU re-initialization — handled by preset reload
    this.invalidateCacheFrom(this.playbackGeneration + 1);
  }

  /**
   * Get the current rule compute body.
   */
  getRuleBody(): string {
    const rule = this.simulation?.preset.rule;
    if (!rule) return '';
    if (rule.stages) return rule.stages.map(s => `# --- ${s.name} ---\n${s.compute}`).join('\n\n');
    return rule.compute ?? '';
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
    if (this.gpuRuleRunner) {
      this.gpuRuleRunner.destroy();
      this.gpuRuleRunner = null;
    }
    this.simulation = null;
    this.commandHistory = null;
    this.circularBuffer.clear();
  }

  // --- SG-8: State snapshot methods for multi-sim root switching ---

  saveState(): ControllerStateSnapshot {
    this.stopPlaybackLoop();
    this.stopComputeAhead();
    if (this.editDebounceTimer) {
      clearTimeout(this.editDebounceTimer);
      this.editDebounceTimer = null;
    }

    const snapshot: ControllerStateSnapshot = {
      simulation: this.simulation,
      commandHistory: this.commandHistory,
      playing: this.playing,
      tickIntervalMs: this.tickIntervalMs,
      activePresetName: this.activePresetName,
      circularBuffer: this.circularBuffer,
      computedGeneration: this.computedGeneration,
      initialSnapshot: this.initialSnapshot,
      computeAheadTarget: this.computeAheadTarget,
      playbackGeneration: this.playbackGeneration,
      playbackMode: this.playbackMode,
      timelineDuration: this.timelineDuration,
    };

    this.simulation = null;
    this.commandHistory = null;
    this.playing = false;
    this.activePresetName = null;
    this.circularBuffer = new CircularFrameBuffer(500);
    this.computedGeneration = 0;
    this.initialSnapshot = null;
    this.computeAheadTarget = 0;
    this.playbackGeneration = 0;
    this.playbackMode = 'loop';
    this.timelineDuration = 256;

    return snapshot;
  }

  restoreState(snapshot: ControllerStateSnapshot): void {
    this.stopPlaybackLoop();
    this.stopComputeAhead();
    if (this.editDebounceTimer) {
      clearTimeout(this.editDebounceTimer);
      this.editDebounceTimer = null;
    }

    this.simulation = snapshot.simulation;
    this.commandHistory = snapshot.commandHistory;
    this.playing = snapshot.playing;
    this.tickIntervalMs = snapshot.tickIntervalMs;
    this.activePresetName = snapshot.activePresetName;
    this.circularBuffer = snapshot.circularBuffer;
    this.computedGeneration = snapshot.computedGeneration;
    this.initialSnapshot = snapshot.initialSnapshot;
    this.computeAheadTarget = snapshot.computeAheadTarget;
    this.playbackGeneration = snapshot.playbackGeneration;
    this.playbackMode = snapshot.playbackMode;
    this.timelineDuration = snapshot.timelineDuration;

    if (this.playing && this.simulation) {
      this.startPlaybackLoop();
    }
  }
}
