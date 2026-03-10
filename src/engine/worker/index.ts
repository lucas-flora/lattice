/**
 * Web Worker module.
 *
 * Simulation loop runs in a dedicated Web Worker from tick zero.
 * This is load-bearing architecture — cannot be retrofitted.
 */

export { handleMessage, createInitialState } from './protocol';
export type { WorkerInMessage, WorkerOutMessage, WorkerState } from './protocol';
export { createSimulationWorker } from './createSimulationWorker';
