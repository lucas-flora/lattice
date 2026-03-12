/**
 * Simulation state store.
 *
 * UI-facing mirror of engine state. Engine is the source of truth.
 * This store subscribes to engine events and re-publishes as React-observable state.
 * Stores never duplicate engine state -- they provide a reactive view of it.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export interface ParamDef {
  name: string;
  label?: string;
  type: string;
  default: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface SimState {
  /** Current simulation generation */
  generation: number;
  /** Whether the simulation is currently running */
  isRunning: boolean;
  /** Name of the currently loaded preset, or null */
  activePreset: string | null;
  /** Grid width in cells */
  gridWidth: number;
  /** Grid height in cells */
  gridHeight: number;
  /** Number of live (non-zero) cells */
  liveCellCount: number;
  /** Current simulation speed in FPS (0 = max) */
  speed: number;
  /** Maximum generation reached (for timeline scrubber range) */
  maxGeneration: number;
  /** How far ahead the sim has been computed (frame cache frontier) */
  computedGeneration: number;
  /** Parameter definitions for the current preset */
  paramDefs: ParamDef[];
  /** Current parameter values */
  params: Record<string, number>;
}

/** Default initial state */
const initialSimState: SimState = {
  generation: 0,
  isRunning: false,
  activePreset: null,
  gridWidth: 0,
  gridHeight: 0,
  liveCellCount: 0,
  speed: 10,
  maxGeneration: 0,
  computedGeneration: 0,
  paramDefs: [],
  params: {},
};

export const useSimStore = create<SimState>()(
  subscribeWithSelector((): SimState => ({ ...initialSimState })),
);

/** Store actions -- called from wireStores event handlers, not from UI directly */
export const simStoreActions = {
  setGeneration: (generation: number): void => {
    useSimStore.setState((s) => ({
      generation,
      maxGeneration: Math.max(s.maxGeneration, generation),
    }));
  },
  setIsRunning: (isRunning: boolean): void => {
    useSimStore.setState({ isRunning });
  },
  setActivePreset: (name: string, width: number, height: number): void => {
    useSimStore.setState({ activePreset: name, gridWidth: width, gridHeight: height });
  },
  setComputedGeneration: (computedGeneration: number): void => {
    useSimStore.setState({ computedGeneration });
  },
  resetState: (): void => {
    useSimStore.setState({ generation: 0, isRunning: false, liveCellCount: 0, maxGeneration: 0, computedGeneration: 0 });
  },
  setLiveCellCount: (liveCellCount: number): void => {
    useSimStore.setState({ liveCellCount });
  },
  setSpeed: (speed: number): void => {
    useSimStore.setState({ speed });
  },
  setParamDefs: (paramDefs: ParamDef[], params: Record<string, number>): void => {
    useSimStore.setState({ paramDefs, params });
  },
  setParam: (name: string, value: number): void => {
    useSimStore.setState((s) => ({ params: { ...s.params, [name]: value } }));
  },
  resetParams: (defaults: Record<string, number>): void => {
    useSimStore.setState({ params: { ...defaults } });
  },
  getParamDefs: (): ParamDef[] => {
    return useSimStore.getState().paramDefs;
  },
};
