import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useSimStore } from '@/store/simStore';
import { commandRegistry } from '@/commands/CommandRegistry';
import { SimulationController } from '@/commands/SimulationController';
import { EventBus } from '@/engine/core/EventBus';
import { registerAllCommands } from '@/commands/definitions';

/**
 * ControlBar component tests.
 *
 * Tests the command invocations that ControlBar triggers.
 * Full DOM rendering deferred to manual browser testing due to jsdom limitations.
 */
describe('ControlBar Component', () => {
  let bus: EventBus;
  let controller: SimulationController;

  beforeEach(() => {
    bus = new EventBus();
    controller = new SimulationController(bus, 10000);
    commandRegistry.clear();
    registerAllCommands(commandRegistry, controller, bus);
    controller.loadPreset('conways-gol');

    useSimStore.setState({
      generation: 0,
      isRunning: false,
      activePreset: null,
      gridWidth: 0,
      gridHeight: 0,
      liveCellCount: 0,
      speed: 10,
    });
  });

  afterEach(() => {
    controller.dispose();
    commandRegistry.clear();
    bus.clear();
  });

  it('TestControlBar_ComponentExports', async () => {
    const mod = await import('../ControlBar');
    expect(typeof mod.ControlBar).toBe('function');
  });

  it('TestControlBar_SimPlayCommand_Works', async () => {
    const result = await commandRegistry.execute('sim.play', {});
    expect(result.success).toBe(true);
    expect(controller.isPlaying()).toBe(true);
    controller.pause();
  });

  it('TestControlBar_SimPauseCommand_Works', async () => {
    controller.play();
    const result = await commandRegistry.execute('sim.pause', {});
    expect(result.success).toBe(true);
    expect(controller.isPlaying()).toBe(false);
  });

  it('TestControlBar_SimStepCommand_Works', async () => {
    const result = await commandRegistry.execute('sim.step', {});
    expect(result.success).toBe(true);
    expect(controller.getGeneration()).toBe(1);
  });

  it('TestControlBar_SimStepBackCommand_Works', async () => {
    controller.step();
    controller.step();
    const result = await commandRegistry.execute('sim.stepBack', {});
    expect(result.success).toBe(true);
    expect(controller.getGeneration()).toBe(1);
  });

  it('TestControlBar_SimResetCommand_Works', async () => {
    controller.step();
    const result = await commandRegistry.execute('sim.reset', {});
    expect(result.success).toBe(true);
    expect(controller.getGeneration()).toBe(0);
  });

  it('TestControlBar_SimClearCommand_Works', async () => {
    const result = await commandRegistry.execute('sim.clear', {});
    expect(result.success).toBe(true);
    // All cells should be 0
    const sim = controller.getSimulation()!;
    const buffer = sim.grid.getCurrentBuffer('alive');
    expect(buffer.every((v) => v === 0)).toBe(true);
  });

  it('TestControlBar_SpeedCommand_Works', async () => {
    const result = await commandRegistry.execute('sim.speed', { fps: 30 });
    expect(result.success).toBe(true);
    expect(controller.getTickIntervalMs()).toBe(33);
  });
});
