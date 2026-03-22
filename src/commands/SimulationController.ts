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
import { expressionStoreActions } from '../store/expressionStore';
import type { ExpressionTagRegistry } from '../engine/expression/ExpressionTagRegistry';
import type { SceneGraph } from '../engine/scene/SceneGraph';
import type { SceneNode } from '../engine/scene/SceneNode';
import { NODE_TYPES, generateNodeId } from '../engine/scene/SceneNode';
import { sceneStoreActions, useSceneStore } from '../store/sceneStore';
import { logMin, logDbg, logGPU } from '../lib/debugLog';
import { GPURuleRunner } from '../engine/rule/GPURuleRunner';
import { GPUContext } from '../engine/gpu/GPUContext';
import { BUILTIN_IR } from '../engine/ir/builtinIR';

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
  frameCache: Map<number, TickSnapshot>;
  computedGeneration: number;
  initialSnapshot: Map<string, Float32Array> | null;
  computeAheadTarget: number;
  pyodideBridge: PyodideBridge | null;
  playbackGeneration: number;
  playbackMode: PlaybackMode;
  timelineDuration: number;
}

export class SimulationController {
  protected eventBus: EventBus;
  protected simulation: Simulation | null = null;
  protected commandHistory: CommandHistory | null = null;
  protected playing: boolean = false;
  protected tickInterval: ReturnType<typeof setInterval> | null = null;
  protected tickIntervalMs: number;
  protected activePresetName: string | null = null;

  /** Frame cache: generation -> snapshot. Replaces the old tickHistory array. */
  protected frameCache: Map<number, TickSnapshot> = new Map();
  protected maxCacheSize: number = 2000;

  /** How far ahead the sim has been computed (the frontier). */
  protected computedGeneration: number = 0;

  /** Snapshot of the grid state right after initialization (for seek/reset to replay from) */
  protected initialSnapshot: Map<string, Float32Array> | null = null;

  /** Compute-ahead state */
  protected computeAheadTimer: ReturnType<typeof setTimeout> | null = null;
  protected computeAheadTarget: number = 0;

  /** Deferred compute-ahead listener (waiting for pyodide:ready) */
  protected deferredComputeAheadListener: (() => void) | null = null;

  /** Debounce timer for restarting compute-ahead after grid edits */
  protected editDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  /** Guard: prevents concurrent async computation from piling up */
  protected asyncComputeInFlight: boolean = false;

  /** Guard: prevents concurrent async playback ticks */
  protected asyncPlaybackInFlight: boolean = false;

  /** Epoch counter: incremented on preset/resize changes to cancel in-flight async work */
  protected computeEpoch: number = 0;

  /** Optional PyodideBridge for Python rule support */
  protected pyodideBridge: PyodideBridge | null = null;

  /** Current playback generation (may lag behind computedGeneration) */
  protected playbackGeneration: number = 0;

  /** What happens when playback reaches the end of the timeline */
  protected playbackMode: PlaybackMode = 'loop';

  /** Timeline duration in frames (for end-of-timeline detection) */
  protected timelineDuration: number = 256;

  /** GPU rule runner — when set, simulation ticks run on the GPU */
  protected gpuRuleRunner: GPURuleRunner | null = null;

  /** Guard: prevents interaction during GPU→CPU readback on pause */
  protected gpuSyncInFlight: boolean = false;

  /** Memory budget for the frame cache in bytes (default 512MB) */
  private static readonly CACHE_MEMORY_BUDGET = 512 * 1024 * 1024;

  /** Grid byte threshold above which GPU cache fill is skipped (64MB per frame) */
  private static readonly GPU_CACHE_FILL_THRESHOLD = 64 * 1024 * 1024;

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

