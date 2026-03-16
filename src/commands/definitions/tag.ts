/**
 * Tag commands: list, show, setPhase, copy, enable, disable ExpressionTags.
 *
 * These operate on the unified ExpressionTagRegistry which holds all
 * computation primitives (links, expressions, scripts) as tags.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';
import type { EventBus } from '../../engine/core/EventBus';

const NoParams = z.object({}).describe('none');

const IdParams = z.object({
  id: z.string(),
}).describe('{ id: string }');

const SetPhaseParams = z.object({
  id: z.string(),
  phase: z.enum(['pre-rule', 'post-rule']),
}).describe('{ id: string, phase: "pre-rule" | "post-rule" }');

const CopyParams = z.object({
  id: z.string(),
  ownerType: z.enum(['cell-type', 'environment', 'global', 'root']),
  ownerId: z.string().optional(),
}).describe('{ id: string, ownerType: string, [ownerId]: string }');

export function registerTagCommands(
  registry: CommandRegistry,
  controller: SimulationController,
  eventBus: EventBus,
): void {
  registry.register({
    name: 'tag.list',
    description: 'List all expression tags',
    category: 'tag',
    params: NoParams,
    execute: async () => {
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: true, data: { tags: [] } };
      }
      const tags = tagRegistry.getAll().map((t) => ({
        id: t.id,
        name: t.name,
        source: t.source,
        phase: t.phase,
        enabled: t.enabled,
        owner: t.owner,
        inputs: t.inputs,
        outputs: t.outputs,
      }));
      return { success: true, data: { tags } };
    },
  });

  registry.register({
    name: 'tag.show',
    description: 'Show full details of an expression tag',
    category: 'tag',
    params: IdParams,
    execute: async (params) => {
      const { id } = params as z.infer<typeof IdParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }
      const tag = tagRegistry.get(id);
      if (!tag) {
        return { success: false, error: `Tag "${id}" not found` };
      }
      return { success: true, data: tag };
    },
  });

  registry.register({
    name: 'tag.setPhase',
    description: 'Change evaluation phase of a tag',
    category: 'tag',
    params: SetPhaseParams,
    execute: async (params) => {
      const { id, phase } = params as z.infer<typeof SetPhaseParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }
      const updated = tagRegistry.update(id, { phase });
      if (!updated) {
        return { success: false, error: `Tag "${id}" not found` };
      }
      eventBus.emit('tag:updated', { id, phase });
      controller.onTagChanged();
      return { success: true, data: { id, phase } };
    },
  });

  registry.register({
    name: 'tag.copy',
    description: 'Copy a tag to a new owner',
    category: 'tag',
    params: CopyParams,
    execute: async (params) => {
      const { id, ownerType, ownerId } = params as z.infer<typeof CopyParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }
      try {
        const copy = tagRegistry.copyToOwner(id, {
          type: ownerType,
          id: ownerId,
        });
        eventBus.emit('tag:added', copy);
        controller.onTagChanged();
        return { success: true, data: copy };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    },
  });

  registry.register({
    name: 'tag.enable',
    description: 'Enable an expression tag',
    category: 'tag',
    params: IdParams,
    execute: async (params) => {
      const { id } = params as z.infer<typeof IdParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }
      const tag = tagRegistry.get(id);
      if (!tag) {
        return { success: false, error: `Tag "${id}" not found` };
      }
      tagRegistry.enable(id);
      eventBus.emit('tag:updated', { id, enabled: true });
      controller.onTagChanged();
      return { success: true, data: { id, enabled: true } };
    },
  });

  registry.register({
    name: 'tag.disable',
    description: 'Disable an expression tag',
    category: 'tag',
    params: IdParams,
    execute: async (params) => {
      const { id } = params as z.infer<typeof IdParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }
      const tag = tagRegistry.get(id);
      if (!tag) {
        return { success: false, error: `Tag "${id}" not found` };
      }
      tagRegistry.disable(id);
      eventBus.emit('tag:updated', { id, enabled: false });
      controller.onTagChanged();
      return { success: true, data: { id, enabled: false } };
    },
  });
}
