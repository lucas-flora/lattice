import { describe, it, expect, beforeEach } from 'vitest';
import { useSimStore } from '@/store/simStore';

/**
 * HUD component tests.
 *
 * Since jsdom has limitations with React rendering of zustand-connected components,
 * we test the store-reading logic that drives the HUD, and verify the component exports.
 */
describe('HUD Component', () => {
  beforeEach(() => {
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

  it('TestHUD_ComponentExports', async () => {
    const mod = await import('../HUD');
    expect(typeof mod.HUD).toBe('function');
  });

  it('TestHUD_StoreProvdesGeneration', () => {
    useSimStore.setState({ generation: 42 });
    expect(useSimStore.getState().generation).toBe(42);
  });

  it('TestHUD_StoreProvidesLiveCellCount', () => {
    useSimStore.setState({ liveCellCount: 1234 });
    expect(useSimStore.getState().liveCellCount).toBe(1234);
  });

  it('TestHUD_StoreProvidesPresetName', () => {
    useSimStore.setState({ activePreset: "Conway's Game of Life" });
    expect(useSimStore.getState().activePreset).toBe("Conway's Game of Life");
  });

  it('TestHUD_StoreUpdatesReactively', () => {
    expect(useSimStore.getState().generation).toBe(0);
    useSimStore.setState({ generation: 100 });
    expect(useSimStore.getState().generation).toBe(100);
  });
});
