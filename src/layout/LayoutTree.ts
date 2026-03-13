/**
 * Layout tree operations.
 *
 * Pure functions for manipulating LayoutNode trees.
 * All operations return new trees (immutable).
 */

import type { LayoutNode, SplitNode } from './types';

/** Generate a unique ID for layout nodes */
let nextId = 0;
export function generateLayoutId(prefix = 'node'): string {
  return `${prefix}-${++nextId}`;
}

/** Reset ID counter (for testing) */
export function resetLayoutIds(): void {
  nextId = 0;
}

/** Find a node by ID in the tree */
export function findNode(root: LayoutNode, id: string): LayoutNode | null {
  if (root.id === id) return root;
  if (root.type === 'split' || root.type === 'tabs') {
    for (const child of root.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
  }
  return null;
}

/** Find the parent of a node by ID */
export function findParent(
  root: LayoutNode,
  id: string,
): (SplitNode | Extract<LayoutNode, { type: 'tabs' }>) | null {
  if (root.type === 'split' || root.type === 'tabs') {
    for (const child of root.children) {
      if (child.id === id) return root;
      const found = findParent(child, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Split an existing panel node into two panels.
 * The original panel stays, and a new panel is added alongside it.
 */
export function splitNode(
  root: LayoutNode,
  targetId: string,
  newPanel: LayoutNode,
  direction: 'h' | 'v',
  insertAfter = true,
): LayoutNode {
  let done = false;
  return mapNode(root, (node) => {
    if (done || node.id !== targetId) return node;
    done = true;
    const children = insertAfter ? [node, newPanel] : [newPanel, node];
    return {
      type: 'split' as const,
      id: generateLayoutId('split'),
      direction,
      children,
      sizes: [50, 50],
    };
  });
}

/** Add a tab to a tabs node, or convert a panel to a tabs node */
export function addTab(
  root: LayoutNode,
  targetId: string,
  newPanel: LayoutNode,
): LayoutNode {
  let done = false;
  return mapNode(root, (node) => {
    if (done || node.id !== targetId) return node;
    done = true;
    if (node.type === 'tabs') {
      return {
        ...node,
        children: [...node.children, newPanel],
        activeIndex: node.children.length,
      };
    }
    // Convert panel to tabs
    return {
      type: 'tabs' as const,
      id: generateLayoutId('tabs'),
      children: [node, newPanel],
      activeIndex: 1,
    };
  });
}

/** Remove a panel from the tree. Returns null if the tree becomes empty. */
export function removePanel(root: LayoutNode, panelId: string): LayoutNode | null {
  if (root.id === panelId) return null;

  if (root.type === 'panel') return root;

  if (root.type === 'split' || root.type === 'tabs') {
    const newChildren = root.children
      .map((child) => removePanel(child, panelId))
      .filter((child): child is LayoutNode => child !== null);

    if (newChildren.length === 0) return null;
    if (newChildren.length === 1) return newChildren[0];

    if (root.type === 'split') {
      // Redistribute sizes proportionally
      const remainingIndices = root.children
        .map((child, i) => (removePanel(child, panelId) !== null ? i : -1))
        .filter((i) => i >= 0);
      const totalSize = remainingIndices.reduce((sum, i) => sum + root.sizes[i], 0);
      const newSizes = remainingIndices.map((i) => (root.sizes[i] / totalSize) * 100);

      return { ...root, children: newChildren, sizes: newSizes };
    }

    // Tabs
    const newActiveIndex = Math.min(root.activeIndex, newChildren.length - 1);
    return { ...root, children: newChildren, activeIndex: newActiveIndex };
  }

  return root;
}

/** Update sizes of a split node's children */
export function resizeSplit(
  root: LayoutNode,
  splitId: string,
  sizes: number[],
): LayoutNode {
  return mapNode(root, (node) => {
    if (node.id !== splitId || node.type !== 'split') return node;
    return { ...node, sizes };
  });
}

/** Set active tab index */
export function setActiveTab(
  root: LayoutNode,
  tabsId: string,
  index: number,
): LayoutNode {
  return mapNode(root, (node) => {
    if (node.id !== tabsId || node.type !== 'tabs') return node;
    return { ...node, activeIndex: Math.max(0, Math.min(index, node.children.length - 1)) };
  });
}

/** Deep map over all nodes in the tree */
function mapNode(
  node: LayoutNode,
  fn: (node: LayoutNode) => LayoutNode,
): LayoutNode {
  const mapped = fn(node);
  if (mapped.type === 'split' || mapped.type === 'tabs') {
    const newChildren = mapped.children.map((child) => mapNode(child, fn));
    if (newChildren.every((c, i) => c === mapped.children[i])) return mapped;
    return { ...mapped, children: newChildren };
  }
  return mapped;
}

/** Collect all panel IDs in the tree */
export function collectPanelIds(root: LayoutNode): string[] {
  if (root.type === 'panel') return [root.id];
  return root.children.flatMap(collectPanelIds);
}

/** Collect all panel types in the tree */
export function collectPanelTypes(root: LayoutNode): string[] {
  if (root.type === 'panel') return [root.panelType];
  return root.children.flatMap(collectPanelTypes);
}
