/**
 * SimulationInstance: per-root wrapper around a SimulationController's state.
 *
 * Each SimRoot in the scene graph corresponds to one SimulationInstance.
 * Holds its own Simulation, playback state, frame cache, and scripting engines.
 * The SimulationManager delegates to the active instance.
 *
 * SG-8: Multi-Sim infrastructure.
 */

import { Simulation } from '../engine/rule/Simulation';
import { CommandHistory } from '../engine/rule/CommandHistory';
import type { PresetConfig } from '../engine/preset/types';

export class SimulationInstance {
  readonly rootId: string;
  simulation: Simulation | null = null;
  commandHistory: CommandHistory | null = null;
  isRunning: boolean = false;
  speed: number = 10; // FPS
  activePresetName: string | null = null;

  constructor(rootId: string) {
    this.rootId = rootId;
  }

  /**
   * Initialize or replace the simulation from a preset config.
   */
  loadFromConfig(config: PresetConfig): void {
    this.simulation = new Simulation(config);
    this.commandHistory = new CommandHistory(this.simulation);
    this.activePresetName = config.meta.name;
  }

  /**
   * Get a summary of this instance's current state.
   */
  getStatus(): {
    rootId: string;
    activePreset: string | null;
    isRunning: boolean;
    speed: number;
    generation: number;
  } {
    return {
      rootId: this.rootId,
      activePreset: this.activePresetName,
      isRunning: this.isRunning,
      speed: this.speed,
      generation: this.simulation?.getGeneration() ?? 0,
    };
  }

  /**
   * Dispose of this instance's resources.
   */
  dispose(): void {
    this.simulation = null;
    this.commandHistory = null;
    this.isRunning = false;
  }
}
