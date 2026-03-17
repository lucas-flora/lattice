/**
 * Script state store.
 *
 * Holds Pyodide runtime status and global variables.
 * Expression/script tag state lives in expressionStore.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { PyodideStatus } from '../engine/scripting/types';

export interface ScriptState {
  globalVariables: Record<string, { value: number | string; type: string }>;
  pyodideStatus: PyodideStatus;
  pyodideProgress: number;
}

const initialScriptState: ScriptState = {
  globalVariables: {},
  pyodideStatus: 'idle',
  pyodideProgress: 0,
};

export const useScriptStore = create<ScriptState>()(
  subscribeWithSelector((): ScriptState => ({ ...initialScriptState })),
);

export const scriptStoreActions = {
  setVariable: (name: string, value: number | string): void => {
    useScriptStore.setState((s) => ({
      globalVariables: {
        ...s.globalVariables,
        [name]: { value, type: typeof value === 'string' ? 'string' : 'float' },
      },
    }));
  },

  deleteVariable: (name: string): void => {
    useScriptStore.setState((s) => {
      const { [name]: _, ...rest } = s.globalVariables;
      return { globalVariables: rest };
    });
  },

  resetVariables: (): void => {
    useScriptStore.setState({ globalVariables: {} });
  },

  setPyodideStatus: (status: PyodideStatus): void => {
    useScriptStore.setState({ pyodideStatus: status });
  },

  setPyodideProgress: (progress: number): void => {
    useScriptStore.setState({ pyodideProgress: progress });
  },

  resetAll: (): void => {
    useScriptStore.setState({ ...initialScriptState });
  },
};
