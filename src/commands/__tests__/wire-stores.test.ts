import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../engine/core/EventBus';
import { wireStores } from '../wireStores';
import { useSimStore } from '../../store/simStore';
import { useViewStore } from '../../store/viewStore';
import { useUiStore } from '../../store/uiStore';

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
    });
    useViewStore.setState({ zoom: 1, cameraX: 0, cameraY: 0 });
    useUiStore.setState({ isTerminalOpen: false, isParamPanelOpen: false });
  });

  afterEach(() => {
    unsubscribe();
    bus.clear();
  });

  it('TestWireStores_SimTick_UpdatesGeneration', () => {
    bus.emit('sim:tick', { generation: 42 });
    expect(useSimStore.getState().generation).toBe(42);
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
    useSimStore.setState({ generation: 100, isRunning: true });
    bus.emit('sim:reset', {});
    const state = useSimStore.getState();
    expect(state.generation).toBe(0);
    expect(state.isRunning).toBe(false);
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

  it('TestWireStores_UiChange_UpdatesUiStore', () => {
    bus.emit('ui:change', { isTerminalOpen: true });
    expect(useUiStore.getState().isTerminalOpen).toBe(true);
    expect(useUiStore.getState().isParamPanelOpen).toBe(false);

    bus.emit('ui:change', { isParamPanelOpen: true });
    expect(useUiStore.getState().isParamPanelOpen).toBe(true);
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
    const unsubUi = useUiStore.subscribe(
      (state) => state.isTerminalOpen,
      (open) => eventLog.push(`ui:terminal=${open}`),
    );

    // Emit events in sequence
    bus.emit('sim:presetLoaded', { name: 'gol', width: 64, height: 64 });
    bus.emit('sim:play', {});
    bus.emit('sim:tick', { generation: 1 });
    bus.emit('sim:tick', { generation: 2 });
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
    expect(useViewStore.getState().zoom).toBe(2);
    expect(useUiStore.getState().isTerminalOpen).toBe(true);

    unsubSim();
    unsubRunning();
    unsubView();
    unsubUi();
  });

  it('TestWireStores_Unsubscribe_StopsUpdates', () => {
    // Emit an event -- store should update
    bus.emit('sim:tick', { generation: 10 });
    expect(useSimStore.getState().generation).toBe(10);

    // Unsubscribe
    unsubscribe();

    // Emit another event -- store should NOT update
    bus.emit('sim:tick', { generation: 99 });
    expect(useSimStore.getState().generation).toBe(10);
  });
});
