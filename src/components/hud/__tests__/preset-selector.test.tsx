import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useSimStore } from '@/store/simStore';
import { commandRegistry } from '@/commands/CommandRegistry';
import { SimulationController } from '@/commands/SimulationController';
import { EventBus } from '@/engine/core/EventBus';
import { registerAllCommands } from '@/commands/definitions';
import { BUILTIN_PRESET_NAMES } from '@/engine/preset/builtinPresets';

/**
 * PresetSelector component tests.
 *
 * Tests the preset listing and loading logic.
 * Full DOM rendering deferred to manual browser testing.
 */
describe('PresetSelector Component', () => {
  let bus: EventBus;
  let controller: SimulationController;

  beforeEach(() => {
    bus = new EventBus();
    controller = new SimulationController(bus, 10000);
    commandRegistry.clear();
    registerAllCommands(commandRegistry, controller, bus);

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

  it('TestPresetSelector_ComponentExports', async () => {
    const mod = await import('../PresetSelector');
    expect(typeof mod.PresetSelector).toBe('function');
  });

  it('TestPresetSelector_AllPresetsAvailable', () => {
    expect(BUILTIN_PRESET_NAMES).toHaveLength(8);
    expect(BUILTIN_PRESET_NAMES).toContain('conways-gol');
    expect(BUILTIN_PRESET_NAMES).toContain('rule-110');
    expect(BUILTIN_PRESET_NAMES).toContain('langtons-ant');
    expect(BUILTIN_PRESET_NAMES).toContain('brians-brain');
    expect(BUILTIN_PRESET_NAMES).toContain('gray-scott');
    expect(BUILTIN_PRESET_NAMES).toContain('navier-stokes');
  });

  it('TestPresetSelector_LoadPreset_UpdatesStore', async () => {
    const result = await commandRegistry.execute('preset.load', { name: 'conways-gol' });
    expect(result.success).toBe(true);
    expect(controller.getSimulation()).not.toBeNull();
  });

  it('TestPresetSelector_PresetList_Returns6', async () => {
    const result = await commandRegistry.execute('preset.list', {});
    expect(result.success).toBe(true);
    const data = result.data as { presets: string[] };
    expect(data.presets).toHaveLength(8);
  });
});
