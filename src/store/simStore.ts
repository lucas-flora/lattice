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
  /** True if this param was added at runtime (not from preset) */
  isUser?: boolean;
}

export interface CellPropertySummary {
  name: string;
  type: 'bool' | 'int' | 'float' | 'vec2' | 'vec3' | 'vec4';
  default: number | number[];
  role?: string;
  isInherent?: boolean;
}

export interface CellTypeSummary {
  id: string;
  name: string;
  color: string;
  properties: CellPropertySummary[];
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
  /** Cell property definitions for the current preset */
  cellProperties: CellPropertySummary[];
  /** Cell type definitions from CellTypeRegistry */
  cellTypes: CellTypeSummary[];
  /** SG-8: Active simulation root ID (multi-sim) */
  activeRootId: string;
  /** SG-8: List of all simulation root IDs */
  rootIds: string[];
  /** Whether WebGPU is available and initialized */
  gpuAvailable: boolean;
  /** GPU adapter description (e.g. 'apple arm') */
  gpuAdapter: string | null;
  /** Max square grid side length for 8-channel properties */
  gpuMaxGridSize: number;
}

/** Default initial state */
const initialSimState: SimState = {
  generation: 0,
  isRunning: false,
  activePreset: null,
  gridWidth: 0,
  gridHeight: 0,
  liveCellCount: 0,
  speed: 60,
  maxGeneration: 0,
  computedGeneration: 0,
  paramDefs: [],
  params: {},
  cellProperties: [],
  cellTypes: [],
  activeRootId: 'default',
  rootIds: ['default'],
  gpuAvailable: false,
  gpuAdapter: null,
  gpuMaxGridSize: 0,
};

export const useSimStore = create<SimState>()(
  subscribeWithSelector((): SimState => ({ ...initialSimState })),
);

/** Store actions -- called from wireStores event handlers, not from UI directly */
export const simStoreActions = {
  /** Batched tick update — sets generation + liveCellCount in one setState to avoid double render */
  setTick: (generation: number, liveCellCount: number): void => {
    useSimStore.setState((s) => ({
      generation,
      liveCellCount,
      maxGeneration: generation > s.maxGeneration ? generation : s.maxGeneration,
    }));
  },
  setGeneration: (generation: number): void => {
    useSimStore.setState((s) => ({
      generation,
      maxGeneration: generation > s.maxGeneration ? generation : s.maxGeneration,
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
  setCellProperties: (cellProperties: CellPropertySummary[]): void => {
    useSimStore.setState({ cellProperties });
  },
  setCellTypes: (cellTypes: CellTypeSummary[]): void => {
    useSimStore.setState({ cellTypes });
  },
  /** SG-8: Set the active root ID */
  setActiveRootId: (activeRootId: string): void => {
    useSimStore.setState({ activeRootId });
  },
  /** SG-8: Set the list of all root IDs */
  setRootIds: (rootIds: string[]): void => {
    useSimStore.setState({ rootIds });
  },
  /** SG-8: Add a root ID to the list */
  addRootId: (rootId: string): void => {
    useSimStore.setState((s) => ({
      rootIds: s.rootIds.includes(rootId) ? s.rootIds : [...s.rootIds, rootId],
    }));
  },
  /** SG-8: Remove a root ID from the list */
  removeRootId: (rootId: string): void => {
    useSimStore.setState((s) => ({
      rootIds: s.rootIds.filter((id) => id !== rootId),
    }));
  },
  /** Set GPU availability and adapter info */
  setGpuStatus: (available: boolean, adapter: string | null, maxGridSize: number): void => {
    useSimStore.setState({ gpuAvailable: available, gpuAdapter: adapter, gpuMaxGridSize: maxGridSize });
  },
};
