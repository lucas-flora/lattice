/**
 * Layout system type definitions.
 *
 * Defines the recursive LayoutNode tree, panel descriptors, and drawer configuration.
 * All types are JSON-serializable for preset persistence.
 */

import type { ComponentType } from 'react';

// --- Layout Tree ---

/** A split node divides space between children */
export interface SplitNode {
  type: 'split';
  id: string;
  direction: 'h' | 'v';
  children: LayoutNode[];
  /** Percentage sizes for each child (must sum to 100) */
  sizes: number[];
}

/** A tabs node shows one child at a time with a tab bar */
export interface TabsNode {
  type: 'tabs';
  id: string;
  children: LayoutNode[];
  activeIndex: number;
}

/** A panel leaf node renders a registered panel component */
export interface PanelNode {
  type: 'panel';
  id: string;
  panelType: string;
  config?: Record<string, unknown>;
}

/** Recursive layout tree node */
export type LayoutNode = SplitNode | TabsNode | PanelNode;

// --- Panel Registry ---

/** Props passed to every panel component */
export interface PanelProps {
  panelId: string;
  config?: Record<string, unknown>;
}

/** Descriptor for a registered panel type */
export interface PanelDescriptor {
  type: string;
  label: string;
  icon?: string;
  component: ComponentType<PanelProps>;
  /** Whether multiple instances of this panel are allowed */
  allowMultiple?: boolean;
}

// --- Drawer Configuration ---

export type DrawerPosition = 'left' | 'right' | 'bottom';

export interface DrawerState {
  collapsed: boolean;
  size: number;
  minSize: number;
  maxSize: number;
}

/** All zone layout trees */
export interface ZoneLayouts {
  center: LayoutNode;
  left: LayoutNode | null;
  right: LayoutNode | null;
  bottom: LayoutNode | null;
}

/** Complete drawer states */
export interface DrawerStates {
  left: DrawerState;
  right: DrawerState;
  bottom: DrawerState;
}
