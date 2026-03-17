/**
 * State commands: capture, restore, setInitial, clearInitial, list, delete.
 *
 * Manage initial-state scene nodes that persist grid snapshots.
 * Works directly with sceneStore (same pattern as scene.ts commands).
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';
import type { EventBus } from '../../engine/core/EventBus';
import { NODE_TYPES, generateNodeId } from '../../engine/scene/SceneNode';
import type { SceneNode } from '../../engine/scene/SceneNode';
import { sceneStoreActions, useSceneStore } from '../../store/sceneStore';

const CaptureParams = z.object({
  name: z.string().optional(),
  parentId: z.string().optional(),
}).describe('{ [name]: string, [parentId]: string }');

const IdParams = z.object({
  id: z.string(),
}).describe('{ id: string }');

const ListParams = z.object({
  simRootId: z.string().optional(),
}).describe('{ [simRootId]: string }');

/** Helper: get a node from the store by ID */
function getStoreNode(id: string): SceneNode | undefined {
  return useSceneStore.getState().nodes[id];
}

/** Helper: find all store nodes of a given type */
function findStoreNodesByType(type: string): SceneNode[] {
  const { nodes } = useSceneStore.getState();
  return Object.values(nodes).filter((n) => n.type === type);
}

/** Helper: find children of a parent that match a type */
function findChildrenByType(parentId: string, type: string): SceneNode[] {
  const parent = getStoreNode(parentId);
  if (!parent) return [];
  const { nodes } = useSceneStore.getState();
  return parent.childIds
    .map((cid) => nodes[cid])
    .filter((n): n is SceneNode => n !== undefined && n.type === type);
}

/** Helper: walk up to find the sim-root ancestor */
function findSimRoot(nodeId: string): SceneNode | null {
  const { nodes } = useSceneStore.getState();
  let current = nodes[nodeId];
  while (current) {
    if (current.type === NODE_TYPES.SIM_ROOT) return current;
    if (!current.parentId) return null;
    current = nodes[current.parentId];
  }
  return null;
}

