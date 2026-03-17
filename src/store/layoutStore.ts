/**
 * Layout state store.
 *
 * Manages drawer visibility/mode, viewport configuration, and sizes.
 * Drawers are numbered by hotkey:
 *   ` = terminal (bottom)
 *   1 = Object Manager + Inspector (left, vertically split)
 *   2 = Card View (left, filtered node cards)
 *   3 = Scripting (right)
 *   4 = Metrics/Charts (far right)
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { LayoutNode, ZoneLayouts } from '../layout/types';
import { defaultZoneLayouts, defaultCenterLayout, splitCenterLayout } from '../layout/defaults';

export type PanelMode = 'floating' | 'docked';

export interface LayoutState {
  /** Layout trees per zone */
  zones: ZoneLayouts;

  // --- Drawer ` : Terminal (bottom) ---
  isTerminalOpen: boolean;
  terminalMode: PanelMode;
  terminalHeight: number;

  // --- Drawer 1 : Object Manager + Inspector (left) ---
  isDrawer1Open: boolean;
  drawer1Mode: PanelMode;
  drawer1Width: number;
  /** Split ratio: fraction of height for Object Manager (0-1). Rest is Inspector. */
  drawer1SplitRatio: number;

  // --- Drawer 2 : Card View (left) ---
  isDrawer2Open: boolean;
  drawer2Mode: PanelMode;
  drawer2Width: number;

  // --- Drawer 3 : Scripting (right) ---
  isDrawer3Open: boolean;
  drawer3Mode: PanelMode;
  drawer3Width: number;

  // --- Drawer 4 : Metrics (far right) ---
  isDrawer4Open: boolean;
  drawer4Mode: PanelMode;
  drawer4Width: number;

  // --- Viewports ---
  viewportCount: 1 | 2;
  fullscreenViewportId: string | null;

  // --- Legacy aliases (kept for backward compat in tests/commands) ---
  /** @deprecated Use isDrawer1Open */
  isLeftDrawerOpen: boolean;
  /** @deprecated Use drawer1Mode */
  leftDrawerMode: PanelMode;
  /** @deprecated Use drawer1Width */
  leftDrawerWidth: number;
  /** @deprecated Use isDrawer3Open */
  isScriptPanelOpen: boolean;
  /** @deprecated Use drawer3Mode */
  scriptPanelMode: PanelMode;
  /** @deprecated Use drawer3Width */
  scriptPanelWidth: number;
  /** @deprecated Use isDrawer2Open */
  isParamPanelOpen: boolean;
  /** @deprecated Use drawer2Mode */
  paramPanelMode: PanelMode;
  /** @deprecated Use drawer2Width */
  paramPanelWidth: number;
  /** @deprecated Use isDrawer1Open (inspector is part of drawer 1) */
  isInspectorOpen: boolean;
  /** @deprecated */
  inspectorMode: PanelMode;
  /** @deprecated */
  inspectorWidth: number;
}

const DEFAULTS: LayoutState = {
  zones: defaultZoneLayouts(),

  isTerminalOpen: false,
  terminalMode: 'docked',
  terminalHeight: 250,

  isDrawer1Open: false,
  drawer1Mode: 'docked',
  drawer1Width: 280,
  drawer1SplitRatio: 0.35,

  isDrawer2Open: false,
  drawer2Mode: 'docked',
  drawer2Width: 280,

  isDrawer3Open: false,
  drawer3Mode: 'docked',
  drawer3Width: 300,

  isDrawer4Open: false,
  drawer4Mode: 'docked',
  drawer4Width: 260,

  viewportCount: 1,
  fullscreenViewportId: null,

  // Legacy aliases — kept in sync
  isLeftDrawerOpen: false,
  leftDrawerMode: 'docked',
  leftDrawerWidth: 280,
  isScriptPanelOpen: false,
  scriptPanelMode: 'docked',
  scriptPanelWidth: 300,
  isParamPanelOpen: false,
  paramPanelMode: 'docked',
  paramPanelWidth: 280,
  isInspectorOpen: false,
  inspectorMode: 'docked',
  inspectorWidth: 280,
};

