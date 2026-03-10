import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../EventBus';
import type { EngineEventMap } from '../EventBus';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('TestEventBus_EmitsTypedEvents', () => {
    const handler = vi.fn();
    bus.on('sim:tick', handler);
    bus.emit('sim:tick', { generation: 42, liveCellCount: 10 });
    expect(handler).toHaveBeenCalledWith({ generation: 42, liveCellCount: 10 });
  });

  it('TestEventBus_MultipleListeners', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    bus.on('sim:tick', handler1);
    bus.on('sim:tick', handler2);
    bus.emit('sim:tick', { generation: 1, liveCellCount: 0 });
    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
  });

  it('TestEventBus_OffRemovesListener', () => {
    const handler = vi.fn();
    bus.on('sim:tick', handler);
    bus.off('sim:tick', handler);
    bus.emit('sim:tick', { generation: 1, liveCellCount: 0 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('TestEventBus_DifferentEvents_NoLeaking', () => {
    const tickHandler = vi.fn();
    const pauseHandler = vi.fn();
    bus.on('sim:tick', tickHandler);
    bus.on('sim:pause', pauseHandler);
    bus.emit('sim:tick', { generation: 1, liveCellCount: 0 });
    expect(tickHandler).toHaveBeenCalledOnce();
    expect(pauseHandler).not.toHaveBeenCalled();
  });

  it('TestEventBus_EmitWithNoListeners_NoError', () => {
    // Should not throw even with no listeners registered
    expect(() => bus.emit('sim:tick', { generation: 1, liveCellCount: 0 })).not.toThrow();
  });

  it('TestEventBus_TypeSafety_PayloadMatchesEventMap', () => {
    // This test verifies type-safe event payloads at compile time
    // The test passes if it compiles — type errors would be caught by tsc

    const tickHandler = (payload: EngineEventMap['sim:tick']) => {
      expect(typeof payload.generation).toBe('number');
      expect(typeof payload.liveCellCount).toBe('number');
    };

    const presetHandler = (payload: EngineEventMap['sim:presetLoaded']) => {
      expect(typeof payload.name).toBe('string');
      expect(typeof payload.width).toBe('number');
      expect(typeof payload.height).toBe('number');
    };

    bus.on('sim:tick', tickHandler);
    bus.on('sim:presetLoaded', presetHandler);

    bus.emit('sim:tick', { generation: 5, liveCellCount: 3 });
    bus.emit('sim:presetLoaded', { name: 'test', width: 10, height: 10 });
  });

  it('TestEventBus_Clear_RemovesAllListeners', () => {
    const handler = vi.fn();
    bus.on('sim:tick', handler);
    bus.on('sim:pause', handler);
    bus.clear();
    bus.emit('sim:tick', { generation: 1, liveCellCount: 0 });
    bus.emit('sim:pause', {});
    expect(handler).not.toHaveBeenCalled();
  });

  it('TestEventBus_ListenerCount', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    expect(bus.listenerCount('sim:tick')).toBe(0);
    bus.on('sim:tick', h1);
    expect(bus.listenerCount('sim:tick')).toBe(1);
    bus.on('sim:tick', h2);
    expect(bus.listenerCount('sim:tick')).toBe(2);
    bus.off('sim:tick', h1);
    expect(bus.listenerCount('sim:tick')).toBe(1);
  });

  it('TestEventBus_OffNonExistentListener_NoError', () => {
    const handler = vi.fn();
    // Should not throw even when removing a listener that was never added
    expect(() => bus.off('sim:tick', handler)).not.toThrow();
  });

  it('TestEventBus_AllEventTypes', () => {
    // Verify all event types in EngineEventMap can be emitted
    const handlers = {
      tick: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      reset: vi.fn(),
      presetLoaded: vi.fn(),
      viewChange: vi.fn(),
      uiChange: vi.fn(),
      editUndo: vi.fn(),
      editRedo: vi.fn(),
    };

    bus.on('sim:tick', handlers.tick);
    bus.on('sim:play', handlers.play);
    bus.on('sim:pause', handlers.pause);
    bus.on('sim:reset', handlers.reset);
    bus.on('sim:presetLoaded', handlers.presetLoaded);
    bus.on('view:change', handlers.viewChange);
    bus.on('ui:change', handlers.uiChange);
    bus.on('edit:undo', handlers.editUndo);
    bus.on('edit:redo', handlers.editRedo);

    bus.emit('sim:tick', { generation: 1, liveCellCount: 0 });
    bus.emit('sim:play', {});
    bus.emit('sim:pause', {});
    bus.emit('sim:reset', {});
    bus.emit('sim:presetLoaded', { name: 'gol', width: 64, height: 64 });
    bus.emit('view:change', { zoom: 2.5 });
    bus.emit('ui:change', { isTerminalOpen: true });
    bus.emit('edit:undo', {});
    bus.emit('edit:redo', {});

    for (const handler of Object.values(handlers)) {
      expect(handler).toHaveBeenCalledOnce();
    }
  });
});
