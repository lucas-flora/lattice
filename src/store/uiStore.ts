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
  /** Whether the hotkey help overlay is visible */
  isHotkeyHelpOpen: boolean;
  /** Current brush size for drawing (1, 3, 5, 7) */
  brushSize: number;
  /** Number of viewport panels (1 = single, 2 = split) */
  viewportCount: 1 | 2;
  /** ID of viewport currently in fullscreen, or null */
  fullscreenViewportId: string | null;
}

export const useUiStore = create<UiState>()(
  subscribeWithSelector((): UiState => ({
    isTerminalOpen: false,
    isParamPanelOpen: false,
    isHotkeyHelpOpen: false,
    brushSize: 1,
    viewportCount: 1,
    fullscreenViewportId: null,
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
  setBrushSize: (brushSize: number): void => {
    useUiStore.setState({ brushSize });
  },
  setViewportCount: (viewportCount: 1 | 2): void => {
    useUiStore.setState({ viewportCount });
  },
  toggleSplitView: (): void => {
    useUiStore.setState((s) => ({
      viewportCount: s.viewportCount === 1 ? 2 : 1,
      fullscreenViewportId: null, // Exit fullscreen when toggling split
    }));
  },
  setFullscreenViewport: (viewportId: string | null): void => {
    useUiStore.setState({ fullscreenViewportId: viewportId });
  },
};
