/**
 * Integration tests for Phase 6: Surfaces.
 *
 * Tests the full pipeline with extended commands, including
 * draw/erase, preset listing, and simulation status.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../src/engine/core/EventBus';
import { CommandRegistry } from '../../src/commands/CommandRegistry';
import { SimulationController } from '../../src/commands/SimulationController';
import { registerAllCommands } from '../../src/commands/definitions';
import { wireStores } from '../../src/commands/wireStores';
import { useSimStore } from '../../src/store/simStore';
import { useUiStore } from '../../src/store/uiStore';

describe('Surfaces Integration', () => {
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
    useUiStore.setState({ isTerminalOpen: false, isParamPanelOpen: false, brushSize: 1 });
  });

  afterEach(() => {
    unwire();
    controller.dispose();
    registry.clear();
    bus.clear();
  });

  it('TestSurfaces_CommandRegistryFullyWired', () => {
    const commands = registry.list().map((c) => c.name);
    expect(commands).toContain('sim.play');
    expect(commands).toContain('sim.pause');
    expect(commands).toContain('sim.step');
    expect(commands).toContain('sim.stepBack');
    expect(commands).toContain('sim.reset');
    expect(commands).toContain('sim.clear');
    expect(commands).toContain('sim.speed');
    expect(commands).toContain('sim.seek');
    expect(commands).toContain('sim.status');
    expect(commands).toContain('preset.load');
    expect(commands).toContain('preset.list');
    expect(commands).toContain('edit.draw');
    expect(commands).toContain('edit.erase');
    expect(commands).toContain('edit.brushSize');
    expect(commands).toContain('edit.undo');
    expect(commands).toContain('edit.redo');
    expect(commands).toContain('view.zoom');
    expect(commands).toContain('view.pan');
    expect(commands).toContain('view.fit');
    expect(commands).toContain('ui.toggleTerminal');
    expect(commands).toContain('ui.toggleParamPanel');
    expect(commands).toContain('view.split');
    expect(commands).toContain('view.fullscreen');
    expect(commands.length).toBe(23);
  });

  it('TestSurfaces_SimPlayPause_ViaRegistry', async () => {
    await registry.execute('preset.load', { name: 'conways-gol' });
    await registry.execute('sim.play', {});
    expect(useSimStore.getState().isRunning).toBe(true);

    await registry.execute('sim.pause', {});
    expect(useSimStore.getState().isRunning).toBe(false);
  });

  it('TestSurfaces_PresetLoad_ViaRegistry', async () => {
    await registry.execute('preset.load', { name: 'conways-gol' });
    expect(useSimStore.getState().activePreset).toBeTruthy();
    expect(useSimStore.getState().gridWidth).toBe(128);

    await registry.execute('preset.load', { name: 'rule-110' });
    expect(useSimStore.getState().gridWidth).toBe(256);
  });

  it('TestSurfaces_EditDraw_ViaRegistry', async () => {
    await registry.execute('preset.load', { name: 'conways-gol' });
    const result = await registry.execute('edit.draw', { x: 10, y: 10 });
    expect(result.success).toBe(true);

    const sim = controller.getSimulation()!;
    const index = sim.grid.coordToIndex(10, 10, 0);
    expect(sim.getCellDirect('alive', index)).toBe(1);
  });

  it('TestSurfaces_EditUndo_RevertsDraw', async () => {
    await registry.execute('preset.load', { name: 'conways-gol' });
    await registry.execute('edit.draw', { x: 10, y: 10 });

    const sim = controller.getSimulation()!;
    const index = sim.grid.coordToIndex(10, 10, 0);
    expect(sim.getCellDirect('alive', index)).toBe(1);

    await registry.execute('edit.undo', {});
    expect(sim.getCellDirect('alive', index)).toBe(0);
  });

  it('TestSurfaces_SimStatus_ReturnsState', async () => {
    await registry.execute('preset.load', { name: 'conways-gol' });
    await registry.execute('sim.step', {});

    const result = await registry.execute('sim.status', {});
    expect(result.success).toBe(true);
    const data = result.data as { generation: number; liveCellCount: number; isRunning: boolean; activePreset: string };
    expect(data.generation).toBe(1);
    expect(data.activePreset).toBe("Conway's Game of Life");
    expect(data.isRunning).toBe(false);
    expect(typeof data.liveCellCount).toBe('number');
  });
});
