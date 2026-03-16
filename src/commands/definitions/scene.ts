/**
 * Scene graph commands: scene.*
 *
 * Tree operations, selection, expand/collapse.
 * During the transition period, the tree is a derived view.
 * Commands emit events that update the sceneStore.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';
import type { EventBus } from '../../engine/core/EventBus';
import { SceneGraph } from '../../engine/scene/SceneGraph';
import { sceneStoreActions, useSceneStore } from '../../store/sceneStore';

export function registerSceneCommands(
  registry: CommandRegistry,
  controller: SimulationController,
  eventBus: EventBus,
): void {
  // --- scene.select ---
  registry.register({
    name: 'scene.select',
    description: 'Select a node in the scene tree',
    category: 'scene',
    params: z.object({ id: z.string() }),
    execute: async (params) => {
      const { id } = params as { id: string };
      const state = useSceneStore.getState();
      if (!state.nodes[id]) {
        return { success: false, error: `Node '${id}' not found` };
      }
      sceneStoreActions.select(id);
      eventBus.emit('scene:selectionChanged', { id });
      return { success: true, data: { selectedNodeId: id } };
    },
  });

  // --- scene.deselect ---
  registry.register({
    name: 'scene.deselect',
    description: 'Clear node selection',
    category: 'scene',
    params: z.object({}),
    execute: async () => {
      sceneStoreActions.select(null);
      eventBus.emit('scene:selectionChanged', { id: null });
      return { success: true };
    },
  });

  // --- scene.add ---
  registry.register({
    name: 'scene.add',
    description: 'Add a node to the scene tree',
    category: 'scene',
    params: z.object({
      type: z.string(),
      name: z.string(),
      parentId: z.string().nullable().optional(),
      properties: z.record(z.unknown()).optional(),
    }),
    execute: async (params) => {
      const { type, name, parentId, properties } = params as {
        type: string;
        name: string;
        parentId?: string | null;
        properties?: Record<string, unknown>;
      };

      const resolvedParentId = parentId ?? null;

      // Validate parent exists
      if (resolvedParentId !== null) {
        const state = useSceneStore.getState();
        if (!state.nodes[resolvedParentId]) {
          return { success: false, error: `Parent node '${resolvedParentId}' not found` };
        }
      }

      // Add to the engine SceneGraph if available
      const graph = controller.getSceneGraph?.();
      let nodeId: string;

      if (graph) {
        const node = graph.addNode({
          type,
          name,
          parentId: resolvedParentId,
          childIds: [],
          enabled: true,
          properties: properties ?? {},
          tags: [],
        });
        nodeId = node.id;
        // Sync full tree to store
        const json = graph.toJSON();
        sceneStoreActions.setTree(json.nodes, json.rootIds);
      } else {
        // No engine graph yet — add directly to store
        const { generateNodeId } = await import('../../engine/scene/SceneNode');
        nodeId = generateNodeId();
        sceneStoreActions.addNode({
          id: nodeId,
          type,
          name,
          parentId: resolvedParentId,
          childIds: [],
          enabled: true,
          properties: properties ?? {},
          tags: [],
        });
      }

      eventBus.emit('scene:nodeAdded', { id: nodeId, type, name, parentId: resolvedParentId });
      return { success: true, data: { id: nodeId } };
    },
  });

  // --- scene.remove ---
  registry.register({
    name: 'scene.remove',
    description: 'Remove a node and its subtree',
    category: 'scene',
    params: z.object({ id: z.string() }),
    execute: async (params) => {
      const { id } = params as { id: string };
      const state = useSceneStore.getState();
      if (!state.nodes[id]) {
        return { success: false, error: `Node '${id}' not found` };
      }

      const graph = controller.getSceneGraph?.();
      if (graph) {
        graph.removeNode(id);
        const json = graph.toJSON();
        sceneStoreActions.setTree(json.nodes, json.rootIds);
      } else {
        sceneStoreActions.removeNode(id);
      }

      eventBus.emit('scene:nodeRemoved', { id });
      return { success: true };
    },
  });

  // --- scene.move ---
  registry.register({
    name: 'scene.move',
    description: 'Move a node to a new parent',
    category: 'scene',
    params: z.object({
      id: z.string(),
      parentId: z.string().nullable(),
      index: z.number().optional(),
    }),
    execute: async (params) => {
      const { id, parentId, index } = params as {
        id: string;
        parentId: string | null;
        index?: number;
      };

      const graph = controller.getSceneGraph?.();
      if (graph) {
        try {
          graph.moveNode(id, parentId, index);
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
        const json = graph.toJSON();
        sceneStoreActions.setTree(json.nodes, json.rootIds);
      } else {
        sceneStoreActions.moveNode(id, parentId, index);
      }

      eventBus.emit('scene:nodeMoved', { id, newParentId: parentId, index });
      return { success: true };
    },
  });

  // --- scene.rename ---
  registry.register({
    name: 'scene.rename',
    description: 'Rename a node',
    category: 'scene',
    params: z.object({ id: z.string(), name: z.string() }),
    execute: async (params) => {
      const { id, name } = params as { id: string; name: string };

      const graph = controller.getSceneGraph?.();
      if (graph) {
        const node = graph.getNode(id);
        if (!node) return { success: false, error: `Node '${id}' not found` };
        node.name = name;
        const json = graph.toJSON();
        sceneStoreActions.setTree(json.nodes, json.rootIds);
      } else {
        sceneStoreActions.updateNode(id, { name });
      }

      eventBus.emit('scene:nodeUpdated', { id, name });
      return { success: true };
    },
  });

  // --- scene.enable / scene.disable ---
  registry.register({
    name: 'scene.enable',
    description: 'Enable a node',
    category: 'scene',
    params: z.object({ id: z.string() }),
    execute: async (params) => {
      const { id } = params as { id: string };

      const graph = controller.getSceneGraph?.();
      if (graph) {
        const node = graph.getNode(id);
        if (!node) return { success: false, error: `Node '${id}' not found` };
        node.enabled = true;
        const json = graph.toJSON();
        sceneStoreActions.setTree(json.nodes, json.rootIds);
      } else {
        sceneStoreActions.updateNode(id, { enabled: true });
      }

      eventBus.emit('scene:nodeUpdated', { id, enabled: true });
      return { success: true };
    },
  });

  registry.register({
    name: 'scene.disable',
    description: 'Disable a node',
    category: 'scene',
    params: z.object({ id: z.string() }),
    execute: async (params) => {
      const { id } = params as { id: string };

      const graph = controller.getSceneGraph?.();
      if (graph) {
        const node = graph.getNode(id);
        if (!node) return { success: false, error: `Node '${id}' not found` };
        node.enabled = false;
        const json = graph.toJSON();
        sceneStoreActions.setTree(json.nodes, json.rootIds);
      } else {
        sceneStoreActions.updateNode(id, { enabled: false });
      }

      eventBus.emit('scene:nodeUpdated', { id, enabled: false });
      return { success: true };
    },
  });

  // --- scene.expand / scene.collapse ---
  registry.register({
    name: 'scene.expand',
    description: 'Expand a node in the tree view',
    category: 'scene',
    params: z.object({ id: z.string() }),
    execute: async (params) => {
      const { id } = params as { id: string };
      sceneStoreActions.expand(id);
      return { success: true };
    },
  });

  registry.register({
    name: 'scene.collapse',
    description: 'Collapse a node in the tree view',
    category: 'scene',
    params: z.object({ id: z.string() }),
    execute: async (params) => {
      const { id } = params as { id: string };
      sceneStoreActions.collapse(id);
      return { success: true };
    },
  });

  // --- scene.group ---
  registry.register({
    name: 'scene.group',
    description: 'Wrap nodes in a Group',
    category: 'scene',
    params: z.object({
      ids: z.array(z.string()),
      name: z.string().optional(),
    }),
    execute: async (params) => {
      const { ids, name } = params as { ids: string[]; name?: string };
      if (ids.length === 0) return { success: false, error: 'No nodes specified' };

      const state = useSceneStore.getState();
      const firstNode = state.nodes[ids[0]];
      if (!firstNode) return { success: false, error: `Node '${ids[0]}' not found` };

      // Create group as sibling of first node
      const groupResult = await registry.execute('scene.add', {
        type: 'group',
        name: name ?? 'Group',
        parentId: firstNode.parentId,
      });

      if (!groupResult.success) return groupResult;
      const groupId = (groupResult.data as { id: string }).id;

      // Move all nodes into the group
      for (const nodeId of ids) {
        await registry.execute('scene.move', { id: nodeId, parentId: groupId });
      }

      return { success: true, data: { groupId } };
    },
  });

  // --- scene.ungroup ---
  registry.register({
    name: 'scene.ungroup',
    description: 'Dissolve a group, reparent children',
    category: 'scene',
    params: z.object({ id: z.string() }),
    execute: async (params) => {
      const { id } = params as { id: string };
      const state = useSceneStore.getState();
      const node = state.nodes[id];
      if (!node) return { success: false, error: `Node '${id}' not found` };
      if (node.type !== 'group') return { success: false, error: 'Node is not a group' };

      // Reparent children to group's parent
      for (const childId of [...node.childIds]) {
        await registry.execute('scene.move', { id: childId, parentId: node.parentId });
      }

      // Remove the empty group
      await registry.execute('scene.remove', { id });

      return { success: true };
    },
  });

  // --- scene.list ---
  registry.register({
    name: 'scene.list',
    description: 'List all nodes in the scene tree',
    category: 'scene',
    params: z.object({ type: z.string().optional() }),
    execute: async (params) => {
      const { type } = params as { type?: string };
      const state = useSceneStore.getState();
      let nodes = Object.values(state.nodes);
      if (type) {
        nodes = nodes.filter((n) => n.type === type);
      }
      return {
        success: true,
        data: {
          nodes: nodes.map((n) => ({
            id: n.id,
            type: n.type,
            name: n.name,
            parentId: n.parentId,
            enabled: n.enabled,
            childCount: n.childIds.length,
            tagCount: n.tags.length,
          })),
        },
      };
    },
  });

  // --- scene.buildTree ---
  registry.register({
    name: 'scene.buildTree',
    description: 'Build scene tree from current simulation state',
    category: 'scene',
    params: z.object({}),
    execute: async () => {
      const sim = controller.getSimulation();
      if (!sim) return { success: false, error: 'No simulation loaded' };

      const graph = SceneGraph.fromSimulation(sim, controller.getActivePresetName() ?? undefined);
      const json = graph.toJSON();
      sceneStoreActions.setTree(json.nodes, json.rootIds);

      eventBus.emit('scene:treeLoaded', {
        nodeCount: json.nodes.length,
        rootCount: json.rootIds.length,
      });

      return {
        success: true,
        data: { nodeCount: json.nodes.length, rootCount: json.rootIds.length },
      };
    },
  });
}
