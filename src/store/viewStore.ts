/**
 * Viewport state store.
 *
 * Manages camera position, zoom, and viewport configuration.
 * Each viewport can have independent settings (expanded in Phase 9).
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export interface ViewState {
  /** Camera zoom level */
  zoom: number;
  /** Camera X position */
  cameraX: number;
  /** Camera Y position */
  cameraY: number;
  /** SG-8: Optional root ID this viewport is bound to. undefined = active root. */
  rootId?: string;
}

export const useViewStore = create<ViewState>()(
  subscribeWithSelector(() => ({
    zoom: 1,
    cameraX: 0,
    cameraY: 0,
  })),
);

/** Store actions -- called from wireStores event handlers */
export const viewStoreActions = {
  setZoom: (zoom: number): void => {
    useViewStore.setState({ zoom });
  },
  setCameraPosition: (x: number, y: number): void => {
    useViewStore.setState({ cameraX: x, cameraY: y });
  },
  updateView: (partial: Partial<ViewState>): void => {
    useViewStore.setState(partial);
  },
  /** SG-8: Bind this viewport to a specific simulation root */
  setRootId: (rootId: string | undefined): void => {
    useViewStore.setState({ rootId });
  },
};
