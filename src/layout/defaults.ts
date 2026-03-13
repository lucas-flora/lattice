/**
 * Default layout trees for each zone.
 *
 * These define the initial layout when no preset is loaded.
 */

import type { LayoutNode, DrawerStates, ZoneLayouts } from './types';

/** Default center zone: single viewport */
export function defaultCenterLayout(): LayoutNode {
  return { type: 'panel', id: 'viewport-1', panelType: 'viewport' };
}

/** Split center zone: two viewports side by side */
export function splitCenterLayout(): LayoutNode {
  return {
    type: 'split',
    id: 'center-split',
    direction: 'h',
    children: [
      { type: 'panel', id: 'viewport-1', panelType: 'viewport' },
      { type: 'panel', id: 'viewport-2', panelType: 'viewport' },
    ],
    sizes: [50, 50],
  };
}

/** Default right drawer: parameter panel */
export function defaultRightLayout(): LayoutNode {
  return { type: 'panel', id: 'param-panel', panelType: 'paramPanel' };
}

/** Default bottom drawer: terminal */
export function defaultBottomLayout(): LayoutNode {
  return { type: 'panel', id: 'terminal-panel', panelType: 'terminal' };
}

/** Default layouts for all zones */
export function defaultZoneLayouts(): ZoneLayouts {
  return {
    center: defaultCenterLayout(),
    left: null,
    right: defaultRightLayout(),
    bottom: defaultBottomLayout(),
  };
}

/** Default drawer states */
export function defaultDrawerStates(): DrawerStates {
  return {
    left: {
      collapsed: true,
      size: 280,
      minSize: 200,
      maxSize: 500,
    },
    right: {
      collapsed: true,
      size: 300,
      minSize: 200,
      maxSize: 600,
    },
    bottom: {
      collapsed: true,
      size: 250,
      minSize: 100,
      maxSize: 600,
    },
  };
}
