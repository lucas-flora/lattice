/**
 * Link commands: add, remove, list, clear, enable, disable parameter links.
 *
 * All link operations go through ExpressionTagRegistry. Links are a creation
 * wizard that produces code tags with linkMeta for JS fast-path resolution.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';
import type { EventBus } from '../../engine/core/EventBus';
import type { EasingType } from '../../engine/expression/types';

const VALID_EASINGS = ['linear', 'smoothstep', 'easeIn', 'easeOut', 'easeInOut'] as const;

const AddParams = z.object({
  source: z.string(),
  target: z.string(),
  sourceRange: z.tuple([z.number(), z.number()]).optional(),
  targetRange: z.tuple([z.number(), z.number()]).optional(),
  easing: z.enum(VALID_EASINGS).optional(),
  // CLI positional args (converted to sourceRange/targetRange/easing below)
  srcMin: z.number().optional(),
  srcMax: z.number().optional(),
  dstMin: z.number().optional(),
  dstMax: z.number().optional(),
}).describe('{ source, target, [easing], [srcMin], [srcMax], [dstMin], [dstMax] }');

const IdParams = z.object({
  id: z.string(),
}).describe('{ id: string }');

const EditParams = z.object({
  id: z.string(),
  sourceRange: z.tuple([z.number(), z.number()]).optional(),
  targetRange: z.tuple([z.number(), z.number()]).optional(),
  easing: z.enum(VALID_EASINGS).optional(),
  srcMin: z.number().optional(),
  srcMax: z.number().optional(),
  dstMin: z.number().optional(),
  dstMax: z.number().optional(),
}).describe('{ id, [sourceRange], [targetRange], [easing], [srcMin], [srcMax], [dstMin], [dstMax] }');

const NoParams = z.object({}).describe('none');

export function registerLinkCommands(
  registry: CommandRegistry,
  controller: SimulationController,
  eventBus: EventBus,
): void {
  registry.register({
    name: 'link.add',
    description: 'Add a parameter link',
    category: 'link',
    params: AddParams,
    execute: async (params) => {
      const parsed = params as z.infer<typeof AddParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }

      const easing = parsed.easing ?? 'linear';

      const sourceRange = parsed.sourceRange ??
        (parsed.srcMin !== undefined && parsed.srcMax !== undefined
          ? [parsed.srcMin, parsed.srcMax] as [number, number]
          : [0, 1] as [number, number]);
      const targetRange = parsed.targetRange ??
        (parsed.dstMin !== undefined && parsed.dstMax !== undefined
          ? [parsed.dstMin, parsed.dstMax] as [number, number]
          : [0, 1] as [number, number]);

      try {
        const tag = tagRegistry.addFromLink(
          parsed.source,
          parsed.target,
          sourceRange,
          targetRange,
          easing as EasingType,
          true,
        );
        eventBus.emit('tag:added', tag);
        controller.onLinkChanged();
        return { success: true, data: tag };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    },
  });

  registry.register({
    name: 'link.remove',
    description: 'Remove a parameter link by ID',
    category: 'link',
    params: IdParams,
    execute: async (params) => {
      const { id } = params as z.infer<typeof IdParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }

      // Find op — could be by op ID or by matching linkMeta
      const tag = tagRegistry.get(id);
      if (!tag) {
        return { success: false, error: `Link/op "${id}" not found` };
      }

      tagRegistry.remove(id);
      eventBus.emit('tag:removed', { id });
      controller.onLinkChanged();
      return { success: true, data: { id } };
    },
  });

  registry.register({
    name: 'link.list',
    description: 'List all parameter links',
    category: 'link',
    params: NoParams,
    execute: async () => {
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: true, data: { links: [] } };
      }
      const linkTags = tagRegistry.getAll().filter(t => t.linkMeta !== undefined);
      return { success: true, data: { links: linkTags } };
    },
  });

  registry.register({
    name: 'link.clear',
    description: 'Remove all parameter links',
    category: 'link',
    params: NoParams,
    execute: async () => {
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: true, data: { cleared: true } };
      }

      const linkTags = tagRegistry.getAll().filter((t) => t.linkMeta !== undefined);
      for (const tag of linkTags) {
        tagRegistry.remove(tag.id);
      }
      if (linkTags.length > 0) {
        eventBus.emit('tag:reset', {});
      }

      controller.onLinkChanged();
      return { success: true, data: { cleared: true } };
    },
  });

  registry.register({
    name: 'link.enable',
    description: 'Enable a parameter link',
    category: 'link',
    params: IdParams,
    execute: async (params) => {
      const { id } = params as z.infer<typeof IdParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }
      const tag = tagRegistry.get(id);
      if (!tag) {
        return { success: false, error: `Link/op "${id}" not found` };
      }
      tagRegistry.enable(id);
      eventBus.emit('tag:updated', { id, enabled: true });
      controller.onLinkChanged();
      return { success: true, data: { id, enabled: true } };
    },
  });

  registry.register({
    name: 'link.disable',
    description: 'Disable a parameter link',
    category: 'link',
    params: IdParams,
    execute: async (params) => {
      const { id } = params as z.infer<typeof IdParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }
      const tag = tagRegistry.get(id);
      if (!tag) {
        return { success: false, error: `Link/op "${id}" not found` };
      }
      tagRegistry.disable(id);
      eventBus.emit('tag:updated', { id, enabled: false });
      controller.onLinkChanged();
      return { success: true, data: { id, enabled: false } };
    },
  });

  registry.register({
    name: 'link.edit',
    description: 'Edit a parameter link (range/easing)',
    category: 'link',
    params: EditParams,
    execute: async (params) => {
      const parsed = params as z.infer<typeof EditParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }

      const tag = tagRegistry.get(parsed.id);
      if (!tag || !tag.linkMeta) {
        return { success: false, error: `Link/op "${parsed.id}" not found` };
      }

      const sourceRange = parsed.sourceRange ??
        (parsed.srcMin !== undefined && parsed.srcMax !== undefined
          ? [parsed.srcMin, parsed.srcMax] as [number, number]
          : undefined);
      const targetRange = parsed.targetRange ??
        (parsed.dstMin !== undefined && parsed.dstMax !== undefined
          ? [parsed.dstMin, parsed.dstMax] as [number, number]
          : undefined);

      const updatedMeta = {
        ...tag.linkMeta,
        ...(sourceRange ? { sourceRange } : {}),
        ...(targetRange ? { targetRange } : {}),
        ...(parsed.easing ? { easing: parsed.easing as EasingType } : {}),
      };

      const updated = tagRegistry.update(parsed.id, { linkMeta: updatedMeta });
      if (!updated) {
        return { success: false, error: `Failed to update op "${parsed.id}"` };
      }

      eventBus.emit('tag:updated', { id: parsed.id });
      controller.onLinkChanged();
      return { success: true, data: updated };
    },
  });
}
