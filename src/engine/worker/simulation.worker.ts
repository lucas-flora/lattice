/**
 * Simulation Web Worker entry point.
 *
 * The simulation loop runs in this dedicated Worker from tick zero.
 * This is load-bearing architecture — cannot be retrofitted.
 *
 * The Worker wraps the pure handleMessage function with postMessage I/O.
 */

import type { WorkerInMessage, WorkerOutMessage } from './protocol';
import { handleMessage, createInitialState } from './protocol';
import type { WorkerState } from './protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let state: WorkerState = createInitialState();

ctx.addEventListener('message', (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;

  const [response, newState] = handleMessage(msg, state);
  state = newState;

  if (response) {
    ctx.postMessage(response satisfies WorkerOutMessage);
  }
});
