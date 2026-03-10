/**
 * Type-safe Worker message protocol for the simulation engine.
 *
 * The handler logic is a pure function testable in Node.js.
 * The Worker entry point (simulation.worker.ts) wraps this with postMessage.
 */

import type { WorkerInMessage, WorkerOutMessage, WorkerState } from '../core/types';

// Re-export types for convenience
export type { WorkerInMessage, WorkerOutMessage, WorkerState };

/**
 * Create a fresh initial worker state.
 */
export function createInitialState(): WorkerState {
  return {
    generation: 0,
    isRunning: false,
  };
}

/**
 * Pure message handler for the simulation Worker.
 *
 * Takes a message and current state, returns a response and updated state.
 * This is the testable core of the Worker — no side effects.
 *
 * @returns [response, newState] — response is null if no reply needed
 */
export function handleMessage(
  msg: WorkerInMessage,
  state: WorkerState,
): [WorkerOutMessage | null, WorkerState] {
  switch (msg.type) {
    case 'init': {
      const newState: WorkerState = { generation: 0, isRunning: false };
      const response: WorkerOutMessage = { type: 'initialized', generation: 0 };
      return [response, newState];
    }

    case 'tick': {
      const generation = state.generation + 1;
      const newState: WorkerState = { ...state, generation, isRunning: true };
      const response: WorkerOutMessage = {
        type: 'tick-result',
        generation,
        timestamp: Date.now(),
      };
      return [response, newState];
    }

    case 'stop': {
      const newState: WorkerState = { ...state, isRunning: false };
      return [null, newState];
    }

    case 'init-wasm': {
      // WASM initialization is handled asynchronously in the worker entry point.
      // The protocol handler returns a placeholder; actual loading happens in the worker.
      const response: WorkerOutMessage = { type: 'wasm-ready', available: false };
      return [response, state];
    }

    default:
      return [null, state];
  }
}
