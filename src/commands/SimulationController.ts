/**
 * SimulationController: wraps Simulation with play/pause lifecycle and event emission.
 *
 * This is the bridge between commands and the engine. Commands call controller
 * methods, which operate on the Simulation and emit events via the EventBus.
 *
 * In Phase 5, the controller runs in the main thread.
 * Worker integration deferred to later phases.
 */

import { Simulation } from '../engine/rule/Simulation';
import { CommandHistory } from '../engine/rule/CommandHistory';
import { loadBuiltinPreset } from '../engine/preset/builtinPresets';
import type { EventBus } from '../engine/core/EventBus';
import type { PresetConfig } from '../engine/preset/types';

export class SimulationController {
  private eventBus: EventBus;
  private simulation: Simulation | null = null;
  private commandHistory: CommandHistory | null = null;
  private playing: boolean = false;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private tickIntervalMs: number;

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

    this.tickInterval = setInterval(() => {
      this.doTick();
    }, this.tickIntervalMs);
  }

  /**
   * Stop the simulation tick loop.
   */
  pause(): void {
    if (!this.playing) return;
    this.playing = false;

    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

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
   * Reset the simulation to its initial state.
   */
  reset(): void {
    if (!this.simulation) return;
    this.simulation.reset();
    this.eventBus.emit('sim:reset', {});
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
   * Internal: run one tick and emit the event.
   */
  private doTick(): void {
    if (!this.simulation) return;
    const result = this.simulation.tick();
    this.eventBus.emit('sim:tick', { generation: result.generation });
  }

  /**
   * Dispose of the controller, stopping the tick loop.
   */
  dispose(): void {
    this.pause();
    this.simulation = null;
    this.commandHistory = null;
  }
}
