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
import { loadBuiltinPreset } from '../engine/preset/builtinPresets';
import type { EventBus } from '../engine/core/EventBus';
import type { PresetConfig } from '../engine/preset/types';

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

    const config: PresetConfig = loadBuiltinPreset(name as Parameters<typeof loadBuiltinPreset>[0]);
    this.simulation = new Simulation(config);
    this.commandHistory = new CommandHistory(this.simulation);
    this.activePresetName = config.meta.name;
    this.tickHistory = [];

    this.eventBus.emit('sim:presetLoaded', {
      name: config.meta.name,
      width: config.grid.width,
      height: config.grid.height ?? 1,
    });
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
      // Reset and replay to target generation
      this.simulation.reset();
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
    this.simulation.reset();
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
