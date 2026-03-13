/**
 * Scenario tests for Phase 6: Surfaces workflows.
 *
 * Tests complete user workflows through both GUI (registry) and CLI (parsing) paths.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../src/engine/core/EventBus';
import { CommandRegistry } from '../../src/commands/CommandRegistry';
import { SimulationController } from '../../src/commands/SimulationController';
import { registerAllCommands } from '../../src/commands/definitions';
import { wireStores } from '../../src/commands/wireStores';
import { useSimStore } from '../../src/store/simStore';
import { useUiStore } from '../../src/store/uiStore';
import { useLayoutStore } from '../../src/store/layoutStore';
import { parseCommand, isCommand } from '../../src/components/terminal/commandParser';

describe('Surfaces Workflow Scenarios', () => {
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

    useSimStore.setState({
      generation: 0,
      isRunning: false,
      activePreset: null,
      gridWidth: 0,
      gridHeight: 0,
      liveCellCount: 0,
      speed: 10,
    });
    useLayoutStore.setState({ isTerminalOpen: false, isParamPanelOpen: false });
    useUiStore.setState({ brushSize: 1 });
  });

  afterEach(() => {
    unwire();
    controller.dispose();
    registry.clear();
    bus.clear();
  });

  it('TestSurfacesWorkflow_FullLifecycle', async () => {
    // 1. Load preset
    await registry.execute('preset.load', { name: 'conways-gol' });
    expect(useSimStore.getState().activePreset).toBeTruthy();

    // 2. Play
    await registry.execute('sim.play', {});
    expect(useSimStore.getState().isRunning).toBe(true);

    // 3. Step
    await registry.execute('sim.step', {});
    expect(useSimStore.getState().generation).toBeGreaterThan(0);

    // 4. Draw a cell
    await registry.execute('sim.pause', {});
    await registry.execute('edit.draw', { x: 10, y: 10 });
    const sim = controller.getSimulation()!;
    const idx = sim.grid.coordToIndex(10, 10, 0);
    expect(sim.getCellDirect('alive', idx)).toBe(1);

    // 5. Undo the draw
    await registry.execute('edit.undo', {});
    expect(sim.getCellDirect('alive', idx)).toBe(0);

    // 6. Reset
    await registry.execute('sim.reset', {});
    expect(useSimStore.getState().generation).toBe(0);
  });

  it('TestSurfacesWorkflow_PresetSwitching', async () => {
    // Load GoL
    await registry.execute('preset.load', { name: 'conways-gol' });
    await registry.execute('sim.step', {});
    expect(useSimStore.getState().generation).toBe(1);
    expect(useSimStore.getState().gridWidth).toBe(128);

    // Switch to Rule 110
    await registry.execute('preset.load', { name: 'rule-110' });
    expect(controller.getGeneration()).toBe(0);
    expect(useSimStore.getState().gridWidth).toBe(256);
  });

  it('TestSurfacesWorkflow_CLICommandParsing', async () => {
    // Parse CLI commands and execute via registry
    await registry.execute('preset.load', { name: 'conways-gol' });

    const cmds = [
      'sim play',
      'sim pause',
      'sim step',
      'sim step-back',
      'sim speed 30',
      'preset list',
      'sim status',
    ];

    for (const cmdStr of cmds) {
      const parsed = parseCommand(cmdStr, registry);
      expect(parsed).not.toBeNull();
      const result = await registry.execute(parsed!.commandName, parsed!.params);
      expect(result.success).toBe(true);
    }
  });

  it('TestSurfacesWorkflow_GUIAndCLISameResult', async () => {
    await registry.execute('preset.load', { name: 'conways-gol' });

    // Execute via "GUI" (direct registry call)
    await registry.execute('sim.step', {});
    const guiGeneration = controller.getGeneration();

    // Reset
    await registry.execute('sim.reset', {});

    // Execute via "CLI" (parsed command)
    const parsed = parseCommand('sim step', registry);
    await registry.execute(parsed!.commandName, parsed!.params);
    const cliGeneration = controller.getGeneration();

    // Both should produce gen 1
    expect(guiGeneration).toBe(1);
    expect(cliGeneration).toBe(1);
  });

  it('TestSurfacesWorkflow_AIPlaceholder', () => {
    // Non-command input should not be recognized as a command
    expect(isCommand('hello world', registry)).toBe(false);
    expect(isCommand('what is this', registry)).toBe(false);

    // Command input should be recognized
    expect(isCommand('sim play', registry)).toBe(true);
    expect(isCommand('preset load conways-gol', registry)).toBe(true);
  });
});
