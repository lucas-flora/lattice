/**
 * Node commands: compile, add/remove nodes, connect/disconnect edges,
 * open editor, auto-layout.
 *
 * Follows Three Surface Doctrine: all node operations are commands.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';
import type { EventBus } from '../../engine/core/EventBus';
import { compileNodeGraph } from '../../engine/nodes/NodeCompiler';
import { nodeTypeRegistry } from '../../engine/nodes/NodeTypeRegistry';
import { registerBuiltinNodes } from '../../engine/nodes/builtinNodes';
import type { NodeGraph, NodeInstance, Edge } from '../../engine/nodes/types';
// layoutStore no longer needed — node.openEditor delegates to ui.toggleNodeEditor

// Ensure builtin nodes are registered
let registered = false;
function ensureRegistered() {
  if (!registered && nodeTypeRegistry.getAll().length === 0) {
    registerBuiltinNodes();
    registered = true;
  }
}

const CompileParams = z.object({
  tagId: z.string(),
}).describe('{ tagId: string }');

const AddNodeParams = z.object({
  tagId: z.string(),
  type: z.string(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  data: z.record(z.unknown()).optional(),
}).describe('{ tagId: string, type: string, [position], [data] }');

const RemoveNodeParams = z.object({
  tagId: z.string(),
  nodeId: z.string(),
}).describe('{ tagId: string, nodeId: string }');

const ConnectParams = z.object({
  tagId: z.string(),
  source: z.string(),
  sourcePort: z.string(),
  target: z.string(),
  targetPort: z.string(),
}).describe('{ tagId, source, sourcePort, target, targetPort }');

const DisconnectParams = z.object({
  tagId: z.string(),
  edgeId: z.string(),
}).describe('{ tagId: string, edgeId: string }');

const OpenEditorParams = z.object({
  tagId: z.string().optional(),
}).describe('{ tagId?: string }');

const AutoLayoutParams = z.object({
  tagId: z.string(),
}).describe('{ tagId: string }');

export function registerNodeCommands(
  registry: CommandRegistry,
  controller: SimulationController,
  eventBus: EventBus,
): void {
  ensureRegistered();

  // --- node.compile ---
  registry.register({
    name: 'node.compile',
    description: 'Compile node graph on an operator to Python code',
    category: 'node',
    params: CompileParams,
    execute: async (params) => {
      const { tagId } = params as z.infer<typeof CompileParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) return { success: false, error: 'No simulation loaded' };

      const tag = tagRegistry.get(tagId);
      if (!tag) return { success: false, error: `Tag "${tagId}" not found` };
      if (!tag.nodeGraph) return { success: false, error: 'Tag has no node graph' };

      try {
        const result = compileNodeGraph(tag.nodeGraph);
        tagRegistry.update(tagId, {
          code: result.code,
          inputs: result.inputs,
          outputs: result.outputs,
        });
        eventBus.emit('tag:updated', { id: tagId, code: result.code });
        controller.onTagChanged();
        return { success: true, data: result };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    },
  });

  // --- node.addNode ---
  registry.register({
    name: 'node.addNode',
    description: 'Add a node to an operator\'s node graph',
    category: 'node',
    params: AddNodeParams,
    execute: async (params) => {
      const { tagId, type, position, data } = params as z.infer<typeof AddNodeParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) return { success: false, error: 'No simulation loaded' };

      const tag = tagRegistry.get(tagId);
      if (!tag) return { success: false, error: `Tag "${tagId}" not found` };

      if (!nodeTypeRegistry.has(type)) {
        return { success: false, error: `Unknown node type: "${type}"` };
      }

      const graph: NodeGraph = tag.nodeGraph ?? { nodes: [], edges: [] };
      const newNode: NodeInstance = {
        id: String(Date.now()),
        type,
        position: position ?? { x: 0, y: 0 },
        data: data ?? {},
      };
      const updatedGraph: NodeGraph = {
        nodes: [...graph.nodes, newNode],
        edges: graph.edges,
      };

      tagRegistry.update(tagId, { nodeGraph: updatedGraph } as Parameters<typeof tagRegistry.update>[1]);
      eventBus.emit('tag:updated', { id: tagId });
      return { success: true, data: newNode };
    },
  });

  // --- node.removeNode ---
  registry.register({
    name: 'node.removeNode',
    description: 'Remove a node from an operator\'s node graph',
    category: 'node',
    params: RemoveNodeParams,
    execute: async (params) => {
      const { tagId, nodeId } = params as z.infer<typeof RemoveNodeParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) return { success: false, error: 'No simulation loaded' };

      const tag = tagRegistry.get(tagId);
      if (!tag?.nodeGraph) return { success: false, error: 'Tag has no node graph' };

      const updatedGraph: NodeGraph = {
        nodes: tag.nodeGraph.nodes.filter((n) => n.id !== nodeId),
        edges: tag.nodeGraph.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      };

      tagRegistry.update(tagId, { nodeGraph: updatedGraph } as Parameters<typeof tagRegistry.update>[1]);
      eventBus.emit('tag:updated', { id: tagId });
      return { success: true, data: { nodeId } };
    },
  });

  // --- node.connect ---
  registry.register({
    name: 'node.connect',
    description: 'Connect two ports in an operator\'s node graph',
    category: 'node',
    params: ConnectParams,
    execute: async (params) => {
      const { tagId, source, sourcePort, target, targetPort } = params as z.infer<typeof ConnectParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) return { success: false, error: 'No simulation loaded' };

      const tag = tagRegistry.get(tagId);
      if (!tag?.nodeGraph) return { success: false, error: 'Tag has no node graph' };

      const newEdge: Edge = {
        id: `e${Date.now()}`,
        source,
        sourcePort,
        target,
        targetPort,
      };
      const updatedGraph: NodeGraph = {
        nodes: tag.nodeGraph.nodes,
        edges: [...tag.nodeGraph.edges, newEdge],
      };

      tagRegistry.update(tagId, { nodeGraph: updatedGraph } as Parameters<typeof tagRegistry.update>[1]);
      eventBus.emit('tag:updated', { id: tagId });
      return { success: true, data: newEdge };
    },
  });

  // --- node.disconnect ---
  registry.register({
    name: 'node.disconnect',
    description: 'Remove an edge from an operator\'s node graph',
    category: 'node',
    params: DisconnectParams,
    execute: async (params) => {
      const { tagId, edgeId } = params as z.infer<typeof DisconnectParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) return { success: false, error: 'No simulation loaded' };

      const tag = tagRegistry.get(tagId);
      if (!tag?.nodeGraph) return { success: false, error: 'Tag has no node graph' };

      const updatedGraph: NodeGraph = {
        nodes: tag.nodeGraph.nodes,
        edges: tag.nodeGraph.edges.filter((e) => e.id !== edgeId),
      };

      tagRegistry.update(tagId, { nodeGraph: updatedGraph } as Parameters<typeof tagRegistry.update>[1]);
      eventBus.emit('tag:updated', { id: tagId });
      return { success: true, data: { edgeId } };
    },
  });

  // --- node.openEditor ---
  registry.register({
    name: 'node.openEditor',
    description: 'Open/focus the node editor panel for a specific op',
    category: 'node',
    params: OpenEditorParams,
    execute: async (params) => {
      const { tagId } = params as z.infer<typeof OpenEditorParams>;
      // Delegate to ui.toggleNodeEditor which handles per-op tab management
      return registry.execute('ui.toggleNodeEditor', { tagId });
    },
  });

  // --- node.autoLayout ---
  registry.register({
    name: 'node.autoLayout',
    description: 'Auto-arrange nodes in an operator\'s node graph',
    category: 'node',
    params: AutoLayoutParams,
    execute: async (params) => {
      const { tagId } = params as z.infer<typeof AutoLayoutParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) return { success: false, error: 'No simulation loaded' };

      const tag = tagRegistry.get(tagId);
      if (!tag?.nodeGraph) return { success: false, error: 'Tag has no node graph' };

      const { nodes, edges } = tag.nodeGraph;

      // Simple layered layout (left-to-right)
      const depths = new Map<string, number>();
      const adj = new Map<string, string[]>();
      for (const n of nodes) {
        adj.set(n.id, []);
        depths.set(n.id, 0);
      }
      for (const e of edges) {
        adj.get(e.source)?.push(e.target);
      }

      const sources = nodes
        .filter((n) => !edges.some((e) => e.target === n.id))
        .map((n) => n.id);
      const queue = sources.map((id) => ({ id, depth: 0 }));
      while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        if (depth > (depths.get(id) ?? 0)) depths.set(id, depth);
        for (const next of adj.get(id) ?? []) {
          queue.push({ id: next, depth: depth + 1 });
        }
      }

      const layerCounts = new Map<number, number>();
      const layoutNodes = nodes.map((n) => {
        const d = depths.get(n.id) ?? 0;
        const row = layerCounts.get(d) ?? 0;
        layerCounts.set(d, row + 1);
        return { ...n, position: { x: d * 220, y: row * 100 } };
      });

      const updatedGraph: NodeGraph = { nodes: layoutNodes, edges };
      tagRegistry.update(tagId, { nodeGraph: updatedGraph } as Parameters<typeof tagRegistry.update>[1]);
      eventBus.emit('tag:updated', { id: tagId });
      return { success: true };
    },
  });
}
