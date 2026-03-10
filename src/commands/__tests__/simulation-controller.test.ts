import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../engine/core/EventBus';
import { SimulationController } from '../SimulationController';

describe('SimulationController', () => {
  let bus: EventBus;
  let controller: SimulationController;

  beforeEach(() => {
    bus = new EventBus();
    // Use very long tick interval to prevent auto-ticking during tests
    controller = new SimulationController(bus, 10000);
  });

  afterEach(() => {
    controller.dispose();
  });

  it('TestSimulationController_LoadPreset_CreatesSimulation', () => {
    controller.loadPreset('conways-gol');
    const sim = controller.getSimulation();
    expect(sim).not.toBeNull();
    expect(sim!.grid.config.width).toBe(128);
    expect(sim!.grid.config.height).toBe(128);
  });

  it('TestSimulationController_Play_EmitsEvent', () => {
    const handler = vi.fn();
    bus.on('sim:play', handler);

    controller.loadPreset('conways-gol');
    controller.play();

    expect(handler).toHaveBeenCalledOnce();
    expect(controller.isPlaying()).toBe(true);

    controller.pause(); // cleanup
  });

  it('TestSimulationController_Pause_EmitsEvent', () => {
    const handler = vi.fn();
    bus.on('sim:pause', handler);

    controller.loadPreset('conways-gol');
    controller.play();
    controller.pause();

    expect(handler).toHaveBeenCalledOnce();
    expect(controller.isPlaying()).toBe(false);
  });

  it('TestSimulationController_Step_AdvancesGeneration', () => {
    controller.loadPreset('conways-gol');
    expect(controller.getGeneration()).toBe(0);
    controller.step();
    expect(controller.getGeneration()).toBe(1);
    controller.step();
    expect(controller.getGeneration()).toBe(2);
  });

  it('TestSimulationController_Step_EmitsTickEvent', () => {
    const handler = vi.fn();
    bus.on('sim:tick', handler);

    controller.loadPreset('conways-gol');
    controller.step();

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ generation: 1 }));
  });

  it('TestSimulationController_Reset_ResetsGeneration', () => {
    controller.loadPreset('conways-gol');
    controller.step();
    controller.step();
    expect(controller.getGeneration()).toBe(2);
    controller.reset();
    expect(controller.getGeneration()).toBe(0);
  });

  it('TestSimulationController_Reset_EmitsEvent', () => {
    const handler = vi.fn();
    bus.on('sim:reset', handler);

    controller.loadPreset('conways-gol');
    controller.step();
    controller.reset();

    expect(handler).toHaveBeenCalledOnce();
  });

  it('TestSimulationController_PlayPause_TogglesCycle', () => {
    controller.loadPreset('conways-gol');
    expect(controller.isPlaying()).toBe(false);
    controller.play();
    expect(controller.isPlaying()).toBe(true);
    controller.pause();
    expect(controller.isPlaying()).toBe(false);
  });

  it('TestSimulationController_LoadPreset_EmitsPresetLoaded', () => {
    const handler = vi.fn();
    bus.on('sim:presetLoaded', handler);

    controller.loadPreset('conways-gol');

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.any(String),
        width: 128,
        height: 128,
      }),
    );
  });

  it('TestSimulationController_PlayWithoutPreset_NoOp', () => {
    // Should not throw
    controller.play();
    expect(controller.isPlaying()).toBe(false);
  });

  it('TestSimulationController_StepWithoutPreset_NoOp', () => {
    // Should not throw
    controller.step();
    expect(controller.getGeneration()).toBe(0);
  });

  it('TestSimulationController_GetCommandHistory', () => {
    controller.loadPreset('conways-gol');
    const history = controller.getCommandHistory();
    expect(history).not.toBeNull();
  });

  it('TestSimulationController_Dispose_StopsPlayback', () => {
    const pauseHandler = vi.fn();
    bus.on('sim:pause', pauseHandler);

    controller.loadPreset('conways-gol');
    controller.play();
    controller.dispose();

    expect(controller.isPlaying()).toBe(false);
    expect(controller.getSimulation()).toBeNull();
  });
});
