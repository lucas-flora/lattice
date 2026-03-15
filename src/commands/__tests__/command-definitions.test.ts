import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../engine/core/EventBus';
import { CommandRegistry } from '../CommandRegistry';
import { SimulationController } from '../SimulationController';
import { registerAllCommands } from '../definitions';
import { Simulation } from '../../engine/rule/Simulation';
import { loadBuiltinPreset } from '../../engine/preset/builtinPresets';
import { useUiStore } from '../../store/uiStore';
import { useLayoutStore } from '../../store/layoutStore';
import { useViewStore } from '../../store/viewStore';

describe('Command Definitions', () => {
  let bus: EventBus;
  let registry: CommandRegistry;
  let controller: SimulationController;

  beforeEach(() => {
    bus = new EventBus();
    registry = new CommandRegistry();
    controller = new SimulationController(bus, 10000);
    registerAllCommands(registry, controller, bus);

    // Reset store state
    useLayoutStore.setState({ isTerminalOpen: false, isParamPanelOpen: false });
    useUiStore.setState({ brushSize: 1 });
    useViewStore.setState({ zoom: 1, cameraX: 0, cameraY: 0 });
  });

  afterEach(() => {
    controller.dispose();
    registry.clear();
    bus.clear();
  });

  it('TestCommandDefinitions_AllCommandsRegistered', () => {
    const list = registry.list();
    const names = list.map((c) => c.name);

    // Original Phase 5 commands
    expect(names).toContain('sim.play');
    expect(names).toContain('sim.pause');
    expect(names).toContain('sim.step');
    expect(names).toContain('sim.reset');
    expect(names).toContain('preset.load');
    expect(names).toContain('view.zoom');
    expect(names).toContain('view.pan');
    expect(names).toContain('view.fit');
    expect(names).toContain('edit.undo');
    expect(names).toContain('edit.redo');
    expect(names).toContain('ui.toggleTerminal');
    expect(names).toContain('ui.toggleParamPanel');

    // Phase 6 new commands
    expect(names).toContain('sim.stepBack');
    expect(names).toContain('sim.clear');
    expect(names).toContain('sim.speed');
    expect(names).toContain('sim.seek');
    expect(names).toContain('sim.status');
    expect(names).toContain('edit.draw');
    expect(names).toContain('edit.erase');
    expect(names).toContain('edit.brushSize');
    expect(names).toContain('preset.list');

    // Phase 9 new commands
    expect(names).toContain('view.split');
    expect(names).toContain('view.fullscreen');

    // Phase 10 new commands
    expect(names).toContain('sim.playToggle');
    expect(names).toContain('ui.toggleHotkeyHelp');
    expect(names).toContain('viewport.screenshot');

    // Parameter controls commands
    expect(names).toContain('param.set');
    expect(names).toContain('param.get');
    expect(names).toContain('param.list');
    expect(names).toContain('param.reset');
    expect(names).toContain('grid.resize');
    expect(names).toContain('grid.info');
    expect(names).toContain('rule.show');
    expect(names).toContain('rule.edit');
    expect(names).toContain('view.gridLines');

    // Timeline / playback
    expect(names).toContain('sim.setDuration');

    // Phase 2 new commands
    expect(names).toContain('ui.toggleLeftDrawer');

    expect(list.length).toBe(64);
  });

  it('TestCommandDefinitions_SimPlay_StartsSimulation', async () => {
    controller.loadPreset('conways-gol');
    const result = await registry.execute('sim.play', {});
    expect(result.success).toBe(true);
    expect(controller.isPlaying()).toBe(true);
    controller.pause(); // cleanup
  });

  it('TestCommandDefinitions_SimPause_StopsSimulation', async () => {
    controller.loadPreset('conways-gol');
    controller.play();
    const result = await registry.execute('sim.pause', {});
    expect(result.success).toBe(true);
    expect(controller.isPlaying()).toBe(false);
  });

  it('TestCommandDefinitions_SimStep_AdvancesOneGeneration', async () => {
    controller.loadPreset('conways-gol');
    expect(controller.getGeneration()).toBe(0);
    const result = await registry.execute('sim.step', {});
    expect(result.success).toBe(true);
    expect(controller.getGeneration()).toBe(1);
  });

  it('TestCommandDefinitions_SimReset_ResetsSimulation', async () => {
    controller.loadPreset('conways-gol');
    controller.step();
    controller.step();
    expect(controller.getGeneration()).toBe(2);
    const result = await registry.execute('sim.reset', {});
    expect(result.success).toBe(true);
    expect(controller.getGeneration()).toBe(0);
  });

  it('TestCommandDefinitions_PresetLoad_LoadsPreset', async () => {
    const result = await registry.execute('preset.load', { name: 'conways-gol' });
    expect(result.success).toBe(true);
    expect(controller.getSimulation()).not.toBeNull();
  });

  it('TestCommandDefinitions_PresetLoad_InvalidParams_ReturnsError', async () => {
    const result = await registry.execute('preset.load', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid params');
  });

  it('TestCommandDefinitions_AllCommandsHaveMetadata', () => {
    const list = registry.list();
    for (const entry of list) {
      expect(entry.name).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(entry.category).toBeTruthy();
      expect(entry.paramsDescription).toBeTruthy();
    }
  });

  it('TestCommandDefinitions_CommandVsDirectCall_IdenticalState', async () => {
    // Load same preset into both the registry-controlled simulation and a direct simulation
    const config = loadBuiltinPreset('conways-gol');

    // Set up via registry
    await registry.execute('preset.load', { name: 'conways-gol' });
    await registry.execute('sim.step', {});
    const registryGeneration = controller.getGeneration();
    const registryBuffer = controller.getSimulation()!.grid.getCurrentBuffer('alive');

    // Direct engine call
    const directSim = new Simulation(config);
    directSim.tick();
    const directGeneration = directSim.getGeneration();
    const directBuffer = directSim.grid.getCurrentBuffer('alive');

    // They must be identical (Success Criterion #3)
    expect(registryGeneration).toBe(directGeneration);
    expect(registryGeneration).toBe(1);

    // Compare grid buffers
    expect(registryBuffer.length).toBe(directBuffer.length);
    for (let i = 0; i < registryBuffer.length; i++) {
      expect(registryBuffer[i]).toBe(directBuffer[i]);
    }
  });

  it('TestCommandDefinitions_ViewZoom_UpdatesViewStore', async () => {
    const result = await registry.execute('view.zoom', { level: 2.5 });
    expect(result.success).toBe(true);
    expect(useViewStore.getState().zoom).toBe(2.5);
  });

  it('TestCommandDefinitions_ViewPan_UpdatesViewStore', async () => {
    const result = await registry.execute('view.pan', { x: 10, y: 20 });
    expect(result.success).toBe(true);
    expect(useViewStore.getState().cameraX).toBe(10);
    expect(useViewStore.getState().cameraY).toBe(20);
  });

  it('TestCommandDefinitions_UiToggleTerminal', async () => {
    expect(useLayoutStore.getState().isTerminalOpen).toBe(false);
    await registry.execute('ui.toggleTerminal', {});
    expect(useLayoutStore.getState().isTerminalOpen).toBe(true);
    await registry.execute('ui.toggleTerminal', {});
    expect(useLayoutStore.getState().isTerminalOpen).toBe(false);
  });

  it('TestCommandDefinitions_UiToggleParamPanel', async () => {
    expect(useLayoutStore.getState().isParamPanelOpen).toBe(false);
    await registry.execute('ui.toggleParamPanel', {});
    expect(useLayoutStore.getState().isParamPanelOpen).toBe(true);
    await registry.execute('ui.toggleParamPanel', {});
    expect(useLayoutStore.getState().isParamPanelOpen).toBe(false);
  });
});
