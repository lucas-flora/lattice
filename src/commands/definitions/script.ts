/**
 * Script commands: add, remove, list, enable, disable, show global scripts.
 *
 * All operations go through ExpressionTagRegistry only.
 * Lazily creates PyodideBridge on first use.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';
import type { EventBus } from '../../engine/core/EventBus';

const AddParams = z.object({
  name: z.string(),
  code: z.string(),
  inputs: z.array(z.string()).optional(),
  outputs: z.array(z.string()).optional(),
}).describe('{ name: string, code: string, inputs?: string[], outputs?: string[] }');

const NameParams = z.object({
  name: z.string(),
}).describe('{ name: string }');

const NoParams = z.object({}).describe('none');

export function registerScriptCommands(
  registry: CommandRegistry,
  controller: SimulationController,
  eventBus: EventBus,
): void {
  registry.register({
    name: 'script.list',
    description: 'List all global scripts',
    category: 'script',
    params: NoParams,
    execute: async () => {
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: true, data: { scripts: [] } };
      }
      const scriptTags = tagRegistry.getAll().filter((t) => t.source === 'script');
      const scripts = scriptTags.map((t) => ({
        name: t.name,
        enabled: t.enabled,
        inputs: t.inputs,
        outputs: t.outputs,
      }));
      return { success: true, data: { scripts } };
    },
  });

  registry.register({
    name: 'script.add',
    description: 'Add a global script',
    category: 'script',
    params: AddParams,
    execute: async (params) => {
      const { name, code, inputs, outputs } = params as z.infer<typeof AddParams>;

      // Ensure Pyodide bridge exists
      controller.ensurePyodideBridge();

      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }

      // Remove existing tag for this script (if any)
      const existing = tagRegistry.getAll().find(
        (t) => t.source === 'script' && t.name === name,
      );
      if (existing) {
        tagRegistry.remove(existing.id);
        eventBus.emit('tag:removed', { id: existing.id });
      }

      const tag = tagRegistry.addFromScript(name, code, inputs ?? [], outputs ?? [], true);
      eventBus.emit('tag:added', tag);

      return { success: true, data: { name } };
    },
  });

  registry.register({
    name: 'script.remove',
    description: 'Remove a global script',
    category: 'script',
    params: NameParams,
    execute: async (params) => {
      const { name } = params as z.infer<typeof NameParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No scripts loaded' };
      }

      const matchingTag = tagRegistry.getAll().find(
        (t) => t.source === 'script' && t.name === name,
      );
      if (!matchingTag) {
        return { success: false, error: `Script "${name}" not found` };
      }

      tagRegistry.remove(matchingTag.id);
      eventBus.emit('tag:removed', { id: matchingTag.id });

      return { success: true, data: { name } };
    },
  });

  registry.register({
    name: 'script.enable',
    description: 'Enable a global script',
    category: 'script',
    params: NameParams,
    execute: async (params) => {
      const { name } = params as z.infer<typeof NameParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No scripts loaded' };
      }

      const matchingTag = tagRegistry.getAll().find(
        (t) => t.source === 'script' && t.name === name,
      );
      if (!matchingTag) {
        return { success: false, error: `Script "${name}" not found` };
      }

      tagRegistry.enable(matchingTag.id);
      eventBus.emit('tag:updated', { id: matchingTag.id, enabled: true });

      return { success: true, data: { name, enabled: true } };
    },
  });

  registry.register({
    name: 'script.disable',
    description: 'Disable a global script',
    category: 'script',
    params: NameParams,
    execute: async (params) => {
      const { name } = params as z.infer<typeof NameParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No scripts loaded' };
      }

      const matchingTag = tagRegistry.getAll().find(
        (t) => t.source === 'script' && t.name === name,
      );
      if (!matchingTag) {
        return { success: false, error: `Script "${name}" not found` };
      }

      tagRegistry.disable(matchingTag.id);
      eventBus.emit('tag:updated', { id: matchingTag.id, enabled: false });

      return { success: true, data: { name, enabled: false } };
    },
  });

  registry.register({
    name: 'script.show',
    description: 'Show details of a global script',
    category: 'script',
    params: NameParams,
    execute: async (params) => {
      const { name } = params as z.infer<typeof NameParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No scripts loaded' };
      }

      const matchingTag = tagRegistry.getAll().find(
        (t) => t.source === 'script' && t.name === name,
      );
      if (!matchingTag) {
        return { success: false, error: `Script "${name}" not found` };
      }

      return { success: true, data: matchingTag };
    },
  });

  registry.register({
    name: 'script.clear',
    description: 'Remove all global scripts',
    category: 'script',
    params: NoParams,
    execute: async () => {
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: true, data: { removed: 0 } };
      }

      const scriptTags = tagRegistry.getAll().filter((t) => t.source === 'script');
      for (const tag of scriptTags) {
        tagRegistry.remove(tag.id);
        eventBus.emit('tag:removed', { id: tag.id });
      }

      return { success: true, data: { removed: scriptTags.length } };
    },
  });
}
