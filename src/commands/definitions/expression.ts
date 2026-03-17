/**
 * Expression commands: set, clear, list per-property Python expressions.
 *
 * All operations go through ExpressionTagRegistry only.
 * Lazily creates PyodideBridge on first use.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';
import type { EventBus } from '../../engine/core/EventBus';

const SetParams = z.object({
  property: z.string(),
  expression: z.string(),
}).describe('{ property: string, expression: string }');

const ClearParams = z.object({
  property: z.string(),
}).describe('{ property: string }');

const NoParams = z.object({}).describe('none');

export function registerExpressionCommands(
  registry: CommandRegistry,
  controller: SimulationController,
  eventBus?: EventBus,
): void {
  registry.register({
    name: 'expr.set',
    description: 'Set a per-property Python expression',
    category: 'expr',
    params: SetParams,
    execute: async (params) => {
      const { property, expression } = params as z.infer<typeof SetParams>;

      // Validate property exists
      const sim = controller.getSimulation();
      if (!sim) {
        return { success: false, error: 'No simulation loaded' };
      }
      const props = sim.typeRegistry.getPropertyUnion();
      if (!props.some((p) => p.name === property)) {
        return { success: false, error: `Unknown property: "${property}". Available: ${props.map((p) => p.name).join(', ')}` };
      }

      // Ensure Pyodide bridge exists
      controller.ensurePyodideBridge();

      const tagRegistry = controller.getTagRegistry();
      if (tagRegistry && eventBus) {
        // Remove existing expression tag for this property (if any)
        const existing = tagRegistry.getAll().find(
          (t) => t.source === 'code' && !t.linkMeta && t.outputs.includes(`cell.${property}`),
        );
        if (existing) {
          tagRegistry.remove(existing.id);
          eventBus.emit('tag:removed', { id: existing.id });
        }

        const tag = tagRegistry.addFromExpression(property, expression);
        eventBus.emit('tag:added', tag);
        controller.onTagChanged();
      }

      return { success: true, data: { property, expression } };
    },
  });

  registry.register({
    name: 'expr.clear',
    description: 'Clear expression from a property',
    category: 'expr',
    params: ClearParams,
    execute: async (params) => {
      const { property } = params as z.infer<typeof ClearParams>;

      const tagRegistry = controller.getTagRegistry();
      if (tagRegistry && eventBus) {
        const existing = tagRegistry.getAll().find(
          (t) => t.source === 'code' && !t.linkMeta && t.outputs.includes(`cell.${property}`),
        );
        if (existing) {
          const wasEnabled = existing.enabled;
          tagRegistry.remove(existing.id);
          eventBus.emit('tag:removed', { id: existing.id });
          if (wasEnabled) {
            controller.onTagChanged();
          }
        }
      }

      return { success: true, data: { property } };
    },
  });

  registry.register({
    name: 'expr.list',
    description: 'List all active expressions',
    category: 'expr',
    params: NoParams,
    execute: async () => {
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: true, data: { expressions: {} } };
      }
      const postRuleExprs = tagRegistry.getPostRuleExpressions();
      return { success: true, data: { expressions: postRuleExprs } };
    },
  });

  registry.register({
    name: 'expr.clearAll',
    description: 'Clear all expressions',
    category: 'expr',
    params: NoParams,
    execute: async () => {
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry || !eventBus) {
        return { success: true, data: { cleared: 0 } };
      }

      // Remove all code-sourced post-rule tags (excluding link-created ones)
      const codeTags = tagRegistry.getAll().filter(
        (t) => t.source === 'code' && !t.linkMeta && t.phase === 'post-rule',
      );
      const hadEnabled = codeTags.some((t) => t.enabled);
      for (const tag of codeTags) {
        tagRegistry.remove(tag.id);
        eventBus.emit('tag:removed', { id: tag.id });
      }
      if (hadEnabled) {
        controller.onTagChanged();
      }

      return { success: true, data: { cleared: codeTags.length } };
    },
  });
}
