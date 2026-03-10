/**
 * Integration tests for the Command Hub.
 *
 * Tests the full pipeline: CommandRegistry -> SimulationController -> EventBus -> Zustand stores.
 * Verifies that commands produce the correct engine state changes and store updates.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../src/engine/core/EventBus';
import { CommandRegistry } from '../../src/commands/CommandRegistry';
import { SimulationController } from '../../src/commands/SimulationController';
import { registerAllCommands } from '../../src/commands/definitions';
import { wireStores } from '../../src/commands/wireStores';
import { useSimStore } from '../../src/store/simStore';
import { useViewStore } from '../../src/store/viewStore';
import { useUiStore } from '../../src/store/uiStore';
import { Simulation } from '../../src/engine/rule/Simulation';
import { loadBuiltinPreset } from '../../src/engine/preset/builtinPresets';

describe('Command Hub Integration', () => {
  let bus: EventBus;
  let registry: CommandRegistry;
  let controller: SimulationController;
  let unwire: () => void;

  beforeEach(() => {
    bus = new EventBus();
    registry = new CommandRegistry();
    controller = new SimulationController(bus, 10000);
    registerAllCommands(registry, controller, bus);
    unwire = wireStores(bus);

    // Reset stores
    useSimStore.setState({
      generation: 0,
      isRunning: false,
      activePreset: null,
      gridWidth: 0,
      gridHeight: 0,
      liveCellCount: 0,
      speed: 10,
    });
    useViewStore.setState({ zoom: 1, cameraX: 0, cameraY: 0 });
    useUiStore.setState({ isTerminalOpen: false, isParamPanelOpen: false, brushSize: 1 });
  });

  afterEach(() => {
    unwire();
    controller.dispose();
    registry.clear();
    bus.clear();
  });

  it('TestCommandHub_ExecuteSimPlay_UpdatesStore', async () => {
    await registry.execute('preset.load', { name: 'conways-gol' });
    await registry.execute('sim.play', {});

    expect(useSimStore.getState().isRunning).toBe(true);
    expect(controller.isPlaying()).toBe(true);

    await registry.execute('sim.pause', {});
  });

  it('TestCommandHub_ExecuteSimStep_UpdatesGeneration', async () => {
    await registry.execute('preset.load', { name: 'conways-gol' });
    expect(useSimStore.getState().generation).toBe(0);

    await registry.execute('sim.step', {});
    expect(useSimStore.getState().generation).toBe(1);

    await registry.execute('sim.step', {});
    expect(useSimStore.getState().generation).toBe(2);
  });

  it('TestCommandHub_ExecutePresetLoad_UpdatesPresetInfo', async () => {
    await registry.execute('preset.load', { name: 'conways-gol' });

    const state = useSimStore.getState();
    expect(state.activePreset).toBeTruthy();
    expect(state.gridWidth).toBe(128);
    expect(state.gridHeight).toBe(128);
  });

  it('TestCommandHub_FullEventSequence', async () => {
    const events: string[] = [];

    // Record all events
    bus.on('sim:presetLoaded', () => events.push('presetLoaded'));
    bus.on('sim:play', () => events.push('play'));
    bus.on('sim:tick', () => events.push('tick'));
    bus.on('sim:pause', () => events.push('pause'));
    bus.on('sim:reset', () => events.push('reset'));

    // Execute command sequence
    await registry.execute('preset.load', { name: 'conways-gol' });
    await registry.execute('sim.play', {});
    await registry.execute('sim.step', {}); // step while playing doesn't double-tick here since interval is long
    await registry.execute('sim.pause', {});
    await registry.execute('sim.reset', {});

    // Verify event sequence
    expect(events).toEqual(['presetLoaded', 'play', 'tick', 'pause', 'reset']);

    // Verify final store state
    expect(useSimStore.getState().generation).toBe(0);
    expect(useSimStore.getState().isRunning).toBe(false);
  });

  it('TestCommandHub_CommandVsDirectEngine_IdenticalState', async () => {
    // Registry path: load preset and step via commands
    await registry.execute('preset.load', { name: 'conways-gol' });
    await registry.execute('sim.step', {});
    await registry.execute('sim.step', {});
    await registry.execute('sim.step', {});

    const registryGen = controller.getGeneration();
    const registryBuffer = controller.getSimulation()!.grid.getCurrentBuffer('alive');

    // Direct path: create same simulation and tick directly
    const config = loadBuiltinPreset('conways-gol');
    const directSim = new Simulation(config);
    directSim.tick();
    directSim.tick();
    directSim.tick();

    const directGen = directSim.getGeneration();
    const directBuffer = directSim.grid.getCurrentBuffer('alive');

    // Must be identical (Success Criterion #3)
    expect(registryGen).toBe(directGen);
    expect(registryGen).toBe(3);
    expect(registryBuffer.length).toBe(directBuffer.length);

    for (let i = 0; i < registryBuffer.length; i++) {
      expect(registryBuffer[i]).toBe(directBuffer[i]);
    }
  });
});
