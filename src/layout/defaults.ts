/**
 * Default layout trees for each zone.
 *
 * These define the initial layout when no preset is loaded.
 */

import type { LayoutNode, DrawerStates, ZoneLayouts } from './types';

/** Default center zone: tabs with viewport + node editor */
export function defaultCenterLayout(): LayoutNode {
  return {
    type: 'tabs',
    id: 'center-tabs',
    activeIndex: 0,
    children: [
      { type: 'panel', id: 'viewport-1', panelType: 'viewport' },
      { type: 'panel', id: 'node-editor-1', panelType: 'nodeEditor' },
    ],
  };
}

/** Split center zone: two viewports side by side + node editor tab */
export function splitCenterLayout(): LayoutNode {
  return {
    type: 'tabs',
    id: 'center-tabs',
    activeIndex: 0,
    children: [
      {
        type: 'split',
        id: 'center-split',
        direction: 'h',
        children: [
          { type: 'panel', id: 'viewport-1', panelType: 'viewport' },
          { type: 'panel', id: 'viewport-2', panelType: 'viewport' },
        ],
        sizes: [50, 50],
      },
      { type: 'panel', id: 'node-editor-1', panelType: 'nodeEditor' },
    ],
  };
}

/** Default left drawer: cell cards panel */
export function defaultLeftLayout(): LayoutNode {
  return { type: 'panel', id: 'cell-panel', panelType: 'cellPanel' };
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
    left: defaultLeftLayout(),
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
