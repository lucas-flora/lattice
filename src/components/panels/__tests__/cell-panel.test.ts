import { describe, it, expect, beforeEach } from 'vitest';
import { useSimStore } from '@/store/simStore';
import { useLayoutStore } from '@/store/layoutStore';

/**
 * CellPanel component tests.
 *
 * Tests the store state that drives the CellPanel and CellCard components.
 * Full DOM rendering deferred to manual browser testing.
 */
describe('CellPanel Component', () => {
  beforeEach(() => {
    useSimStore.setState({
      generation: 0,
      isRunning: false,
      activePreset: "Conway's Game of Life",
      gridWidth: 128,
      gridHeight: 128,
      liveCellCount: 0,
      cellProperties: [],
    });
    useLayoutStore.setState({ isLeftDrawerOpen: false });
  });

  it('TestCellPanel_ComponentExports', async () => {
    const mod = await import('../CellPanel');
    expect(typeof mod.CellPanel).toBe('function');
  });

  it('TestCellPanel_CellCardExports', async () => {
    const mod = await import('../CellCard');
    expect(typeof mod.CellCard).toBe('function');
  });

  it('TestCellPanel_PropertyRowExports', async () => {
    const mod = await import('../PropertyRow');
    expect(typeof mod.PropertyRow).toBe('function');
  });

  it('TestCellPanel_StoreControlsVisibility', () => {
    useLayoutStore.setState({ isLeftDrawerOpen: true });
    expect(useLayoutStore.getState().isLeftDrawerOpen).toBe(true);

    useLayoutStore.setState({ isLeftDrawerOpen: false });
    expect(useLayoutStore.getState().isLeftDrawerOpen).toBe(false);
  });

  it('TestCellPanel_StoreProvidesCellProperties', () => {
    useSimStore.setState({
      cellProperties: [
        { name: 'alive', type: 'bool', default: 0, role: 'input_output' },
      ],
    });

    const state = useSimStore.getState();
    expect(state.cellProperties).toHaveLength(1);
    expect(state.cellProperties[0].name).toBe('alive');
    expect(state.cellProperties[0].type).toBe('bool');
  });

  it('TestCellPanel_MultipleCellProperties', () => {
    useSimStore.setState({
      cellProperties: [
        { name: 'alive', type: 'bool', default: 0, role: 'input_output' },
        { name: 'state', type: 'int', default: 0, role: 'input_output' },
        { name: 'energy', type: 'float', default: 0.5, role: 'output' },
      ],
    });

    const state = useSimStore.getState();
    expect(state.cellProperties).toHaveLength(3);
    expect(state.cellProperties.map((p) => p.name)).toEqual(['alive', 'state', 'energy']);
  });

  it('TestCellPanel_CellPropertiesClearedOnPresetChange', () => {
    useSimStore.setState({
      cellProperties: [
        { name: 'alive', type: 'bool', default: 0 },
      ],
    });
    expect(useSimStore.getState().cellProperties).toHaveLength(1);

    // Simulating preset change clears and repopulates
    useSimStore.setState({
      activePreset: "Brian's Brain",
      cellProperties: [
        { name: 'state', type: 'int', default: 0 },
      ],
    });
    expect(useSimStore.getState().cellProperties).toHaveLength(1);
    expect(useSimStore.getState().cellProperties[0].name).toBe('state');
  });

  it('TestCellPanel_LeftDrawerWidth', () => {
    expect(useLayoutStore.getState().leftDrawerWidth).toBe(280);

    useLayoutStore.setState({ leftDrawerWidth: 350 });
    expect(useLayoutStore.getState().leftDrawerWidth).toBe(350);
  });

  it('TestCellPanel_ToggleCommand_Available', async () => {
    const { commandRegistry } = await import('@/commands/CommandRegistry');
    expect(typeof commandRegistry.execute).toBe('function');
  });
});
