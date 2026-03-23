/**
 * Rule execution module.
 *
 * GPU-native: all rules compile through PythonParser → IR → WGSL → GPU compute shader.
 * Provides Simulation facade, GPURuleRunner, and CommandHistory (undo/redo).
 */
export { Simulation } from './Simulation';
export { GPURuleRunner } from './GPURuleRunner';
export { CommandHistory } from './CommandHistory';
export type {
  TickResult,
} from './types';
export type { Command, CellChange } from './CommandHistory';
