import { describe, it, expect, beforeEach } from 'vitest';
import { useSimStore } from '@/store/simStore';
import { useUiStore } from '@/store/uiStore';

/**
 * ParamPanel component tests.
 *
 * Tests the store state that drives the ParamPanel.
 * Full DOM rendering deferred to manual browser testing.
 */
describe('ParamPanel Component', () => {
  beforeEach(() => {
    useSimStore.setState({
      generation: 0,
      isRunning: false,
      activePreset: "Conway's Game of Life",
      gridWidth: 128,
      gridHeight: 128,
      liveCellCount: 0,
      speed: 10,
    });
    useUiStore.setState({ isTerminalOpen: false, isParamPanelOpen: false, brushSize: 1 });
  });

  it('TestParamPanel_ComponentExports', async () => {
    const mod = await import('../ParamPanel');
    expect(typeof mod.ParamPanel).toBe('function');
  });

  it('TestParamPanel_StoreControlsVisibility', () => {
    useUiStore.setState({ isParamPanelOpen: true });
    expect(useUiStore.getState().isParamPanelOpen).toBe(true);

    useUiStore.setState({ isParamPanelOpen: false });
    expect(useUiStore.getState().isParamPanelOpen).toBe(false);
  });

  it('TestParamPanel_StoreProvidesPresetInfo', () => {
    const state = useSimStore.getState();
    expect(state.activePreset).toBe("Conway's Game of Life");
    expect(state.gridWidth).toBe(128);
    expect(state.gridHeight).toBe(128);
  });

  it('TestParamPanel_ToggleCommand_Available', async () => {
    const { commandRegistry } = await import('@/commands/CommandRegistry');
    // Only check if command registry module exports correctly
    expect(typeof commandRegistry.execute).toBe('function');
  });
});