export function registerStateCommands(
  registry: CommandRegistry,
  controller: SimulationController,
  eventBus: EventBus,
): void {
  registry.register({
    name: 'state.capture',
    description: 'Capture current grid state as an initial-state node',
    category: 'state',
    params: CaptureParams,
    execute: async (params) => {
      const { name, parentId } = params as z.infer<typeof CaptureParams>;
      const sim = controller.getSimulation();
      if (!sim) {
        return { success: false, error: 'No simulation loaded' };
      }

      // Determine parent: explicit parentId, or find the active sim-root
      let resolvedParentId = parentId ?? null;
      if (!resolvedParentId) {
        const simRoots = findStoreNodesByType(NODE_TYPES.SIM_ROOT);
        if (simRoots.length > 0) {
          resolvedParentId = simRoots[0].id;
        }
      }

      // Capture all property buffers
      const buffers: Record<string, number[]> = {};
      const propertyNames: string[] = [];
      for (const propName of sim.grid.getPropertyNames()) {
        const buf = sim.grid.getCurrentBuffer(propName);
        buffers[propName] = Array.from(buf);
        propertyNames.push(propName);
      }

      const nodeId = generateNodeId();
      const nodeName = name ?? `State @ gen ${sim.getGeneration()}`;
      const node: SceneNode = {
        id: nodeId,
        type: NODE_TYPES.INITIAL_STATE,
        name: nodeName,
        parentId: resolvedParentId,
        childIds: [],
        enabled: true,
        properties: {
          buffers,
          width: sim.grid.config.width,
          height: sim.grid.config.height,
          isInitial: false,
          capturedAt: new Date().toISOString(),
          propertyNames,
        },
        tags: [],
      };

      sceneStoreActions.addNode(node);
      eventBus.emit('scene:nodeAdded', {
        id: nodeId, type: NODE_TYPES.INITIAL_STATE, name: nodeName, parentId: resolvedParentId,
      });
      return { success: true, data: { id: nodeId, name: nodeName } };
    },
  });

  registry.register({
    name: 'state.restore',
    description: 'Restore grid from an initial-state node',
    category: 'state',
    params: IdParams,
    execute: async (params) => {
      const { id } = params as z.infer<typeof IdParams>;
      const sim = controller.getSimulation();
      if (!sim) {
        return { success: false, error: 'No simulation loaded' };
      }

      const node = getStoreNode(id);
      if (!node || node.type !== NODE_TYPES.INITIAL_STATE) {
        return { success: false, error: `State node "${id}" not found` };
      }

      const buffers = node.properties.buffers as Record<string, number[]> | undefined;
      if (!buffers) {
        return { success: false, error: 'State node has no buffers' };
      }

      // Dimension check
      const stateWidth = node.properties.width as number;
      const stateHeight = node.properties.height as number;
      if (stateWidth !== sim.grid.config.width || stateHeight !== sim.grid.config.height) {
        return {
          success: false,
          error: `Dimension mismatch: state is ${stateWidth}x${stateHeight}, grid is ${sim.grid.config.width}x${sim.grid.config.height}`,
        };
      }

      // Write buffers to grid
      for (const [propName, data] of Object.entries(buffers)) {
        const gridBuf = sim.grid.getCurrentBuffer(propName);
        gridBuf.set(new Float32Array(data));
      }

      // Pause and reset playhead
      controller.pause();
      sim.runner.setGeneration(0);

      // Update controller state
      controller.onStateRestored();

      return { success: true, data: { id, name: node.name } };
    },
  });

  registry.register({
    name: 'state.setInitial',
    description: 'Mark a state node as the initial state (clears others)',
    category: 'state',
    params: IdParams,
    execute: async (params) => {
      const { id } = params as z.infer<typeof IdParams>;
      const node = getStoreNode(id);
      if (!node || node.type !== NODE_TYPES.INITIAL_STATE) {
        return { success: false, error: `State node "${id}" not found` };
      }

      // Clear isInitial on all sibling state nodes
      const simRoot = findSimRoot(id);
      if (simRoot) {
        const stateNodes = findChildrenByType(simRoot.id, NODE_TYPES.INITIAL_STATE);
        for (const sn of stateNodes) {
          if (sn.properties.isInitial) {
            sceneStoreActions.updateNode(sn.id, {
              properties: { ...sn.properties, isInitial: false },
            });
          }
        }
      }

      sceneStoreActions.updateNode(id, {
        properties: { ...node.properties, isInitial: true },
      });
      eventBus.emit('scene:nodeUpdated', { id, properties: { isInitial: true } });
      return { success: true, data: { id } };
    },
  });

  registry.register({
    name: 'state.clearInitial',
    description: 'Remove initial designation from a state node',
    category: 'state',
    params: IdParams,
    execute: async (params) => {
      const { id } = params as z.infer<typeof IdParams>;
      const node = getStoreNode(id);
      if (!node || node.type !== NODE_TYPES.INITIAL_STATE) {
        return { success: false, error: `State node "${id}" not found` };
      }

      sceneStoreActions.updateNode(id, {
        properties: { ...node.properties, isInitial: false },
      });
      eventBus.emit('scene:nodeUpdated', { id, properties: { isInitial: false } });
      return { success: true, data: { id } };
    },
  });

  registry.register({
    name: 'state.list',
    description: 'List all state nodes',
    category: 'state',
    params: ListParams,
    execute: async (params) => {
      const { simRootId } = params as z.infer<typeof ListParams>;

      let stateNodes: SceneNode[];
      if (simRootId) {
        stateNodes = findChildrenByType(simRootId, NODE_TYPES.INITIAL_STATE);
      } else {
        stateNodes = findStoreNodesByType(NODE_TYPES.INITIAL_STATE);
      }

      const states = stateNodes.map((n) => ({
        id: n.id,
        name: n.name,
        isInitial: n.properties.isInitial as boolean,
        width: n.properties.width as number,
        height: n.properties.height as number,
        capturedAt: n.properties.capturedAt as string,
        propertyCount: (n.properties.propertyNames as string[] | undefined)?.length ?? 0,
      }));

      return { success: true, data: { states } };
    },
  });

  registry.register({
    name: 'state.delete',
    description: 'Delete a state node',
    category: 'state',
    params: IdParams,
    execute: async (params) => {
      const { id } = params as z.infer<typeof IdParams>;
      const node = getStoreNode(id);
      if (!node || node.type !== NODE_TYPES.INITIAL_STATE) {
        return { success: false, error: `State node "${id}" not found` };
      }

      sceneStoreActions.removeNode(id);
      eventBus.emit('scene:nodeRemoved', { id });
      return { success: true, data: { id } };
    },
  });
}
