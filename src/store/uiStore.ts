/**
 * UI state store.
 *
 * Manages panel visibility, terminal state, and layout configuration.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export interface UiState {
  /** Whether the terminal panel is visible */
  isTerminalOpen: boolean;
  /** Whether the parameter panel is visible */
  isParamPanelOpen: boolean;
}

export const useUiStore = create<UiState>()(
  subscribeWithSelector((): UiState => ({
    isTerminalOpen: false,
    isParamPanelOpen: false,
  })),
);

/** Store actions -- called from wireStores event handlers */
export const uiStoreActions = {
  setTerminalOpen: (isTerminalOpen: boolean): void => {
    useUiStore.setState({ isTerminalOpen });
  },
  setParamPanelOpen: (isParamPanelOpen: boolean): void => {
    useUiStore.setState({ isParamPanelOpen });
  },
  updateUi: (partial: Partial<UiState>): void => {
    useUiStore.setState(partial);
  },
};
