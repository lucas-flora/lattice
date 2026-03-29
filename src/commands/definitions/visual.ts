/**
 * Visual mapping commands.
 *
 * Commands for managing the Visual node's color ramp configuration.
 * These update the scene graph's Visual node properties and trigger
 * GPU recompilation of the ramp compute pass.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';
import type { EventBus } from '../../engine/core/EventBus';
import { useSceneStore } from '../../store/sceneStore';
import { NODE_TYPES } from '../../engine/scene/SceneNode';

const UpdateStopParams = z.object({
  nodeId: z.string(),
  index: z.number().int().min(0),
  color: z.string().optional(),
  t: z.number().min(0).max(1).optional(),
}).describe('{ nodeId, index, color?, t? }');

const RemoveStopParams = z.object({
  nodeId: z.string(),
  index: z.number().int().min(0),
}).describe('{ nodeId, index }');

const AddStopParams = z.object({
  nodeId: z.string(),
  t: z.number().min(0).max(1),
  color: z.string().default('#ffffff'),
}).describe('{ nodeId, t, color? }');

/** After a visual mapping edit, trigger full recompilation through the unified op path */
function triggerVisualRecompile(controller: SimulationController): void {
  controller.onTagChanged();
}

export function registerVisualCommands(
  registry: CommandRegistry,
  controller: SimulationController,
  _eventBus: EventBus,
): void {
  registry.register({
    name: 'visual.updateStop',
    description: 'Update a color stop in the visual mapping ramp',
    category: 'visual',
    params: UpdateStopParams,
    execute: async (params) => {
      const { nodeId, index, color, t } = params as z.infer<typeof UpdateStopParams>;
      const state = useSceneStore.getState();
      const node = state.nodes[nodeId];
      if (!node || node.type !== NODE_TYPES.VISUAL) {
        return { success: false, error: `Node ${nodeId} is not a visual node` };
      }
      const mappings = [...((node.properties.mappings as unknown[]) ?? [])];
      const colorMapping = mappings.find((m: any) => m.channel === 'color') as any;
      if (!colorMapping?.stops?.[index]) {
        return { success: false, error: `Stop ${index} not found` };
      }
      const newStops = [...colorMapping.stops];
      if (color !== undefined) newStops[index] = { ...newStops[index], color };
      if (t !== undefined) newStops[index] = { ...newStops[index], t };
      const newMapping = { ...colorMapping, stops: newStops };
      const newMappings = mappings.map((m: any) => m.channel === 'color' ? newMapping : m);
      useSceneStore.setState(s => ({
        nodes: { ...s.nodes, [nodeId]: { ...node, properties: { ...node.properties, mappings: newMappings } } },
      }));
      triggerVisualRecompile(controller);
      return { success: true };
    },
  });

  registry.register({
    name: 'visual.removeStop',
    description: 'Remove a color stop from the visual mapping ramp',
    category: 'visual',
    params: RemoveStopParams,
    execute: async (params) => {
      const { nodeId, index } = params as z.infer<typeof RemoveStopParams>;
      const state = useSceneStore.getState();
      const node = state.nodes[nodeId];
      if (!node || node.type !== NODE_TYPES.VISUAL) {
        return { success: false, error: `Node ${nodeId} is not a visual node` };
      }
      const mappings = [...((node.properties.mappings as unknown[]) ?? [])];
      const colorMapping = mappings.find((m: any) => m.channel === 'color') as any;
      if (!colorMapping?.stops?.[index]) {
        return { success: false, error: `Stop ${index} not found` };
      }
      const newStops = colorMapping.stops.filter((_: unknown, i: number) => i !== index);
      const newMapping = { ...colorMapping, stops: newStops };
      const newMappings = mappings.map((m: any) => m.channel === 'color' ? newMapping : m);
      useSceneStore.setState(s => ({
        nodes: { ...s.nodes, [nodeId]: { ...node, properties: { ...node.properties, mappings: newMappings } } },
      }));
      triggerVisualRecompile(controller);
      return { success: true };
    },
  });

  registry.register({
    name: 'visual.addStop',
    description: 'Add a color stop to the visual mapping ramp',
    category: 'visual',
    params: AddStopParams,
    execute: async (params) => {
      const { nodeId, t, color } = params as z.infer<typeof AddStopParams>;
      const state = useSceneStore.getState();
      const node = state.nodes[nodeId];
      if (!node || node.type !== NODE_TYPES.VISUAL) {
        return { success: false, error: `Node ${nodeId} is not a visual node` };
      }
      const mappings = [...((node.properties.mappings as unknown[]) ?? [])];
      const colorMapping = mappings.find((m: any) => m.channel === 'color') as any;
      if (!colorMapping) {
        return { success: false, error: 'No color mapping found' };
      }
      const newStops = [...(colorMapping.stops ?? []), { t, color }].sort((a: any, b: any) => a.t - b.t);
      const newMapping = { ...colorMapping, stops: newStops };
      const newMappings = mappings.map((m: any) => m.channel === 'color' ? newMapping : m);
      useSceneStore.setState(s => ({
        nodes: { ...s.nodes, [nodeId]: { ...node, properties: { ...node.properties, mappings: newMappings } } },
      }));
      triggerVisualRecompile(controller);
      return { success: true };
    },
  });

  registry.register({
    name: 'visual.list',
    description: 'List current visual mapping configuration',
    category: 'visual',
    params: z.object({}).describe('{}'),
    execute: async () => {
      const state = useSceneStore.getState();
      const visualNodes = Object.values(state.nodes).filter(n => n.type === NODE_TYPES.VISUAL);
      if (visualNodes.length === 0) {
        return { success: true, data: { mappings: [] } };
      }
      const mappings = visualNodes[0].properties.mappings ?? [];
      return { success: true, data: { mappings } };
    },
  });
}
