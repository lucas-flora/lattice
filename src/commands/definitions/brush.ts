/**
 * Brush commands: select, setRadius, add, remove, list, edit.
 *
 * M2: Three Surface Doctrine compliance — all brush actions available
 * via CommandRegistry (GUI, CLI, AI).
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import { useBrushStore, brushStoreActions, type BrushBlendMode } from '../../store/brushStore';
import type { Brush, BrushPropertyAction } from '../../engine/preset/schema';

const NoParams = z.object({}).describe('none');

const SelectParams = z.object({
  name: z.string().optional(),
  index: z.number().int().min(0).optional(),
}).describe('{ name?: string, index?: number }');

const SetRadiusParams = z.object({
  radius: z.number().min(1).max(100),
}).describe('{ radius: number }');

const SetBlendModeParams = z.object({
  mode: z.enum(['normal', 'set', 'add', 'multiply', 'random', 'clear']),
}).describe('{ mode: "normal"|"set"|"add"|"multiply"|"random"|"clear" }');

const BrushPropertyActionSchema = z.object({
  value: z.number(),
  mode: z.enum(['set', 'add', 'multiply', 'random']),
});

const AddParams = z.object({
  name: z.string().min(1),
  properties: z.record(z.string(), BrushPropertyActionSchema),
  radius: z.number().min(1).max(100).optional(),
  shape: z.enum(['circle', 'square']).optional(),
  falloff: z.enum(['hard', 'linear', 'smooth']).optional(),
}).describe('{ name, properties, radius?, shape?, falloff? }');

const RemoveParams = z.object({
  name: z.string().min(1),
}).describe('{ name: string }');

const EditParams = z.object({
  name: z.string().min(1),
  properties: z.record(z.string(), BrushPropertyActionSchema).optional(),
  radius: z.number().min(1).max(100).optional(),
  shape: z.enum(['circle', 'square']).optional(),
  falloff: z.enum(['hard', 'linear', 'smooth']).optional(),
}).describe('{ name, properties?, radius?, shape?, falloff? }');

export function registerBrushCommands(
  registry: CommandRegistry,
): void {
  registry.register({
    name: 'brush.select',
    description: 'Select a brush by name or index',
    category: 'brush',
    params: SelectParams,
    execute: async (params) => {
      const { name, index } = params as z.infer<typeof SelectParams>;
      if (name !== undefined) {
        const found = brushStoreActions.selectByName(name);
        if (!found) return { success: false, error: `Brush "${name}" not found` };
        return { success: true };
      }
      if (index !== undefined) {
        const { availableBrushes } = useBrushStore.getState();
        if (index >= availableBrushes.length) {
          return { success: false, error: `Brush index ${index} out of range (0-${availableBrushes.length - 1})` };
        }
        brushStoreActions.selectByIndex(index);
        return { success: true };
      }
      return { success: false, error: 'Provide name or index' };
    },
  });

  registry.register({
    name: 'brush.setRadius',
    description: 'Set the active brush radius (1-100)',
    category: 'brush',
    params: SetRadiusParams,
    execute: async (params) => {
      const { radius } = params as z.infer<typeof SetRadiusParams>;
      brushStoreActions.setRadiusOverride(radius);
      return { success: true, data: { radius } };
    },
  });

  registry.register({
    name: 'brush.setBlendMode',
    description: 'Set brush blend mode override (normal, set, add, multiply, random, clear)',
    category: 'brush',
    params: SetBlendModeParams,
    execute: async (params) => {
      const { mode } = params as z.infer<typeof SetBlendModeParams>;
      brushStoreActions.setBlendMode(mode as BrushBlendMode);
      return { success: true, data: { mode } };
    },
  });

  registry.register({
    name: 'brush.add',
    description: 'Add a new brush at runtime',
    category: 'brush',
    params: AddParams,
    execute: async (params) => {
      const p = params as z.infer<typeof AddParams>;
      const brush: Brush = {
        name: p.name,
        properties: p.properties as Record<string, BrushPropertyAction>,
        radius: p.radius ?? 5,
        shape: p.shape ?? 'circle',
        falloff: p.falloff ?? 'smooth',
      };
      brushStoreActions.addBrush(brush);
      return { success: true, data: { name: brush.name } };
    },
  });

  registry.register({
    name: 'brush.remove',
    description: 'Remove a brush by name',
    category: 'brush',
    params: RemoveParams,
    execute: async (params) => {
      const { name } = params as z.infer<typeof RemoveParams>;
      const removed = brushStoreActions.removeBrush(name);
      if (!removed) return { success: false, error: `Brush "${name}" not found` };
      return { success: true };
    },
  });

  registry.register({
    name: 'brush.list',
    description: 'List all available brushes',
    category: 'brush',
    params: NoParams,
    execute: async () => {
      const { availableBrushes, activeBrushIndex } = useBrushStore.getState();
      const radius = brushStoreActions.getEffectiveRadius();
      const list = availableBrushes.map((b, i) => ({
        index: i,
        name: b.name,
        active: i === activeBrushIndex,
        properties: Object.entries(b.properties).map(([k, v]) => `${k}:${v.mode}(${v.value})`).join(', '),
        radius: b.radius,
        shape: b.shape,
        falloff: b.falloff,
      }));
      const { blendMode } = useBrushStore.getState();
      return {
        success: true,
        data: { brushes: list, effectiveRadius: radius, blendMode },
      };
    },
  });

  registry.register({
    name: 'brush.cycleNext',
    description: 'Cycle to the next brush',
    category: 'brush',
    params: NoParams,
    execute: async () => {
      const { availableBrushes, activeBrushIndex } = useBrushStore.getState();
      if (availableBrushes.length <= 1) return { success: true };
      const next = (activeBrushIndex + 1) % availableBrushes.length;
      brushStoreActions.selectByIndex(next);
      return { success: true, data: { index: next, name: availableBrushes[next].name } };
    },
  });

  registry.register({
    name: 'brush.cycleBlendMode',
    description: 'Cycle to the next blend mode',
    category: 'brush',
    params: NoParams,
    execute: async () => {
      brushStoreActions.cycleBlendMode();
      const { blendMode } = useBrushStore.getState();
      return { success: true, data: { blendMode } };
    },
  });

  registry.register({
    name: 'brush.radiusDown',
    description: 'Decrease brush radius by 1',
    category: 'brush',
    params: NoParams,
    execute: async () => {
      brushStoreActions.adjustRadius(-1);
      return { success: true, data: { radius: brushStoreActions.getEffectiveRadius() } };
    },
  });

  registry.register({
    name: 'brush.radiusUp',
    description: 'Increase brush radius by 1',
    category: 'brush',
    params: NoParams,
    execute: async () => {
      brushStoreActions.adjustRadius(1);
      return { success: true, data: { radius: brushStoreActions.getEffectiveRadius() } };
    },
  });

  registry.register({
    name: 'brush.edit',
    description: 'Update an existing brush by name',
    category: 'brush',
    params: EditParams,
    execute: async (params) => {
      const { name, ...updates } = params as z.infer<typeof EditParams>;
      // Filter out undefined values
      const cleanUpdates: Partial<Omit<Brush, 'name'>> = {};
      if (updates.properties) cleanUpdates.properties = updates.properties as Record<string, BrushPropertyAction>;
      if (updates.radius !== undefined) cleanUpdates.radius = updates.radius;
      if (updates.shape !== undefined) cleanUpdates.shape = updates.shape;
      if (updates.falloff !== undefined) cleanUpdates.falloff = updates.falloff;
      const edited = brushStoreActions.editBrush(name, cleanUpdates);
      if (!edited) return { success: false, error: `Brush "${name}" not found` };
      return { success: true };
    },
  });
}
