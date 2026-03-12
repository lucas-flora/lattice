/**
 * Parameter commands: set, get, list, reset runtime simulation parameters.
 *
 * All parameter control flows through these commands via the CommandRegistry.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';

const SetParams = z.object({
  name: z.string(),
  value: z.number(),
}).describe('{ name: string, value: number }');

const GetParams = z.object({
  name: z.string(),
}).describe('{ name: string }');

const NoParams = z.object({}).describe('none');

const ResetParams = z.object({
  name: z.string().optional(),
}).describe('{ name?: string }');

export function registerParamCommands(
  registry: CommandRegistry,
  controller: SimulationController,
): void {
  registry.register({
    name: 'param.set',
    description: 'Set a runtime simulation parameter',
    category: 'param',
    params: SetParams,
    execute: async (params) => {
      const { name, value } = params as z.infer<typeof SetParams>;
      const defs = controller.getParamDefs();
      const def = defs.find((d) => d.name === name);
      if (!def) {
        return { success: false, error: `Unknown parameter: "${name}". Use param.list to see available parameters.` };
      }
      controller.setParam(name, value);
      const actual = controller.getParam(name);
      return { success: true, data: { name, value: actual } };
    },
  });

  registry.register({
    name: 'param.get',
    description: 'Get current value of a runtime parameter',
    category: 'param',
    params: GetParams,
    execute: async (params) => {
      const { name } = params as z.infer<typeof GetParams>;
      const value = controller.getParam(name);
      if (value === undefined) {
        return { success: false, error: `Unknown parameter: "${name}"` };
      }
      return { success: true, data: { name, value } };
    },
  });

  registry.register({
    name: 'param.list',
    description: 'List all runtime parameters with current values',
    category: 'param',
    params: NoParams,
    execute: async () => {
      const defs = controller.getParamDefs();
      const values = controller.getParamValues();
      const params = defs.map((d) => ({
        name: d.name,
        label: d.label ?? d.name,
        value: values[d.name] ?? d.default,
        default: d.default,
        min: d.min,
        max: d.max,
        step: d.step,
        type: d.type,
      }));
      return { success: true, data: { params } };
    },
  });

  registry.register({
    name: 'param.reset',
    description: 'Reset parameters to defaults (one or all)',
    category: 'param',
    params: ResetParams,
    execute: async (params) => {
      const { name } = params as z.infer<typeof ResetParams>;
      if (name) {
        const defs = controller.getParamDefs();
        const def = defs.find((d) => d.name === name);
        if (!def) {
          return { success: false, error: `Unknown parameter: "${name}"` };
        }
        controller.setParam(name, def.default);
        return { success: true, data: { name, value: def.default } };
      }
      controller.resetParams();
      return { success: true };
    },
  });
}