      // Check if this preset can run on GPU: either has built-in IR or a compute body to transpile
      const irBuilder = BUILTIN_IR[presetName];
      const hasBuiltinIR = irBuilder && irBuilder(this.simulation.preset);
      const hasComputeBody = !!this.simulation.preset.rule.compute;
      if (!hasBuiltinIR && !hasComputeBody) return;

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
      }
      runner.setGeneration(this.playbackGeneration);

      logGPU(`Rule runner active for "${presetName}"`);
      this.eventBus.emit('gpu:ruleRunnerReady', {});

      // GPU can tick to any frame — unlock full timeline scrubbing immediately
      this.computedGeneration = this.timelineDuration;
      this.eventBus.emit('sim:computeProgress', { computedGeneration: this.computedGeneration });

      // Start background cache fill (non-blocking, yields to browser)
      void this.gpuCacheFill();
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
   * Upload current CPU Grid state to GPU buffers.
   * Call after any CPU-side modification (edit, reset, seek, clear).
   */
  private syncGridToGPU(): void {
    if (!this.gpuRuleRunner) return;
    this.gpuRuleRunner.uploadFromGrid();
    this.gpuRuleRunner.setGeneration(this.playbackGeneration);
  }

  /**
   * Read display GPU state back into CPU Grid buffers.
   * Call after GPU playback stops so edits see the correct base state.
   */
  private async syncGPUToGrid(): Promise<void> {
    if (!this.gpuRuleRunner || !this.simulation) return;
    const data = await this.gpuRuleRunner.readBack();
    this.gpuRuleRunner.applyToGrid(data);
    this.simulation.runner.setGeneration(this.gpuRuleRunner.getGeneration());
  }

  /** Epoch for GPU cache fill — incremented to cancel in-flight fills */
  private gpuCacheFillEpoch: number = 0;

  /**
   * Background GPU cache fill using a SEPARATE offscreen GPURuleRunner.
   * The display runner's buffers are never touched — zero visual artifacts.
   * Creates a temporary runner, seeds it with initial state, ticks + readback
   * for each frame, stores snapshots in the frame cache, then destroys it.
   */
  private async gpuCacheFill(): Promise<void> {
    if (!this.gpuRuleRunner || !this.simulation) return;
    if (this.playing) return;

    // Skip cache fill for large grids — readback + double runner memory is prohibitive.
    // The GPU live-tick path handles playback without cache.
    const grid = this.simulation.grid;
    const perFrameBytes = grid.cellCount * grid.getPropertyNames().length * 4;
    if (perFrameBytes > SimulationController.GPU_CACHE_FILL_THRESHOLD) {
      logGPU(`Cache fill skipped: per-frame ${(perFrameBytes / 1024 / 1024).toFixed(1)}MB exceeds ${(SimulationController.GPU_CACHE_FILL_THRESHOLD / 1024 / 1024).toFixed(0)}MB threshold`);
      return;
    }

    const epoch = ++this.gpuCacheFillEpoch;
    const target = this.timelineDuration;

    // Find the first uncached frame — start fill from there
    let startGen = 0;
    while (startGen < target && this.frameCache.has(startGen)) startGen++;
    if (startGen >= target) return; // All cached already

    // Create offscreen runner (shader compilation is cached — instant)
    let offscreen: GPURuleRunner;
    try {
      offscreen = new GPURuleRunner(this.simulation.grid, this.simulation.preset);
      await offscreen.initialize();
    } catch (err) {
      logGPU(`Cache fill: offscreen runner init failed: ${err}`);
      return;
    }

    // Seed offscreen runner: use the cached frame just before startGen,
    // or initial state if starting from 0. Uses Grid as temp transfer buffer.
    const savedGridBufs = new Map<string, Float32Array>();
    for (const propName of this.simulation.grid.getPropertyNames()) {
      savedGridBufs.set(propName, new Float32Array(this.simulation.grid.getCurrentBuffer(propName)));
    }

    if (startGen > 0 && this.frameCache.has(startGen - 1)) {
      this.applySnapshot(this.frameCache.get(startGen - 1)!);
      offscreen.uploadFromGrid();
      offscreen.setGeneration(startGen - 1);
      offscreen.tick(); // advance to startGen
    } else if (startGen === 0 && this.initialSnapshot) {
      for (const [propName, buf] of this.initialSnapshot) {
        this.simulation.grid.getCurrentBuffer(propName).set(buf);
      }
      offscreen.uploadFromGrid();
      offscreen.setGeneration(0);
    }

    // Restore Grid to what it was (display path owns it)
    for (const [propName, buf] of savedGridBufs) {
      this.simulation.grid.getCurrentBuffer(propName).set(buf);
    }

    logGPU(`Cache fill starting: gen ${startGen} → ${target} (offscreen)`);

    for (let gen = startGen; gen < target; gen++) {
      if (this.gpuCacheFillEpoch !== epoch) break;

      if (!this.frameCache.has(gen)) {
        const buffers = await offscreen.readBackToGrid();
        this.frameCache.set(gen, { generation: gen, buffers, liveCellCount: -1 });
      }

      offscreen.tick();
      this.computedGeneration = Math.max(this.computedGeneration, gen + 1);

      if (gen % 10 === 0) {
        this.eventBus.emit('sim:computeProgress', { computedGeneration: this.computedGeneration });
        await new Promise(r => setTimeout(r, 0));
      }
    }

    // Cache the final frame
    if (this.gpuCacheFillEpoch === epoch) {
      const buffers = await offscreen.readBackToGrid();
      const finalGen = offscreen.getGeneration();
      this.frameCache.set(finalGen, { generation: finalGen, buffers, liveCellCount: -1 });
      this.computedGeneration = Math.max(this.computedGeneration, finalGen);
      this.eventBus.emit('sim:computeProgress', { computedGeneration: this.computedGeneration });
      logGPU(`Cache fill complete: ${this.frameCache.size} frames cached`);
    }

    offscreen.destroy();
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
    this.asyncComputeInFlight = false;
    this.asyncPlaybackInFlight = false;
    this.clearScriptingState();

    const config: PresetConfig = loadBuiltinPresetClient(name as BuiltinPresetNameClient);
    this.simulation = new Simulation(config);
    this.commandHistory = new CommandHistory(this.simulation);
    this.activePresetName = config.meta.name;
    this.frameCache.clear();
    this.computedGeneration = 0;
    this.playbackGeneration = 0;

    // Create Pyodide bridge BEFORE emitting presetLoaded, so that
    // onPresetLoaded → captureInitialState sees needsAsyncTick()=true
    // and defers compute-ahead until Pyodide is ready (with tickAsync).
    this.userParamDefs = [];
    this.autoLoadPyodideIfNeeded();
    // Try GPU acceleration (async, non-blocking — emit happens immediately, GPU init finishes in background)
    void this.tryInitGPURuleRunner();
    logMin('ctrl', `loadPreset: bridge=${!!this.pyodideBridge}, bridgeStatus=${this.pyodideBridge?.getStatus()}, needsAsync=${this.needsAsyncTick()}, postRuleTags=${this.simulation.tagRegistry.hasPostRuleTags()}`);
    this.emitPresetLoaded(config);
    this.emitParamDefs();
    this.syncTagStore();
    logMin('ctrl', `loadPreset done — computedGen=${this.computedGeneration}, cacheSize=${this.frameCache.size}, computeAheadTarget=${this.computeAheadTarget}`);
  }

  /**
   * Load a preset from an already-parsed PresetConfig.
   * For Python presets, use loadPresetConfigAsync() instead.
   */
  loadPresetConfig(config: PresetConfig): void {
    logMin('ctrl', `loadPresetConfig("${config.meta.name}") — playing=${this.playing}, computedGen=${this.computedGeneration}`);
    this.computeEpoch++;  // Cancel any in-flight async work
    if (this.editDebounceTimer) { clearTimeout(this.editDebounceTimer); this.editDebounceTimer = null; }
    this.pause();
    this.stopComputeAhead();
    this.asyncComputeInFlight = false;
    this.asyncPlaybackInFlight = false;
    this.clearScriptingState();

    this.simulation = new Simulation(config);
    this.commandHistory = new CommandHistory(this.simulation);
    this.activePresetName = config.meta.name;
    this.frameCache.clear();
    this.computedGeneration = 0;
    this.playbackGeneration = 0;

    this.userParamDefs = [];
    this.autoLoadPyodideIfNeeded();
    void this.tryInitGPURuleRunner();
    logMin('ctrl', `loadPresetConfig: bridge=${!!this.pyodideBridge}, needsAsync=${this.needsAsyncTick()}`);
    this.emitPresetLoaded(config);
    this.emitParamDefs();
    this.syncTagStore();
    logMin('ctrl', `loadPresetConfig done — computedGen=${this.computedGeneration}, cacheSize=${this.frameCache.size}`);
  }

  /**
   * Load a Python preset asynchronously. Creates PyodideBridge and
   * initializes the Python runtime before creating the Simulation.
   */
  async loadPresetConfigAsync(config: PresetConfig, bridge: PyodideBridge): Promise<void> {
    if (this.editDebounceTimer) { clearTimeout(this.editDebounceTimer); this.editDebounceTimer = null; }
    this.pause();
    this.clearScriptingState();

    this.pyodideBridge = bridge;
    this.simulation = await Simulation.create(config, bridge);
    this.commandHistory = new CommandHistory(this.simulation);
    this.activePresetName = config.meta.name;
    this.frameCache.clear();
    this.computedGeneration = 0;
    this.playbackGeneration = 0;
    this.userParamDefs = [];

    this.emitPresetLoaded(config);
    this.emitParamDefs();
    this.syncTagStore();
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
    const result = this.simulation?.needsAsyncTick() ?? false;
    logDbg('sim', `needsAsyncTick() → ${result} (bridge=${!!this.simulation?.pyodideBridge}, postRule=${this.simulation?.tagRegistry.hasPostRuleTags()}, scripts=${this.simulation?.tagRegistry.getAll().some(t => t.enabled && t.source === 'script')})`);
    return result;
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
    this.frameCache.clear();
    this.computedGeneration = 0;
    this.playbackGeneration = 0;
    // Restore initial state BEFORE anything else touches the grid
    this.restoreInitialState();
    this.syncGridToGPU();
    // Cache the clean initial frame
    this.cacheCurrentFrame();
    // Emit targeted events: generation=0, paused, computedGeneration=0.
    // Don't use sim:reset which nukes maxGeneration (timeline needs that for scrub ceiling).
    this.eventBus.emit('sim:tick', {
      generation: 0,
      liveCellCount: this.getLiveCellCount(),
    });
    this.eventBus.emit('sim:computeProgress', { computedGeneration: 0 });
    // Restart compute-ahead from clean state
    if (this.computeAheadTarget > 0) {
      this.computeAhead(this.computeAheadTarget);
    }
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
    this.frameCache.clear();
    this.computedGeneration = 0;
    this.playbackGeneration = 0;
    this.syncGridToGPU();
    this.cacheCurrentFrame();
    this.eventBus.emit('sim:reset', {});
    this.eventBus.emit('sim:tick', {
      generation: 0,
      liveCellCount: this.getLiveCellCount(),
    });
  }

  /**
   * Get the PyodideBridge instance.
   */
  getPyodideBridge() {
    return this.pyodideBridge;
  }

  /**
   * Auto-create PyodideBridge if the loaded preset has post-rule expression or script tags.
   * This ensures needsAsyncTick() returns true so the compute path uses tickAsync().
   */
  private autoLoadPyodideIfNeeded(): void {
    if (!this.simulation) return;
    const hasPostRule = this.simulation.tagRegistry.hasPostRuleTags();
    const hasScripts = this.simulation.tagRegistry.getAll().some(
      t => t.enabled && t.source === 'script',
    );
    logMin('pyodide', `autoLoadPyodideIfNeeded: hasPostRule=${hasPostRule}, hasScripts=${hasScripts}, bridgeExists=${!!this.pyodideBridge}`);
    if (hasPostRule || hasScripts) {
      const bridge = this.ensurePyodideBridge();
      // Start loading Pyodide immediately so it's ready when compute-ahead starts
      if (bridge) {
        logMin('pyodide', `ensureReady() called — status=${bridge.getStatus()}`);
        void bridge.ensureReady().then(() => {
          logMin('pyodide', 'Pyodide ready!');
        });
      }
    }
  }

  /**
   * Lazily ensure a PyodideBridge is available and attached to the simulation.
   * Returns the bridge or null if no simulation.
   */
  ensurePyodideBridge(): PyodideBridge | null {
    if (!this.simulation) return null;
    if (!this.pyodideBridge) {
      this.pyodideBridge = new PyodideBridge();
    }
    if (!this.simulation.pyodideBridge) {
      this.simulation.pyodideBridge = this.pyodideBridge;
    }
    return this.pyodideBridge;
  }

  /**
   * Start simulation playback.
   * Kicks off compute-ahead to fill the cache, then starts
   * the playback loop at display FPS.
   */
  play(): void {
    logMin('play', `play() — already=${this.playing}, needsAsync=${this.needsAsyncTick()}, computedGen=${this.computedGeneration}, playbackGen=${this.playbackGeneration}`);
    if (this.playing || !this.simulation) return;
    this.playing = true;
    this.gpuCacheFillEpoch++; // Cancel any in-flight GPU cache fill

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
    logMin('play', `pause() — playing=${this.playing}`);
    if (!this.playing) return;
    this.playing = false;

    this.stopPlaybackLoop();
    this.asyncPlaybackInFlight = false;

    // GPU mode: sync display state back to CPU Grid so edits see correct base
    if (this.gpuRuleRunner) {
      this.gpuSyncInFlight = true;
      void this.syncGPUToGrid().finally(() => {
        this.gpuSyncInFlight = false;
      });
    }

    this.eventBus.emit('sim:pause', {});
  }

  /**
   * Run a single tick (step forward one generation).
   * For Python rules, use stepAsync() instead.
   */
  step(): void {
    if (!this.simulation || this.gpuSyncInFlight) return;
    logDbg('play', `step() — needsAsync=${this.needsAsyncTick()}, playbackGen=${this.playbackGeneration}, computedGen=${this.computedGeneration}`);
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
    if (!this.simulation || this.gpuSyncInFlight) return;
    logDbg('play', `stepAsync() — playbackGen=${this.playbackGeneration}, computedGen=${this.computedGeneration}`);

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

    this.frameCache.clear();
    this.computedGeneration = 0;
    this.playbackGeneration = 0;
    this.simulation.runner.setGeneration(0);
    this.syncGridToGPU();
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
    if (targetGen === this.playbackGeneration && this.frameCache.has(targetGen)) {
      return;
    }
    logDbg('play', `seek(${targetGen}) — playbackGen=${this.playbackGeneration}, computedGen=${this.computedGeneration}`);

    // GPU mode: only seek to cached frames — never block with sync compute
    if (this.gpuRuleRunner) {
      if (this.frameCache.has(targetGen)) {
        this.playbackGeneration = targetGen;
        this.restoreFrame(targetGen);
      } else {
        // Find nearest cached frame
        let nearest = targetGen;
        while (nearest > 0 && !this.frameCache.has(nearest)) nearest--;
        if (this.frameCache.has(nearest)) {
          this.playbackGeneration = nearest;
          this.restoreFrame(nearest);
        }
      }
      return;
    }

    // CPU mode: compute to target if not cached (may block)
    if (!this.frameCache.has(targetGen)) {
      if (targetGen > this.computedGeneration) {
        this.computeFrames(targetGen - this.computedGeneration);
      } else {
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
    // GPU ticks live, no compute-ahead (check both runner and expected GPU capability)
    if (this.gpuRuleRunner) return;
    if (GPUContext.isAvailable() && this.simulation && (BUILTIN_IR[this.simulation.preset.meta.name] || this.simulation.preset.rule.compute)) return;
    logMin('compute', `computeAhead(${targetGeneration}) — computedGen=${this.computedGeneration}, timerRunning=${!!this.computeAheadTimer}, needsAsync=${this.needsAsyncTick()}`);
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
    logMin('ctrl', `reset() — computedGen=${this.computedGeneration}, playbackGen=${this.playbackGeneration}`);
    this.stopComputeAhead();
    if (this.initialSnapshot) {
      this.restoreInitialState();
    } else {
      this.simulation.reset();
    }
    this.frameCache.clear();
    this.computedGeneration = 0;
    this.playbackGeneration = 0;
    this.syncGridToGPU();
    if (!this.gpuRuleRunner) {
      this.cacheCurrentFrame();
      if (this.computeAheadTarget > 0) this.computeAhead(this.computeAheadTarget);
    } else {
      void this.gpuCacheFill();
    }
    this.eventBus.emit('sim:reset', {});
  }

  /**
   * Count non-zero values in the primary property buffer.
   */
  getLiveCellCount(): number {
    if (!this.simulation) return 0;
    const firstProp = this.simulation.preset.cell_properties?.[0]?.name
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
    logMin('ctrl', `captureInitialState(${cacheTarget}) — needsAsync=${this.needsAsyncTick()}, bridgeStatus=${this.pyodideBridge?.getStatus()}, simGen=${this.simulation.getGeneration()}`);
    this.initialSnapshot = new Map();
    let perFrameBytes = 0;
    for (const propName of this.simulation.grid.getPropertyNames()) {
      const buf = this.simulation.grid.getCurrentBuffer(propName);
      this.initialSnapshot.set(propName, new Float32Array(buf));
      perFrameBytes += buf.byteLength;
    }

    // Dynamic cache size: cap total cache memory at the budget
    if (perFrameBytes > 0) {
      this.maxCacheSize = Math.max(10, Math.floor(SimulationController.CACHE_MEMORY_BUDGET / perFrameBytes));
      logDbg('compute', `Cache size: ${this.maxCacheSize} frames (${(perFrameBytes / 1024 / 1024).toFixed(1)}MB/frame, budget=${(SimulationController.CACHE_MEMORY_BUDGET / 1024 / 1024).toFixed(0)}MB)`);
    }

    // Also cache frame 0
    this.cacheCurrentFrame();
    // Sync to scene graph for persistence
    this.syncInitialStateToScene();

    // Start compute-ahead (CPU mode only — GPU ticks live, no pre-compute needed)
    if (cacheTarget && cacheTarget > 0) {
      this.timelineDuration = cacheTarget;
      this.computeAheadTarget = cacheTarget;
      // Skip compute-ahead if GPU will handle this preset (runner may still be initializing)
      if (this.gpuRuleRunner || (GPUContext.isAvailable() && this.simulation && (BUILTIN_IR[this.simulation.preset.meta.name] || this.simulation.preset.rule.compute))) {
        // Unlock timeline scrubbing immediately — GPU can seek to any frame
        this.computedGeneration = cacheTarget;
        this.eventBus.emit('sim:computeProgress', { computedGeneration: cacheTarget });
        return;
      }

      // If async tick is needed but Pyodide isn't ready yet, defer compute-ahead
      if (this.needsAsyncTick() && this.pyodideBridge && this.pyodideBridge.getStatus() !== 'ready') {
        this.computeAheadTarget = cacheTarget;
        // Cancel any previous deferred listener
        if (this.deferredComputeAheadListener) {
          this.eventBus.off('pyodide:ready', this.deferredComputeAheadListener);
        }
        const captureEpoch = this.computeEpoch;
        const onReady = () => {
          this.eventBus.off('pyodide:ready', onReady);
          this.deferredComputeAheadListener = null;
          // If a preset load or resize happened since we deferred, bail out
          if (this.computeEpoch !== captureEpoch) return;
          this.computeAhead(cacheTarget);
        };
        this.deferredComputeAheadListener = onReady;
        this.eventBus.on('pyodide:ready', onReady);
      } else {
        this.computeAhead(cacheTarget);
      }
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
        this.simulation.runner.setGeneration(0);
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
    this.simulation.runner.setGeneration(0);
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
   * Cache the current frame in the frame cache.
   */
  private cacheCurrentFrame(): void {
    if (!this.simulation) return;

    const generation = this.simulation.getGeneration();
    logDbg('compute', `cacheCurrentFrame() gen=${generation}, cacheSize=${this.frameCache.size}`);
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
   * GPU path: just tick (no cache — GPU renders live from buffers).
   * CPU path: tick + cache for timeline scrubbing.
   */
  private computeFrames(count: number): void {
    if (!this.simulation) return;
    logDbg('compute', `computeFrames(${count}) — simGen=${this.simulation.getGeneration()}, computedGen=${this.computedGeneration}, gpu=${!!this.gpuRuleRunner}`);

    if (this.gpuRuleRunner) {
      // GPU path: tick on GPU, don't cache (readback is async).
      // Frame caching for GPU is handled by computeFramesGPU().
      for (let i = 0; i < count; i++) {
        this.gpuRuleRunner.tick();
        const gpuGen = this.gpuRuleRunner.getGeneration();
        this.simulation.runner.setGeneration(gpuGen);
        this.computedGeneration = gpuGen;
      }
    } else {
      // CPU path (unchanged)
      if (this.simulation.getGeneration() !== this.computedGeneration) {
        this.advanceSimTo(this.computedGeneration);
      }

      for (let i = 0; i < count; i++) {
        this.cacheCurrentFrame();
        this.simulation.tick();
        this.computedGeneration = this.simulation.getGeneration();
      }
      this.cacheCurrentFrame();
    }
    logDbg('compute', `computeFrames done — computedGen=${this.computedGeneration}`);

    // Emit progress
    this.eventBus.emit('sim:computeProgress', { computedGeneration: this.computedGeneration });
  }

  /**
   * Async version of computeFrames for Python rules.
   * Guarded: only one async compute can run at a time.
   *
   * Saves the display state before computing and restores it after each
   * await yield, so the renderer never shows intermediate compute-ahead frames.
   */
  private async computeFramesAsync(count: number): Promise<void> {
    if (!this.simulation) return;
    if (this.asyncComputeInFlight) {
      logDbg('compute', `computeFramesAsync(${count}) SKIPPED — already in flight`);
      return;
    }
    this.asyncComputeInFlight = true;
    logDbg('compute', `computeFramesAsync(${count}) START — simGen=${this.simulation.getGeneration()}, computedGen=${this.computedGeneration}, playbackGen=${this.playbackGeneration}, bridgeStatus=${this.pyodideBridge?.getStatus()}`);

    // Lock the display: renderer reads frozen snapshot while we compute freely
    const grid = this.simulation.grid;
    const epoch = this.computeEpoch;
    grid.lockDisplay();

    try {
      // Move sim to compute frontier (restores from cache — no sync replay needed)
      if (this.simulation.getGeneration() !== this.computedGeneration) {
        logDbg('compute', `advancing sim from ${this.simulation.getGeneration()} to computedGen=${this.computedGeneration}`);
        this.advanceSimTo(this.computedGeneration);
      }

      for (let i = 0; i < count; i++) {
        // Check if simulation was replaced (grid resize, preset change)
        if (this.computeEpoch !== epoch) {
          logMin('compute', `computeFramesAsync ABORTED — epoch changed (${epoch} → ${this.computeEpoch})`);
          break;
        }

        this.cacheCurrentFrame();
        logDbg('compute', `tickAsync() iteration ${i}/${count} — simGen=${this.simulation.getGeneration()}`);
        await this.simulation.tickAsync();
        this.computedGeneration = this.simulation.getGeneration();
        logDbg('compute', `tickAsync() done — new computedGen=${this.computedGeneration}`);

        // Cache the result with expressions applied
        this.cacheCurrentFrame();
      }

      logDbg('compute', `computeFramesAsync(${count}) DONE — computedGen=${this.computedGeneration}`);
      this.eventBus.emit('sim:computeProgress', { computedGeneration: this.computedGeneration });
    } catch (err) {
      logMin('compute', `computeFramesAsync ERROR: ${err}`);
      throw err;
    } finally {
      // Unlock the grid we locked (not this.simulation.grid — might have changed)
      if (this.computeEpoch === epoch) {
        // Same simulation: restore playback frame, then unlock
        const playbackSnapshot = this.frameCache.get(this.playbackGeneration);
        if (playbackSnapshot) {
          this.applySnapshot(playbackSnapshot);
        }
      }
      grid.unlockDisplay();
      this.asyncComputeInFlight = false;
    }
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
      logDbg('compute', `advanceSimTo(${targetGen}) — from cache (simGen was ${currentGen})`);
      this.applySnapshot(this.frameCache.get(targetGen)!);
      return;
    }

    // Need to replay
    logDbg('compute', `advanceSimTo(${targetGen}) — REPLAY from ${currentGen < targetGen && this.frameCache.has(currentGen) ? currentGen : 0}`);
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
    logDbg('compute', `applySnapshot(gen=${snapshot.generation}) — ${snapshot.buffers.size} buffers, liveCells=${snapshot.liveCellCount}`);
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
    if (!snapshot) {
      logMin('play', `restoreFrame(${generation}) — MISS (not in cache, cacheSize=${this.frameCache.size})`);
      return;
    }

    logDbg('play', `restoreFrame(${generation}) — liveCells=${snapshot.liveCellCount}`);
    this.applySnapshot(snapshot);
    this.syncGridToGPU();
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
    logDbg('play', `playbackTick() — playbackGen=${this.playbackGeneration}, computedGen=${this.computedGeneration}, gpu=${!!this.gpuRuleRunner}`);

    // GPU path takes priority — always live-tick for performance.
    // Restoring from cache requires a full CPU→GPU upload per frame which is
    // prohibitively slow for large grids. Cache is only used for seek/step-back.
    if (this.gpuRuleRunner) {
      if (this.gpuSyncInFlight) return; // Wait for readback to finish
      const nextGen = this.playbackGeneration + 1;
      if (nextGen >= this.timelineDuration) {
        switch (this.playbackMode) {
          case 'once':
            this.pause();
            return;
          case 'loop': {
            // Reset GPU runner to initial state
            this.playbackGeneration = 0;
            if (this.initialSnapshot) {
              for (const [propName, buf] of this.initialSnapshot) {
                this.simulation.grid.getCurrentBuffer(propName).set(buf);
              }
              this.syncGridToGPU();
            }
            this.gpuRuleRunner.setGeneration(0);
            this.simulation.runner.setGeneration(0);
            this.eventBus.emit('sim:tick', { generation: 0, liveCellCount: -1 });
            return;
          }
          case 'endless': {
            const newDuration = smartExtendDuration(this.timelineDuration);
            this.timelineDuration = newDuration;
            this.eventBus.emit('sim:timelineExtend', { duration: newDuration });
            break;
          }
        }
      }
      // Always live-tick on GPU — no cache roundtrip
      this.gpuRuleRunner.tick();
      this.playbackGeneration = this.gpuRuleRunner.getGeneration();
      this.simulation.runner.setGeneration(this.playbackGeneration);
      this.eventBus.emit('sim:tick', {
        generation: this.playbackGeneration,
        liveCellCount: -1,
      });
      return;
    }

    // Async rules (Python via Pyodide, expressions, scripts) — CPU fallback
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
    if (nextGen > this.computedGeneration) {
      this.computeFrames(1);
    }

    // Advance playback if the frame is now available
    if (nextGen <= this.computedGeneration) {
      this.playbackGeneration = nextGen;
      this.restoreFrame(this.playbackGeneration);
    }
  }

  private async playbackTickAsync(): Promise<void> {
    if (!this.simulation) return;
    if (this.asyncPlaybackInFlight) {
      logDbg('play', `playbackTickAsync() SKIPPED — already in flight`);
      return;
    }
    this.asyncPlaybackInFlight = true;
    const epoch = this.computeEpoch;
    logDbg('play', `playbackTickAsync() — playbackGen=${this.playbackGeneration}, computedGen=${this.computedGeneration}`);

    try {
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

    // Bail if simulation was replaced during await
    if (this.computeEpoch !== epoch) return;

    if (nextGen <= this.computedGeneration) {
      this.playbackGeneration = nextGen;
      this.restoreFrame(this.playbackGeneration);
    }
    } finally {
      this.asyncPlaybackInFlight = false;
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
    // GPU mode: no compute-ahead. GPU ticks live.
    if (this.gpuRuleRunner) {
      this.computeAheadTimer = null;
      return;
    }

    // Cap compute-ahead to timeline duration
    const effectiveTarget = Math.min(this.computeAheadTarget, this.timelineDuration);
    if (this.computedGeneration >= effectiveTarget) {
      logDbg('compute', `runComputeAheadChunk DONE — computedGen=${this.computedGeneration} >= target=${effectiveTarget}`);
      this.computeAheadTimer = null;
      return;
    }

    const remaining = effectiveTarget - this.computedGeneration;
    const maxChunk = this.playing ? PLAYBACK_CHUNK_SIZE : COMPUTE_CHUNK_SIZE;
    const chunkSize = Math.min(maxChunk, remaining);
    logDbg('compute', `runComputeAheadChunk — computedGen=${this.computedGeneration}, target=${effectiveTarget}, chunk=${chunkSize}`);

    if (this.needsAsyncTick()) {
      if (this.asyncComputeInFlight) {
        logDbg('compute', `runComputeAheadChunk — async in flight, deferring`);
        this.computeAheadTimer = null;
        return;
      }
      logDbg('compute', `runComputeAheadChunk — launching async chunk of ${chunkSize}`);
      const chunkEpoch = this.computeEpoch;
      void this.computeFramesAsync(chunkSize).then(() => {
        if (this.computeEpoch !== chunkEpoch) return;
        if (this.frameCache.has(this.playbackGeneration)) {
          this.applySnapshot(this.frameCache.get(this.playbackGeneration)!);
        }
        this.computeAheadTimer = setTimeout(() => {
          this.runComputeAheadChunk();
        }, 0);
      });
      return;
    }

    this.computeFrames(chunkSize);

    if (this.frameCache.has(this.playbackGeneration)) {
      this.applySnapshot(this.frameCache.get(this.playbackGeneration)!);
    }

    this.computeAheadTimer = setTimeout(() => {
      this.runComputeAheadChunk();
    }, 0);
  }

  /**
   * Stop compute-ahead.
   */
  private stopComputeAhead(): void {
    logDbg('compute', `stopComputeAhead() — timer=${!!this.computeAheadTimer}, deferredListener=${!!this.deferredComputeAheadListener}`);
    if (this.computeAheadTimer) {
      clearTimeout(this.computeAheadTimer);
      this.computeAheadTimer = null;
    }
    // Cancel deferred compute-ahead waiting for Pyodide
    if (this.deferredComputeAheadListener) {
      this.eventBus.off('pyodide:ready', this.deferredComputeAheadListener);
      this.deferredComputeAheadListener = null;
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
    for (const key of this.frameCache.keys()) {
      if (key >= fromGeneration) {
        this.frameCache.delete(key);
      }
    }
    if (this.computedGeneration > fromGeneration) {
      this.computedGeneration = fromGeneration;
      this.advanceSimTo(Math.max(0, fromGeneration - 1));
      this.eventBus.emit('sim:computeProgress', { computedGeneration: this.computedGeneration });
    }
    this.stopComputeAhead();
    if (this.computeAheadTarget > this.computedGeneration) {
      this.computeAhead(this.computeAheadTarget);
    }
  }

  /**
   * Notify the controller that grid cells have been edited (draw/erase).
   */
  onGridEdited(): void {
    if (!this.simulation) return;

    const gen = this.playbackGeneration;
    this.simulation.runner.setGeneration(gen);
    this.syncGridToGPU();
    this.cacheCurrentFrame();

    if (gen === 0 && this.initialSnapshot) {
      for (const propName of this.simulation.grid.getPropertyNames()) {
        const buf = this.simulation.grid.getCurrentBuffer(propName);
        this.initialSnapshot.set(propName, new Float32Array(buf));
      }
      this.syncInitialStateToScene();
    }

    this.stopComputeAhead();
    for (const key of this.frameCache.keys()) {
      if (key > gen) {
        this.frameCache.delete(key);
      }
    }
    this.computedGeneration = gen;
    this.eventBus.emit('sim:computeProgress', { computedGeneration: gen });

    this.eventBus.emit('sim:tick', {
      generation: gen,
      liveCellCount: this.getLiveCellCount(),
    });

    if (this.editDebounceTimer) {
      clearTimeout(this.editDebounceTimer);
    }
    this.editDebounceTimer = setTimeout(() => {
      this.editDebounceTimer = null;
      if (this.gpuRuleRunner) {
        // GPU mode: re-fill cache from the edit frame onwards
        void this.gpuCacheFill();
      } else if (this.computeAheadTarget > this.computedGeneration) {
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
  updateRule(newBody: string): void {
    if (!this.simulation) return;
    this.simulation.updateRule(newBody);
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
      frameCache: this.frameCache,
      computedGeneration: this.computedGeneration,
      initialSnapshot: this.initialSnapshot,
      computeAheadTarget: this.computeAheadTarget,
      pyodideBridge: this.pyodideBridge,
      playbackGeneration: this.playbackGeneration,
      playbackMode: this.playbackMode,
      timelineDuration: this.timelineDuration,
    };

    this.simulation = null;
    this.commandHistory = null;
    this.playing = false;
    this.activePresetName = null;
    this.frameCache = new Map();
    this.computedGeneration = 0;
    this.initialSnapshot = null;
    this.computeAheadTarget = 0;
    this.pyodideBridge = null;
    this.playbackGeneration = 0;
    this.playbackMode = 'loop';
    this.timelineDuration = 256;

    return snapshot;
  }

  restoreState(snapshot: ControllerStateSnapshot): void {
    this.stopPlaybackLoop();
    this.stopComputeAhead();
    this.asyncComputeInFlight = false;
    this.asyncPlaybackInFlight = false;
    if (this.editDebounceTimer) {
      clearTimeout(this.editDebounceTimer);
      this.editDebounceTimer = null;
    }

    this.simulation = snapshot.simulation;
    this.commandHistory = snapshot.commandHistory;
    this.playing = snapshot.playing;
    this.tickIntervalMs = snapshot.tickIntervalMs;
    this.activePresetName = snapshot.activePresetName;
    this.frameCache = snapshot.frameCache;
    this.computedGeneration = snapshot.computedGeneration;
    this.initialSnapshot = snapshot.initialSnapshot;
    this.computeAheadTarget = snapshot.computeAheadTarget;
    this.pyodideBridge = snapshot.pyodideBridge;
    this.playbackGeneration = snapshot.playbackGeneration;
    this.playbackMode = snapshot.playbackMode;
    this.timelineDuration = snapshot.timelineDuration;

    if (this.playing && this.simulation) {
      this.startPlaybackLoop();
    }

    if (this.computeAheadTarget > this.computedGeneration) {
      this.computeAhead(this.computeAheadTarget);
    }
  }
}
