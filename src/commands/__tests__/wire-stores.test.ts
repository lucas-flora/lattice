import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../engine/core/EventBus';
import { wireStores } from '../wireStores';
import { useSimStore } from '../../store/simStore';
import { useViewStore } from '../../store/viewStore';
import { useUiStore } from '../../store/uiStore';
import { useLayoutStore } from '../../store/layoutStore';

describe('wireStores', () => {
  let bus: EventBus;
  let unsubscribe: () => void;

  beforeEach(() => {
    bus = new EventBus();
    unsubscribe = wireStores(bus);

    // Reset all stores to defaults
    useSimStore.setState({
      generation: 0,
      isRunning: false,
      activePreset: null,
      gridWidth: 0,
      gridHeight: 0,
      liveCellCount: 0,
      speed: 10,
    });
    useViewStore.setState({ zoom: 1, cameraX: 0, cameraY: 0 });
    useLayoutStore.setState({ isTerminalOpen: false, isParamPanelOpen: false });
    useUiStore.setState({ brushSize: 1 });
  });

  afterEach(() => {
    unsubscribe();
    bus.clear();
  });

  it('TestWireStores_SimTick_UpdatesGeneration', () => {
    bus.emit('sim:tick', { generation: 42, liveCellCount: 100 });
    expect(useSimStore.getState().generation).toBe(42);
  });

  it('TestWireStores_SimTick_UpdatesLiveCellCount', () => {
    bus.emit('sim:tick', { generation: 1, liveCellCount: 250 });
    expect(useSimStore.getState().liveCellCount).toBe(250);
  });

  it('TestWireStores_SimPlay_SetsIsRunning', () => {
    bus.emit('sim:play', {});
    expect(useSimStore.getState().isRunning).toBe(true);
  });

  it('TestWireStores_SimPause_ClearsIsRunning', () => {
    useSimStore.setState({ isRunning: true });
    bus.emit('sim:pause', {});
    expect(useSimStore.getState().isRunning).toBe(false);
  });

  it('TestWireStores_SimPresetLoaded_UpdatesPresetInfo', () => {
    bus.emit('sim:presetLoaded', { name: 'test-preset', width: 256, height: 256 });
    const state = useSimStore.getState();
    expect(state.activePreset).toBe('test-preset');
    expect(state.gridWidth).toBe(256);
    expect(state.gridHeight).toBe(256);
  });

  it('TestWireStores_SimReset_ResetsState', () => {
    useSimStore.setState({ generation: 100, isRunning: true, liveCellCount: 500 });
    bus.emit('sim:reset', {});
    const state = useSimStore.getState();
    expect(state.generation).toBe(0);
    expect(state.isRunning).toBe(false);
    expect(state.liveCellCount).toBe(0);
  });

  it('TestWireStores_SimSpeedChange_UpdatesSpeed', () => {
    bus.emit('sim:speedChange', { fps: 30 });
    expect(useSimStore.getState().speed).toBe(30);
  });

  it('TestWireStores_SimClear_ResetsLiveCellCount', () => {
    useSimStore.setState({ liveCellCount: 500 });
    bus.emit('sim:clear', {});
    expect(useSimStore.getState().liveCellCount).toBe(0);
  });

  it('TestWireStores_ViewChange_UpdatesViewStore', () => {
    bus.emit('view:change', { zoom: 3.5 });
    expect(useViewStore.getState().zoom).toBe(3.5);

    bus.emit('view:change', { cameraX: 10, cameraY: 20 });
    expect(useViewStore.getState().cameraX).toBe(10);
    expect(useViewStore.getState().cameraY).toBe(20);
    // zoom should still be 3.5 from prior emit
    expect(useViewStore.getState().zoom).toBe(3.5);
  });

  it('TestWireStores_UiChange_UpdatesLayoutStore', () => {
    bus.emit('ui:change', { isTerminalOpen: true });
    expect(useLayoutStore.getState().isTerminalOpen).toBe(true);
    expect(useLayoutStore.getState().isParamPanelOpen).toBe(false);

    bus.emit('ui:change', { isParamPanelOpen: true });
    expect(useLayoutStore.getState().isParamPanelOpen).toBe(true);
  });

  it('TestWireStores_AllStoresReactive_EventSequence', () => {
    // Emit a sequence of events and verify all stores update correctly
    // This is Success Criterion #4

    const eventLog: string[] = [];

    // Track store changes via subscriptions
    const unsubSim = useSimStore.subscribe(
      (state) => state.generation,
      (gen) => eventLog.push(`sim:generation=${gen}`),
    );
    const unsubRunning = useSimStore.subscribe(
      (state) => state.isRunning,
      (running) => eventLog.push(`sim:isRunning=${running}`),
    );
    const unsubView = useViewStore.subscribe(
      (state) => state.zoom,
      (zoom) => eventLog.push(`view:zoom=${zoom}`),
    );
    const unsubUi = useLayoutStore.subscribe(
      (state) => state.isTerminalOpen,
      (open) => eventLog.push(`ui:terminal=${open}`),
    );

    // Emit events in sequence
    bus.emit('sim:presetLoaded', { name: 'gol', width: 64, height: 64 });
    bus.emit('sim:play', {});
    bus.emit('sim:tick', { generation: 1, liveCellCount: 50 });
    bus.emit('sim:tick', { generation: 2, liveCellCount: 60 });
    bus.emit('view:change', { zoom: 2 });
    bus.emit('ui:change', { isTerminalOpen: true });
    bus.emit('sim:pause', {});

    // Verify the sequence
    expect(eventLog).toContain('sim:isRunning=true');
    expect(eventLog).toContain('sim:generation=1');
    expect(eventLog).toContain('sim:generation=2');
    expect(eventLog).toContain('view:zoom=2');
    expect(eventLog).toContain('ui:terminal=true');
    expect(eventLog).toContain('sim:isRunning=false');

    // Verify final store states
    expect(useSimStore.getState().generation).toBe(2);
    expect(useSimStore.getState().isRunning).toBe(false);
    expect(useSimStore.getState().activePreset).toBe('gol');
    expect(useSimStore.getState().liveCellCount).toBe(60);
    expect(useViewStore.getState().zoom).toBe(2);
    expect(useLayoutStore.getState().isTerminalOpen).toBe(true);

    unsubSim();
    unsubRunning();
    unsubView();
    unsubUi();
  });

  it('TestWireStores_Unsubscribe_StopsUpdates', () => {
    // Emit an event -- store should update
    bus.emit('sim:tick', { generation: 10, liveCellCount: 100 });
    expect(useSimStore.getState().generation).toBe(10);

    // Unsubscribe
    unsubscribe();

    // Emit another event -- store should NOT update
    bus.emit('sim:tick', { generation: 99, liveCellCount: 200 });
    expect(useSimStore.getState().generation).toBe(10);
  });
});
