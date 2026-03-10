import { describe, it, expect, vi } from 'vitest';
import { useSimStore } from '../simStore';
import { useViewStore } from '../viewStore';
import { useUiStore } from '../uiStore';
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
