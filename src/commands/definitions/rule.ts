/**
 * Rule commands: show and edit the current rule compute body.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';

const NoParams = z.object({}).describe('none');

const EditParams = z.object({
  body: z.string().min(1),
}).describe('{ body: string }');

export function registerRuleCommands(
  registry: CommandRegistry,
  controller: SimulationController,
): void {
  registry.register({
    name: 'rule.show',
    description: 'Show the current rule compute body',
    category: 'rule',
    params: NoParams,
    execute: async () => {
      const body = controller.getRuleBody();
      if (!body) {
        return { success: false, error: 'No simulation loaded' };
      }
      return { success: true, data: { body } };
    },
  });

  registry.register({
    name: 'rule.edit',
    description: 'Replace the rule compute body at runtime',
    category: 'rule',
    params: EditParams,
    execute: async (params) => {
      const { body } = params as z.infer<typeof EditParams>;
      try {
        controller.updateRule(body);
        return { success: true };
      } catch (err) {
        return { success: false, error: `Failed to compile rule: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  });
}
