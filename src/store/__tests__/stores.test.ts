import { describe, it, expect, vi } from 'vitest';
import { useSimStore } from '../simStore';
import { useViewStore } from '../viewStore';
import { useUiStore, uiStoreActions } from '../uiStore';
import { useAiStore } from '../aiStore';

describe('Zustand Stores', () => {
  it('TestSimStore_InitializesWithDefaults', () => {
    const state = useSimStore.getState();
    expect(state.generation).toBe(0);
    expect(state.isRunning).toBe(false);
    expect(state.activePreset).toBeNull();
    expect(state.gridWidth).toBe(0);
    expect(state.gridHeight).toBe(0);
    expect(state.liveCellCount).toBe(0);
    expect(state.speed).toBe(10);
  });

  it('TestViewStore_InitializesWithDefaults', () => {
    const state = useViewStore.getState();
    expect(state.zoom).toBe(1);
    expect(state.cameraX).toBe(0);
    expect(state.cameraY).toBe(0);
  });

  it('TestUiStore_InitializesWithDefaults', () => {
    const state = useUiStore.getState();
    expect(state.isTerminalOpen).toBe(false);
    expect(state.isParamPanelOpen).toBe(false);
    expect(state.brushSize).toBe(1);
    expect(state.terminalHeight).toBe(250);
    expect(state.paramPanelWidth).toBe(300);
    expect(state.terminalMode).toBe('docked');
    expect(state.paramPanelMode).toBe('docked');
  });

  it('TestUiStore_TerminalHeight_Clamps', () => {
    // Below minimum
    uiStoreActions.setTerminalHeight(50);
    expect(useUiStore.getState().terminalHeight).toBe(100);

    // Normal value
    uiStoreActions.setTerminalHeight(300);
    expect(useUiStore.getState().terminalHeight).toBe(300);

    // Above maximum (60% of window height)
    uiStoreActions.setTerminalHeight(99999);
    const maxH = window.innerHeight * 0.6;
    expect(useUiStore.getState().terminalHeight).toBe(maxH);

    // Reset
    useUiStore.setState({ terminalHeight: 250 });
  });

  it('TestUiStore_ParamPanelWidth_Clamps', () => {
    // Below minimum
    uiStoreActions.setParamPanelWidth(100);
    expect(useUiStore.getState().paramPanelWidth).toBe(200);

    // Normal value
    uiStoreActions.setParamPanelWidth(400);
    expect(useUiStore.getState().paramPanelWidth).toBe(400);

    // Above maximum (50% of window width)
    uiStoreActions.setParamPanelWidth(99999);
    const maxW = window.innerWidth * 0.5;
    expect(useUiStore.getState().paramPanelWidth).toBe(maxW);

    // Reset
    useUiStore.setState({ paramPanelWidth: 300 });
  });

  it('TestAiStore_InitializesWithDefaults', () => {
    const state = useAiStore.getState();
    expect(state.chatHistory).toEqual([]);
    expect(state.isLoading).toBe(false);
  });

  it('TestStores_SubscribeWithSelectorWorks', () => {
    const callback = vi.fn();

    // Subscribe to generation changes only
    const unsub = useSimStore.subscribe(
      (state) => state.generation,
      callback,
    );

    // Update generation
    useSimStore.setState({ generation: 42 });
    expect(callback).toHaveBeenCalledWith(42, 0);

    // Update a different field — callback should NOT fire
    callback.mockClear();
    useSimStore.setState({ isRunning: true });
    expect(callback).not.toHaveBeenCalled();

    unsub();

    // Reset state for other tests
    useSimStore.setState({ generation: 0, isRunning: false });
  });
});
