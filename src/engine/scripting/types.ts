/**
 * Message types for the Pyodide Web Worker protocol.
 *
 * Follows the same pattern as simulation.worker protocol:
 * typed discriminated unions for worker ↔ main thread messages.
 */

export type PyodideStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Messages sent TO the Pyodide worker */
export type PyodideInMessage =
  | { type: 'init'; indexURL?: string }
  | {
      type: 'exec-rule';
      id: string;
      code: string;
      buffers: Record<string, Float32Array>;
      gridWidth: number;
      gridHeight: number;
      gridDepth: number;
      params: Record<string, number>;
    }
  | { type: 'dispose' };

/** Messages sent FROM the Pyodide worker */
export type PyodideOutMessage =
  | { type: 'init-progress'; phase: string; progress: number }
  | { type: 'ready' }
  | { type: 'rule-result'; id: string; buffers: Record<string, Float32Array> }
  | { type: 'error'; id?: string; message: string; stack?: string }
  | { type: 'disposed' };
