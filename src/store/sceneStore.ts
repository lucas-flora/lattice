/**
 * Scene graph state store.
 *
 * Holds the scene tree (SceneNode map), root IDs, selection,
 * and expand/collapse state. Updated via EventBus wiring.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { SceneNode } from '../engine/scene/SceneNode';

export interface SceneState {
  /** All nodes keyed by ID */
  nodes: Record<string, SceneNode>;
  /** Ordered root IDs (SimRoots + Shared) */
  rootIds: string[];
  /** Currently selected node ID */
  selectedNodeId: string | null;
  /** Set of expanded node IDs (for tree UI) */
  expandedNodeIds: string[];
}

const initialSceneState: SceneState = {
  nodes: {},
  rootIds: [],
  selectedNodeId: null,
  expandedNodeIds: [],
};

export const useSceneStore = create<SceneState>()(
  subscribeWithSelector((): SceneState => ({ ...initialSceneState })),
);

export const sceneStoreActions = {
  /** Load full tree state (e.g., from SceneGraph.toJSON()) */
  setTree: (nodes: SceneNode[], rootIds: string[]): void => {
    const nodeMap: Record<string, SceneNode> = {};
    for (const node of nodes) {
      nodeMap[node.id] = node;
    }
    useSceneStore.setState({
      nodes: nodeMap,
      rootIds,
      // Auto-expand roots
      expandedNodeIds: rootIds,
    });
  },

  addNode: (node: SceneNode): void => {
    useSceneStore.setState((s) => {
      const nodes = { ...s.nodes, [node.id]: node };
      const rootIds =
        node.parentId === null ? [...s.rootIds, node.id] : s.rootIds;

      // Update parent's childIds
      if (node.parentId && nodes[node.parentId]) {
        const parent = { ...nodes[node.parentId] };
        if (!parent.childIds.includes(node.id)) {
          parent.childIds = [...parent.childIds, node.id];
        }
        nodes[node.parentId] = parent;
      }

      return { nodes, rootIds };
    });
  },

  removeNode: (id: string): void => {
    useSceneStore.setState((s) => {
      const nodes = { ...s.nodes };
      const node = nodes[id];
      if (!node) return s;

      // Collect subtree IDs
      const toRemove = new Set<string>();
      const collect = (nodeId: string) => {
        toRemove.add(nodeId);
        const n = nodes[nodeId];
        if (n) {
          for (const cid of n.childIds) collect(cid);
        }
      };
      collect(id);

      // Remove from parent
      if (node.parentId && nodes[node.parentId]) {
        const parent = { ...nodes[node.parentId] };
        parent.childIds = parent.childIds.filter((cid) => !toRemove.has(cid));
        nodes[node.parentId] = parent;
      }

      // Delete nodes
      for (const rid of toRemove) delete nodes[rid];

      // Clean rootIds
      const rootIds = s.rootIds.filter((rid) => !toRemove.has(rid));
      const selectedNodeId = toRemove.has(s.selectedNodeId ?? '')
        ? null
        : s.selectedNodeId;
      const expandedNodeIds = s.expandedNodeIds.filter(
        (eid) => !toRemove.has(eid),
      );

      return { nodes, rootIds, selectedNodeId, expandedNodeIds };
    });
  },

  updateNode: (id: string, patch: Partial<SceneNode>): void => {
    useSceneStore.setState((s) => {
      const node = s.nodes[id];
      if (!node) return s;
      return {
        nodes: { ...s.nodes, [id]: { ...node, ...patch } },
      };
    });
  },

  moveNode: (
    id: string,
    newParentId: string | null,
    index?: number,
  ): void => {
    useSceneStore.setState((s) => {
      const nodes = { ...s.nodes };
      const node = nodes[id];
      if (!node) return s;

      // Remove from old parent
      if (node.parentId && nodes[node.parentId]) {
        const oldParent = { ...nodes[node.parentId] };
        oldParent.childIds = oldParent.childIds.filter((cid) => cid !== id);
        nodes[node.parentId] = oldParent;
      }

      let rootIds = node.parentId === null
        ? s.rootIds.filter((rid) => rid !== id)
        : [...s.rootIds];

      // Update node parentId
      const updated = { ...node, parentId: newParentId };
      nodes[id] = updated;

      // Add to new parent
      if (newParentId === null) {
        if (index !== undefined) {
          rootIds.splice(index, 0, id);
        } else {
          rootIds.push(id);
        }
      } else if (nodes[newParentId]) {
        const newParent = { ...nodes[newParentId] };
        if (index !== undefined) {
          newParent.childIds = [...newParent.childIds];
          newParent.childIds.splice(index, 0, id);
        } else {
          newParent.childIds = [...newParent.childIds, id];
        }
        nodes[newParentId] = newParent;
      }

      return { nodes, rootIds };
    });
  },

  select: (id: string | null): void => {
    useSceneStore.setState({ selectedNodeId: id });
  },

  expand: (id: string): void => {
    useSceneStore.setState((s) => ({
      expandedNodeIds: s.expandedNodeIds.includes(id)
        ? s.expandedNodeIds
        : [...s.expandedNodeIds, id],
    }));
  },

  collapse: (id: string): void => {
    useSceneStore.setState((s) => ({
      expandedNodeIds: s.expandedNodeIds.filter((eid) => eid !== id),
    }));
  },

  resetAll: (): void => {
    useSceneStore.setState({ ...initialSceneState });
  },
};
