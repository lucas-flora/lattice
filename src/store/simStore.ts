/**
 * Simulation state store.
 *
 * UI-facing mirror of engine state. Engine is the source of truth.
 * This store subscribes to engine events and re-publishes as React-observable state.
 * Stores never duplicate engine state — they provide a reactive view of it.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

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
}

export const useSimStore = create<SimState>()(
  subscribeWithSelector((): SimState => ({
    generation: 0,
    isRunning: false,
    activePreset: null,
    gridWidth: 0,
    gridHeight: 0,
  })),
);
