/**
 * UI state store.
 *
 * Manages panel visibility, terminal state, and layout configuration.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export type PanelMode = 'floating' | 'docked';

export interface UiState {
  /** Whether the terminal panel is visible */
  isTerminalOpen: boolean;
  /** Whether the parameter panel is visible */
  isParamPanelOpen: boolean;
  /** Whether the hotkey help overlay is visible */
  isHotkeyHelpOpen: boolean;
  /** Terminal display mode */
  terminalMode: PanelMode;
  /** Parameter panel display mode */
  paramPanelMode: PanelMode;
  /** Current brush size for drawing (1, 3, 5, 7) */
  brushSize: number;
  /** Number of viewport panels (1 = single, 2 = split) */
  viewportCount: 1 | 2;
  /** ID of viewport currently in fullscreen, or null */
  fullscreenViewportId: string | null;
  /** Whether grid lines are displayed */
  gridLinesVisible: boolean;
  /** Terminal panel height in pixels (docked mode) */
  terminalHeight: number;
  /** Parameter panel width in pixels (docked mode) */
  paramPanelWidth: number;
}

export const useUiStore = create<UiState>()(
  subscribeWithSelector((): UiState => ({
    isTerminalOpen: false,
    isParamPanelOpen: false,
    isHotkeyHelpOpen: false,
    terminalMode: 'docked',
    paramPanelMode: 'docked',
    brushSize: 1,
    viewportCount: 1,
    fullscreenViewportId: null,
    gridLinesVisible: false,
    terminalHeight: 250,
    paramPanelWidth: 300,
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
  toggleGridLines: (): void => {
    useUiStore.setState((s) => ({ gridLinesVisible: !s.gridLinesVisible }));
  },
  setGridLines: (visible: boolean): void => {
    useUiStore.setState({ gridLinesVisible: visible });
  },
  setTerminalHeight: (h: number): void => {
    const maxH = typeof window !== 'undefined' ? window.innerHeight * 0.6 : 600;
    useUiStore.setState({ terminalHeight: Math.max(100, Math.min(h, maxH)) });
  },
  setParamPanelWidth: (w: number): void => {
    const maxW = typeof window !== 'undefined' ? window.innerWidth * 0.5 : 800;
    useUiStore.setState({ paramPanelWidth: Math.max(200, Math.min(w, maxW)) });
  },
};
