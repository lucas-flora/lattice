/**
 * Message types for the Pyodide Web Worker protocol.
 *
 * Follows the same pattern as simulation.worker protocol:
 * typed discriminated unions for worker ↔ main thread messages.
 */

export type PyodideStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Definition for a global variable in a preset */
export interface GlobalVariableDef {
  name: string;
  type: 'float' | 'int' | 'string';
  default: number | string;
}

/** Definition for a global script in a preset */
export interface GlobalScriptDef {
  name: string;
  enabled: boolean;
  inputs?: string[];
  outputs?: string[];
  code: string;
}

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
  | {
      type: 'exec-expressions';
      id: string;
      code: string;
      buffers: Record<string, Float32Array>;
      gridWidth: number;
      gridHeight: number;
      gridDepth: number;
      params: Record<string, number>;
      globalVars: Record<string, number>;
    }
  | {
      type: 'exec-script';
      id: string;
      code: string;
      params: Record<string, number>;
      globalVars: Record<string, number>;
      gridWidth: number;
      gridHeight: number;
      gridDepth: number;
    }
  | { type: 'dispose' };

/** Messages sent FROM the Pyodide worker */
export type PyodideOutMessage =
  | { type: 'init-progress'; phase: string; progress: number }
  | { type: 'ready' }
  | { type: 'rule-result'; id: string; buffers: Record<string, Float32Array> }
  | {
      type: 'expression-result';
      id: string;
      buffers: Record<string, Float32Array>;
    }
  | {
      type: 'script-result';
      id: string;
      envChanges: Record<string, number>;
      varChanges: Record<string, number | string>;
    }
  | { type: 'error'; id?: string; message: string; stack?: string }
  | { type: 'disposed' };
