/**
 * SimulationManager: extends SimulationController with multi-root support.
 *
 * Manages a Map<rootId, ControllerStateSnapshot> for independent simulations.
 * The "active root" routes all inherited SimulationController methods
 * (play, pause, step, etc.) to the correct instance via save/restore.
 *
 * Backward compatible: when used as a SimulationController, the default
 * root ("default") behaves exactly like a single-sim setup. Existing code
 * that references `SimulationController` works unchanged.
 *
 * SG-8: Multi-Sim infrastructure.
 */

import { SimulationController, type ControllerStateSnapshot } from './SimulationController';
import { SimulationInstance } from './SimulationInstance';
import type { EventBus } from '../engine/core/EventBus';

/** Default root ID used for single-sim backward compatibility */
export const DEFAULT_ROOT_ID = 'default';

export class SimulationManager extends SimulationController {
  /** Lightweight metadata per root (rootId, preset name, etc.) */
  private instances: Map<string, SimulationInstance> = new Map();

  /** Saved controller state snapshots for inactive roots */
  private savedStates: Map<string, ControllerStateSnapshot> = new Map();

  private _activeRootId: string = DEFAULT_ROOT_ID;

  constructor(eventBus: EventBus, tickIntervalMs: number = 100) {
    super(eventBus, tickIntervalMs);
    // Create the default instance so single-sim usage works out of the box
    this.instances.set(DEFAULT_ROOT_ID, new SimulationInstance(DEFAULT_ROOT_ID));
  }

  // --- Multi-root API ---

  /**
   * Get the active root ID.
   */
  get activeRootId(): string {
    return this._activeRootId;
  }

  /**
   * Get a specific instance by root ID.
   * Returns undefined if no instance exists for that root.
   */
  getInstance(rootId: string): SimulationInstance | undefined {
    return this.instances.get(rootId);
  }

  /**
   * Get the active instance (the one that receives commands).
   */
  getActiveInstance(): SimulationInstance | undefined {
    return this.instances.get(this._activeRootId);
  }

  /**
   * Switch which root receives commands.
   * Saves current root's state and restores the new root's state.
   * No-op if the rootId doesn't exist or is already active.
   */
  setActiveRoot(rootId: string): void {
    if (!this.instances.has(rootId)) return;
    if (rootId === this._activeRootId) return;

    // Save current root's controller state
    const currentSnapshot = this.saveState();
    this.savedStates.set(this._activeRootId, currentSnapshot);
    this.syncInstanceFromController(this._activeRootId, currentSnapshot);

    // Switch active
    this._activeRootId = rootId;

    // Restore the new root's state (if it was previously saved)
    const saved = this.savedStates.get(rootId);
    if (saved) {
      this.restoreState(saved);
      this.savedStates.delete(rootId);
    }
    // If no saved state, the controller is now in a clean state (no simulation loaded)
    // which is correct for a newly added root that hasn't had a preset loaded yet.
  }

  /**
   * Add a new simulation root. Returns the created instance.
   * If a root with this ID already exists, returns the existing one.
   */
  addRoot(rootId: string): SimulationInstance {
    const existing = this.instances.get(rootId);
    if (existing) return existing;

    const instance = new SimulationInstance(rootId);
    this.instances.set(rootId, instance);
    return instance;
  }

  /**
   * Remove a simulation root and dispose its resources.
   * Cannot remove the default root.
   * If the active root is removed, active switches to default.
   */
  removeRoot(rootId: string): boolean {
    if (rootId === DEFAULT_ROOT_ID) return false;
    const instance = this.instances.get(rootId);
    if (!instance) return false;

    instance.dispose();
    this.instances.delete(rootId);
    this.savedStates.delete(rootId);

    // If we just removed the active root, fall back to default
    if (this._activeRootId === rootId) {
      this._activeRootId = DEFAULT_ROOT_ID;
      // Restore default's saved state
      const saved = this.savedStates.get(DEFAULT_ROOT_ID);
      if (saved) {
        this.restoreState(saved);
        this.savedStates.delete(DEFAULT_ROOT_ID);
      }
    }
    return true;
  }

  /**
   * List all root IDs.
   */
  listRoots(): string[] {
    return Array.from(this.instances.keys());
  }

  /**
   * Get the number of active simulation roots.
   */
  getRootCount(): number {
    return this.instances.size;
  }

  // --- Override hooks to keep instances in sync ---

  /**
   * Override loadPreset to sync the active instance's metadata.
   */
  override loadPreset(name: string): void {
    super.loadPreset(name);
    this.syncActiveInstanceFromController();
  }

  /**
   * Override loadPresetConfig to sync.
   */
  override loadPresetConfig(config: import('../engine/preset/types').PresetConfig): void {
    super.loadPresetConfig(config);
    this.syncActiveInstanceFromController();
  }

  /**
   * Override play to track running state on the instance.
   */
  override play(): void {
    super.play();
    const instance = this.instances.get(this._activeRootId);
    if (instance) instance.isRunning = true;
  }

  /**
   * Override pause to track running state on the instance.
   */
  override pause(): void {
    super.pause();
    const instance = this.instances.get(this._activeRootId);
    if (instance) instance.isRunning = false;
  }

  /**
   * Override setSpeed to track on the instance.
   */
  override setSpeed(fps: number): void {
    super.setSpeed(fps);
    const instance = this.instances.get(this._activeRootId);
    if (instance) instance.speed = fps;
  }

  /**
   * Override dispose to clean up all instances.
   */
  override dispose(): void {
    super.dispose();
    for (const instance of this.instances.values()) {
      instance.dispose();
    }
    this.instances.clear();
    this.savedStates.clear();
    // Re-create default for potential reuse
    this.instances.set(DEFAULT_ROOT_ID, new SimulationInstance(DEFAULT_ROOT_ID));
    this._activeRootId = DEFAULT_ROOT_ID;
  }

  /**
   * Sync the active SimulationInstance's metadata from the controller's current state.
   */
  private syncActiveInstanceFromController(): void {
    const instance = this.instances.get(this._activeRootId);
    if (!instance) return;
    instance.simulation = this.getSimulation();
    instance.commandHistory = this.getCommandHistory();
    instance.activePresetName = this.getActivePresetName();
    instance.isRunning = this.isPlaying();
  }

  /**
   * Sync instance metadata from a saved state snapshot (used during root switch).
   */
  private syncInstanceFromController(rootId: string, snapshot: ControllerStateSnapshot): void {
    const instance = this.instances.get(rootId);
    if (!instance) return;
    instance.simulation = snapshot.simulation;
    instance.commandHistory = snapshot.commandHistory;
    instance.activePresetName = snapshot.activePresetName;
    instance.isRunning = snapshot.playing;
  }
}
