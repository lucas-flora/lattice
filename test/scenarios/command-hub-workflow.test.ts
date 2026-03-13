/**
 * Scenario tests for Command Hub workflows.
 *
 * Tests complete user workflows from initialization through preset loading,
 * simulation control, and state management -- all via the CommandRegistry.
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
import { useLayoutStore } from '../../src/store/layoutStore';

describe('Command Hub Workflow Scenarios', () => {
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
    useLayoutStore.setState({ isTerminalOpen: false, isParamPanelOpen: false });
    useUiStore.setState({ brushSize: 1 });
  });

  afterEach(() => {
    unwire();
    controller.dispose();
    registry.clear();
    bus.clear();
  });

  it('TestCommandHubWorkflow_FullLifecycle', async () => {
    // 1. Load a preset
    const loadResult = await registry.execute('preset.load', { name: 'conways-gol' });
    expect(loadResult.success).toBe(true);
    expect(useSimStore.getState().activePreset).toBeTruthy();
    expect(useSimStore.getState().gridWidth).toBe(128);

    // 2. Step forward a few generations
    await registry.execute('sim.step', {});
    await registry.execute('sim.step', {});
    await registry.execute('sim.step', {});
    expect(useSimStore.getState().generation).toBe(3);

    // 3. Start playing
    await registry.execute('sim.play', {});
    expect(useSimStore.getState().isRunning).toBe(true);

    // 4. Pause
    await registry.execute('sim.pause', {});
    expect(useSimStore.getState().isRunning).toBe(false);

    // 5. Adjust viewport
    await registry.execute('view.zoom', { level: 2.5 });
    expect(useViewStore.getState().zoom).toBe(2.5);

    await registry.execute('view.pan', { x: 50, y: 30 });
    expect(useViewStore.getState().cameraX).toBe(50);
    expect(useViewStore.getState().cameraY).toBe(30);

    // 6. Toggle UI panels
    await registry.execute('ui.toggleTerminal', {});
    expect(useLayoutStore.getState().isTerminalOpen).toBe(true);

    // 7. Reset simulation
    await registry.execute('sim.reset', {});
    expect(useSimStore.getState().generation).toBe(0);
    expect(useSimStore.getState().isRunning).toBe(false);
    // Preset info should still be present (reset doesn't unload preset)
    expect(useSimStore.getState().activePreset).toBeTruthy();
  });

  it('TestCommandHubWorkflow_MultiplePresetSwitches', async () => {
    // Load Conway's GoL
    await registry.execute('preset.load', { name: 'conways-gol' });
    await registry.execute('sim.step', {});
    await registry.execute('sim.step', {});
    expect(useSimStore.getState().generation).toBe(2);
    expect(useSimStore.getState().gridWidth).toBe(128);

    // Switch to Brian's Brain -- state should reset
    await registry.execute('preset.load', { name: 'brians-brain' });
    // After loading new preset, generation resets because new Simulation is created
    expect(controller.getGeneration()).toBe(0);
    expect(useSimStore.getState().activePreset).toBeTruthy();

    // Step the new preset
    await registry.execute('sim.step', {});
    expect(controller.getGeneration()).toBe(1);
  });

  it('TestCommandHubWorkflow_UndoRedoViaCommands', async () => {
    // Load a preset
    await registry.execute('preset.load', { name: 'conways-gol' });
    const sim = controller.getSimulation()!;
    const history = controller.getCommandHistory()!;

    // Make some cell edits via CommandHistory (not through registry -- edit commands use CommandHistory)
    history.beginCommand('Draw cell');
    history.editCell('alive', 0, 1);
    history.editCell('alive', 1, 1);
    history.commitCommand();

    // Verify edits applied
    expect(sim.getCellDirect('alive', 0)).toBe(1);
    expect(sim.getCellDirect('alive', 1)).toBe(1);

    // Undo via command
    const undoResult = await registry.execute('edit.undo', {});
    expect(undoResult.success).toBe(true);
    expect(sim.getCellDirect('alive', 0)).toBe(0);
    expect(sim.getCellDirect('alive', 1)).toBe(0);

    // Redo via command
    const redoResult = await registry.execute('edit.redo', {});
    expect(redoResult.success).toBe(true);
    expect(sim.getCellDirect('alive', 0)).toBe(1);
    expect(sim.getCellDirect('alive', 1)).toBe(1);
  });

  it('TestCommandHubWorkflow_ErrorHandling', async () => {
    // Execute unknown command
    const result1 = await registry.execute('nonexistent.cmd', {});
    expect(result1.success).toBe(false);

    // Execute with invalid params
    const result2 = await registry.execute('preset.load', {});
    expect(result2.success).toBe(false);
    expect(result2.error).toContain('Invalid params');

    // Undo with no simulation loaded
    const result3 = await registry.execute('edit.undo', {});
    expect(result3.success).toBe(false);
    expect(result3.error).toContain('No simulation');
  });

  it('TestCommandHubWorkflow_CommandListIsComplete', () => {
    const list = registry.list();

    // Every command has all required metadata
    for (const entry of list) {
      expect(entry.name).toMatch(/\./); // Dot notation
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.category.length).toBeGreaterThan(0);
      expect(entry.paramsDescription).toBeDefined();
    }

    // Categories covered
    const categories = new Set(list.map((e) => e.category));
    expect(categories).toContain('sim');
    expect(categories).toContain('preset');
    expect(categories).toContain('view');
    expect(categories).toContain('edit');
    expect(categories).toContain('ui');
  });
});
