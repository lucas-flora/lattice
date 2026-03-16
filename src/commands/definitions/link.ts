/**
 * Link commands: add, remove, list, clear, enable, disable parameter links.
 *
 * Each link.add now also creates an ExpressionTag in the unified registry.
 * The old LinkRegistry is kept for backward compatibility during migration.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';
import type { EventBus } from '../../engine/core/EventBus';
import type { EasingType } from '../../engine/linking/types';

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
      const linkRegistry = controller.getLinkRegistry();
      if (!linkRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }

      // Resolve easing: could come as named param or positional string
      let easing = parsed.easing;
      if (!easing && typeof parsed.easing === 'string' && VALID_EASINGS.includes(parsed.easing as typeof VALID_EASINGS[number])) {
        easing = parsed.easing as typeof VALID_EASINGS[number];
      }

      // Resolve ranges: prefer explicit tuples, fall back to positional args
      const sourceRange = parsed.sourceRange ??
        (parsed.srcMin !== undefined && parsed.srcMax !== undefined
          ? [parsed.srcMin, parsed.srcMax] as [number, number]
          : undefined);
      const targetRange = parsed.targetRange ??
        (parsed.dstMin !== undefined && parsed.dstMax !== undefined
          ? [parsed.dstMin, parsed.dstMax] as [number, number]
          : undefined);

      try {
        const link = linkRegistry.add({
          source: parsed.source,
          target: parsed.target,
          sourceRange,
          targetRange,
          easing,
        });
        eventBus.emit('link:added', link);

        // Also create an ExpressionTag in the unified registry
        const tagRegistry = controller.getTagRegistry();
        if (tagRegistry) {
          const tag = tagRegistry.addFromLink(
            parsed.source,
            parsed.target,
            link.sourceRange,
            link.targetRange,
            link.easing as EasingType,
            link.enabled,
          );
          eventBus.emit('tag:added', tag);
        }

        controller.onLinkChanged();
        return { success: true, data: link };
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
      const linkRegistry = controller.getLinkRegistry();
      if (!linkRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }

      // Find the corresponding tag before removing the link
      const tagRegistry = controller.getTagRegistry();
      const link = linkRegistry.get(id);

      const removed = linkRegistry.remove(id);
      if (!removed) {
        return { success: false, error: `Link "${id}" not found` };
      }
      eventBus.emit('link:removed', { id });

      // Also remove the corresponding tag
      if (tagRegistry && link) {
        const matchingTags = tagRegistry.getAll().filter(
          (t) => t.linkMeta?.sourceAddress === link.source && t.outputs.includes(link.target),
        );
        for (const tag of matchingTags) {
          tagRegistry.remove(tag.id);
          eventBus.emit('tag:removed', { id: tag.id });
        }
      }

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
      const linkRegistry = controller.getLinkRegistry();
      if (!linkRegistry) {
        return { success: true, data: { links: [] } };
      }
      return { success: true, data: { links: linkRegistry.getAll() } };
    },
  });

  registry.register({
    name: 'link.clear',
    description: 'Remove all parameter links',
    category: 'link',
    params: NoParams,
    execute: async () => {
      const linkRegistry = controller.getLinkRegistry();
      if (!linkRegistry) {
        return { success: true, data: { cleared: true } };
      }
      linkRegistry.clear();
      eventBus.emit('link:reset', {});

      // Also clear link-sourced tags
      const tagRegistry = controller.getTagRegistry();
      if (tagRegistry) {
        const linkTags = tagRegistry.getAll().filter((t) => t.linkMeta !== undefined);
        for (const tag of linkTags) {
          tagRegistry.remove(tag.id);
        }
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
      const linkRegistry = controller.getLinkRegistry();
      if (!linkRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }
      const link = linkRegistry.get(id);
      if (!link) {
        return { success: false, error: `Link "${id}" not found` };
      }
      linkRegistry.enable(id);
      eventBus.emit('link:updated', { id, enabled: true });

      // Also enable the corresponding tag
      const tagRegistry = controller.getTagRegistry();
      if (tagRegistry) {
        const matchingTags = tagRegistry.getAll().filter(
          (t) => t.linkMeta?.sourceAddress === link.source && t.outputs.includes(link.target),
        );
        for (const tag of matchingTags) {
          tagRegistry.enable(tag.id);
          eventBus.emit('tag:updated', { id: tag.id, enabled: true });
        }
      }

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
      const linkRegistry = controller.getLinkRegistry();
      if (!linkRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }
      const link = linkRegistry.get(id);
      if (!link) {
        return { success: false, error: `Link "${id}" not found` };
      }
      linkRegistry.disable(id);
      eventBus.emit('link:updated', { id, enabled: false });

      // Also disable the corresponding tag
      const tagRegistry = controller.getTagRegistry();
      if (tagRegistry) {
        const matchingTags = tagRegistry.getAll().filter(
          (t) => t.linkMeta?.sourceAddress === link.source && t.outputs.includes(link.target),
        );
        for (const tag of matchingTags) {
          tagRegistry.disable(tag.id);
          eventBus.emit('tag:updated', { id: tag.id, enabled: false });
        }
      }

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
      const linkRegistry = controller.getLinkRegistry();
      if (!linkRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }

      const sourceRange = parsed.sourceRange ??
        (parsed.srcMin !== undefined && parsed.srcMax !== undefined
          ? [parsed.srcMin, parsed.srcMax] as [number, number]
          : undefined);
      const targetRange = parsed.targetRange ??
        (parsed.dstMin !== undefined && parsed.dstMax !== undefined
          ? [parsed.dstMin, parsed.dstMax] as [number, number]
          : undefined);

      const patch: { sourceRange?: [number, number]; targetRange?: [number, number]; easing?: typeof VALID_EASINGS[number] } = {};
      if (sourceRange) patch.sourceRange = sourceRange;
      if (targetRange) patch.targetRange = targetRange;
      if (parsed.easing) patch.easing = parsed.easing;

      const link = linkRegistry.get(parsed.id);
      const updated = linkRegistry.update(parsed.id, patch);
      if (!updated) {
        return { success: false, error: `Link "${parsed.id}" not found` };
      }
      eventBus.emit('link:updated', { id: parsed.id, ...patch });

      // Also update the corresponding tag's linkMeta
      const tagRegistry = controller.getTagRegistry();
      if (tagRegistry && link) {
        const matchingTags = tagRegistry.getAll().filter(
          (t) => t.linkMeta?.sourceAddress === link.source && t.outputs.includes(link.target),
        );
        for (const tag of matchingTags) {
          const updatedMeta = {
            ...tag.linkMeta!,
            ...(sourceRange ? { sourceRange } : {}),
            ...(targetRange ? { targetRange } : {}),
            ...(parsed.easing ? { easing: parsed.easing as EasingType } : {}),
          };
          tagRegistry.update(tag.id, { linkMeta: updatedMeta });
          eventBus.emit('tag:updated', { id: tag.id });
        }
      }

      controller.onLinkChanged();
      return { success: true, data: updated };
    },
  });
}
