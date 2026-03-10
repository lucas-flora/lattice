import { describe, it, expect } from 'vitest';
import { handleMessage, createInitialState } from '../protocol';
import type { WorkerInMessage, WorkerState } from '../protocol';

describe('createInitialState', () => {
  it('TestWorkerState_InitializesWithZeroGeneration', () => {
    const state = createInitialState();
    expect(state.generation).toBe(0);
    expect(state.isRunning).toBe(false);
  });
});

describe('handleMessage', () => {
  it('TestWorkerHandler_InitResetsGeneration', () => {
    const state: WorkerState = { generation: 42, isRunning: true };
    const msg: WorkerInMessage = { type: 'init' };

    const [response, newState] = handleMessage(msg, state);

    expect(response).not.toBeNull();
    expect(response!.type).toBe('initialized');
    if (response!.type === 'initialized') {
      expect(response!.generation).toBe(0);
    }
    expect(newState.generation).toBe(0);
    expect(newState.isRunning).toBe(false);
  });

  it('TestWorkerHandler_TickIncrementsGeneration', () => {
    const state = createInitialState();
    const msg: WorkerInMessage = { type: 'tick' };

    const [response, newState] = handleMessage(msg, state);

    expect(response).not.toBeNull();
    expect(response!.type).toBe('tick-result');
    if (response!.type === 'tick-result') {
      expect(response!.generation).toBe(1);
      expect(response!.timestamp).toBeGreaterThan(0);
    }
    expect(newState.generation).toBe(1);
    expect(newState.isRunning).toBe(true);
  });

  it('TestWorkerHandler_TickReturnsTimestamp', () => {
    const state = createInitialState();
    const msg: WorkerInMessage = { type: 'tick' };

    const before = Date.now();
    const [response] = handleMessage(msg, state);
    const after = Date.now();

    expect(response).not.toBeNull();
    if (response!.type === 'tick-result') {
      expect(response!.timestamp).toBeGreaterThanOrEqual(before);
      expect(response!.timestamp).toBeLessThanOrEqual(after);
    }
  });

  it('TestWorkerHandler_StopReturnsNull', () => {
    const state: WorkerState = { generation: 10, isRunning: true };
    const msg: WorkerInMessage = { type: 'stop' };

    const [response, newState] = handleMessage(msg, state);

    expect(response).toBeNull();
    expect(newState.isRunning).toBe(false);
    expect(newState.generation).toBe(10); // generation preserved
  });

  it('TestWorkerHandler_SequentialTicksIncrementCorrectly', () => {
    let state = createInitialState();
    const tickMsg: WorkerInMessage = { type: 'tick' };

    for (let i = 1; i <= 5; i++) {
      const [response, newState] = handleMessage(tickMsg, state);
      state = newState;

      expect(response).not.toBeNull();
      if (response!.type === 'tick-result') {
        expect(response!.generation).toBe(i);
      }
      expect(state.generation).toBe(i);
    }
  });

  it('TestWorkerHandler_InitAfterTicksResetsGeneration', () => {
    let state = createInitialState();
    const tickMsg: WorkerInMessage = { type: 'tick' };
    const initMsg: WorkerInMessage = { type: 'init' };

    // Tick 5 times
    for (let i = 0; i < 5; i++) {
      const [, newState] = handleMessage(tickMsg, state);
      state = newState;
    }
    expect(state.generation).toBe(5);

    // Init should reset
    const [response, newState] = handleMessage(initMsg, state);
    expect(response).not.toBeNull();
    if (response!.type === 'initialized') {
      expect(response!.generation).toBe(0);
    }
    expect(newState.generation).toBe(0);
    expect(newState.isRunning).toBe(false);
  });
});
