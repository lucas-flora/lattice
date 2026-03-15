/**
 * Expression commands: set, clear, list per-property Python expressions.
 *
 * Lazily creates PyodideBridge and ExpressionEngine on first use.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';

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

      // Lazily create scripting engines
      const engines = controller.ensureScriptingEngines();
      if (!engines) {
        return { success: false, error: 'Failed to initialize scripting engines' };
      }

      engines.expressionEngine.setExpression(property, expression);
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
      const engine = controller.getExpressionEngine();
      if (!engine) {
        return { success: true, data: { property } }; // No engine = nothing to clear
      }
      engine.clearExpression(property);
      return { success: true, data: { property } };
    },
  });

  registry.register({
    name: 'expr.list',
    description: 'List all active expressions',
    category: 'expr',
    params: NoParams,
    execute: async () => {
      const engine = controller.getExpressionEngine();
      if (!engine) {
        return { success: true, data: { expressions: {} } };
      }
      return { success: true, data: { expressions: engine.getAllExpressions() } };
    },
  });

  registry.register({
    name: 'expr.clearAll',
    description: 'Clear all expressions',
    category: 'expr',
    params: NoParams,
    execute: async () => {
      const engine = controller.getExpressionEngine();
      if (!engine) {
        return { success: true, data: { cleared: 0 } };
      }
      const all = engine.getAllExpressions();
      for (const prop of Object.keys(all)) {
        engine.clearExpression(prop);
      }
      return { success: true, data: { cleared: Object.keys(all).length } };
    },
  });
}
