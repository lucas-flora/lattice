/**
 * Layout state store.
 *
 * Manages zone layout trees, panel visibility/mode, viewport configuration,
 * and drawer sizes. Source of truth for all layout decisions.
 *
 * Migrated from uiStore: isTerminalOpen, isParamPanelOpen, terminalMode,
 * paramPanelMode, viewportCount, fullscreenViewportId, terminalHeight, paramPanelWidth.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { LayoutNode, ZoneLayouts } from '../layout/types';
import { defaultZoneLayouts, defaultCenterLayout, splitCenterLayout } from '../layout/defaults';

export type PanelMode = 'floating' | 'docked';

export interface LayoutState {
  /** Layout trees per zone */
  zones: ZoneLayouts;
  /** Whether the left drawer (cell cards) is visible */
  isLeftDrawerOpen: boolean;
  /** Left drawer display mode */
  leftDrawerMode: PanelMode;
  /** Whether the terminal panel is visible */
  isTerminalOpen: boolean;
  /** Whether the parameter panel is visible */
  isParamPanelOpen: boolean;
  /** Whether the script panel is visible */
  isScriptPanelOpen: boolean;
  /** Script panel display mode */
  scriptPanelMode: PanelMode;
  /** Terminal display mode */
  terminalMode: PanelMode;
  /** Parameter panel display mode */
  paramPanelMode: PanelMode;
  /** Number of viewport panels (1 = single, 2 = split) */
  viewportCount: 1 | 2;
  /** ID of viewport currently in fullscreen, or null */
  fullscreenViewportId: string | null;
  /** Left drawer width in pixels */
  leftDrawerWidth: number;
  /** Terminal panel height in pixels (docked mode) */
  terminalHeight: number;
  /** Parameter panel width in pixels (docked mode) */
  paramPanelWidth: number;
  /** Script panel width in pixels */
  scriptPanelWidth: number;
}

export const useLayoutStore = create<LayoutState>()(
  subscribeWithSelector((): LayoutState => ({
    zones: defaultZoneLayouts(),
    isLeftDrawerOpen: false,
    leftDrawerMode: 'floating',
    isTerminalOpen: false,
    isParamPanelOpen: false,
    isScriptPanelOpen: false,
    terminalMode: 'docked',
    scriptPanelMode: 'floating',
    paramPanelMode: 'floating',
    viewportCount: 1,
    fullscreenViewportId: null,
    leftDrawerWidth: 280,
    terminalHeight: 250,
    paramPanelWidth: 300,
    scriptPanelWidth: 300,
  })),
);

/** Store actions */
export const layoutStoreActions = {
  setLeftDrawerOpen: (isLeftDrawerOpen: boolean): void => {
    useLayoutStore.setState({ isLeftDrawerOpen });
  },

  setTerminalOpen: (isTerminalOpen: boolean): void => {
    useLayoutStore.setState({ isTerminalOpen });
  },

  setParamPanelOpen: (isParamPanelOpen: boolean): void => {
    useLayoutStore.setState({ isParamPanelOpen });
  },

  setScriptPanelOpen: (isScriptPanelOpen: boolean): void => {
    useLayoutStore.setState({ isScriptPanelOpen });
  },

  setScriptPanelWidth: (w: number): void => {
    const maxW = typeof window !== 'undefined' ? window.innerWidth * 0.5 : 800;
    useLayoutStore.setState({ scriptPanelWidth: Math.max(200, Math.min(w, maxW)) });
  },

  setLeftDrawerWidth: (w: number): void => {
    const maxW = typeof window !== 'undefined' ? window.innerWidth * 0.4 : 500;
    useLayoutStore.setState({ leftDrawerWidth: Math.max(200, Math.min(w, maxW)) });
  },

  setTerminalHeight: (h: number): void => {
    const maxH = typeof window !== 'undefined' ? window.innerHeight * 0.6 : 600;
    useLayoutStore.setState({ terminalHeight: Math.max(100, Math.min(h, maxH)) });
  },

  setParamPanelWidth: (w: number): void => {
    const maxW = typeof window !== 'undefined' ? window.innerWidth * 0.5 : 800;
    useLayoutStore.setState({ paramPanelWidth: Math.max(200, Math.min(w, maxW)) });
  },

  toggleSplitView: (): void => {
    useLayoutStore.setState((s) => {
      const newCount = s.viewportCount === 1 ? 2 : 1;
      return {
        viewportCount: newCount as 1 | 2,
        zones: {
          ...s.zones,
          center: newCount === 2 ? splitCenterLayout() : defaultCenterLayout(),
        },
        fullscreenViewportId: null,
      };
    });
  },

  setViewportCount: (viewportCount: 1 | 2): void => {
    useLayoutStore.setState((s) => ({
      viewportCount,
      zones: {
        ...s.zones,
        center: viewportCount === 2 ? splitCenterLayout() : defaultCenterLayout(),
      },
    }));
  },

  setFullscreenViewport: (viewportId: string | null): void => {
    useLayoutStore.setState({ fullscreenViewportId: viewportId });
  },

  setTerminalMode: (terminalMode: PanelMode): void => {
    useLayoutStore.setState({ terminalMode });
  },

  setParamPanelMode: (paramPanelMode: PanelMode): void => {
    useLayoutStore.setState({ paramPanelMode });
  },

  /** Set a zone's layout tree */
  setZoneLayout: (zone: keyof ZoneLayouts, layout: LayoutNode | null): void => {
    useLayoutStore.setState((s) => ({
      zones: { ...s.zones, [zone]: layout },
    }));
  },

  /** Update arbitrary layout state */
  updateLayout: (partial: Partial<LayoutState>): void => {
    useLayoutStore.setState(partial);
  },

  /** Reset layout to defaults */
  resetLayout: (): void => {
    useLayoutStore.setState({
      zones: defaultZoneLayouts(),
      isLeftDrawerOpen: false,
      leftDrawerMode: 'floating',
      isTerminalOpen: false,
      isParamPanelOpen: false,
      isScriptPanelOpen: false,
      terminalMode: 'docked',
      scriptPanelMode: 'floating',
      paramPanelMode: 'floating',
      viewportCount: 1,
      fullscreenViewportId: null,
      leftDrawerWidth: 280,
      terminalHeight: 250,
      paramPanelWidth: 300,
      scriptPanelWidth: 300,
    });
  },
};