export const useLayoutStore = create<LayoutState>()(
  subscribeWithSelector((): LayoutState => ({ ...DEFAULTS })),
);

/** Store actions */
export const layoutStoreActions = {
  // --- Drawer 1: Object Manager + Inspector ---
  toggleDrawer1: (opts?: { docked?: boolean }): void => {
    const { isDrawer1Open, drawer1Mode } = useLayoutStore.getState();
    if (opts?.docked !== undefined) {
      const mode = opts.docked ? 'docked' : 'floating';
      if (isDrawer1Open && drawer1Mode === mode) {
        useLayoutStore.setState({ isDrawer1Open: false, isLeftDrawerOpen: false, isInspectorOpen: false });
      } else {
        useLayoutStore.setState({ isDrawer1Open: true, drawer1Mode: mode, isLeftDrawerOpen: true, leftDrawerMode: mode, isInspectorOpen: true, inspectorMode: mode });
      }
    } else {
      const next = !isDrawer1Open;
      useLayoutStore.setState({ isDrawer1Open: next, isLeftDrawerOpen: next, isInspectorOpen: next });
    }
  },

  setDrawer1Width: (w: number): void => {
    const maxW = typeof window !== 'undefined' ? window.innerWidth * 0.4 : 500;
    const clamped = Math.max(200, Math.min(w, maxW));
    useLayoutStore.setState({ drawer1Width: clamped, leftDrawerWidth: clamped });
  },

  setDrawer1SplitRatio: (ratio: number): void => {
    useLayoutStore.setState({ drawer1SplitRatio: Math.max(0.15, Math.min(0.85, ratio)) });
  },

  // --- Drawer 2: Card View ---
  toggleDrawer2: (opts?: { docked?: boolean }): void => {
    const { isDrawer2Open, drawer2Mode } = useLayoutStore.getState();
    if (opts?.docked !== undefined) {
      const mode = opts.docked ? 'docked' : 'floating';
      if (isDrawer2Open && drawer2Mode === mode) {
        useLayoutStore.setState({ isDrawer2Open: false, isParamPanelOpen: false });
      } else {
        useLayoutStore.setState({ isDrawer2Open: true, drawer2Mode: mode, isParamPanelOpen: true, paramPanelMode: mode });
      }
    } else {
      const next = !isDrawer2Open;
      useLayoutStore.setState({ isDrawer2Open: next, isParamPanelOpen: next });
    }
  },

  setDrawer2Width: (w: number): void => {
    const maxW = typeof window !== 'undefined' ? window.innerWidth * 0.4 : 500;
    const clamped = Math.max(200, Math.min(w, maxW));
    useLayoutStore.setState({ drawer2Width: clamped, paramPanelWidth: clamped });
  },

  // --- Drawer 3: Scripting ---
  toggleDrawer3: (opts?: { docked?: boolean }): void => {
    const { isDrawer3Open, drawer3Mode } = useLayoutStore.getState();
    if (opts?.docked !== undefined) {
      const mode = opts.docked ? 'docked' : 'floating';
      if (isDrawer3Open && drawer3Mode === mode) {
        useLayoutStore.setState({ isDrawer3Open: false, isScriptPanelOpen: false });
      } else {
        useLayoutStore.setState({ isDrawer3Open: true, drawer3Mode: mode, isScriptPanelOpen: true, scriptPanelMode: mode });
      }
    } else {
      const next = !isDrawer3Open;
      useLayoutStore.setState({ isDrawer3Open: next, isScriptPanelOpen: next });
    }
  },

  setDrawer3Width: (w: number): void => {
    const maxW = typeof window !== 'undefined' ? window.innerWidth * 0.5 : 800;
    const clamped = Math.max(200, Math.min(w, maxW));
    useLayoutStore.setState({ drawer3Width: clamped, scriptPanelWidth: clamped });
  },

  // --- Drawer 4: Metrics ---
  toggleDrawer4: (opts?: { docked?: boolean }): void => {
    const { isDrawer4Open, drawer4Mode } = useLayoutStore.getState();
    if (opts?.docked !== undefined) {
      const mode = opts.docked ? 'docked' : 'floating';
      if (isDrawer4Open && drawer4Mode === mode) {
        useLayoutStore.setState({ isDrawer4Open: false });
      } else {
        useLayoutStore.setState({ isDrawer4Open: true, drawer4Mode: mode });
      }
    } else {
      useLayoutStore.setState({ isDrawer4Open: !isDrawer4Open });
    }
  },

  setDrawer4Width: (w: number): void => {
    const maxW = typeof window !== 'undefined' ? window.innerWidth * 0.4 : 500;
    useLayoutStore.setState({ drawer4Width: Math.max(200, Math.min(w, maxW)) });
  },

  // --- Terminal ---
  setTerminalOpen: (isTerminalOpen: boolean): void => {
    useLayoutStore.setState({ isTerminalOpen });
  },

  setTerminalHeight: (h: number): void => {
    const maxH = typeof window !== 'undefined' ? window.innerHeight * 0.6 : 600;
    useLayoutStore.setState({ terminalHeight: Math.max(100, Math.min(h, maxH)) });
  },

  setTerminalMode: (terminalMode: PanelMode): void => {
    useLayoutStore.setState({ terminalMode });
  },

  // --- Viewports ---
  toggleSplitView: (): void => {
    useLayoutStore.setState((s) => {
      const newCount = s.viewportCount === 1 ? 2 : 1;
      const newCenter = newCount === 2 ? splitCenterLayout() : defaultCenterLayout();
      // Preserve active tab index from current center if it's a tabs node
      if (s.zones.center.type === 'tabs' && newCenter.type === 'tabs') {
        newCenter.activeIndex = s.zones.center.activeIndex;
      }
      return {
        viewportCount: newCount as 1 | 2,
        zones: { ...s.zones, center: newCenter },
        fullscreenViewportId: null,
      };
    });
  },

  setViewportCount: (viewportCount: 1 | 2): void => {
    useLayoutStore.setState((s) => {
      const newCenter = viewportCount === 2 ? splitCenterLayout() : defaultCenterLayout();
      if (s.zones.center.type === 'tabs' && newCenter.type === 'tabs') {
        newCenter.activeIndex = s.zones.center.activeIndex;
      }
      return {
        viewportCount,
        zones: { ...s.zones, center: newCenter },
      };
    });
  },

  setFullscreenViewport: (viewportId: string | null): void => {
    useLayoutStore.setState({ fullscreenViewportId: viewportId });
  },

  // --- Legacy compat ---
  setLeftDrawerOpen: (v: boolean): void => {
    useLayoutStore.setState({ isLeftDrawerOpen: v, isDrawer1Open: v, isInspectorOpen: v });
  },
  setLeftDrawerWidth: (w: number): void => { layoutStoreActions.setDrawer1Width(w); },
  setParamPanelOpen: (v: boolean): void => {
    useLayoutStore.setState({ isParamPanelOpen: v, isDrawer2Open: v });
  },
  setParamPanelWidth: (w: number): void => { layoutStoreActions.setDrawer2Width(w); },
  setParamPanelMode: (m: PanelMode): void => {
    useLayoutStore.setState({ paramPanelMode: m, drawer2Mode: m });
  },
  setScriptPanelOpen: (v: boolean): void => {
    useLayoutStore.setState({ isScriptPanelOpen: v, isDrawer3Open: v });
  },
  setScriptPanelWidth: (w: number): void => { layoutStoreActions.setDrawer3Width(w); },
  setInspectorOpen: (v: boolean): void => {
    useLayoutStore.setState({ isInspectorOpen: v });
  },
  setInspectorWidth: (w: number): void => {
    useLayoutStore.setState({ inspectorWidth: Math.max(200, Math.min(w, 800)) });
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
    useLayoutStore.setState({ ...DEFAULTS });
  },
};
