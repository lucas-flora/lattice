/**
 * SG-8: Multi-Sim integration tests.
 *
 * Tests that SimulationManager can manage multiple independent simulation roots,
 * switch between them, and that existing single-sim behavior is preserved.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../engine/core/EventBus';
import { CommandRegistry } from '../CommandRegistry';
import { SimulationManager, DEFAULT_ROOT_ID } from '../SimulationManager';
import { SimulationController } from '../SimulationController';
import { registerAllCommands } from '../definitions';
import { wireStores } from '../wireStores';
import { useSimStore } from '../../store/simStore';

describe('SimulationManager — Multi-Sim', () => {
  let bus: EventBus;
  let manager: SimulationManager;
  let registry: CommandRegistry;
  let unwire: () => void;

  beforeEach(() => {
    bus = new EventBus();
    registry = new CommandRegistry();
    manager = new SimulationManager(bus, 10000);
    registerAllCommands(registry, manager, bus);
    unwire = wireStores(bus);
  });

  afterEach(() => {
    manager.dispose();
    unwire();
    useSimStore.setState(useSimStore.getInitialState());
  });

  // --- Backward compatibility: single-sim behavior unchanged ---

  it('TestSimulationManager_IsSimulationController', () => {
    // SimulationManager IS-A SimulationController
    expect(manager).toBeInstanceOf(SimulationController);
  });

  it('TestSimulationManager_DefaultRoot_ExistsByDefault', () => {
    expect(manager.activeRootId).toBe(DEFAULT_ROOT_ID);
    expect(manager.listRoots()).toEqual([DEFAULT_ROOT_ID]);
    expect(manager.getRootCount()).toBe(1);
  });

  it('TestSimulationManager_SingleSim_WorksLikeBefore', () => {
    // Load, step, check generation — exactly like SimulationController
    manager.loadPreset('conways-gol');
    expect(manager.getSimulation()).not.toBeNull();
    expect(manager.getGeneration()).toBe(0);

    manager.step();
    expect(manager.getGeneration()).toBe(1);

    manager.step();
    expect(manager.getGeneration()).toBe(2);

    manager.reset();
    expect(manager.getGeneration()).toBe(0);
  });

  it('TestSimulationManager_SingleSim_PlayPause', () => {
    manager.loadPreset('conways-gol');
    expect(manager.isPlaying()).toBe(false);

    manager.play();
    expect(manager.isPlaying()).toBe(true);

    manager.pause();
    expect(manager.isPlaying()).toBe(false);
  });

  it('TestSimulationManager_SingleSim_InstanceSynced', () => {
    manager.loadPreset('conways-gol');
    const instance = manager.getActiveInstance();
    expect(instance).toBeDefined();
    expect(instance!.rootId).toBe(DEFAULT_ROOT_ID);
    expect(instance!.simulation).toBe(manager.getSimulation());
    expect(instance!.activePresetName).not.toBeNull();
  });

  // --- Multi-root: two independent simulations ---

  it('TestSimulationManager_AddRoot_CreatesNewInstance', () => {
    const instance = manager.addRoot('sim-b');
    expect(instance.rootId).toBe('sim-b');
    expect(manager.getRootCount()).toBe(2);
    expect(manager.listRoots()).toContain('sim-b');
    expect(manager.listRoots()).toContain(DEFAULT_ROOT_ID);
  });

  it('TestSimulationManager_AddRoot_DuplicateReturnsExisting', () => {
    const first = manager.addRoot('sim-b');
    const second = manager.addRoot('sim-b');
    expect(first).toBe(second);
    expect(manager.getRootCount()).toBe(2);
  });

  it('TestSimulationManager_SetActiveRoot_SwitchesContext', () => {
    manager.addRoot('sim-b');
    expect(manager.activeRootId).toBe(DEFAULT_ROOT_ID);

    manager.setActiveRoot('sim-b');
    expect(manager.activeRootId).toBe('sim-b');
    expect(manager.getActiveInstance()!.rootId).toBe('sim-b');
  });

  it('TestSimulationManager_SetActiveRoot_UnknownRootNoOp', () => {
    manager.setActiveRoot('nonexistent');
    expect(manager.activeRootId).toBe(DEFAULT_ROOT_ID);
  });

  it('TestSimulationManager_RemoveRoot_DisposesInstance', () => {
    manager.addRoot('sim-b');
    expect(manager.getRootCount()).toBe(2);

    const removed = manager.removeRoot('sim-b');
    expect(removed).toBe(true);
    expect(manager.getRootCount()).toBe(1);
    expect(manager.getInstance('sim-b')).toBeUndefined();
  });

  it('TestSimulationManager_RemoveRoot_CannotRemoveDefault', () => {
    const removed = manager.removeRoot(DEFAULT_ROOT_ID);
    expect(removed).toBe(false);
    expect(manager.getRootCount()).toBe(1);
  });

  it('TestSimulationManager_RemoveActiveRoot_FallsBackToDefault', () => {
    manager.addRoot('sim-b');
    manager.setActiveRoot('sim-b');
    expect(manager.activeRootId).toBe('sim-b');

    manager.removeRoot('sim-b');
    expect(manager.activeRootId).toBe(DEFAULT_ROOT_ID);
  });

  it('TestSimulationManager_TwoRoots_IndependentState', () => {
    // Set up two roots with the same preset
    manager.loadPreset('conways-gol');
    manager.captureInitialState();

    manager.addRoot('sim-b');
    manager.setActiveRoot('sim-b');
    manager.loadPreset('conways-gol');
    manager.captureInitialState();

    // Step root B 5 times
    for (let i = 0; i < 5; i++) {
      manager.step();
    }
    const genB = manager.getGeneration();
    expect(genB).toBe(5);

    // Switch to root A (default) — should still be at gen 0
    manager.setActiveRoot(DEFAULT_ROOT_ID);
    const genA = manager.getGeneration();
    expect(genA).toBe(0);

    // Step root A 3 times
    for (let i = 0; i < 3; i++) {
      manager.step();
    }
    expect(manager.getGeneration()).toBe(3);

    // Switch back to B — should still be at 5
    manager.setActiveRoot('sim-b');
    expect(manager.getGeneration()).toBe(5);
  });

  it('TestSimulationManager_TwoRoots_IndependentTickCounts', () => {
    // Root A: load and step 2 times
    manager.loadPreset('conways-gol');
    manager.step();
    manager.step();
    const instanceA = manager.getActiveInstance()!;

    // Root B: load and step 7 times
    manager.addRoot('sim-b');
    manager.setActiveRoot('sim-b');
    manager.loadPreset('conways-gol');
    for (let i = 0; i < 7; i++) {
      manager.step();
    }
    const instanceB = manager.getActiveInstance()!;

    // Verify independent tick counts via instance getStatus
    expect(instanceA.getStatus().generation).toBe(2);
    expect(instanceB.getStatus().generation).toBe(7);
  });

  it('TestSimulationManager_EachInstance_IndependentPlaybackState', () => {
    manager.loadPreset('conways-gol');
    manager.addRoot('sim-b');
    manager.setActiveRoot('sim-b');
    manager.loadPreset('conways-gol');

    // Play root B
    manager.play();
    expect(manager.getActiveInstance()!.isRunning).toBe(true);

    // Switch to A — A should NOT be running
    manager.setActiveRoot(DEFAULT_ROOT_ID);
    const instanceA = manager.getActiveInstance()!;
    expect(instanceA.isRunning).toBe(false);

    // Pause B
    manager.setActiveRoot('sim-b');
    manager.pause();
    expect(manager.getActiveInstance()!.isRunning).toBe(false);
  });

  // --- Command routing ---

  it('TestSimulationManager_Commands_RouteToActiveRoot', async () => {
    // Load via command on default root
    await registry.execute('preset.load', { name: 'conways-gol' });

    // Add second root via command
    const addResult = await registry.execute('sim.addRoot', { rootId: 'sim-b' });
    expect(addResult.success).toBe(true);

    // Switch to sim-b via command
    const setResult = await registry.execute('sim.setRoot', { rootId: 'sim-b' });
    expect(setResult.success).toBe(true);
    expect(manager.activeRootId).toBe('sim-b');

    // List roots
    const listResult = await registry.execute('sim.listRoots', {});
    expect(listResult.success).toBe(true);
    const listData = listResult.data as { roots: string[]; activeRootId: string };
    expect(listData.roots).toContain(DEFAULT_ROOT_ID);
    expect(listData.roots).toContain('sim-b');
    expect(listData.activeRootId).toBe('sim-b');
  });

  it('TestSimulationManager_Commands_RemoveRoot', async () => {
    await registry.execute('sim.addRoot', { rootId: 'sim-b' });
    const result = await registry.execute('sim.removeRoot', { rootId: 'sim-b' });
    expect(result.success).toBe(true);
    const removeData = result.data as { roots: string[] };
    expect(removeData.roots).toEqual([DEFAULT_ROOT_ID]);
  });

  it('TestSimulationManager_Commands_CannotRemoveDefault', async () => {
    const result = await registry.execute('sim.removeRoot', { rootId: DEFAULT_ROOT_ID });
    expect(result.success).toBe(false);
  });

  it('TestSimulationManager_Commands_SetUnknownRoot', async () => {
    const result = await registry.execute('sim.setRoot', { rootId: 'nonexistent' });
    expect(result.success).toBe(false);
  });

  // --- Store sync ---

  it('TestSimulationManager_StoreSync_ActiveRootId', async () => {
    await registry.execute('sim.addRoot', { rootId: 'sim-b' });
    expect(useSimStore.getState().rootIds).toContain('sim-b');

    await registry.execute('sim.setRoot', { rootId: 'sim-b' });
    expect(useSimStore.getState().activeRootId).toBe('sim-b');
  });

  it('TestSimulationManager_StoreSync_RemoveRoot', async () => {
    await registry.execute('sim.addRoot', { rootId: 'sim-b' });
    expect(useSimStore.getState().rootIds).toContain('sim-b');

    await registry.execute('sim.removeRoot', { rootId: 'sim-b' });
    expect(useSimStore.getState().rootIds).not.toContain('sim-b');
  });

  // --- Dispose ---

  it('TestSimulationManager_Dispose_CleansUpAllInstances', () => {
    manager.addRoot('sim-b');
    manager.addRoot('sim-c');
    expect(manager.getRootCount()).toBe(3);

    manager.dispose();

    // After dispose, default is re-created for potential reuse
    expect(manager.getRootCount()).toBe(1);
    expect(manager.activeRootId).toBe(DEFAULT_ROOT_ID);
  });
});
