/**
 * Script state store.
 *
 * UI-facing mirror of scripting engine state. Subscribes to script events
 * via wireStores and re-publishes as React-observable state.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { PyodideStatus } from '../engine/scripting/types';
import type { GlobalScriptDef } from '../engine/scripting/types';

export interface ScriptState {
  globalVariables: Record<string, { value: number | string; type: string }>;
  globalScripts: GlobalScriptDef[];
  expressions: Record<string, string>;
  pyodideStatus: PyodideStatus;
  pyodideProgress: number;
}

const initialScriptState: ScriptState = {
  globalVariables: {},
  globalScripts: [],
  expressions: {},
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

  setExpression: (property: string, expression: string): void => {
    useScriptStore.setState((s) => ({
      expressions: { ...s.expressions, [property]: expression },
    }));
  },

  clearExpression: (property: string): void => {
    useScriptStore.setState((s) => {
      const { [property]: _, ...rest } = s.expressions;
      return { expressions: rest };
    });
  },

  addScript: (script: { name: string; enabled: boolean; code: string; inputs?: string[]; outputs?: string[] }): void => {
    useScriptStore.setState((s) => ({
      globalScripts: [...s.globalScripts.filter((sc) => sc.name !== script.name), script],
    }));
  },

  removeScript: (name: string): void => {
    useScriptStore.setState((s) => ({
      globalScripts: s.globalScripts.filter((sc) => sc.name !== name),
    }));
  },

  toggleScript: (name: string, enabled: boolean): void => {
    useScriptStore.setState((s) => ({
      globalScripts: s.globalScripts.map((sc) =>
        sc.name === name ? { ...sc, enabled } : sc,
      ),
    }));
  },

  setScripts: (scripts: GlobalScriptDef[]): void => {
    useScriptStore.setState({ globalScripts: scripts });
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
