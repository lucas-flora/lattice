/**
 * Integration tests for Phase 2: Cell Panel.
 *
 * Tests cell property flow from preset load through EventBus/wireStores
 * to simStore, and left drawer toggle via command system.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../src/engine/core/EventBus';
import { CommandRegistry } from '../../src/commands/CommandRegistry';
import { SimulationController } from '../../src/commands/SimulationController';
import { registerAllCommands } from '../../src/commands/definitions';
import { wireStores } from '../../src/commands/wireStores';
import { useSimStore } from '../../src/store/simStore';
import { useLayoutStore } from '../../src/store/layoutStore';

describe('Cell Panel Integration', () => {
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
      cellProperties: [],
    });
    useLayoutStore.setState({ isLeftDrawerOpen: false });
  });

  afterEach(() => {
    unwire();
    controller.dispose();
    registry.clear();
    bus.clear();
  });

  it('TestCellPanel_PresetLoad_PopulatesCellProperties', async () => {
    await registry.execute('preset.load', { name: 'conways-gol' });

    const { cellProperties } = useSimStore.getState();
    expect(cellProperties.length).toBeGreaterThan(0);
    expect(cellProperties[0].name).toBe('alive');
    expect(cellProperties[0].type).toBe('bool');
  });

  it('TestCellPanel_PresetSwitch_UpdatesCellProperties', async () => {
    await registry.execute('preset.load', { name: 'conways-gol' });
    expect(useSimStore.getState().cellProperties[0].name).toBe('alive');

    await registry.execute('preset.load', { name: 'brians-brain' });
    const props = useSimStore.getState().cellProperties;
    const stateP = props.find((p) => p.name === 'state');
    expect(stateP).toBeDefined();
    expect(stateP!.type).toBe('int');
  });

  it('TestCellPanel_ToggleLeftDrawer_ViaCommand', async () => {
    expect(useLayoutStore.getState().isLeftDrawerOpen).toBe(false);

    const result = await registry.execute('ui.toggleLeftDrawer', {});
    expect(result.success).toBe(true);
    expect(useLayoutStore.getState().isLeftDrawerOpen).toBe(true);

    await registry.execute('ui.toggleLeftDrawer', {});
    expect(useLayoutStore.getState().isLeftDrawerOpen).toBe(false);
  });

  it('TestCellPanel_LeftDrawerCommand_Registered', () => {
    const list = registry.list();
    const names = list.map((c) => c.name);
    expect(names).toContain('ui.toggleLeftDrawer');
  });

  it('TestCellPanel_GrayScott_MultipleCellProperties', async () => {
    await registry.execute('preset.load', { name: 'gray-scott' });

    const { cellProperties } = useSimStore.getState();
    const names = cellProperties.map((p) => p.name);
    expect(names).toContain('u');
    expect(names).toContain('v');
    expect(cellProperties.length).toBeGreaterThanOrEqual(2);
  });

  it('TestCellPanel_NavierStokes_MultipleCellProperties', async () => {
    await registry.execute('preset.load', { name: 'navier-stokes' });

    const { cellProperties } = useSimStore.getState();
    expect(cellProperties.length).toBeGreaterThanOrEqual(3);
    const names = cellProperties.map((p) => p.name);
    expect(names).toContain('density');
    expect(names).toContain('vx');
    expect(names).toContain('vy');
  });
});
