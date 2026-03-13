/**
 * Layout system module.
 *
 * Provides the recursive layout tree, panel registry, and default configurations.
 */

export type {
  LayoutNode,
  SplitNode,
  TabsNode,
  PanelNode,
  PanelProps,
  PanelDescriptor,
  DrawerPosition,
  DrawerState,
  ZoneLayouts,
  DrawerStates,
} from './types';

export {
  findNode,
  findParent,
  splitNode,
  addTab,
  removePanel,
  resizeSplit,
  setActiveTab,
  collectPanelIds,
  collectPanelTypes,
  generateLayoutId,
  resetLayoutIds,
} from './LayoutTree';

export { panelRegistry } from './PanelRegistry';
export { registerPanels } from './registerPanels';

export {
  defaultCenterLayout,
  splitCenterLayout,
  defaultRightLayout,
  defaultBottomLayout,
  defaultZoneLayouts,
  defaultDrawerStates,
} from './defaults';
